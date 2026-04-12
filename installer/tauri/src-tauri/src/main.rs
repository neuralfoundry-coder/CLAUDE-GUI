// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct Sidecar {
    child: Arc<Mutex<Option<Child>>>,
    port: u16,
    app_handle: AppHandle,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ServerConfig {
    #[serde(default)]
    remote_access: bool,
    #[serde(default)]
    remote_access_token: Option<String>,
}

fn load_server_config() -> ServerConfig {
    let home = dirs::home_dir().unwrap_or_default();
    let config_path = home.join(".claudegui").join("server-config.json");
    match fs::read_to_string(&config_path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => ServerConfig::default(),
    }
}

fn pick_port(bind_all: bool) -> std::io::Result<u16> {
    let addr = if bind_all { "0.0.0.0:0" } else { "127.0.0.1:0" };
    let listener = TcpListener::bind(addr)?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn resource_path(app: &AppHandle, relative: &str) -> PathBuf {
    app.path()
        .resource_dir()
        .expect("resource_dir not available")
        .join("resources")
        .join(relative)
}

fn bundled_node_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().resource_dir().expect("resource_dir");
    if cfg!(target_os = "windows") {
        dir.join("binaries").join("node.exe")
    } else {
        dir.join("binaries").join("node")
    }
}

fn app_data_bin_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir not available")
        .join("node-prefix")
        .join(if cfg!(target_os = "windows") { "" } else { "bin" })
}

fn compose_path_env(app: &AppHandle) -> String {
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let current = env::var("PATH").unwrap_or_default();
    let bin = app_data_bin_dir(app);
    format!("{}{}{}", bin.to_string_lossy(), sep, current)
}

fn spawn_server(app: &AppHandle, port: u16, config: &ServerConfig) -> std::io::Result<Child> {
    let node = bundled_node_path(app);
    let server_js = resource_path(app, "server.js");

    let home = app
        .path()
        .home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    let host = if config.remote_access { "0.0.0.0" } else { "127.0.0.1" };

    let mut cmd = Command::new(node);
    cmd.arg(server_js)
        .env("NODE_ENV", "production")
        .env("HOST", host)
        .env("PORT", port.to_string())
        .env("HOME", home)
        .env("PATH", compose_path_env(app))
        .env(
            "CLAUDEGUI_APP_RESOURCES",
            resource_path(app, "").to_string_lossy().to_string(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    if let Some(ref token) = config.remote_access_token {
        cmd.env("CLAUDEGUI_TOKEN", token);
    }

    cmd.spawn()
}

fn wait_for_health(port: u16, timeout: Duration) -> bool {
    let url = format!("http://127.0.0.1:{}/api/health", port);
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(resp) = reqwest::blocking::get(&url) {
            if resp.status().is_success() {
                return true;
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn stop_sidecar(sidecar: &Sidecar) {
    let mut guard = sidecar.child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        #[cfg(unix)]
        unsafe {
            libc::kill(child.id() as i32, libc::SIGTERM);
        }
        #[cfg(not(unix))]
        {
            let _ = child.kill();
        }
        let _ = child.wait();
    }
}

#[tauri::command]
fn restart_server(state: tauri::State<'_, Sidecar>) -> Result<String, String> {
    // Stop existing sidecar
    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            #[cfg(unix)]
            {
                // Send SIGTERM
                unsafe {
                    libc::kill(child.id() as i32, libc::SIGTERM);
                }
            }
            #[cfg(not(unix))]
            {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
    }

    // Reload config and respawn
    let config = load_server_config();
    let port = state.port;

    let child = spawn_server(&state.app_handle, port, &config)
        .map_err(|e| format!("Failed to restart server: {}", e))?;

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    if !wait_for_health(port, Duration::from_secs(15)) {
        return Err("Server health check timed out after restart".to_string());
    }

    Ok("Server restarted successfully".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![restart_server])
        .setup(|app| {
            let handle = app.handle().clone();
            let config = load_server_config();
            let port = pick_port(config.remote_access).expect("failed to pick free port");

            let sidecar = Sidecar {
                child: Arc::new(Mutex::new(None)),
                port,
                app_handle: handle.clone(),
            };
            app.manage(sidecar);

            let started = spawn_server(&handle, port, &config)?;
            if let Some(sc) = handle.try_state::<Sidecar>() {
                *sc.child.lock().unwrap() = Some(started);
            }

            if !wait_for_health(port, Duration::from_secs(15)) {
                log::error!("ClaudeGUI server health check timed out");
                // fall through; the webview will show a load error
            }

            let url = format!("http://127.0.0.1:{}", port);
            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))
                .title("ClaudeGUI")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(sidecar) = handle.try_state::<Sidecar>() {
                    stop_sidecar(&sidecar);
                }
            }
        });
}
