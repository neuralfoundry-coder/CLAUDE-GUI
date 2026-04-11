# =============================================================================
# ClaudeGUI local launch script (Windows PowerShell)
# =============================================================================
# Foreground default, optional detached background, module-scoped debug logs,
# pid/log management, lifecycle commands (Stop / Restart / Status / Tail).
#
# Usage:
#   .\scripts\dev.ps1                          # foreground dev
#   .\scripts\dev.ps1 -Clean -Build            # clean rebuild then run
#   .\scripts\dev.ps1 -Prod -Port 8080         # production mode
#   .\scripts\dev.ps1 -Background -Verbose     # detached + all modules
#   .\scripts\dev.ps1 -Background -Tail        # detached then follow log
#   .\scripts\dev.ps1 -Stop
#   .\scripts\dev.ps1 -Restart -Debug '*'
#   .\scripts\dev.ps1 -Status
#   .\scripts\dev.ps1 -Tail
#   .\scripts\dev.ps1 -Help
# =============================================================================

[CmdletBinding()]
param(
  # Preparation
  [switch]$Clean,
  [switch]$Install,
  [switch]$Check,
  [switch]$Lint,
  [switch]$Test,
  [switch]$Build,
  [switch]$AllChecks,

  # Run mode
  [switch]$Dev,
  [switch]$Prod,

  # Server options
  [string]$Host_ = '127.0.0.1',
  [int]$Port = 3000,
  [string]$Project,
  [switch]$KillPort,

  # Debug
  [string]$Debug,
  [switch]$Verbose,
  [switch]$Trace,
  [ValidateSet('debug','info','warn','error')][string]$LogLevel = 'info',
  [switch]$Inspect,
  [switch]$InspectBrk,
  [string]$LogFile,
  [switch]$LogTruncate,
  [switch]$NoColor,

  # Background / lifecycle
  [switch]$Background,
  [switch]$Stop,
  [switch]$Restart,
  [switch]$Status,
  [switch]$Tail,
  [string]$PidFile,
  [switch]$ForceKill,

  # Convenience
  [switch]$Open,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

# ----- state / path defaults -----
$StateDir = if ($env:CLAUDEGUI_STATE_DIR) { $env:CLAUDEGUI_STATE_DIR } else { Join-Path $HOME '.claudegui' }
if (-not $PidFile) {
  $PidFile = if ($env:CLAUDEGUI_PID_FILE) { $env:CLAUDEGUI_PID_FILE } else { Join-Path $StateDir 'claudegui.pid' }
}
$DefaultLogDir  = if ($env:CLAUDEGUI_LOG_DIR) { $env:CLAUDEGUI_LOG_DIR } else { Join-Path $StateDir 'logs' }
$DefaultLogFile = Join-Path $DefaultLogDir 'claudegui.log'

function Write-Step($msg)   { Write-Host "[dev] $msg"   -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "[dev] + $msg" -ForegroundColor Green }
function Write-WarnMsg($msg){ Write-Host "[dev] ! $msg" -ForegroundColor Yellow }
function Write-Die($msg)    { Write-Host "[dev] x $msg" -ForegroundColor Red; exit 1 }

if ($Help) {
@"
ClaudeGUI local launch script (Windows)

USAGE:
  scripts\dev.ps1 [options]

PREPARATION:
  -Clean            Remove .next, tsconfig.tsbuildinfo, node_modules\.cache,
                    playwright-report, test-results (implies -Install)
  -Install          npm install
  -Check            npm run type-check
  -Lint             npm run lint
  -Test             npm test
  -Build            npm run build (required for -Prod)
  -AllChecks        -Check + -Lint + -Test

RUN MODE:
  -Dev              Development mode (default)
  -Prod             Production mode (implies -Build)

SERVER OPTIONS:
  -Host_ <addr>     Bind host (default 127.0.0.1)
  -Port <n>         Bind port (default 3000)
  -Project <path>   Initial PROJECT_ROOT
  -KillPort         Kill any process on -Port before starting

DEBUG OPTIONS:
  -Debug <mods>     Comma-separated modules: server,project,files,terminal,claude
                    '*' or 'all' enables every module
  -Verbose          Equivalent to -Debug '*'
  -Trace            Enable stack traces + --trace-warnings
  -LogLevel <lvl>   LOG_LEVEL env var (debug|info|warn|error)
  -Inspect          Enable Node inspector on port 9229
  -InspectBrk       Enable Node inspector, break on first line
  -LogFile <path>   Foreground: tee stdout/stderr to this file.
                    Background: write stdout/stderr to this file.
  -LogTruncate      Truncate the log file on start instead of appending
  -NoColor          Disable ANSI colors

BACKGROUND / LIFECYCLE:
  -Background       Run detached. Auto-creates log file if -LogFile not given.
                    Default log: %USERPROFILE%\.claudegui\logs\claudegui.log
  -Stop             Send Ctrl+Break to tracked background process.
  -Restart          Stop (if running) and start fresh in background.
  -Status           Show background instance state (pid, log, port) and exit.
  -Tail             Follow the log file. Alone: tail existing log.
                    Combined with -Background: tail after starting.
  -PidFile <path>   Override pid file path
  -ForceKill        With -Stop / -Restart: Stop-Process -Force immediately

CONVENIENCE:
  -Open             Open http://Host_:Port in the default browser after boot
  -Help             Show this help

EXAMPLES:
  .\scripts\dev.ps1
  .\scripts\dev.ps1 -Clean -AllChecks -Prod -Verbose
  .\scripts\dev.ps1 -Debug 'files,project' -Trace
  .\scripts\dev.ps1 -Background -Verbose
  .\scripts\dev.ps1 -Background -Tail -Debug 'files,claude'
  .\scripts\dev.ps1 -Status
  .\scripts\dev.ps1 -Restart -Debug '*'
  .\scripts\dev.ps1 -Tail
"@
  exit 0
}

# ----- flag normalization -----
if ($AllChecks) { $Check = $true; $Lint = $true; $Test = $true }
if ($Prod)      { $Build = $true }
if ($Verbose -and -not $Debug) { $Debug = '*' }
if ($Restart)   { $Background = $true }

# ----- preconditions -----
try { $nodeVersion = (node -v) } catch { Write-Die 'node is not on PATH' }
if ($nodeVersion -notmatch '^v(\d+)') { Write-Die "invalid node version: $nodeVersion" }
if ([int]$Matches[1] -lt 20) { Write-Die "Node.js >= 20 required (found $nodeVersion)" }

# ----- lifecycle helpers -----
function Read-TrackedPid {
  if (-not (Test-Path $PidFile)) { return $null }
  $raw = (Get-Content $PidFile -ErrorAction SilentlyContinue) -join ''
  if ($raw -match '^\s*(\d+)\s*$') { return [int]$Matches[1] }
  return $null
}

function Test-Alive($procId) {
  if (-not $procId) { return $false }
  try {
    $p = Get-Process -Id $procId -ErrorAction Stop
    return $p -and -not $p.HasExited
  } catch { return $false }
}

function Invoke-Status {
  $pidVal = Read-TrackedPid
  if (Test-Alive $pidVal) {
    Write-Ok 'running'
    Write-Host "  pid      $pidVal"
    Write-Host "  pidfile  $PidFile"
    if (Test-Path $DefaultLogFile) { Write-Host "  log      $DefaultLogFile" }
    try {
      $p = Get-Process -Id $pidVal -ErrorAction Stop
      $uptime = (Get-Date) - $p.StartTime
      Write-Host ("  uptime   {0:dd}d {0:hh}h{0:mm}m{0:ss}s" -f $uptime)
    } catch {}
    try {
      $listen = Get-NetTCPConnection -OwningProcess $pidVal -State Listen -ErrorAction Stop
      foreach ($c in $listen) { Write-Host ("  listen   {0}:{1}" -f $c.LocalAddress, $c.LocalPort) }
    } catch {}
    exit 0
  }
  if (Test-Path $PidFile) {
    Write-WarnMsg "not running (stale pid file at $PidFile)"
    Remove-Item -Force $PidFile
  } else {
    Write-Step 'not running'
  }
  exit 1
}

function Invoke-Stop {
  $pidVal = Read-TrackedPid
  if (-not (Test-Alive $pidVal)) {
    Write-WarnMsg "no running instance (pid file: $PidFile)"
    if (Test-Path $PidFile) { Remove-Item -Force $PidFile }
    return
  }
  if ($ForceKill) {
    Write-Step "killing pid $pidVal (force)"
    Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
  } else {
    Write-Step "stopping pid $pidVal"
    try { Stop-Process -Id $pidVal -ErrorAction Stop } catch {}
    for ($i = 0; $i -lt 16; $i++) {
      if (-not (Test-Alive $pidVal)) { break }
      Start-Sleep -Milliseconds 300
    }
    if (Test-Alive $pidVal) {
      Write-WarnMsg 'still alive after 5s, forcing'
      Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path $PidFile) { Remove-Item -Force $PidFile }
  Write-Ok 'stopped'
}

function Invoke-Tail {
  $target = if ($LogFile) { $LogFile } else { $DefaultLogFile }
  if (-not (Test-Path $target)) { Write-Die "log file not found: $target" }
  Write-Step "tailing $target (Ctrl+C to stop)"
  Get-Content $target -Tail 100 -Wait
  exit 0
}

# ----- standalone lifecycle -----
if ($Status) { Invoke-Status }
if ($Stop -and -not $Restart) { Invoke-Stop; exit 0 }
if ($Tail -and -not $Background -and -not $Restart) { Invoke-Tail }

if ($Restart) { Invoke-Stop }

if ($Background) {
  $existing = Read-TrackedPid
  if (Test-Alive $existing) { Write-Die "already running (pid $existing). Use -Stop, -Restart, or -Status." }
  if (Test-Path $PidFile) { Remove-Item -Force $PidFile }
}

if ($Background -and $InspectBrk) {
  Write-WarnMsg '-InspectBrk with -Background: debugger will wait silently for attach'
}

# ----- kill port -----
if ($KillPort) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop
    foreach ($c in $conns) {
      Write-WarnMsg "killing process on port $Port (pid $($c.OwningProcess))"
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}

# ----- clean -----
if ($Clean) {
  Write-Step 'cleaning build artifacts'
  foreach ($p in @('.next', 'tsconfig.tsbuildinfo', 'node_modules\.cache', 'playwright-report', 'test-results')) {
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
  }
  Write-Ok 'cleaned'
  $Install = $true
}

# ----- install -----
if ($Install -or -not (Test-Path 'node_modules')) {
  Write-Step 'npm install'
  npm install --no-audit --no-fund
  Write-Ok 'dependencies installed'
} elseif ((Test-Path 'package-lock.json') -and (Test-Path 'node_modules\.package-lock.json')) {
  $locked = (Get-Item 'node_modules\.package-lock.json').LastWriteTime
  $top = (Get-Item 'package-lock.json').LastWriteTime
  if ($top -gt $locked) {
    Write-WarnMsg 'package-lock.json is newer than node_modules — re-running npm install'
    npm install --no-audit --no-fund
  }
}

# ----- checks -----
if ($Check) { Write-Step 'type-check'; npm run type-check; Write-Ok 'type-check passed' }
if ($Lint)  { Write-Step 'lint';       npm run lint;       Write-Ok 'lint passed' }
if ($Test)  { Write-Step 'unit tests'; npm test;           Write-Ok 'unit tests passed' }

# ----- build -----
if ($Build) {
  Write-Step 'next build'
  npm run build
  Write-Ok 'build complete'
}

# ----- env setup -----
if ($Prod) {
  $env:NODE_ENV = 'production'
  if (-not (Test-Path '.next')) { Write-Die '.next not found — production mode requires -Build' }
} else {
  $env:NODE_ENV = 'development'
}

$env:HOST = $Host_
$env:PORT = $Port.ToString()
$env:LOG_LEVEL = $LogLevel

if ($Project) {
  if ($Project.StartsWith('~')) { $Project = $Project.Replace('~', $HOME) }
  if (-not (Test-Path $Project -PathType Container)) { Write-Die "project path not found: $Project" }
  $env:PROJECT_ROOT = (Resolve-Path $Project).Path
}

if ($Debug)   { $env:CLAUDEGUI_DEBUG = $Debug }
if ($Trace)   { $env:CLAUDEGUI_TRACE = '1' }
if ($NoColor) { $env:NO_COLOR = '1' }

$nodeOpts = @()
if ($Trace)       { $nodeOpts += '--trace-warnings'; $nodeOpts += '--stack-trace-limit=100' }
if ($InspectBrk)  { $nodeOpts += '--inspect-brk' }
elseif ($Inspect) { $nodeOpts += '--inspect' }
if ($nodeOpts.Count -gt 0) {
  $existingOpts = if ($env:NODE_OPTIONS) { $env:NODE_OPTIONS + ' ' } else { '' }
  $env:NODE_OPTIONS = $existingOpts + ($nodeOpts -join ' ')
}

# ----- resolve log file -----
if (-not $LogFile -and $Background) { $LogFile = $DefaultLogFile }

# ----- summary -----
$inspectState = 'off'
if ($Inspect)    { $inspectState = 'on (9229)' }
if ($InspectBrk) { $inspectState = 'break (9229)' }
$runLabel = if ($Background) { 'background (detached)' } else { 'foreground' }

Write-Step 'launching ClaudeGUI'
Write-Host ("  run      {0}" -f $runLabel)
Write-Host ("  mode     {0}" -f (if ($Prod) { 'prod' } else { 'dev' }))
Write-Host ("  host     {0}" -f $Host_)
Write-Host ("  port     {0}" -f $Port)
Write-Host ("  project  {0}" -f (if ($env:PROJECT_ROOT) { $env:PROJECT_ROOT } else { '(server cwd)' }))
Write-Host ("  debug    {0}" -f (if ($Debug) { $Debug } else { 'off' }))
Write-Host ("  trace    {0}" -f (if ($Trace) { 'on' } else { 'off' }))
Write-Host ("  inspect  {0}" -f $inspectState)
Write-Host ("  loglvl   {0}" -f $LogLevel)
Write-Host ("  logfile  {0}" -f (if ($LogFile) { $LogFile } else { '(foreground only)' }))
if ($Background) { Write-Host ("  pidfile  {0}" -f $PidFile) }

# ----- optional browser open -----
if ($Open) {
  Start-Job -ScriptBlock {
    param($Url)
    for ($i = 0; $i -lt 15; $i++) {
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/health" -TimeoutSec 1 | Out-Null
        Start-Process $Url
        break
      } catch { Start-Sleep -Milliseconds 500 }
    }
  } -ArgumentList "http://$Host_`:$Port" | Out-Null
}

# ----- background run -----
if ($Background) {
  $logDir = Split-Path $LogFile -Parent
  if ($logDir -and -not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
  $pidDir = Split-Path $PidFile -Parent
  if ($pidDir -and -not (Test-Path $pidDir)) { New-Item -ItemType Directory -Force -Path $pidDir | Out-Null }

  if ($LogTruncate) {
    Clear-Content -Path $LogFile -ErrorAction SilentlyContinue
    Write-Step "truncated $LogFile"
  }

  $header = @(
    ''
    '========================================================'
    " ClaudeGUI $(if ($Prod) {'prod'} else {'dev'}) start @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    " host=$Host_ port=$Port project=$(if ($env:PROJECT_ROOT) { $env:PROJECT_ROOT } else { '(cwd)' }) debug=$(if ($Debug) { $Debug } else { 'off' })"
    '========================================================'
  )
  Add-Content -Path $LogFile -Value $header

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'node'
  $psi.Arguments = 'server.js'
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($k in @('NODE_ENV','HOST','PORT','LOG_LEVEL','PROJECT_ROOT','CLAUDEGUI_DEBUG','CLAUDEGUI_TRACE','NO_COLOR','NODE_OPTIONS')) {
    $v = (Get-Item "env:$k" -ErrorAction SilentlyContinue).Value
    if ($v) { $psi.EnvironmentVariables[$k] = $v }
  }

  $proc = [System.Diagnostics.Process]::Start($psi)
  Set-Content -Path $PidFile -Value $proc.Id

  # Pump stdout/stderr to log file on background threads
  $outAction = { param($sender, $e) if ($e.Data) { Add-Content -Path $using:LogFile -Value $e.Data } }
  Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action $outAction | Out-Null
  Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived  -Action $outAction | Out-Null
  $proc.BeginOutputReadLine()
  $proc.BeginErrorReadLine()

  Start-Sleep -Milliseconds 600
  if ($proc.HasExited) {
    Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
    Write-Die "process died immediately — check $LogFile"
  }

  $healthOk = $false
  for ($i = 0; $i -lt 20; $i++) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "http://$Host_`:$Port/api/health" -TimeoutSec 1 | Out-Null
      $healthOk = $true
      break
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if ($healthOk) { Write-Ok 'started (healthy)' }
  else { Write-WarnMsg "started but health check timed out — check $LogFile" }

  Write-Host ("  pid      {0}" -f $proc.Id)
  Write-Host ("  pidfile  {0}" -f $PidFile)
  Write-Host ("  logfile  {0}" -f $LogFile)
  Write-Host ("  url      http://{0}:{1}" -f $Host_, $Port)
  Write-Host ''
  Write-Host "  stop:    .\scripts\dev.ps1 -Stop"
  Write-Host "  restart: .\scripts\dev.ps1 -Restart [options]"
  Write-Host "  status:  .\scripts\dev.ps1 -Status"
  Write-Host "  tail:    .\scripts\dev.ps1 -Tail"

  if ($Tail) {
    Write-Host ''
    Write-Step "following $LogFile (Ctrl+C stops tailing; server keeps running)"
    Get-Content $LogFile -Tail 20 -Wait
  }
  exit 0
}

# ----- foreground run (default) -----
if ($LogFile) {
  $logDir = Split-Path $LogFile -Parent
  if ($logDir -and -not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
  if ($LogTruncate) { Clear-Content -Path $LogFile -ErrorAction SilentlyContinue }
  Write-Step "foreground + log file: $LogFile"
  node server.js 2>&1 | Tee-Object -FilePath $LogFile -Append
} else {
  node server.js
}
