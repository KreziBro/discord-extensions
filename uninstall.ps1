[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Discord Extensions Uninstaller"

$ESC = [char]27
$C_BLURPLE = "$ESC[38;2;88;101;242m"
$C_GREEN = "$ESC[38;2;35;165;90m"
$C_RED = "$ESC[38;2;242;63;67m"
$C_GRAY = "$ESC[38;2;148;155;164m"
$C_WHITE = "$ESC[38;2;242;243;245m"
$C_RESET = "$ESC[0m"

function Write-DiscordBanner {
    Write-Host ""
    Write-Host "  ${C_BLURPLE}██████╗ ██╗███████╗ ██████╗ ██████╗ ██████╗ ${C_RESET}"
    Write-Host "  ${C_BLURPLE}██╔══██╗██║██╔════╝██╔════╝██╔═══██╗██╔══██╗${C_RESET}"
    Write-Host "  ${C_BLURPLE}██║  ██║██║███████╗██║     ██║   ██║██████╔╝${C_WHITE}UNINSTALLER${C_RESET}"
    Write-Host "  ${C_BLURPLE}██║  ██║██║╚════██║██║     ██║   ██║██╔══██╗${C_GRAY}v1.0.0${C_RESET}"
    Write-Host "  ${C_BLURPLE}██████╔╝██║███████║╚██████╗╚██████╔╝██║  ██║${C_RESET}"
    Write-Host "  ${C_BLURPLE}╚═════╝ ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝${C_RESET}"
    Write-Host ""
    Write-Host "  ${C_GRAY}Восстановление оригинального состояния клиента Discord${C_RESET}"
    Write-Host ""
}

function Write-Step {
    param([string]$Message)
    Write-Host "  ${C_BLURPLE}[>]${C_RESET} ${C_WHITE}$Message${C_RESET}"
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ${C_GREEN}[OK]${C_RESET} ${C_GREEN}$Message${C_RESET}"
}

function Write-Failure {
    param([string]$Message)
    Write-Host "  ${C_RED}[FAIL]${C_RESET} ${C_RED}$Message${C_RESET}"
}

Write-DiscordBanner

function Find-DiscordDirectory {
    $Candidates = [System.Collections.Generic.List[string]]::new()

    try {
        $Proc = Get-Process -Name "Discord" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($Proc -and $Proc.Path) {
            $Candidate = Split-Path -Parent (Split-Path -Parent $Proc.Path)
            if ($Candidate) { $Candidates.Add($Candidate) }
        }
    } catch {}

    if ($env:LOCALAPPDATA) {
        $Candidates.Add((Join-Path $env:LOCALAPPDATA "Discord"))
    }
    if ($env:USERPROFILE) {
        $Candidates.Add((Join-Path $env:USERPROFILE "AppData\Local\Discord"))
    }

    foreach ($P in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($P)) { continue }
        if (Test-Path $P) {
            $Apps = Get-ChildItem -Path $P -Directory -Filter "app-*" -ErrorAction SilentlyContinue
            if ($Apps -and $Apps.Count -gt 0) {
                return $P
            }
        }
    }
    return $null
}

$DiscordBase = Find-DiscordDirectory

if (-not $DiscordBase) {
    Write-Failure "Настольный клиент Discord не найден."
    exit 1
}

$AvailableAppDirs = Get-ChildItem -Path $DiscordBase -Directory -Filter "app-*" | Sort-Object {
    try { [version]($_.Name -replace '^app-', '') } catch { $_.Name }
} -Descending

$TargetAppDir = $AvailableAppDirs[0].FullName
$ModulesDir = Join-Path $TargetAppDir "modules"
$CoreModuleDir = Get-ChildItem -Path $ModulesDir -Directory -Filter "discord_desktop_core-*" | Select-Object -First 1

if ($CoreModuleDir) {
    $CorePackageDir = Join-Path $CoreModuleDir.FullName "discord_desktop_core"
    $CoreIndexJs = Join-Path $CorePackageDir "index.js"
    $CoreIndexBackup = Join-Path $CorePackageDir "index.js.original"

    $ActiveInstances = Get-Process -Name "Discord" -ErrorAction SilentlyContinue
    if ($ActiveInstances) {
        Write-Step "Остановка активных процессов Discord..."
        Stop-Process -Name "Discord" -Force -ErrorAction SilentlyContinue
        
        $Retries = 0
        while ((Get-Process -Name "Discord" -ErrorAction SilentlyContinue) -and ($Retries -lt 10)) {
            Start-Sleep -Milliseconds 500
            $Retries++
        }
    }

    if (Test-Path $CoreIndexBackup) {
        Write-Step "Восстановление оригинального index.js..."
        Copy-Item $CoreIndexBackup $CoreIndexJs -Force
        Remove-Item $CoreIndexBackup -Force -ErrorAction SilentlyContinue
        Write-Success "Оригинальный index.js успешно восстановлен."
    } else {
        # Restore stock one-line index.js
        [System.IO.File]::WriteAllText($CoreIndexJs, "module.exports = require('./core.asar');`n", [System.Text.Encoding]::UTF8)
        Write-Success "Заводской index.js записан."
    }
}

$TargetExtensionsDir = Join-Path $DiscordBase "extensions"
if (Test-Path $TargetExtensionsDir) {
    Write-Step "Очистка установленных модулей Discord Extensions..."
    Remove-Item (Join-Path $TargetExtensionsDir "discordExtensionLoader.js") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $TargetExtensionsDir "discordPreload.js") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $TargetExtensionsDir "extensionsManager.html") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $TargetExtensionsDir "version.json") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $TargetExtensionsDir "plugins") -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $TargetExtensionsDir "themes") -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Success "Удаление завершено. Клиент возвращен в исходное состояние."
Write-Host ""
