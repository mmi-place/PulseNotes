<?php

declare(strict_types=1);

const PULSENOTES_RELEASE_API = 'https://api.github.com/repos/mmi-place/PulseNotes/releases/latest';
const PULSENOTES_UPDATE_STATE_FILE = 'update-state.json';
const PULSENOTES_MAINTENANCE_FILE = 'maintenance.json';

function updateEnvBoolean(string $name, bool $default): bool
{
    $value = getenv($name);
    if ($value === false || trim((string) $value) === '') return $default;
    return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
}

function updateEnvInteger(string $name, int $default, int $minimum, int $maximum): int
{
    $value = filter_var(getenv($name), FILTER_VALIDATE_INT);
    if ($value === false) return $default;
    return max($minimum, min($maximum, (int) $value));
}

function updateRuntimeDirectory(): string
{
    $directory = __DIR__ . DIRECTORY_SEPARATOR . 'runtime';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Impossible de créer le stockage de mise à jour.');
    }
    @chmod($directory, 0700);
    return $directory;
}

/** @return array<string,mixed> */
function updateReadJson(string $path): array
{
    if (!is_file($path)) return [];
    $raw = @file_get_contents($path);
    if ($raw === false) return [];
    $value = json_decode($raw, true);
    return is_array($value) ? $value : [];
}

/** @param array<string,mixed> $value */
function updateWriteJson(string $path, array $value): void
{
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(6));
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    if (file_put_contents($temporary, $json . "\n", LOCK_EX) === false) {
        throw new RuntimeException('Impossible d’écrire l’état de mise à jour.');
    }
    @chmod($temporary, 0600);
    if (!@rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Impossible de publier l’état de mise à jour.');
    }
}

/** @return array{version:string,commit:string} */
function installedReleaseMetadata(): array
{
    $metadata = updateReadJson(__DIR__ . DIRECTORY_SEPARATOR . 'version.json');
    $version = trim((string) ($metadata['version'] ?? '0.0.0-dev'));
    return [
        'version' => preg_match('/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/', $version) === 1 ? $version : '0.0.0-dev',
        'commit' => trim((string) ($metadata['commit'] ?? '')),
    ];
}

function updateEnabled(): bool
{
    return updateEnvBoolean('PULSENOTES_UPDATE_ENABLED', true);
}

function updateReleaseApiUrl(): string
{
    $configured = trim((string) getenv('PULSENOTES_UPDATE_RELEASE_API'));
    $url = $configured !== '' ? $configured : PULSENOTES_RELEASE_API;
    $parts = parse_url($url);
    if (($parts['scheme'] ?? '') !== 'https') throw new RuntimeException('La source de mise à jour doit utiliser HTTPS.');
    return $url;
}

function assertTrustedReleaseAssetUrl(string $url): void
{
    $parts = parse_url($url);
    $host = strtolower((string) ($parts['host'] ?? ''));
    $path = (string) ($parts['path'] ?? '');
    if (($parts['scheme'] ?? '') !== 'https' || $host !== 'github.com' || !str_starts_with($path, '/mmi-place/PulseNotes/releases/download/')) {
        throw new RuntimeException('La release propose une URL de téléchargement non autorisée.');
    }
}

function assertTrustedDownloadDestination(string $url): void
{
    $parts = parse_url($url);
    $host = strtolower((string) ($parts['host'] ?? ''));
    $allowed = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-releases.githubusercontent.com'];
    if (($parts['scheme'] ?? '') !== 'https' || !in_array($host, $allowed, true)) {
        throw new RuntimeException('Le téléchargement a été redirigé vers un hôte non autorisé.');
    }
}

/** @return array{body:string,effectiveUrl:string} */
function updateHttpGet(string $url, int $maximumBytes = 2_000_000): array
{
    if (!extension_loaded('curl')) throw new RuntimeException('L’extension PHP cURL est requise pour les mises à jour.');
    $handle = curl_init($url);
    if ($handle === false) throw new RuntimeException('Impossible d’initialiser le téléchargement.');
    $body = '';
    curl_setopt_array($handle, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_USERAGENT => 'PulseNotesUpdater/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json', 'X-GitHub-Api-Version: 2022-11-28'],
        CURLOPT_WRITEFUNCTION => static function ($unused, string $chunk) use (&$body, $maximumBytes): int {
            if (strlen($body) + strlen($chunk) > $maximumBytes) return 0;
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) curl_setopt($handle, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    $success = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $effectiveUrl = (string) curl_getinfo($handle, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($handle);
    curl_close($handle);
    if ($success === false || $status < 200 || $status >= 300) {
        throw new RuntimeException('Téléchargement de la mise à jour impossible' . ($error !== '' ? ' : ' . $error : '.'));
    }
    return ['body' => $body, 'effectiveUrl' => $effectiveUrl];
}

function updateDownloadFile(string $url, string $destination, int $maximumBytes = 100_000_000): void
{
    assertTrustedReleaseAssetUrl($url);
    if (!extension_loaded('curl')) throw new RuntimeException('L’extension PHP cURL est requise pour les mises à jour.');
    $stream = @fopen($destination, 'wb');
    if ($stream === false) throw new RuntimeException('Impossible de préparer le fichier de mise à jour.');
    $received = 0;
    $handle = curl_init($url);
    if ($handle === false) {
        fclose($stream);
        throw new RuntimeException('Impossible d’initialiser le téléchargement.');
    }
    curl_setopt_array($handle, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => updateEnvInteger('PULSENOTES_UPDATE_TIMEOUT', 300, 60, 900),
        CURLOPT_USERAGENT => 'PulseNotesUpdater/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_WRITEFUNCTION => static function ($unused, string $chunk) use ($stream, &$received, $maximumBytes): int {
            $received += strlen($chunk);
            if ($received > $maximumBytes) return 0;
            $written = fwrite($stream, $chunk);
            return $written === false ? 0 : $written;
        },
    ]);
    if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) curl_setopt($handle, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    $success = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $effectiveUrl = (string) curl_getinfo($handle, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($handle);
    curl_close($handle);
    fclose($stream);
    if ($success === false || $status < 200 || $status >= 300) {
        @unlink($destination);
        throw new RuntimeException('Téléchargement de l’archive impossible' . ($error !== '' ? ' : ' . $error : '.'));
    }
    assertTrustedDownloadDestination($effectiveUrl);
}

/** @return array<string,mixed> */
function cachedUpdateState(): array
{
    return updateReadJson(updateRuntimeDirectory() . DIRECTORY_SEPARATOR . PULSENOTES_UPDATE_STATE_FILE);
}

/** @param array<string,mixed> $state */
function writeUpdateState(array $state): void
{
    updateWriteJson(updateRuntimeDirectory() . DIRECTORY_SEPARATOR . PULSENOTES_UPDATE_STATE_FILE, $state);
}

/** @return array<string,mixed>|null */
function updateMaintenanceState(): ?array
{
    $path = updateRuntimeDirectory() . DIRECTORY_SEPARATOR . PULSENOTES_MAINTENANCE_FILE;
    $state = updateReadJson($path);
    if ($state === []) return null;
    $startedAt = (int) ($state['startedAt'] ?? 0);
    if ($startedAt > 0 && $startedAt < time() - 1_200) {
        @unlink($path);
        return null;
    }
    return $state;
}

/** @param array<string,mixed> $state */
function writeUpdateMaintenance(array $state): void
{
    updateWriteJson(updateRuntimeDirectory() . DIRECTORY_SEPARATOR . PULSENOTES_MAINTENANCE_FILE, $state);
}

function clearUpdateMaintenance(): void
{
    @unlink(updateRuntimeDirectory() . DIRECTORY_SEPARATOR . PULSENOTES_MAINTENANCE_FILE);
}

/** @return array<string,mixed> */
function checkForUpdate(bool $force = false): array
{
    $installed = installedReleaseMetadata();
    $state = cachedUpdateState();
    if (!updateEnabled()) {
        return [...$state, 'enabled' => false, 'currentVersion' => $installed['version'], 'available' => false];
    }
    $ttl = updateEnvInteger('PULSENOTES_UPDATE_CHECK_TTL', 900, 300, 86_400);
    if (!$force && (int) ($state['checkedAt'] ?? 0) > time() - $ttl) {
        $cachedLatest = (string) ($state['latestVersion'] ?? '');
        return [
            ...$state,
            'enabled' => true,
            'currentVersion' => $installed['version'],
            'available' => $cachedLatest !== '' && version_compare($cachedLatest, $installed['version'], '>'),
        ];
    }

    $lock = @fopen(updateRuntimeDirectory() . DIRECTORY_SEPARATOR . 'check.lock', 'c+');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        if (is_resource($lock)) fclose($lock);
        $cachedLatest = (string) ($state['latestVersion'] ?? '');
        return [
            ...$state,
            'enabled' => true,
            'currentVersion' => $installed['version'],
            'available' => $cachedLatest !== '' && version_compare($cachedLatest, $installed['version'], '>'),
        ];
    }
    try {
        $response = updateHttpGet(updateReleaseApiUrl());
        $release = json_decode($response['body'], true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($release) || !empty($release['draft']) || !empty($release['prerelease'])) {
            throw new RuntimeException('La réponse GitHub ne décrit pas une release stable.');
        }
        $tag = trim((string) ($release['tag_name'] ?? ''));
        $latestVersion = ltrim($tag, 'vV');
        if (preg_match('/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/', $latestVersion) !== 1) {
            throw new RuntimeException('La version publiée est invalide.');
        }
        $mode = function_exists('deploymentMode') ? deploymentMode() : 'selfhosted';
        $archiveName = $mode === 'global' ? 'pulsenotes-global.zip' : 'pulsenotes-personal.zip';
        $hashName = $archiveName . '.sha256';
        $archiveUrl = '';
        $hashUrl = '';
        $githubDigest = '';
        foreach (is_array($release['assets'] ?? null) ? $release['assets'] : [] as $asset) {
            if (!is_array($asset)) continue;
            $name = (string) ($asset['name'] ?? '');
            if ($name === $archiveName) {
                $archiveUrl = (string) ($asset['browser_download_url'] ?? '');
                $githubDigest = (string) ($asset['digest'] ?? '');
            } elseif ($name === $hashName) {
                $hashUrl = (string) ($asset['browser_download_url'] ?? '');
            }
        }
        if ($archiveUrl === '' || $hashUrl === '') throw new RuntimeException('La release ne contient pas les fichiers attendus.');
        assertTrustedReleaseAssetUrl($archiveUrl);
        assertTrustedReleaseAssetUrl($hashUrl);
        $available = version_compare($latestVersion, $installed['version'], '>');
        $previousVersion = (string) ($state['latestVersion'] ?? '');
        $publishedAt = strtotime((string) ($release['published_at'] ?? '')) ?: time();
        $state = [
            'enabled' => true,
            'checkedAt' => time(),
            'currentVersion' => $installed['version'],
            'latestVersion' => $latestVersion,
            'publishedAt' => $publishedAt,
            'firstSeenAt' => $previousVersion === $latestVersion ? (int) ($state['firstSeenAt'] ?? time()) : time(),
            'available' => $available,
            'archiveUrl' => $archiveUrl,
            'hashUrl' => $hashUrl,
            'githubDigest' => $githubDigest,
            'lastError' => '',
            'lastInstallError' => $previousVersion === $latestVersion ? (string) ($state['lastInstallError'] ?? '') : '',
            'lastInstallAttemptAt' => $previousVersion === $latestVersion ? (int) ($state['lastInstallAttemptAt'] ?? 0) : 0,
        ];
        writeUpdateState($state);
        return $state;
    } catch (Throwable $error) {
        $cachedLatest = (string) ($state['latestVersion'] ?? '');
        $state = [
            ...$state,
            'enabled' => true,
            'checkedAt' => time(),
            'currentVersion' => $installed['version'],
            'available' => $cachedLatest !== '' && version_compare($cachedLatest, $installed['version'], '>'),
            'lastError' => $error->getMessage(),
        ];
        writeUpdateState($state);
        return $state;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/** @return array<string,mixed> */
function calculateUpdatePolicy(string $mode, bool $connected, bool $available, int $publishedAt, int $graceDays, int $now, bool $retryBlocked = false): array
{
    $mandatoryOnLogout = $mode === 'selfhosted' && $available && $now >= $publishedAt + ($graceDays * 86_400);
    return [
        'mandatoryOnLogout' => $mandatoryOnLogout,
        'required' => !$retryBlocked && $available && ($mode === 'global' || ($mandatoryOnLogout && !$connected)),
        'forceAfter' => $mode === 'selfhosted' && $available ? $publishedAt + ($graceDays * 86_400) : null,
    ];
}

/** @return array<string,mixed> */
function publicUpdateStatus(bool $connected, bool $forceCheck = false): array
{
    $state = checkForUpdate($forceCheck);
    $maintenance = updateMaintenanceState();
    $available = !empty($state['available']);
    $publishedAt = (int) ($state['publishedAt'] ?? $state['firstSeenAt'] ?? time());
    $graceDays = updateEnvInteger('PULSENOTES_SELFHOST_FORCE_AFTER_DAYS', 15, 1, 90);
    $retryAt = (int) ($state['lastInstallAttemptAt'] ?? 0) + 900;
    $retryBlocked = (string) ($state['lastInstallError'] ?? '') !== '' && $retryAt > time();
    $policy = calculateUpdatePolicy(deploymentMode(), $connected, $available, $publishedAt, $graceDays, time(), $retryBlocked);
    $parent = dirname(dirname(__DIR__));
    $supported = PHP_VERSION_ID >= 80100 && extension_loaded('curl') && class_exists('ZipArchive') && is_writable($parent) && is_file(__DIR__ . DIRECTORY_SEPARATOR . 'config.php');
    return [
        'enabled' => !empty($state['enabled']),
        'available' => $available,
        'required' => !empty($policy['required']) || $maintenance !== null,
        'mandatoryOnLogout' => !empty($policy['mandatoryOnLogout']),
        'maintenance' => $maintenance !== null,
        'phase' => (string) ($maintenance['phase'] ?? 'idle'),
        'currentVersion' => (string) ($state['currentVersion'] ?? installedReleaseMetadata()['version']),
        'latestVersion' => (string) ($state['latestVersion'] ?? ''),
        'publishedAt' => $publishedAt,
        'forceAfter' => $policy['forceAfter'],
        'supported' => $supported,
        'supportError' => $supported ? '' : 'L’hébergement doit utiliser PHP 8.1+, fournir cURL et ZipArchive, conserver api/config.php et autoriser l’écriture dans le dossier parent.',
        'checkFailed' => (string) ($state['lastError'] ?? '') !== '',
        'retryAt' => $retryBlocked ? $retryAt : null,
    ];
}

function updateRemoveTree(string $directory): void
{
    if (!file_exists($directory)) return;
    if (is_link($directory) || is_file($directory)) {
        if (!@unlink($directory)) throw new RuntimeException('Impossible de supprimer un ancien fichier de mise à jour.');
        return;
    }
    foreach (scandir($directory) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        updateRemoveTree($directory . DIRECTORY_SEPARATOR . $entry);
    }
    if (!@rmdir($directory)) throw new RuntimeException('Impossible de nettoyer un ancien dossier de mise à jour.');
}

function updateCopyTree(string $source, string $destination): void
{
    if (is_link($source)) throw new RuntimeException('Un lien symbolique persistant a été refusé.');
    if (is_file($source)) {
        if (!is_dir(dirname($destination)) && !mkdir(dirname($destination), 0700, true) && !is_dir(dirname($destination))) {
            throw new RuntimeException('Impossible de préparer un dossier persistant.');
        }
        if (!copy($source, $destination)) throw new RuntimeException('Impossible de conserver un fichier persistant.');
        $permissions = fileperms($source);
        if ($permissions !== false) @chmod($destination, $permissions & 0777);
        return;
    }
    if (!is_dir($source)) return;
    if (!is_dir($destination) && !mkdir($destination, 0700, true) && !is_dir($destination)) {
        throw new RuntimeException('Impossible de conserver un dossier persistant.');
    }
    foreach (scandir($source) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        updateCopyTree($source . DIRECTORY_SEPARATOR . $entry, $destination . DIRECTORY_SEPARATOR . $entry);
    }
}

function normalizeUpdatePermissions(string $directory): void
{
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iterator as $item) {
        $path = $item->getPathname();
        if ($item->isLink()) throw new RuntimeException('Un lien symbolique a été détecté après extraction.');
        @chmod($path, $item->isDir() ? 0755 : 0644);
    }
    $api = $directory . DIRECTORY_SEPARATOR . 'api';
    if (!@chmod($api . DIRECTORY_SEPARATOR . 'config.php', 0600)) throw new RuntimeException('Impossible de protéger la configuration de la nouvelle version.');
    @chmod($api . DIRECTORY_SEPARATOR . 'update.sh', 0700);
    foreach (['data', 'runtime'] as $persistentName) {
        $persistent = $api . DIRECTORY_SEPARATOR . $persistentName;
        if (!is_dir($persistent)) continue;
        @chmod($persistent, 0700);
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($persistent, FilesystemIterator::SKIP_DOTS)) as $item) {
            if ($item->isFile() && $item->getFilename() !== '.htaccess') @chmod($item->getPathname(), 0600);
        }
    }
}

function validateUpdateArchive(string $archivePath, string $destination): void
{
    if (!class_exists('ZipArchive')) throw new RuntimeException('L’extension PHP ZipArchive est requise pour les mises à jour.');
    $archive = new ZipArchive();
    if ($archive->open($archivePath) !== true) throw new RuntimeException('L’archive de mise à jour est illisible.');
    $totalSize = 0;
    try {
        if ($archive->numFiles < 4 || $archive->numFiles > 5_000) throw new RuntimeException('L’archive contient un nombre de fichiers invalide.');
        for ($index = 0; $index < $archive->numFiles; $index++) {
            $entry = $archive->statIndex($index);
            $name = is_array($entry) ? (string) ($entry['name'] ?? '') : '';
            $normalized = str_replace('\\', '/', $name);
            $segments = explode('/', trim($normalized, '/'));
            if ($name === '' || str_contains($name, "\0") || str_contains($name, '\\') || str_starts_with($normalized, '/') || preg_match('/^[A-Za-z]:/', $normalized) === 1 || in_array('..', $segments, true)) {
                throw new RuntimeException('L’archive contient un chemin dangereux.');
            }
            $totalSize += (int) ($entry['size'] ?? 0);
            if ($totalSize > 150_000_000) throw new RuntimeException('L’archive décompressée est trop volumineuse.');
            $operatingSystem = 0;
            $attributes = 0;
            if ($archive->getExternalAttributesIndex($index, $operatingSystem, $attributes)) {
                $type = ($attributes >> 16) & 0170000;
                if ($type === 0120000) throw new RuntimeException('Les liens symboliques sont interdits dans une mise à jour.');
            }
        }
        if (!$archive->extractTo($destination)) throw new RuntimeException('Impossible d’extraire la mise à jour.');
    } finally {
        $archive->close();
    }
    foreach (['index.html', 'api/index.php', 'api/router.php', 'api/updater.php', 'api/version.json'] as $required) {
        if (!is_file($destination . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $required))) {
            throw new RuntimeException('La mise à jour est incomplète : ' . $required . ' manque.');
        }
    }
    $metadata = updateReadJson($destination . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'version.json');
    if (trim((string) ($metadata['version'] ?? '')) === '') throw new RuntimeException('La version de l’archive est introuvable.');
    $expectedMode = deploymentMode() === 'global' ? 'global' : 'personal';
    if ((string) ($metadata['mode'] ?? '') !== $expectedMode) throw new RuntimeException('L’archive ne correspond pas au mode de déploiement.');
}

/** @return array<string,mixed> */
function installAvailableUpdate(): array
{
    if (!updateEnabled()) throw new RuntimeException('Les mises à jour automatiques sont désactivées.');
    $state = checkForUpdate(false);
    if (empty($state['available'])) throw new RuntimeException('Aucune mise à jour n’est disponible.');
    $targetVersion = (string) ($state['latestVersion'] ?? '');
    if ($targetVersion === '') throw new RuntimeException('La version cible est inconnue.');

    $runtime = updateRuntimeDirectory();
    $lock = @fopen($runtime . DIRECTORY_SEPARATOR . 'install.lock', 'c+');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        if (is_resource($lock)) fclose($lock);
        throw new RuntimeException('Une mise à jour est déjà en cours.');
    }

    $appDirectory = dirname(__DIR__);
    $parentDirectory = dirname($appDirectory);
    if (!is_writable($parentDirectory)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        throw new RuntimeException('Le dossier parent de PulseNotes n’est pas accessible en écriture.');
    }
    if (!is_file($appDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config.php')) {
        flock($lock, LOCK_UN);
        fclose($lock);
        throw new RuntimeException('La configuration de PulseNotes est introuvable.');
    }
    $identifier = bin2hex(random_bytes(8));
    $workDirectory = $parentDirectory . DIRECTORY_SEPARATOR . '.pulsenotes-update-' . $identifier;
    $stageDirectory = $workDirectory . DIRECTORY_SEPARATOR . 'stage';
    $backupDirectory = $parentDirectory . DIRECTORY_SEPARATOR . '.pulsenotes-backup';
    $swapped = false;
    $movedCurrent = false;

    ignore_user_abort(true);
    @set_time_limit(updateEnvInteger('PULSENOTES_UPDATE_TIMEOUT', 300, 60, 900));
    try {
        writeUpdateMaintenance(['phase' => 'download', 'startedAt' => time(), 'targetVersion' => $targetVersion]);
        if (!mkdir($workDirectory, 0700, true) || file_put_contents($workDirectory . DIRECTORY_SEPARATOR . '.htaccess', "Require all denied\n") === false || !mkdir($stageDirectory, 0700, true)) {
            throw new RuntimeException('Impossible de préparer les dossiers temporaires.');
        }
        $archivePath = $workDirectory . DIRECTORY_SEPARATOR . 'release.zip';
        updateDownloadFile((string) $state['archiveUrl'], $archivePath);
        writeUpdateMaintenance(['phase' => 'verification', 'startedAt' => time(), 'targetVersion' => $targetVersion]);
        assertTrustedReleaseAssetUrl((string) $state['hashUrl']);
        $hashResponse = updateHttpGet((string) $state['hashUrl'], 10_000);
        assertTrustedDownloadDestination($hashResponse['effectiveUrl']);
        if (preg_match('/\b([a-f0-9]{64})\b/i', $hashResponse['body'], $matches) !== 1) {
            throw new RuntimeException('L’empreinte publiée est invalide.');
        }
        $expectedHash = strtolower($matches[1]);
        $actualHash = hash_file('sha256', $archivePath);
        if ($actualHash === false || !hash_equals($expectedHash, strtolower($actualHash))) {
            throw new RuntimeException('L’empreinte SHA-256 de la mise à jour ne correspond pas.');
        }
        $githubDigest = strtolower((string) ($state['githubDigest'] ?? ''));
        if (str_starts_with($githubDigest, 'sha256:') && !hash_equals(substr($githubDigest, 7), strtolower($actualHash))) {
            throw new RuntimeException('L’empreinte GitHub de la mise à jour ne correspond pas.');
        }

        writeUpdateMaintenance(['phase' => 'preparation', 'startedAt' => time(), 'targetVersion' => $targetVersion]);
        validateUpdateArchive($archivePath, $stageDirectory);
        $stagedMetadata = updateReadJson($stageDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'version.json');
        if ((string) ($stagedMetadata['version'] ?? '') !== $targetVersion) {
            throw new RuntimeException('La version de l’archive ne correspond pas à la release annoncée.');
        }
        updateCopyTree($appDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config.php', $stageDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config.php');
        updateCopyTree($appDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'data', $stageDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'data');
        foreach ([PULSENOTES_UPDATE_STATE_FILE, PULSENOTES_MAINTENANCE_FILE] as $runtimeFile) {
            updateCopyTree(
                $appDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . $runtimeFile,
                $stageDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . $runtimeFile
            );
        }
        normalizeUpdatePermissions($stageDirectory);

        writeUpdateMaintenance(['phase' => 'installation', 'startedAt' => time(), 'targetVersion' => $targetVersion]);
        if (file_exists($backupDirectory)) updateRemoveTree($backupDirectory);
        if (!@rename($appDirectory, $backupDirectory)) throw new RuntimeException('Impossible de sauvegarder la version actuelle.');
        $movedCurrent = true;
        if (!@rename($stageDirectory, $appDirectory)) {
            @rename($backupDirectory, $appDirectory);
            $movedCurrent = false;
            throw new RuntimeException('Impossible d’activer la nouvelle version.');
        }
        $swapped = true;
        $newState = [
            'enabled' => true,
            'checkedAt' => time(),
            'currentVersion' => $targetVersion,
            'latestVersion' => $targetVersion,
            'publishedAt' => (int) ($state['publishedAt'] ?? time()),
            'firstSeenAt' => (int) ($state['firstSeenAt'] ?? time()),
            'available' => false,
            'lastError' => '',
            'installedAt' => time(),
        ];
        updateWriteJson($appDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . PULSENOTES_UPDATE_STATE_FILE, $newState);
        @unlink($appDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . PULSENOTES_MAINTENANCE_FILE);
        if (function_exists('opcache_reset')) @opcache_reset();
        return ['ok' => true, 'version' => $targetVersion];
    } catch (Throwable $error) {
        if ($swapped && is_dir($appDirectory) && is_dir($backupDirectory)) {
            $failedDirectory = $parentDirectory . DIRECTORY_SEPARATOR . '.pulsenotes-failed-' . $identifier;
            if (@rename($appDirectory, $failedDirectory)) {
                if (@rename($backupDirectory, $appDirectory)) {
                    $swapped = false;
                    $movedCurrent = false;
                    try { updateRemoveTree($failedDirectory); } catch (Throwable) {}
                } else {
                    @rename($failedDirectory, $appDirectory);
                }
            }
        } elseif ($movedCurrent && !is_dir($appDirectory) && is_dir($backupDirectory)) {
            @rename($backupDirectory, $appDirectory);
            $movedCurrent = false;
        }
        $activeRuntime = $appDirectory . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'runtime';
        if (is_dir($activeRuntime)) {
            @unlink($activeRuntime . DIRECTORY_SEPARATOR . PULSENOTES_MAINTENANCE_FILE);
            $failureState = cachedUpdateState();
            $failureState['lastInstallError'] = $error->getMessage();
            $failureState['lastInstallAttemptAt'] = time();
            try { updateWriteJson($activeRuntime . DIRECTORY_SEPARATOR . PULSENOTES_UPDATE_STATE_FILE, $failureState); } catch (Throwable) {}
        }
        throw $error;
    } finally {
        if (is_dir($workDirectory)) {
            try { updateRemoveTree($workDirectory); } catch (Throwable) {}
        }
        if (!$swapped && is_dir($stageDirectory)) {
            try { updateRemoveTree($stageDirectory); } catch (Throwable) {}
        }
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
