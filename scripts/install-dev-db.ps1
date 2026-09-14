param([switch]$StartOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$developmentDirectory = Join-Path $root '.dev'
$environmentFile = Join-Path $developmentDirectory 'mysql.env'
$composeFile = Join-Path $root 'docker-compose.dev.yml'

function New-HexSecret([int]$Bytes) {
    $buffer = [byte[]]::new($Bytes)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToHexString($buffer).ToLowerInvariant()
}

function Invoke-Docker([string[]]$Arguments) {
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "La commande Docker a échoué ($LASTEXITCODE)." }
}

function Test-DockerEngine {
    & docker info --format '{{.ServerVersion}}' *> $null
    return $LASTEXITCODE -eq 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop est requis. Installez-le puis relancez install-dev-db.bat.'
}

if (-not (Test-DockerEngine)) {
    $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path -LiteralPath $dockerDesktop)) {
        throw 'Docker est installé, mais Docker Desktop est introuvable ou son moteur est arrêté.'
    }
    Write-Host 'Démarrage de Docker Desktop...'
    Start-Process -FilePath $dockerDesktop | Out-Null
    $ready = $false
    foreach ($attempt in 1..60) {
        Start-Sleep -Seconds 2
        if (Test-DockerEngine) { $ready = $true; break }
    }
    if (-not $ready) { throw 'Docker Desktop ne répond pas après deux minutes.' }
}

New-Item -ItemType Directory -Path $developmentDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $environmentFile)) {
    $lines = @(
        'MYSQL_IMAGE=mysql:8.4',
        'MYSQL_PORT=3307',
        'MYSQL_DATABASE=pulsenotes',
        'MYSQL_USER=pulsenotes',
        "MYSQL_PASSWORD=$(New-HexSecret 24)",
        "MYSQL_ROOT_PASSWORD=$(New-HexSecret 32)",
        "PULSENOTES_APP_KEY=$(New-HexSecret 32)"
    )
    [System.IO.File]::WriteAllText($environmentFile, ($lines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
    Write-Host "Configuration locale créée : $environmentFile"
} else {
    Write-Host "Configuration locale conservée : $environmentFile"
}

$required = @('MYSQL_PORT','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD','PULSENOTES_APP_KEY')
$configured = @{}
foreach ($line in [System.IO.File]::ReadAllLines($environmentFile)) {
    if ($line.Trim() -eq '' -or $line.TrimStart().StartsWith('#') -or -not $line.Contains('=')) { continue }
    $name, $value = $line.Split('=', 2)
    $configured[$name.Trim()] = $value.Trim()
}
foreach ($name in $required) {
    if (-not $configured.ContainsKey($name) -or $configured[$name] -eq '') { throw "Valeur manquante dans .dev/mysql.env : $name" }
}

if (-not $StartOnly) {
    Invoke-Docker @('compose', '--env-file', $environmentFile, '-f', $composeFile, 'pull', 'mysql')
}
Invoke-Docker @('compose', '--env-file', $environmentFile, '-f', $composeFile, 'up', '-d', '--wait', 'mysql')

Write-Host "MySQL écoute sur 127.0.0.1:$($configured['MYSQL_PORT'])."
Write-Host "Base : $($configured['MYSQL_DATABASE']) ; utilisateur : $($configured['MYSQL_USER'])."
