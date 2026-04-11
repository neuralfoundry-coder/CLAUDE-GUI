# ClaudeGUI uninstaller for Windows.
[CmdletBinding()]
param([switch]$Yes)

$InstallDir = if ($env:CLAUDEGUI_HOME) { $env:CLAUDEGUI_HOME } else { Join-Path $env:LOCALAPPDATA 'ClaudeGUI\app' }
$Launcher   = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\claudegui.cmd'
$StateFile  = Join-Path $env:USERPROFILE '.claudegui\state.json'

Write-Host "This will remove:"
Write-Host "  $InstallDir"
Write-Host "  $Launcher"
Write-Host "  $StateFile"

if (-not $Yes) {
  $reply = Read-Host 'Continue? [y/N]'
  if ($reply -notmatch '^(y|Y|yes|YES)$') { exit 0 }
}

if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
if (Test-Path $Launcher) { Remove-Item -Force $Launcher }
if (Test-Path $StateFile) { Remove-Item -Force $StateFile }

Write-Host 'ClaudeGUI removed.'
Write-Host 'Note: Claude CLI (@anthropic-ai/claude-code) is left installed.'
