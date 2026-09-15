param([ValidateSet('all','global','personal')][string]$Mode = 'all')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root 'src'
$releaseRoot = Join-Path $root 'output'

function Get-Sha256([string]$Path) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

Push-Location $frontend
try { npm run build } finally { Pop-Location }

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

foreach ($target in @('global','personal')) {
    if ($Mode -ne 'all' -and $Mode -ne $target) { continue }
    $destination = Join-Path $releaseRoot $target
    if ((Resolve-Path $releaseRoot -ErrorAction SilentlyContinue) -and (Split-Path $destination -Parent) -ne $releaseRoot) { throw 'Chemin de sortie invalide.' }
    Remove-Item -LiteralPath $destination -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path (Join-Path $destination 'api') -Force | Out-Null
    Copy-Item (Join-Path $frontend 'dist\*') $destination -Recurse -Force
    Copy-Item (Join-Path $root 'php\router.php') (Join-Path $destination 'api\router.php')
    Copy-Item (Join-Path $root "deploy\$target\index.php") (Join-Path $destination 'api\index.php')
    Copy-Item (Join-Path $root "deploy\$target\config.php.example") (Join-Path $destination 'api\config.php')
    Copy-Item (Join-Path $root 'deploy\common\.htaccess') (Join-Path $destination '.htaccess')
    Copy-Item (Join-Path $root 'deploy\common\api.htaccess') (Join-Path $destination 'api\.htaccess')
    if ($target -eq 'personal') {
        New-Item -ItemType Directory -Path (Join-Path $destination 'api\data') -Force | Out-Null
        Copy-Item (Join-Path $root 'deploy\common\api.htaccess') (Join-Path $destination 'api\data\.htaccess')
        Copy-Item (Join-Path $root 'deploy\personal\update.sh') (Join-Path $destination 'api\update.sh')
    } else {
        Copy-Item (Join-Path $root 'deploy\global\update.sh') (Join-Path $destination 'api\update.sh')
    }
    $archive = Join-Path $releaseRoot "pulsenotes-$target.zip"
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    Compress-Archive -Path (Join-Path $destination '*') -DestinationPath $archive -CompressionLevel Optimal
    if (-not (Test-Path -LiteralPath $archive)) { throw "Impossible de créer l’archive $archive." }
    $zipArchive = $null
    try {
        $zipArchive = [System.IO.Compression.ZipFile]::OpenRead($archive)
        $zipEntries = $zipArchive.Entries.Count
    } catch {
        throw "L’archive $archive n’est pas un ZIP Windows valide."
    } finally {
        if ($zipArchive) { $zipArchive.Dispose() }
    }
    if ($zipEntries -lt 1) { throw "L’archive $archive est vide." }
    $hash = Get-Sha256 $archive
    Set-Content -LiteralPath "$archive.sha256" -Value "$hash  $(Split-Path -Leaf $archive)" -Encoding ascii
    Write-Host "Distribution $target : $archive"
}

if ($Mode -eq 'all' -or $Mode -eq 'personal') {
    Copy-Item (Join-Path $root 'installer\install-personal-o2switch.sh') (Join-Path $releaseRoot 'install-personal-o2switch.sh') -Force
}
