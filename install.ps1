[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Discord Extensions Installer"

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
    Write-Host "  ${C_BLURPLE}██║  ██║██║███████╗██║     ██║   ██║██████╔╝${C_WHITE}EXTENSIONS${C_RESET}"
    Write-Host "  ${C_BLURPLE}██║  ██║██║╚════██║██║     ██║   ██║██╔══██╗${C_GRAY}v1.0.0${C_RESET}"
    Write-Host "  ${C_BLURPLE}██████╔╝██║███████║╚██████╗╚██████╔╝██║  ██║${C_RESET}"
    Write-Host "  ${C_BLURPLE}╚═════╝ ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝${C_RESET}"
    Write-Host ""
    Write-Host "  ${C_GRAY}Установка нативных модулей расширений для клиента Discord${C_RESET}"
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

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $ScriptRoot) { $ScriptRoot = Get-Location }

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
    Write-Failure "Настольный клиент Discord не найден в системе."
    exit 1
}

$AvailableAppDirs = Get-ChildItem -Path $DiscordBase -Directory -Filter "app-*" | Sort-Object {
    try { [version]($_.Name -replace '^app-', '') } catch { $_.Name }
} -Descending

$TargetAppDir = $AvailableAppDirs[0].FullName
Write-Step "Обнаружен каталог клиента Discord: $TargetAppDir"

# Find discord_desktop_core module
$ModulesDir = Join-Path $TargetAppDir "modules"
$CoreModuleDir = Get-ChildItem -Path $ModulesDir -Directory -Filter "discord_desktop_core-*" | Select-Object -First 1

if (-not $CoreModuleDir) {
    Write-Failure "Модуль discord_desktop_core не обнаружен."
    exit 1
}

$CorePackageDir = Join-Path $CoreModuleDir.FullName "discord_desktop_core"
$CoreIndexJs = Join-Path $CorePackageDir "index.js"
$CoreIndexBackup = Join-Path $CorePackageDir "index.js.original"

$ActiveInstances = Get-Process -Name "Discord" -ErrorAction SilentlyContinue
if ($ActiveInstances) {
    Write-Step "Завершение активных процессов Discord..."
    Stop-Process -Name "Discord" -Force -ErrorAction SilentlyContinue
    
    $Retries = 0
    while ((Get-Process -Name "Discord" -ErrorAction SilentlyContinue) -and ($Retries -lt 10)) {
        Start-Sleep -Milliseconds 500
        $Retries++
    }
}

$TargetExtensionsDir = Join-Path $DiscordBase "extensions"
if (-not (Test-Path $TargetExtensionsDir)) {
    New-Item -ItemType Directory -Path $TargetExtensionsDir -Force | Out-Null
}

Write-Step "Развертывание файлов Discord Extensions..."
$SourceComponents = Join-Path $ScriptRoot "src"
Copy-Item (Join-Path $SourceComponents "discordExtensionLoader.js") (Join-Path $TargetExtensionsDir "discordExtensionLoader.js") -Force
Copy-Item (Join-Path $SourceComponents "discordPreload.js") (Join-Path $TargetExtensionsDir "discordPreload.js") -Force
Copy-Item (Join-Path $SourceComponents "extensionsManager.html") (Join-Path $TargetExtensionsDir "extensionsManager.html") -Force
if (Test-Path (Join-Path $SourceComponents "version.json")) {
    Copy-Item (Join-Path $SourceComponents "version.json") (Join-Path $TargetExtensionsDir "version.json") -Force
}

$TargetPluginsDir = Join-Path $TargetExtensionsDir "plugins"
if (-not (Test-Path $TargetPluginsDir)) {
    New-Item -ItemType Directory -Path $TargetPluginsDir -Force | Out-Null
}
$SourcePlugins = Join-Path $SourceComponents "plugins"
if (Test-Path $SourcePlugins) {
    Copy-Item (Join-Path $SourcePlugins "*") $TargetPluginsDir -Recurse -Force
}

$TargetThemesDir = Join-Path $TargetExtensionsDir "themes"
if (-not (Test-Path $TargetThemesDir)) {
    New-Item -ItemType Directory -Path $TargetThemesDir -Force | Out-Null
}
$SourceThemes = Join-Path $SourceComponents "themes"
if (Test-Path $SourceThemes) {
    Copy-Item (Join-Path $SourceThemes "*") $TargetThemesDir -Recurse -Force
}

$ConfigFile = Join-Path $TargetExtensionsDir "config.json"
if (-not (Test-Path $ConfigFile)) {
    $DefaultConfig = @{
        performanceMode = $true
        hardwareAcceleration = $true
        blockTelemetry = $true
        silentTyping = $true
        nitroCleaner = $true
        volumeBooster = $true
        messageLogger = $true
        autoTranslator = $true
        openInApp = $true
        platformIndicators = $true
        serverGrid = $false
        spotifyControls = $true
        spotifyPauseBypass = $true
        showDockButton = $true
        selectedTheme = "none"
        disabledExtensions = @()
    }
    $DefaultConfig | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
}

Write-Step "Внедрение хука загрузчика в discord_desktop_core..."

if (-not (Test-Path $CoreIndexBackup)) {
    Copy-Item $CoreIndexJs $CoreIndexBackup -Force
}

$HookCode = @"
const path = require('path');
try {
    const extDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'), 'Discord', 'extensions');
    require(path.join(extDir, 'discordExtensionLoader.js'));
} catch (e) {
    console.error('[DiscordExtensions] Init failure:', e);
}
module.exports = require('./core.asar');
"@

[System.IO.File]::WriteAllText($CoreIndexJs, $HookCode, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Success "Discord Extensions успешно установлен."
Write-Host ""
Write-Host "  Параметры и управление:" -ForegroundColor White
Write-Host "    Нажмите CTRL SHIFT E или кликните иконку в клиенте" -ForegroundColor Gray
Write-Host "    Встроенные плагины: Nitro Cleaner, Silent Typing, Volume Booster, AMOLED" -ForegroundColor Gray
Write-Host "    Аппаратное ускорение GPU активно по умолчанию" -ForegroundColor Gray
Write-Host "    Консоль разработчика: F12" -ForegroundColor Gray
Write-Host ""

$Prompt = Read-Host "  Запустить клиент Discord сейчас? (Y/n)"
if ([string]::IsNullOrWhiteSpace($Prompt) -or $Prompt.Trim().ToLower() -eq 'y') {
    $DiscordExe = Join-Path $DiscordBase "Update.exe"
    if (Test-Path $DiscordExe) {
        Start-Process $DiscordExe -ArgumentList "--processStart Discord.exe"
    } else {
        Start-Process (Join-Path $TargetAppDir "Discord.exe")
    }
}
