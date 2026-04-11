# ClaudeGUI one-line installer for Windows (PowerShell 5+).
# Usage:
#   iwr -useb https://raw.githubusercontent.com/neuralfoundry-coder/CLAUDE-GUI/main/scripts/install/install.ps1 | iex
#   $env:CLAUDEGUI_YES = '1'; iwr ... | iex       (non-interactive)

[CmdletBinding()]
param(
  [switch]$Yes,
  [switch]$DryRun,
  [switch]$NoDesktopIcon
)

$ErrorActionPreference = 'Stop'

$RepoUrl    = $env:CLAUDEGUI_REPO  -as [string]
if (-not $RepoUrl) { $RepoUrl = 'https://github.com/neuralfoundry-coder/CLAUDE-GUI.git' }
$Branch     = if ($env:CLAUDEGUI_BRANCH) { $env:CLAUDEGUI_BRANCH } else { 'main' }
$InstallDir = if ($env:CLAUDEGUI_HOME) { $env:CLAUDEGUI_HOME } else { Join-Path $env:LOCALAPPDATA 'ClaudeGUI\app' }
$Launcher   = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\claudegui.cmd'
$IconDir    = Join-Path $env:LOCALAPPDATA 'ClaudeGUI\icons'
$LauncherPs1 = Join-Path $env:LOCALAPPDATA 'ClaudeGUI\bin\claudegui-launcher.ps1'
$DesktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ClaudeGUI.lnk'

if ($env:CLAUDEGUI_YES -eq '1') { $Yes = $true }
if ($env:CLAUDEGUI_NO_DESKTOP_ICON -eq '1') { $NoDesktopIcon = $true }

function Write-Log($msg)  { Write-Host "[claudegui] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[claudegui] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[claudegui] $msg" -ForegroundColor Red }

function Invoke-Step($cmd) {
  if ($DryRun) {
    Write-Host "+ $cmd" -ForegroundColor DarkGray
  } else {
    Invoke-Expression $cmd
  }
}

function Confirm-Action($prompt) {
  if ($Yes -or $DryRun) { return $true }
  $reply = Read-Host "$prompt [y/N]"
  return ($reply -match '^(y|Y|yes|YES)$')
}

Write-Log "Install dir: $InstallDir"
Write-Log "Launcher: $Launcher"

# --- Node.js -----------------------------------------------------------
$needNode = $true
try {
  $nodeVersion = (node -v) 2>$null
  if ($nodeVersion -match '^v(\d+)') {
    $major = [int]$Matches[1]
    if ($major -ge 20) {
      $needNode = $false
      Write-Log "Node.js $nodeVersion detected"
    }
  }
} catch {}

if ($needNode) {
  Write-Warn 'Node.js 20+ not found.'
  if (Confirm-Action 'Install Node 20 via fnm?') {
    try {
      Invoke-Step 'winget install --silent --accept-source-agreements --accept-package-agreements Schniz.fnm'
      Invoke-Step 'fnm install 20'
      Invoke-Step 'fnm use 20'
    } catch {
      Write-Err "Failed to install Node via fnm. Install manually from https://nodejs.org/"
      exit 1
    }
  } else {
    Write-Err 'Node.js is required. Aborting.'
    exit 1
  }
}

# --- Git ---------------------------------------------------------------
try { git --version | Out-Null } catch {
  Write-Err 'git not found. Install from https://git-scm.com/download/win'
  exit 1
}

# --- Clone / update ----------------------------------------------------
if (Test-Path (Join-Path $InstallDir '.git')) {
  Write-Log "Updating existing checkout at $InstallDir"
  Invoke-Step "git -C `"$InstallDir`" fetch --depth=1 origin $Branch"
  Invoke-Step "git -C `"$InstallDir`" reset --hard origin/$Branch"
} else {
  if (Test-Path $InstallDir) {
    Write-Err "$InstallDir exists and is not a git repo. Move or delete it first."
    exit 1
  }
  Write-Log "Cloning $RepoUrl -> $InstallDir"
  Invoke-Step "git clone --depth=1 --branch $Branch `"$RepoUrl`" `"$InstallDir`""
}

# --- npm install + build ----------------------------------------------
Write-Log 'Installing dependencies (this may take a few minutes)'
Invoke-Step "cmd /c `"cd /d `"$InstallDir`" && npm ci --no-audit --no-fund`""

Write-Log 'Building production bundle'
Invoke-Step "cmd /c `"cd /d `"$InstallDir`" && npm run build`""

# --- Claude CLI --------------------------------------------------------
try {
  $null = (claude --version) 2>$null
  Write-Log 'Claude CLI detected'
} catch {
  Write-Warn 'Claude CLI not found on PATH.'
  if (Confirm-Action 'Install @anthropic-ai/claude-code globally via npm?') {
    Invoke-Step 'npm install -g @anthropic-ai/claude-code'
  } else {
    Write-Warn 'Skipping Claude CLI install. Install later with: npm install -g @anthropic-ai/claude-code'
  }
}

# --- Launcher ----------------------------------------------------------
$launcherDir = Split-Path $Launcher -Parent
if (-not (Test-Path $launcherDir)) {
  New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null
}

if (-not $DryRun) {
  $launcherBody = @"
@echo off
setlocal
set NODE_ENV=production
if "%1"=="--project" (
  set PROJECT_ROOT=%2
  shift
  shift
)
cd /d "$InstallDir"
node server.js %*
endlocal
"@
  Set-Content -Path $Launcher -Value $launcherBody -Encoding ASCII
}
Write-Log "Launcher installed at $Launcher"

# --- Desktop launcher (FR-1100) ----------------------------------------
function Install-DesktopLauncher {
  $iconParent = Split-Path $IconDir -Parent
  $launcherParent = Split-Path $LauncherPs1 -Parent
  if (-not $DryRun) {
    foreach ($d in @($IconDir, $launcherParent)) {
      if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
  }

  # Copy icon assets from the freshly checked-out repo.
  $assets = @('claudegui.svg','claudegui.ico','claudegui-512.png','claudegui-256.png','claudegui-128.png')
  foreach ($a in $assets) {
    $src = Join-Path $InstallDir "public\branding\$a"
    if (Test-Path $src) {
      if (-not $DryRun) { Copy-Item -Path $src -Destination (Join-Path $IconDir $a) -Force }
    }
  }

  $iconIco = Join-Path $IconDir 'claudegui.ico'

  # Write launcher PowerShell script (banner + start server + poll + open browser).
  $launcherBody = @"
# ClaudeGUI desktop launcher
# Boots the production server, opens the default browser when ready,
# and terminates the server when this window closes.
`$ErrorActionPreference = 'Continue'
`$InstallDir = '$InstallDir'
`$Port = if (`$env:CLAUDEGUI_PORT) { `$env:CLAUDEGUI_PORT } elseif (`$env:PORT) { `$env:PORT } else { '3000' }
`$Url = "http://localhost:`$Port"
`$LogDir = Join-Path `$env:USERPROFILE '.claudegui\logs'
New-Item -ItemType Directory -Force -Path `$LogDir | Out-Null
`$LogFile = Join-Path `$LogDir 'launcher.log'

`$host.UI.RawUI.WindowTitle = 'ClaudeGUI'
Write-Host ''
Write-Host '  +---------------------------------------------+'
Write-Host '  |   ClaudeGUI                                  |'
Write-Host "  |   url   : `$Url"
Write-Host "  |   log   : `$LogFile"
Write-Host '  |   stop  : close this window or press Ctrl+C  |'
Write-Host '  +---------------------------------------------+'
Write-Host ''

Set-Location `$InstallDir
`$env:NODE_ENV = 'production'
`$env:PORT = `$Port

# Background opener: poll readiness, then launch the default browser.
`$opener = Start-Job -Name 'claudegui-opener' -ScriptBlock {
  param(`$u)
  for (`$i = 0; `$i -lt 60; `$i++) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri `$u -Method Head -TimeoutSec 1 | Out-Null
      Start-Process `$u
      return
    } catch { Start-Sleep -Milliseconds 500 }
  }
} -ArgumentList `$Url

try {
  & node server.js 2>&1 | Tee-Object -FilePath `$LogFile -Append
} finally {
  Get-Job -Name 'claudegui-opener' -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Job `$_ -ErrorAction SilentlyContinue
    Remove-Job `$_ -ErrorAction SilentlyContinue
  }
}
"@

  if (-not $DryRun) {
    Set-Content -Path $LauncherPs1 -Value $launcherBody -Encoding UTF8
  }
  Write-Log "Launcher script: $LauncherPs1"

  # Create the .lnk on the user's Desktop.
  if (-not $DryRun) {
    $WshShell = New-Object -ComObject WScript.Shell
    $sc = $WshShell.CreateShortcut($DesktopLnk)
    $sc.TargetPath       = (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
    $sc.Arguments        = "-NoProfile -ExecutionPolicy Bypass -File `"$LauncherPs1`""
    $sc.WorkingDirectory = $InstallDir
    $sc.IconLocation     = "$iconIco,0"
    $sc.Description      = 'Launch ClaudeGUI (web IDE wrapping Claude CLI)'
    $sc.WindowStyle      = 1
    $sc.Save()
  }
  Write-Log "Desktop shortcut: $DesktopLnk"
}

if ($NoDesktopIcon) {
  Write-Log 'Skipping desktop launcher (-NoDesktopIcon).'
} else {
  Install-DesktopLauncher
}

Write-Log 'Install complete.'
Write-Log 'Run:  claudegui                              # CLI'
Write-Log 'Run:  claudegui --project C:\path\to\project'
Write-Log 'GUI:  double-click the ClaudeGUI shortcut on your Desktop'
