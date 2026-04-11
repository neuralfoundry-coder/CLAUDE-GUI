# ClaudeGUI one-line installer for Windows (PowerShell 5+).
# Usage:
#   iwr -useb https://raw.githubusercontent.com/<org>/ClaudeGUI/main/scripts/install/install.ps1 | iex
#   $env:CLAUDEGUI_YES = '1'; iwr ... | iex       (non-interactive)

[CmdletBinding()]
param(
  [switch]$Yes,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$RepoUrl    = $env:CLAUDEGUI_REPO  -as [string]
if (-not $RepoUrl) { $RepoUrl = 'https://github.com/anthropics/ClaudeGUI.git' }
$Branch     = if ($env:CLAUDEGUI_BRANCH) { $env:CLAUDEGUI_BRANCH } else { 'main' }
$InstallDir = if ($env:CLAUDEGUI_HOME) { $env:CLAUDEGUI_HOME } else { Join-Path $env:LOCALAPPDATA 'ClaudeGUI\app' }
$Launcher   = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\claudegui.cmd'

if ($env:CLAUDEGUI_YES -eq '1') { $Yes = $true }

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

Write-Log 'Install complete.'
Write-Log 'Run:  claudegui'
Write-Log 'Run:  claudegui --project C:\path\to\project'
