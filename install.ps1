$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Discord Extensions Installer"

$ESC = [char]27
$C_BLURPLE = [char]27 + "[38;2;88;101;242m"
$C_GREEN   = [char]27 + "[38;2;35;165;90m"
$C_RED     = [char]27 + "[38;2;242;63;67m"
$C_GRAY    = [char]27 + "[38;2;148;155;164m"
$C_WHITE   = [char]27 + "[38;2;242;243;245m"
$C_RESET   = [char]27 + "[0m"

function Write-DiscordBanner {
    Write-Host ""
    Write-Host "  ${C_BLURPLE}██████╗  ██╗███████╗ ██████╗  ██████╗ ██████╗  ██████╗ ${C_RESET}"
    Write-Host "  ${C_BLURPLE}██╔══██╗ ██║██╔════╝██╔════╝ ██╔═══██╗██╔══██╗ ██╔══██╗${C_RESET}"
    Write-Host "  ${C_BLURPLE}██║  ██║ ██║███████╗██║      ██║   ██║██████╔╝ ██║  ██║  ${C_WHITE}EXTENSIONS${C_RESET}"
    Write-Host "  ${C_BLURPLE}██║  ██║ ██║╚════██║██║      ██║   ██║██╔══██╗ ██║  ██║  ${C_GRAY}v1.0.2${C_RESET}"
    Write-Host "  ${C_BLURPLE}██████╔╝ ██║███████║╚██████╗ ╚██████╔╝██║  ██║ ██████╔╝${C_RESET}"
    Write-Host "  ${C_BLURPLE}╚═════╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ${C_RESET}"
    Write-Host ""
    Write-Host "  ${C_GRAY}Установка стабильного ядра Discord Extensions${C_RESET}"
    Write-Host ""
}

function Write-Step {
    param([string]$Message)
    Write-Host ("  " + $C_BLURPLE + "[>]" + $C_RESET + " " + $C_WHITE + $Message + $C_RESET)
}

function Write-Success {
    param([string]$Message)
    Write-Host ("  " + $C_GREEN + "[OK]" + $C_RESET + " " + $C_GREEN + $Message + $C_RESET)
}

function Write-Failure {
    param([string]$Message)
    Write-Host ("  " + $C_RED + "[FAIL]" + $C_RESET + " " + $C_RED + $Message + $C_RESET)
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
            if (Test-Path $Candidate) {
                $Candidates.Add($Candidate)
            }
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
    Write-Failure "Каталог установки Discord не обнаружен."
    exit 1
}

$AvailableAppDirs = Get-ChildItem -Path $DiscordBase -Directory -Filter "app-*" | Sort-Object {
    try { [version]($_.Name -replace '^app-', '') } catch { $_.Name }
} -Descending

if (-not $AvailableAppDirs -or $AvailableAppDirs.Count -eq 0) {
    Write-Failure "Версии Discord не найдены внутри $DiscordBase."
    exit 1
}

$TargetAppDir = $AvailableAppDirs[0].FullName
$CoreFound = $false

foreach ($AppDirItem in $AvailableAppDirs) {
    $ModDir = Join-Path $AppDirItem.FullName "modules"
    if (Test-Path $ModDir) {
        $CoreDirs = Get-ChildItem -Path $ModDir -Directory -Filter "discord_desktop_core-*"
        if ($CoreDirs -and $CoreDirs.Count -gt 0) {
            $CoreFound = $true
            break
        }
    }
}

if (-not $CoreFound) {
    Write-Failure "Модуль discord_desktop_core не обнаружен."
    exit 1
}

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

Write-Step "Развертывание компонентов Discord Extensions..."
$SourceComponents = Join-Path $ScriptRoot "src"

Copy-Item (Join-Path $SourceComponents "discordExtensionLoader.js") (Join-Path $TargetExtensionsDir "discordExtensionLoader.js") -Force
if (Test-Path (Join-Path $SourceComponents "discordPreload.js")) {
    Copy-Item (Join-Path $SourceComponents "discordPreload.js") (Join-Path $TargetExtensionsDir "discordPreload.js") -Force
}
if (Test-Path (Join-Path $SourceComponents "extensionsManager.html")) {
    Copy-Item (Join-Path $SourceComponents "extensionsManager.html") (Join-Path $TargetExtensionsDir "extensionsManager.html") -Force
}
if (Test-Path (Join-Path $SourceComponents "defaultSettings.json")) {
    Copy-Item (Join-Path $SourceComponents "defaultSettings.json") (Join-Path $TargetExtensionsDir "defaultSettings.json") -Force
}
if (Test-Path (Join-Path $SourceComponents "version.json")) {
    Copy-Item (Join-Path $SourceComponents "version.json") (Join-Path $TargetExtensionsDir "version.json") -Force
}
if (Test-Path (Join-Path $SourceComponents "plugins.json")) {
    Copy-Item (Join-Path $SourceComponents "plugins.json") (Join-Path $TargetExtensionsDir "plugins.json") -Force
}

$TargetCoreDir = Join-Path $TargetExtensionsDir "core"
if (-not (Test-Path $TargetCoreDir)) {
    New-Item -ItemType Directory -Path $TargetCoreDir -Force | Out-Null
}
$SourceCore = Join-Path $SourceComponents "core"
if (Test-Path $SourceCore) {
    Copy-Item (Join-Path $SourceCore "*") $TargetCoreDir -Recurse -Force
}

$TargetModulesDir = Join-Path $TargetExtensionsDir "modules"
if (-not (Test-Path $TargetModulesDir)) {
    New-Item -ItemType Directory -Path $TargetModulesDir -Force | Out-Null
}
$SourceModules = Join-Path $SourceComponents "modules"
if (Test-Path $SourceModules) {
    Copy-Item (Join-Path $SourceModules "*") $TargetModulesDir -Recurse -Force
}

$TargetDataDir = Join-Path $TargetExtensionsDir "data"
$TargetSettingsDir = Join-Path $TargetDataDir "settings"
$TargetThemesDir = Join-Path $TargetDataDir "themes"
$TargetPluginsDir = Join-Path $TargetDataDir "plugins"
$TargetChromeDir = Join-Path $TargetExtensionsDir "chrome"

foreach ($dir in @($TargetDataDir, $TargetSettingsDir, $TargetThemesDir, $TargetPluginsDir, $TargetChromeDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

$SourceThemes = Join-Path $SourceComponents "themes"
if (Test-Path $SourceThemes) {
    Copy-Item (Join-Path $SourceThemes "*") $TargetThemesDir -Recurse -Force
}

$SourceUserPlugins = Join-Path $ScriptRoot "extensions\data\plugins"
if (Test-Path $SourceUserPlugins) {
    Copy-Item (Join-Path $SourceUserPlugins "*") $TargetPluginsDir -Recurse -Force
}

$SettingsJson = Join-Path $TargetSettingsDir "settings.json"
$DefaultSettingsJson = Join-Path $SourceComponents "defaultSettings.json"
if ((-not (Test-Path $SettingsJson)) -and (Test-Path $DefaultSettingsJson)) {
    Copy-Item $DefaultSettingsJson $SettingsJson -Force
}

$ConfigFile = Join-Path $TargetExtensionsDir "config.json"
if (-not (Test-Path $ConfigFile)) {
    $DefaultConfig = @{
        performanceMode = $false
        hardwareAcceleration = $false
        blockTelemetry = $false
        silentTyping = $false
        nitroCleaner = $false
        volumeBooster = $false
        messageLogger = $false
        autoTranslator = $false
        openInApp = $false
        serverGrid = $false
        spotifyControls = $false
        spotifyPauseBypass = $false
        showDockButton = $true
        selectedTheme = "none"
        disabledExtensions = @()
    }
    [System.IO.File]::WriteAllText($ConfigFile, ($DefaultConfig | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
}

Write-Step "Внедрение загрузчика в discord_desktop_core..."

$HookCode = @'
const path = require('path');
try {
    const extDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'), 'Discord', 'extensions');
    require(path.join(extDir, 'discordExtensionLoader.js'));
} catch (e) {
    console.error('[DiscordExtensions] Init failure:', e);
}
module.exports = require('./core.asar');
'@

foreach ($AppDirItem in $AvailableAppDirs) {
    $ModDir = Join-Path $AppDirItem.FullName "modules"
    if (Test-Path $ModDir) {
        $CoreDirs = Get-ChildItem -Path $ModDir -Directory -Filter "discord_desktop_core-*"
        foreach ($CD in $CoreDirs) {
            $TargetIndex = Join-Path $CD.FullName "discord_desktop_core\index.js"
            $TargetBackup = Join-Path $CD.FullName "discord_desktop_core\index.js.original"
            if (Test-Path $TargetIndex) {
                if (-not (Test-Path $TargetBackup)) {
                    Copy-Item $TargetIndex $TargetBackup -Force
                }
                [System.IO.File]::WriteAllText($TargetIndex, $HookCode, [System.Text.Encoding]::UTF8)
            }
        }
    }
}

Write-Host ""
Write-Success "Discord Extensions успешно установлен."
Write-Host ""
Write-Host "  Параметры и управление:" -ForegroundColor White
Write-Host "    Кликните по круглой иконке справа внизу или нажмите CTRL SHIFT E" -ForegroundColor Gray
Write-Host "    Каталог плагинов, нативные темы, автосбор квестов и Custom RPC" -ForegroundColor Gray
Write-Host "    Консоль разработчика: F12" -ForegroundColor Gray
Write-Host ""

$Prompt = Read-Host "  Запустить клиент Discord сейчас? (Y/n)"
if ([string]::IsNullOrWhiteSpace($Prompt) -or $Prompt.Trim().ToLower() -eq 'y') {
    $TargetDiscordExe = Join-Path $TargetAppDir "Discord.exe"
    if (Test-Path $TargetDiscordExe) {
        Start-Process $TargetDiscordExe
    } else {
        $DiscordExe = Join-Path $DiscordBase "Update.exe"
        if (Test-Path $DiscordExe) {
            Start-Process $DiscordExe -ArgumentList @("--processStart", "Discord.exe")
        }
    }
}
