<?php

declare(strict_types=1);

const CAS_ORIGIN = 'https://cas2.uvsq.fr';
const CAS_LOGIN = 'https://cas2.uvsq.fr/login';
const BULLETINS_ORIGIN = 'https://bulletins.iut-velizy.uvsq.fr';
const STATS_CACHE_VERSION = 1;
const STATS_CACHE_TTL = 45;
const USER_DATA_RETENTION_DAYS = 180;

class AuthenticationRequired extends RuntimeException
{
}

final class StoredCredentialInvalid extends AuthenticationRequired
{
}

function deploymentMode(): string
{
    $mode = strtolower(trim((string) getenv('PULSENOTES_DEPLOYMENT_MODE')));
    return $mode === 'global' ? 'global' : 'selfhosted';
}

function applicationKey(): string
{
    $secret = trim((string) getenv('PULSENOTES_APP_KEY'));
    if ($secret === '' && deploymentMode() === 'global') throw new RuntimeException('PULSENOTES_APP_KEY est requis en mode global.');
    return hash('sha256', $secret !== '' ? $secret : 'pulsenotes-selfhosted', true);
}

function applicationDatabase(): PDO
{
    static $database = null;
    if ($database instanceof PDO) return $database;
    $dsn = trim((string) getenv('PULSENOTES_DATABASE_DSN'));
    if (deploymentMode() === 'selfhosted') {
        $directory = __DIR__ . DIRECTORY_SEPARATOR . 'data';
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Impossible de créer le stockage local.');
        $path = trim((string) getenv('PULSENOTES_SQLITE_PATH')) ?: $directory . DIRECTORY_SEPARATOR . 'pulsenotes.sqlite';
        $dsn = 'sqlite:' . $path;
    } elseif ($dsn === '' || str_starts_with(strtolower($dsn), 'sqlite:')) {
        throw new RuntimeException('Une base MySQL ou PostgreSQL est requise en mode global.');
    }
    $database = new PDO($dsn, (string) getenv('PULSENOTES_DATABASE_USER'), (string) getenv('PULSENOTES_DATABASE_PASSWORD'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $database->exec('CREATE TABLE IF NOT EXISTS evaluation_state (user_key VARCHAR(64) NOT NULL, evaluation_id VARCHAR(191) NOT NULL, fingerprint VARCHAR(64) NOT NULL, state VARCHAR(16) NOT NULL, updated_at BIGINT NOT NULL, seen_at BIGINT NULL, PRIMARY KEY (user_key, evaluation_id))');
    $database->exec('CREATE TABLE IF NOT EXISTS evaluation_record (user_key VARCHAR(64) NOT NULL, record_key VARCHAR(64) NOT NULL, identity_key VARCHAR(64) NOT NULL, sealed TEXT NOT NULL, updated_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL, PRIMARY KEY (user_key, record_key))');
    $database->exec('CREATE TABLE IF NOT EXISTS user_activity (user_key VARCHAR(64) PRIMARY KEY, last_seen_at BIGINT NOT NULL)');
    $database->exec('CREATE TABLE IF NOT EXISTS note_share (token VARCHAR(64) PRIMARY KEY, user_key VARCHAR(64) NOT NULL, evaluation_id VARCHAR(191) NOT NULL, payload TEXT NOT NULL, created_at BIGINT NOT NULL, revoked_at BIGINT NULL, missing_at BIGINT NULL)');
    if (deploymentMode() === 'global') $database->exec('CREATE TABLE IF NOT EXISTS app_session (session_id VARCHAR(128) PRIMARY KEY, data TEXT NOT NULL, expires_at BIGINT NOT NULL)');
    else $database->exec('CREATE TABLE IF NOT EXISTS personal_account (singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1), username TEXT NOT NULL, credential_cipher TEXT NOT NULL, credential_iv TEXT NOT NULL, credential_tag TEXT NOT NULL, credential_salt TEXT NOT NULL, local_hash TEXT NOT NULL, auth_method TEXT NOT NULL, credential_invalid INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    return $database;
}

/** @return array<string,mixed>|null */
function personalAccount(): ?array
{
    if (deploymentMode() !== 'selfhosted') return null;
    $value = applicationDatabase()->query('SELECT * FROM personal_account WHERE singleton_id = 1')->fetch();
    return is_array($value) ? $value : null;
}

function personalAuthMethod(string $method): string
{
    if (!in_array($method, ['pin4', 'pin8', 'pattern', 'password'], true)) throw new InvalidArgumentException('Méthode de connexion personnelle invalide.');
    return $method;
}

function validatePersonalSecret(string $method, string $secret): void
{
    $valid = match ($method) {
        'pin4' => preg_match('/^\d{4}$/', $secret) === 1,
        'pin8' => preg_match('/^\d{8}$/', $secret) === 1,
        'pattern' => preg_match('/^[1-9]{4,9}$/', $secret) === 1 && count(array_unique(str_split($secret))) === strlen($secret),
        'password' => strlen($secret) >= 8 && strlen($secret) <= 128,
        default => false,
    };
    if (!$valid) throw new InvalidArgumentException(match ($method) {
        'pin4' => 'Le code PIN doit contenir exactement 4 chiffres.',
        'pin8' => 'Le code PIN doit contenir exactement 8 chiffres.',
        'pattern' => 'Le schéma doit relier 4 à 9 points différents.',
        default => 'Le mot de passe local doit contenir au moins 8 caractères.',
    });
}

function derivePersonalKey(string $secret, string $salt): string
{
    return hash_pbkdf2('sha256', $secret, $salt, 210000, 32, true);
}

/** @return array{cipher:string,iv:string,tag:string,salt:string,key:string} */
function encryptPersonalCredential(string $password, string $secret): array
{
    $salt = random_bytes(16);
    $key = derivePersonalKey($secret, $salt);
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($password, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Impossible de chiffrer les identifiants personnels.');
    return ['cipher' => base64_encode($cipher), 'iv' => base64_encode($iv), 'tag' => base64_encode($tag), 'salt' => base64_encode($salt), 'key' => $key];
}

function decryptPersonalCredential(array $account, string $key): string
{
    $cipher = base64_decode((string) $account['credential_cipher'], true);
    $iv = base64_decode((string) $account['credential_iv'], true);
    $tag = base64_decode((string) $account['credential_tag'], true);
    if ($cipher === false || $iv === false || $tag === false) throw new RuntimeException('Identifiants personnels illisibles.');
    $password = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if (!is_string($password)) throw new AuthenticationRequired('Le code local est incorrect.');
    return $password;
}

function storePersonalAccount(string $username, string $password, string $method, string $secret): string
{
    $method = personalAuthMethod($method);
    validatePersonalSecret($method, $secret);
    $encrypted = encryptPersonalCredential($password, $secret);
    $statement = applicationDatabase()->prepare('INSERT OR REPLACE INTO personal_account (singleton_id, username, credential_cipher, credential_iv, credential_tag, credential_salt, local_hash, auth_method, credential_invalid, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, 0, COALESCE((SELECT created_at FROM personal_account WHERE singleton_id = 1), ?), ?)');
    $now = time();
    $statement->execute([$username, $encrypted['cipher'], $encrypted['iv'], $encrypted['tag'], $encrypted['salt'], password_hash($secret, PASSWORD_DEFAULT), $method, $now, $now]);
    return $encrypted['key'];
}

function markPersonalCredentialInvalid(bool $invalid): void
{
    if (deploymentMode() === 'selfhosted') applicationDatabase()->prepare('UPDATE personal_account SET credential_invalid = ?, updated_at = ? WHERE singleton_id = 1')->execute([$invalid ? 1 : 0, time()]);
}

function personalSessionKey(): ?string
{
    $encoded = (string) ($_SESSION['personalUnlockKey'] ?? '');
    $key = $encoded === '' ? false : base64_decode($encoded, true);
    return is_string($key) && strlen($key) === 32 ? $key : null;
}

function encryptPersonalCredentialWithKey(string $password, string $key): array
{
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($password, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Impossible de chiffrer les identifiants personnels.');
    return ['cipher' => base64_encode($cipher), 'iv' => base64_encode($iv), 'tag' => base64_encode($tag)];
}

function loginStoredPersonal(RemoteBrowser $browser, array $account, string $key): void
{
    $password = decryptPersonalCredential($account, $key);
    try {
        loginCas($browser, (string) $account['username'], $password);
    } catch (AuthenticationRequired $error) {
        markPersonalCredentialInvalid(true);
        throw new StoredCredentialInvalid('Votre mot de passe UVSQ a changé ou n’est plus accepté. Mettez-le à jour pour continuer.');
    } finally {
        $password = '';
        unset($password);
    }
    markPersonalCredentialInvalid(false);
}

function authenticatedRemoteBrowser(): RemoteBrowser
{
    if (!empty($_SESSION['remoteCookies'])) return new RemoteBrowser($_SESSION['remoteCookies']);
    if (deploymentMode() !== 'selfhosted') throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
    $account = personalAccount();
    $key = personalSessionKey();
    if ($account === null || $key === null) throw new AuthenticationRequired('Déverrouillez votre installation personnelle.');
    $browser = new RemoteBrowser();
    loginStoredPersonal($browser, $account, $key);
    $_SESSION['remoteCookies'] = $browser->cookies();
    $_SESSION['username'] = (string) $account['username'];
    return $browser;
}

function withAuthenticatedBrowser(callable $request): mixed
{
    $browser = authenticatedRemoteBrowser();
    try {
        return $request($browser);
    } catch (AuthenticationRequired $error) {
        if (deploymentMode() !== 'selfhosted') throw $error;
        $account = personalAccount();
        $key = personalSessionKey();
        if ($account === null || $key === null) throw $error;
        $browser = new RemoteBrowser();
        loginStoredPersonal($browser, $account, $key);
        return $request($browser);
    } finally {
        $_SESSION['remoteCookies'] = $browser->cookies();
    }
}

function assertPersonalUnlockAllowed(): void
{
    $until = (int) ($_SESSION['personalLockUntil'] ?? 0);
    if ($until > time()) throw new InvalidArgumentException('Trop de tentatives. Réessayez dans ' . ($until - time()) . ' secondes.');
}

function recordPersonalUnlockFailure(): void
{
    $attempts = (int) ($_SESSION['personalUnlockAttempts'] ?? 0) + 1;
    $_SESSION['personalUnlockAttempts'] = $attempts;
    if ($attempts >= 5) {
        $_SESSION['personalLockUntil'] = time() + 60;
        $_SESSION['personalUnlockAttempts'] = 0;
    }
}

function clearPersonalUnlockFailures(): void
{
    unset($_SESSION['personalUnlockAttempts'], $_SESSION['personalLockUntil']);
}

final class DatabaseSessionHandler implements SessionHandlerInterface
{
    public function __construct(private PDO $database, private string $key) {}
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }
    public function read(string $id): string|false
    {
        $statement = $this->database->prepare('SELECT data FROM app_session WHERE session_id = ? AND expires_at > ?');
        $statement->execute([$id, time()]);
        $value = $statement->fetchColumn();
        if (!is_string($value)) return '';
        $payload = base64_decode($value, true);
        if ($payload === false || strlen($payload) < 29) return '';
        $iv = substr($payload, 0, 12);
        $tag = substr($payload, 12, 16);
        $plain = openssl_decrypt(substr($payload, 28), 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);
        return is_string($plain) ? $plain : '';
    }
    public function write(string $id, string $data): bool
    {
        $this->database->beginTransaction();
        try {
            $this->database->prepare('DELETE FROM app_session WHERE session_id = ?')->execute([$id]);
            $iv = random_bytes(12);
            $tag = '';
            $cipher = openssl_encrypt($data, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);
            if ($cipher === false) throw new RuntimeException('Impossible de chiffrer la session.');
            $payload = base64_encode($iv . $tag . $cipher);
            $this->database->prepare('INSERT INTO app_session (session_id, data, expires_at) VALUES (?, ?, ?)')->execute([$id, $payload, time() + (int) ini_get('session.gc_maxlifetime')]);
            $this->database->commit();
            return true;
        } catch (Throwable $error) {
            if ($this->database->inTransaction()) $this->database->rollBack();
            error_log($error->getMessage());
            return false;
        }
    }
    public function destroy(string $id): bool { return $this->database->prepare('DELETE FROM app_session WHERE session_id = ?')->execute([$id]); }
    public function gc(int $maxLifetime): int|false
    {
        $statement = $this->database->prepare('DELETE FROM app_session WHERE expires_at <= ?');
        $statement->execute([time()]);
        return $statement->rowCount();
    }
}

interface RemoteClient
{
    /** @return list<string> */
    public function cookies(): array;

    /** @return array{status:int,url:string,headers:string,body:string,contentType:string} */
    public function request(string $url, array $options = []): array;
}

final class RemoteBrowser implements RemoteClient
{
    /** @var list<string> */
    private array $cookies;

    /** @param list<string> $cookies */
    public function __construct(array $cookies = [])
    {
        $this->cookies = array_values(array_filter($cookies, 'is_string'));
    }

    /** @return list<string> */
    public function cookies(): array
    {
        return $this->cookies;
    }

    /** @return array{status:int,url:string,headers:string,body:string,contentType:string} */
    public function request(string $url, array $options = []): array
    {
        $this->assertAllowedUrl($url);
        $handle = curl_init($url);
        if ($handle === false) {
            throw new RuntimeException('Impossible d\'initialiser cURL.');
        }

        curl_setopt($handle, CURLOPT_COOKIEFILE, '');
        foreach ($this->cookies as $cookieLine) {
            curl_setopt($handle, CURLOPT_COOKIELIST, $cookieLine);
        }

        $defaults = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_AUTOREFERER => true,
            CURLOPT_MAXREDIRS => 12,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 35,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; PulseNotesPrivateProxy/0.2)',
            CURLOPT_ENCODING => '',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];

        if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
            $defaults[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
        }
        if (defined('CURLOPT_REDIR_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
            $defaults[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTPS;
        }

        curl_setopt_array($handle, array_replace($defaults, $options));
        $raw = curl_exec($handle);
        if ($raw === false) {
            $error = curl_error($handle);
            curl_close($handle);
            throw new RuntimeException('Erreur cURL : ' . $error);
        }

        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $effectiveUrl = (string) curl_getinfo($handle, CURLINFO_EFFECTIVE_URL);
        $headerSize = (int) curl_getinfo($handle, CURLINFO_HEADER_SIZE);
        $contentType = (string) (curl_getinfo($handle, CURLINFO_CONTENT_TYPE) ?: '');
        $this->assertAllowedUrl($effectiveUrl);

        $cookieList = curl_getinfo($handle, CURLINFO_COOKIELIST);
        if (is_array($cookieList)) {
            $this->cookies = array_values(array_filter($cookieList, 'is_string'));
        }
        curl_close($handle);

        return [
            'status' => $status,
            'url' => $effectiveUrl,
            'headers' => substr($raw, 0, $headerSize),
            'body' => substr($raw, $headerSize),
            'contentType' => $contentType,
        ];
    }

    private function assertAllowedUrl(string $url): void
    {
        $scheme = strtolower((string) (parse_url($url, PHP_URL_SCHEME) ?: ''));
        $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?: ''));
        if ($scheme !== 'https') {
            throw new RuntimeException('Seules les destinations HTTPS sont autorisées.');
        }
        if (!in_array($host, ['cas2.uvsq.fr', 'bulletins.iut-velizy.uvsq.fr'], true)) {
            throw new RuntimeException('Hôte distant refusé.');
        }
    }
}

function startProxySession(): void
{
    if (deploymentMode() === 'global') session_set_save_handler(new DatabaseSessionHandler(applicationDatabase(), applicationKey()), true);
    session_name('PULSENOTESSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (!isset($_SESSION['remoteCookies']) || !is_array($_SESSION['remoteCookies'])) {
        $_SESSION['remoteCookies'] = [];
    }
}

/** @return array<string,mixed> */
function jsonInput(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($contentType, 'application/json')) {
        throw new InvalidArgumentException('Le corps doit être envoyé en JSON.');
    }
    $raw = file_get_contents('php://input');
    $data = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($data)) {
        throw new InvalidArgumentException('Corps JSON invalide.');
    }
    return $data;
}

function respond(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function respondInstallerScript(): never
{
    $url = 'https://github.com/mmi-place/PulseNotes/releases/latest/download/install-personal-o2switch.sh';
    $handle = curl_init($url);
    if ($handle === false) throw new RuntimeException('Impossible d\'initialiser le téléchargement de l’installateur.');
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'PulseNotesInstallerProxy/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $contentType = (string) (curl_getinfo($handle, CURLINFO_CONTENT_TYPE) ?: '');
    $error = curl_error($handle);
    curl_close($handle);
    if ($body === false) throw new RuntimeException('Téléchargement de l’installateur impossible : ' . $error);
    if ($status < 200 || $status >= 300) throw new RuntimeException('GitHub a refusé le téléchargement de l’installateur.');
    if (!str_starts_with($body, '#!/bin/bash')) throw new RuntimeException('Le contenu téléchargé n’est pas un installateur shell valide.');
    http_response_code(200);
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: inline; filename="install-personal-o2switch.sh"');
    header('Cache-Control: no-cache, must-revalidate');
    echo $body;
    exit;
}

function evaluationDatabase(): PDO
{
    return applicationDatabase();
}

function evaluationUserKey(): string
{
    $username = trim((string) ($_SESSION['username'] ?? ''));
    if ($username === '') throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
    return hash_hmac('sha256', strtolower($username), applicationKey());
}

function userDataKey(string $userKey): string
{
    return hash_hmac('sha256', "pulsenotes-user-data-v2\0" . $userKey, applicationKey(), true);
}

function sealUserData(array $value, string $userKey): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $compressed = gzdeflate($json, 6);
    if ($compressed === false) throw new RuntimeException('Impossible de compresser les données utilisateur.');
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($compressed, 'aes-256-gcm', userDataKey($userKey), OPENSSL_RAW_DATA, $iv, $tag, $userKey);
    if ($cipher === false) throw new RuntimeException('Impossible de chiffrer les données utilisateur.');
    return 'v2:' . base64_encode($iv . $tag . $cipher);
}

/** @return array<string,mixed>|null */
function openUserData(string $sealed, string $userKey): ?array
{
    if (!str_starts_with($sealed, 'v2:')) return null;
    $payload = base64_decode(substr($sealed, 3), true);
    if ($payload === false || strlen($payload) < 29) return null;
    $plain = openssl_decrypt(substr($payload, 28), 'aes-256-gcm', userDataKey($userKey), OPENSSL_RAW_DATA, substr($payload, 0, 12), substr($payload, 12, 16), $userKey);
    if (!is_string($plain)) return null;
    $json = gzinflate($plain);
    if (!is_string($json)) return null;
    $decoded = json_decode($json, true);
    return is_array($decoded) ? $decoded : null;
}

function normalizedIdentityValue(mixed $value): string
{
    $text = trim(preg_replace('/\s+/u', ' ', (string) $value) ?? '');
    $text = function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
    $ascii = function_exists('iconv') ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text) : false;
    $normalized = is_string($ascii) ? $ascii : $text;
    return trim(preg_replace('/[^a-z0-9]+/i', ' ', $normalized) ?? $normalized);
}

/** @return array{semester:string,label:string,moduleCode:string,moduleTitle:string,kind:string,ues:list<string>} */
function evaluationIdentity(array $evaluation): array
{
    $identity = is_array($evaluation['identity'] ?? null) ? $evaluation['identity'] : [];
    $ues = array_values(array_unique(array_map('normalizedIdentityValue', is_array($identity['ues'] ?? null) ? $identity['ues'] : [])));
    sort($ues);
    return [
        'semester' => normalizedIdentityValue($identity['semester'] ?? ''),
        'label' => normalizedIdentityValue($identity['label'] ?? ''),
        'moduleCode' => normalizedIdentityValue($identity['moduleCode'] ?? ''),
        'moduleTitle' => normalizedIdentityValue($identity['moduleTitle'] ?? ''),
        'kind' => normalizedIdentityValue($identity['kind'] ?? ''),
        'ues' => $ues,
    ];
}

function identityKey(array $identity, string $userKey): string
{
    return hash_hmac('sha256', json_encode($identity, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), userDataKey($userKey));
}

function textSimilarity(string $first, string $second): float
{
    if ($first === $second) return $first === '' ? 0.0 : 1.0;
    $length = max(strlen($first), strlen($second));
    return $length === 0 ? 0.0 : max(0.0, 1.0 - levenshtein($first, $second) / $length);
}

function identitySimilarity(array $first, array $second): float
{
    $firstUes = $first['ues'] ?? [];
    $secondUes = $second['ues'] ?? [];
    $union = array_unique(array_merge($firstUes, $secondUes));
    $ueScore = $union === [] ? 0.0 : count(array_intersect($firstUes, $secondUes)) / count($union);
    return textSimilarity((string) ($first['label'] ?? ''), (string) ($second['label'] ?? '')) * .46
        + ((string) ($first['moduleCode'] ?? '') !== '' && ($first['moduleCode'] ?? '') === ($second['moduleCode'] ?? '') ? .18 : 0)
        + textSimilarity((string) ($first['moduleTitle'] ?? ''), (string) ($second['moduleTitle'] ?? '')) * .10
        + $ueScore * .16
        + ((string) ($first['semester'] ?? '') !== '' && ($first['semester'] ?? '') === ($second['semester'] ?? '') ? .07 : 0)
        + ((string) ($first['kind'] ?? '') !== '' && ($first['kind'] ?? '') === ($second['kind'] ?? '') ? .03 : 0);
}

/** @return list<array{recordKey:string,identityKey:string,data:array<string,mixed>}> */
function evaluationRecords(string $userKey): array
{
    $statement = evaluationDatabase()->prepare('SELECT record_key, identity_key, sealed FROM evaluation_record WHERE user_key = ?');
    $statement->execute([$userKey]);
    $records = [];
    foreach ($statement->fetchAll() as $row) {
        $data = openUserData((string) $row['sealed'], $userKey);
        if ($data !== null) $records[] = ['recordKey' => (string) $row['record_key'], 'identityKey' => (string) $row['identity_key'], 'data' => $data];
    }
    return $records;
}

function saveEvaluationRecord(string $userKey, string $recordKey, string $identityKey, array $data, int $now): void
{
    $database = evaluationDatabase();
    $database->prepare('DELETE FROM evaluation_record WHERE user_key = ? AND record_key = ?')->execute([$userKey, $recordKey]);
    $database->prepare('INSERT INTO evaluation_record (user_key, record_key, identity_key, sealed, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$userKey, $recordKey, $identityKey, sealUserData($data, $userKey), $now, $now]);
}

/** @return array<string,mixed>|null */
function evaluationRecordById(string $userKey, string $evaluationId): ?array
{
    foreach (evaluationRecords($userKey) as $record) if (($record['data']['id'] ?? null) === $evaluationId) return $record;
    return null;
}

function touchUserActivity(string $userKey, int $now): void
{
    $database = evaluationDatabase();
    $database->prepare('DELETE FROM user_activity WHERE user_key = ?')->execute([$userKey]);
    $database->prepare('INSERT INTO user_activity (user_key, last_seen_at) VALUES (?, ?)')->execute([$userKey, $now]);
}

function cleanupInactiveUserData(int $now): void
{
    $database = evaluationDatabase();
    $threshold = $now - USER_DATA_RETENTION_DAYS * 86400;
    $statement = $database->prepare('SELECT user_key FROM user_activity WHERE last_seen_at < ?');
    $statement->execute([$threshold]);
    foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $userKey) {
        foreach (['evaluation_record', 'evaluation_state', 'note_share', 'user_activity'] as $table) $database->prepare("DELETE FROM $table WHERE user_key = ?")->execute([$userKey]);
    }
    $database->prepare('DELETE FROM evaluation_state WHERE updated_at < ? AND user_key NOT IN (SELECT user_key FROM user_activity)')->execute([$threshold]);
    $database->prepare('DELETE FROM note_share WHERE created_at < ? AND user_key NOT IN (SELECT user_key FROM user_activity)')->execute([$threshold]);
}

function migrateUserShares(string $userKey): void
{
    $database = applicationDatabase();
    $statement = $database->prepare('SELECT token, payload FROM note_share WHERE user_key = ?');
    $statement->execute([$userKey]);
    $update = $database->prepare('UPDATE note_share SET payload = ? WHERE token = ? AND user_key = ?');
    foreach ($statement->fetchAll() as $row) {
        $stored = (string) $row['payload'];
        if (str_starts_with($stored, 'v2:')) continue;
        $payload = json_decode($stored, true);
        if (is_array($payload)) $update->execute([sealUserData($payload, $userKey), (string) $row['token'], $userKey]);
    }
}

/** @return array<string,mixed> */
function validatedSharePayload(array $payload): array
{
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > 100_000) throw new InvalidArgumentException('Données de partage invalides ou trop volumineuses.');
    $evaluation = is_array($payload['evaluation'] ?? null) ? $payload['evaluation'] : [];
    $evaluationId = trim((string) ($evaluation['id'] ?? ''));
    $note = $evaluation['note'] ?? null;
    if ($evaluationId === '' || strlen($evaluationId) > 180 || (!is_int($note) && !is_float($note))) throw new InvalidArgumentException('La note à partager est invalide.');
    if ((float) $note < 0 || (float) $note > 20) throw new InvalidArgumentException('La note à partager est hors limites.');
    return $payload;
}

/** @return array<string,mixed> */
function createNoteShare(array $payload, string $evaluationSource): array
{
    $payload = validatedSharePayload($payload);
    $evaluationId = (string) $payload['evaluation']['id'];
    $userKey = evaluationUserKey();
    $sourceEvaluation = json_decode($evaluationSource, true);
    if (!is_array($sourceEvaluation) || $sourceEvaluation != $payload['evaluation']) throw new InvalidArgumentException('La note partagée ne correspond pas aux données synchronisées.');
    $record = evaluationRecordById($userKey, $evaluationId);
    if ($record === null) {
        $statement = applicationDatabase()->prepare('SELECT evaluation_id FROM evaluation_state WHERE user_key = ? AND evaluation_id = ?');
        $statement->execute([$userKey, $evaluationId]);
        if ($statement->fetchColumn() === false) throw new InvalidArgumentException('Cette note doit être chargée avant de pouvoir être partagée.');
    }
    $token = bin2hex(random_bytes(32));
    $encoded = sealUserData($payload, $userKey);
    applicationDatabase()->prepare('INSERT INTO note_share (token, user_key, evaluation_id, payload, created_at) VALUES (?, ?, ?, ?, ?)')->execute([$token, $userKey, $evaluationId, $encoded, time()]);
    return ['token' => $token, 'evaluationId' => $evaluationId, 'createdAt' => time(), 'missing' => false];
}

/** @return list<array<string,mixed>> */
function listNoteShares(?string $evaluationId = null): array
{
    $query = 'SELECT token, evaluation_id, payload, created_at, missing_at FROM note_share WHERE user_key = ? AND revoked_at IS NULL';
    $arguments = [evaluationUserKey()];
    if ($evaluationId !== null && $evaluationId !== '') { $query .= ' AND evaluation_id = ?'; $arguments[] = $evaluationId; }
    $query .= ' ORDER BY created_at DESC';
    $statement = applicationDatabase()->prepare($query);
    $statement->execute($arguments);
    $userKey = evaluationUserKey();
    return array_map(static function (array $row) use ($userKey): array {
        $payload = openUserData((string) $row['payload'], $userKey) ?? json_decode((string) $row['payload'], true);
        return ['token' => (string) $row['token'], 'evaluationId' => (string) $row['evaluation_id'], 'createdAt' => (int) $row['created_at'], 'missing' => $row['missing_at'] !== null, 'label' => (string) ($payload['evaluation']['label'] ?? 'Note partagée'), 'moduleCode' => (string) ($payload['evaluation']['moduleCode'] ?? '')];
    }, $statement->fetchAll());
}

function revokeNoteShare(string $token): void
{
    if (preg_match('/^[a-f0-9]{64}$/', $token) !== 1) throw new InvalidArgumentException('Lien de partage invalide.');
    $statement = applicationDatabase()->prepare('UPDATE note_share SET revoked_at = ? WHERE token = ? AND user_key = ? AND revoked_at IS NULL');
    $statement->execute([time(), $token, evaluationUserKey()]);
    if ($statement->rowCount() === 0) throw new InvalidArgumentException('Ce partage est introuvable ou déjà supprimé.');
}

/** @return array<string,mixed>|null */
function publicNoteShare(string $token): ?array
{
    if (preg_match('/^[a-f0-9]{64}$/', $token) !== 1) return null;
    $statement = applicationDatabase()->prepare('SELECT user_key, payload, created_at, missing_at FROM note_share WHERE token = ? AND revoked_at IS NULL');
    $statement->execute([$token]);
    $row = $statement->fetch();
    if (!is_array($row)) return null;
    $payload = openUserData((string) $row['payload'], (string) $row['user_key']) ?? json_decode((string) $row['payload'], true);
    return is_array($payload) ? ['payload' => $payload, 'createdAt' => (int) $row['created_at'], 'missing' => $row['missing_at'] !== null] : null;
}

function requestOrigin(): string
{
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
    return ($secure ? 'https' : 'http') . '://' . $host;
}

function respondSharePage(string $token): never
{
    $share = publicNoteShare($token);
    $payload = is_array($share['payload'] ?? null) ? $share['payload'] : [];
    $evaluation = is_array($payload['evaluation'] ?? null) ? $payload['evaluation'] : [];
    $student = trim((string) ($payload['studentName'] ?? '')) ?: 'Un étudiant';
    $label = trim((string) ($evaluation['label'] ?? 'Note partagée')) ?: 'Note partagée';
    $note = is_numeric($evaluation['note'] ?? null) ? rtrim(rtrim(number_format((float) $evaluation['note'], 2, ',', ''), '0'), ',') . '/20' : 'Note indisponible';
    $title = $share === null ? 'Partage indisponible · PulseNotes' : $label . ' · ' . $note;
    $description = $share === null ? 'Ce lien de partage n’existe plus.' : $student . ' partage un résultat PulseNotes : ' . $label . ', ' . $note . '.';
    $root = dirname(__DIR__);
    $isDevelopmentRequest = str_contains((string) ($_SERVER['HTTP_HOST'] ?? ''), ':5173');
    $indexCandidates = $isDevelopmentRequest
        ? [$root . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'index.html']
        : [
            $root . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'index.html',
            $root . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'index.html',
            $root . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'index.html',
        ];
    $indexPath = array_values(array_filter($indexCandidates, static fn (string $path): bool => is_file($path)))[0] ?? null;
    $html = $indexPath !== null ? file_get_contents($indexPath) : false;
    if (!is_string($html)) throw new RuntimeException('Page de l’application introuvable.');
    if ($isDevelopmentRequest) {
        $vitePreamble = '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh"; injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;</script><script type="module" src="/@vite/client"></script>';
        $html = str_replace('<head>', '<head>' . $vitePreamble, $html);
    }
    $imageUrl = requestOrigin() . '/share/' . rawurlencode($token) . '?image=1';
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $safeDescription = htmlspecialchars($description, ENT_QUOTES, 'UTF-8');
    $safeImageUrl = htmlspecialchars($imageUrl, ENT_QUOTES, 'UTF-8');
    $pageUrl = htmlspecialchars(requestOrigin() . '/share/' . rawurlencode($token), ENT_QUOTES, 'UTF-8');
    $meta = '<meta name="description" content="' . $safeDescription . '">' .
        '<meta property="og:type" content="website"><meta property="og:title" content="' . $safeTitle . '">' .
        '<meta property="og:description" content="' . $safeDescription . '"><meta property="og:url" content="' . $pageUrl . '">' .
        '<meta property="og:site_name" content="PulseNotes"><meta property="og:image" content="' . $safeImageUrl . '">' .
        '<meta property="og:image:secure_url" content="' . $safeImageUrl . '"><meta property="og:image:type" content="image/png">' .
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="' . $safeTitle . '">' .
        '<meta name="theme-color" content="#5865F2"><meta name="twitter:card" content="summary_large_image">' .
        '<meta name="twitter:title" content="' . $safeTitle . '"><meta name="twitter:description" content="' . $safeDescription . '">' .
        '<meta name="twitter:image" content="' . $safeImageUrl . '"><meta name="twitter:image:alt" content="' . $safeTitle . '">';
    $html = str_replace('</head>', $meta . '</head>', str_replace('<title>PulseNotes — mmi.place</title>', '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>', $html));
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: public, max-age=120');
    echo $html;
    exit;
}

function respondShareCard(string $token): never
{
    $share = publicNoteShare($token);
    $payload = is_array($share['payload'] ?? null) ? $share['payload'] : [];
    $evaluation = is_array($payload['evaluation'] ?? null) ? $payload['evaluation'] : [];
    $stats = is_array($payload['stats'] ?? null) ? $payload['stats'] : [];
    $student = htmlspecialchars(trim((string) ($payload['studentName'] ?? 'Étudiant')), ENT_XML1, 'UTF-8');
    $label = htmlspecialchars(trim((string) ($evaluation['label'] ?? 'Note partagée')), ENT_XML1, 'UTF-8');
    $module = htmlspecialchars(trim((string) ($evaluation['moduleCode'] ?? 'PulseNotes')), ENT_XML1, 'UTF-8');
    $note = is_numeric($evaluation['note'] ?? null) ? rtrim(rtrim(number_format((float) $evaluation['note'], 2, ',', ''), '0'), ',') : '—';
    $rank = is_numeric($stats['rank'] ?? null) && is_numeric($stats['total'] ?? null) ? '#' . (int) $stats['rank'] . ' sur ' . (int) $stats['total'] : 'Classement indisponible';
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><text x="70" y="105" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#168985">' . $module . '</text><text x="70" y="180" font-family="Arial,sans-serif" font-size="44" font-weight="800" fill="#11151c">' . $label . '</text><text x="70" y="235" font-family="Arial,sans-serif" font-size="25" fill="#666b73">' . $student . '</text><text x="70" y="425" font-family="Arial,sans-serif" font-size="150" font-weight="900" fill="#11151c">' . $note . '</text><text x="375" y="425" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="#777d86">/ 20</text><rect x="690" y="285" width="340" height="165" rx="18" fill="#11151c"/><text x="860" y="350" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#aeb5c0">RANG</text><text x="860" y="405" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="800" fill="#8bdbd2">' . $rank . '</text><text x="70" y="520" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#11151c">PulseNotes · résultat partagé</text></svg>';
    if (!class_exists('Imagick')) {
        throw new RuntimeException('Imagick est requis pour générer l’image PNG du partage.');
    }

    try {
        $image = new Imagick();
        $image->setBackgroundColor(new ImagickPixel('white'));
        $image->setOption('svg:background-color', 'white');
        $image->setResolution(144, 144);
        $image->readImageBlob($svg);
        $image->resizeImage(1200, 630, Imagick::FILTER_LANCZOS, 1);
        $image->setImageFormat('png');
        $image->setImageDepth(8);
        $image->stripImage();
        $png = $image->getImagesBlob();
        $image->clear();
        $image->destroy();
    } catch (Throwable $cause) {
        throw new RuntimeException('Impossible de convertir l’image de partage en PNG.', 0, $cause);
    }

    http_response_code($share === null ? 404 : 200);
    header('Content-Type: image/png');
    header('Content-Disposition: inline; filename="pulsenotes-share.png"');
    header('Cache-Control: public, max-age=120');
    echo $png;
    exit;
}

function synchronizeMissingShares(string $userKey, array $evaluationIds): void
{
    $database = applicationDatabase();
    $ids = array_values(array_unique(array_filter($evaluationIds, static fn ($id): bool => is_string($id) && $id !== '')));
    $database->prepare('UPDATE note_share SET missing_at = ? WHERE user_key = ? AND revoked_at IS NULL')->execute([time(), $userKey]);
    if ($ids === []) return;
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $statement = $database->prepare("UPDATE note_share SET missing_at = NULL WHERE user_key = ? AND evaluation_id IN ($placeholders) AND revoked_at IS NULL");
    $statement->execute(array_merge([$userKey], $ids));
}

/** @return array<string,string> */
function synchronizeEvaluations(array $evaluations): array
{
    $database = evaluationDatabase();
    $userKey = evaluationUserKey();
    $records = evaluationRecords($userKey);
    $recordsById = [];
    $recordsByIdentity = [];
    foreach ($records as $record) {
        $recordId = (string) ($record['data']['id'] ?? '');
        if ($recordId !== '') $recordsById[$recordId] = $record;
        $recordsByIdentity[$record['identityKey']][] = $record;
    }
    $legacyCount = $database->prepare('SELECT COUNT(*) FROM evaluation_state WHERE user_key = ?');
    $legacyCount->execute([$userKey]);
    $firstSynchronization = $records === [] && (int) $legacyCount->fetchColumn() === 0;
    $legacySelect = $database->prepare('SELECT fingerprint, state, seen_at FROM evaluation_state WHERE user_key = ? AND evaluation_id = ?');
    $states = [];
    $now = time();
    $database->beginTransaction();
    try {
        $evaluationIds = [];
        $usedRecords = [];
        foreach ($evaluations as $evaluation) {
            if (!is_array($evaluation)) continue;
            $id = trim((string) ($evaluation['id'] ?? ''));
            if ($id === '' || strlen($id) > 180) continue;
            $evaluationIds[] = $id;
            $fingerprint = hash('sha256', (string) ($evaluation['fingerprint'] ?? ''));
            $identity = evaluationIdentity($evaluation);
            $identityKey = identityKey($identity, $userKey);
            $identityCandidates = $recordsByIdentity[$identityKey] ?? [];
            $matched = $recordsById[$id] ?? (count($identityCandidates) === 1 ? $identityCandidates[0] : null);
            if (is_array($matched) && isset($usedRecords[$matched['recordKey']])) $matched = null;
            if ($matched === null) {
                $bestScore = 0.0;
                $secondScore = 0.0;
                foreach ($records as $record) {
                    if (isset($usedRecords[$record['recordKey']])) continue;
                    $score = identitySimilarity($identity, is_array($record['data']['identity'] ?? null) ? $record['data']['identity'] : []);
                    if ($score > $bestScore) { $secondScore = $bestScore; $bestScore = $score; $matched = $record; }
                    elseif ($score > $secondScore) $secondScore = $score;
                }
                if ($bestScore < .78 || $bestScore - $secondScore < .08) $matched = null;
            }
            $legacySelect->execute([$userKey, $id]);
            $legacy = $legacySelect->fetch(PDO::FETCH_ASSOC);
            $savedData = is_array($matched) ? $matched['data'] : (is_array($legacy) ? ['fingerprint' => (string) $legacy['fingerprint'], 'state' => (string) $legacy['state'], 'seenAt' => $legacy['seen_at']] : null);
            $state = $savedData === null ? ($firstSynchronization ? 'seen' : 'new') : (string) ($savedData['state'] ?? 'seen');
            if ($savedData !== null && !hash_equals((string) ($savedData['fingerprint'] ?? ''), $fingerprint)) $state = 'modified';
            $recordKey = is_array($matched) ? $matched['recordKey'] : bin2hex(random_bytes(16));
            if (is_array($matched)) $usedRecords[$recordKey] = true;
            saveEvaluationRecord($userKey, $recordKey, $identityKey, ['id' => $id, 'fingerprint' => $fingerprint, 'state' => $state, 'seenAt' => $state === 'seen' ? ($savedData['seenAt'] ?? $now) : null, 'identity' => $identity], $now);
            $states[$id] = $state;
        }
        synchronizeMissingShares($userKey, $evaluationIds);
        migrateUserShares($userKey);
        touchUserActivity($userKey, $now);
        $database->prepare('DELETE FROM evaluation_state WHERE user_key = ?')->execute([$userKey]);
        $database->commit();
    } catch (Throwable $error) {
        $database->rollBack();
        throw $error;
    }
    if (deploymentMode() === 'global') cleanupInactiveUserData($now);
    return $states;
}

function markEvaluationIdsSeen(array $ids): void
{
    $userKey = evaluationUserKey();
    $wanted = array_flip(array_unique(array_filter($ids, 'is_string')));
    $now = time();
    foreach (evaluationRecords($userKey) as $record) {
        if (!isset($wanted[(string) ($record['data']['id'] ?? '')])) continue;
        $data = $record['data'];
        $data['state'] = 'seen';
        $data['seenAt'] = $now;
        saveEvaluationRecord($userKey, $record['recordKey'], $record['identityKey'], $data, $now);
    }
}

function setEvaluationDebugState(string $id, string $state): void
{
    if (!in_array($state, ['new', 'modified', 'seen'], true)) throw new InvalidArgumentException('État de test invalide.');
    $userKey = evaluationUserKey();
    $now = time();
    $record = evaluationRecordById($userKey, $id);
    if ($record === null) throw new InvalidArgumentException('Note introuvable.');
    $data = $record['data'];
    $data['state'] = $state;
    $data['seenAt'] = $state === 'seen' ? $now : null;
    saveEvaluationRecord($userKey, $record['recordKey'], $record['identityKey'], $data, $now);
}

function resolveUrl(string $base, string $relative): string
{
    if (preg_match('~^https://~i', $relative) === 1) {
        return $relative;
    }
    $parts = parse_url($base);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        throw new RuntimeException('URL de base invalide.');
    }
    $origin = $parts['scheme'] . '://' . $parts['host'];
    if (str_starts_with($relative, '/')) {
        return $origin . $relative;
    }
    $directory = preg_replace('~/[^/]*$~', '/', (string) ($parts['path'] ?? '/')) ?: '/';
    return $origin . $directory . $relative;
}

/** @return array{action:string,fields:array<string,string>} */
function parseCasForm(string $html, string $baseUrl): array
{
    $previous = libxml_use_internal_errors(true);
    $document = new DOMDocument();
    $loaded = $document->loadHTML($html, LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$loaded) {
        throw new RuntimeException('Impossible de lire la page de connexion CAS.');
    }

    $xpath = new DOMXPath($document);
    $form = $xpath->query('//form[@id="fm1"]')->item(0)
        ?? $xpath->query('//form[.//input[@name="execution"]]')->item(0);
    if (!$form instanceof DOMElement) {
        throw new RuntimeException('Formulaire CAS introuvable.');
    }

    $action = trim($form->getAttribute('action'));
    $action = $action === '' ? $baseUrl : resolveUrl($baseUrl, $action);
    $fields = [];
    foreach ($xpath->query('.//input[@name]', $form) as $input) {
        if ($input instanceof DOMElement && $input->getAttribute('name') !== '') {
            $fields[$input->getAttribute('name')] = $input->getAttribute('value');
        }
    }
    if (empty($fields['execution'])) {
        throw new RuntimeException('Jeton d\'exécution CAS introuvable.');
    }
    return ['action' => $action, 'fields' => $fields];
}

function bulletinsServiceUrl(): string
{
    return BULLETINS_ORIGIN . '/services/doAuth.php?href=' . rawurlencode(BULLETINS_ORIGIN . '/');
}

function loginCas(RemoteClient $browser, string $username, string $password): void
{
    $loginUrl = CAS_LOGIN . '?service=' . rawurlencode(bulletinsServiceUrl());
    $loginPage = $browser->request($loginUrl);
    if (strtolower((string) parse_url($loginPage['url'], PHP_URL_HOST)) === 'bulletins.iut-velizy.uvsq.fr') {
        return;
    }

    $form = parseCasForm($loginPage['body'], $loginPage['url']);
    $fields = $form['fields'];
    $fields['username'] = $username;
    $fields['password'] = $password;
    $fields['_eventId'] = 'submit';
    $fields['geolocation'] = $fields['geolocation'] ?? '';

    $result = $browser->request($form['action'], [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($fields, '', '&', PHP_QUERY_RFC3986),
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: ' . CAS_ORIGIN,
            'Referer: ' . $loginPage['url'],
        ],
    ]);

    $fields['password'] = '';
    unset($fields, $password);
    $host = strtolower((string) parse_url($result['url'], PHP_URL_HOST));
    if ($host === 'cas2.uvsq.fr') {
        throw new AuthenticationRequired('Connexion refusée : vérifiez vos identifiants ou l’étape MFA.');
    }
    if ($host !== 'bulletins.iut-velizy.uvsq.fr') {
        throw new RuntimeException('La connexion CAS n’a pas abouti sur Bulletins.');
    }
}

function validatedBulletinsUrl(string $path, array $query): string
{
    if (!str_starts_with($path, '/') || str_starts_with($path, '//') || str_contains($path, '://') || preg_match('/[\x00-\x1F\x7F]/', $path)) {
        throw new InvalidArgumentException('Chemin Bulletins invalide.');
    }
    $queryString = http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    return BULLETINS_ORIGIN . $path . ($queryString === '' ? '' : '?' . $queryString);
}

/** @return array{status:int,url:string,headers:string,body:string,contentType:string} */
function requestBulletins(RemoteClient $browser, array $input): array
{
    $path = (string) ($input['path'] ?? '');
    $method = strtoupper((string) ($input['method'] ?? 'GET'));
    $query = is_array($input['query'] ?? null) ? $input['query'] : [];
    if (!in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], true)) {
        throw new InvalidArgumentException('Méthode HTTP refusée.');
    }

    $url = validatedBulletinsUrl($path, $query);
    $headers = ['Accept: application/json,text/plain,*/*', 'Referer: ' . BULLETINS_ORIGIN . '/'];
    $allowedHeaders = ['accept', 'content-type', 'x-requested-with'];
    foreach ((array) ($input['headers'] ?? []) as $name => $value) {
        if (is_string($name) && is_string($value) && in_array(strtolower($name), $allowedHeaders, true)) {
            $headers[] = $name . ': ' . $value;
        }
    }

    $options = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers];
    if (array_key_exists('body', $input) && $method !== 'GET' && $method !== 'HEAD') {
        $body = is_string($input['body']) ? $input['body'] : json_encode($input['body'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($body === false || strlen($body) > 2_000_000) {
            throw new InvalidArgumentException('Corps de requête invalide ou trop volumineux.');
        }
        $options[CURLOPT_POSTFIELDS] = $body;
    }

    $response = $browser->request($url, $options);
    $decoded = json_decode($response['body'], true);
    $redirect = is_array($decoded) && is_string($decoded['redirect'] ?? null) ? $decoded['redirect'] : '';
    $finalHost = strtolower((string) parse_url($response['url'], PHP_URL_HOST));
    $visitedCas = stripos($response['headers'], 'cas2.uvsq.fr') !== false;
    $authenticationNeeded = $finalHost === 'cas2.uvsq.fr' || str_contains($redirect, 'doAuth.php');

    if ($authenticationNeeded) {
        if ($redirect !== '') {
            $authentication = $browser->request(resolveUrl(BULLETINS_ORIGIN . '/', $redirect));
            if (strtolower((string) parse_url($authentication['url'], PHP_URL_HOST)) === 'cas2.uvsq.fr') {
                throw new AuthenticationRequired('Votre session UVSQ a expiré. Reconnectez-vous.');
            }
        } else {
            throw new AuthenticationRequired('Votre session UVSQ a expiré. Reconnectez-vous.');
        }
        $response = $browser->request($url, $options);
        $retryData = json_decode($response['body'], true);
        if (
            strtolower((string) parse_url($response['url'], PHP_URL_HOST)) === 'cas2.uvsq.fr'
            || (is_array($retryData) && str_contains((string) ($retryData['redirect'] ?? ''), 'doAuth.php'))
        ) {
            throw new AuthenticationRequired('Votre session UVSQ a expiré. Reconnectez-vous.');
        }
    } elseif ($visitedCas) {
        $response = $browser->request($url, $options);
    }
    return $response;
}

/** @return array{status:int,url:string,headers:string,body:string,contentType:string} */
function downloadBulletin(RemoteClient $browser, string $semester, string $document = 'bulletin', string $student = ''): array
{
    if ($semester === '' || preg_match('/^[A-Za-z0-9_-]+$/', $semester) !== 1) {
        throw new InvalidArgumentException('Identifiant de semestre invalide.');
    }
    if (!in_array($document, ['bulletin', 'grades'], true)) {
        throw new InvalidArgumentException('Type de document invalide.');
    }
    $query = $document === 'bulletin' ? ['type' => 'BUT', 'sem_id' => $semester] : ['sem_id' => $semester];
    if ($student !== '') $query['etudiant'] = $student;
    $response = requestBulletins($browser, [
        'path' => '/services/bulletin_PDF.php',
        'method' => 'POST',
        'query' => $query,
    ]);
    if ($response['status'] < 200 || $response['status'] >= 300) {
        throw new RuntimeException('Le bulletin PDF est indisponible.');
    }
    return $response;
}

function statisticsCacheDirectory(): string
{
    $configured = trim((string) getenv('PULSENOTES_CACHE_DIR'));
    return $configured !== '' ? $configured : rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'pulsenotes-stats';
}

function statisticsCacheTtl(): int
{
    $configured = filter_var(getenv('PULSENOTES_STATS_CACHE_TTL'), FILTER_VALIDATE_INT);
    return $configured === false ? STATS_CACHE_TTL : max(5, min(300, $configured));
}

/** @return array{evaluation:string,key:string}|null */
function statisticsCacheDescriptor(array $input): ?array
{
    if ((string) ($input['path'] ?? '') !== '/services/data.php' || strtoupper((string) ($input['method'] ?? 'GET')) !== 'GET') {
        return null;
    }
    $query = is_array($input['query'] ?? null) ? $input['query'] : [];
    $evaluation = trim((string) ($query['eval'] ?? ''));
    if ((string) ($query['q'] ?? '') !== 'listeNotes' || $evaluation === '' || preg_match('/^[A-Za-z0-9_-]+$/', $evaluation) !== 1) {
        return null;
    }
    return ['evaluation' => $evaluation, 'key' => hash('sha256', $evaluation)];
}

/** @return array{status:int,url:string,headers:string,body:string,contentType:string}|null */
function readStatisticsCache(string $path, int $now): ?array
{
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    $entry = json_decode($raw === false ? '' : $raw, true);
    if (
        !is_array($entry)
        || ($entry['version'] ?? null) !== STATS_CACHE_VERSION
        || !is_int($entry['expiresAt'] ?? null)
        || $entry['expiresAt'] <= $now
        || !is_array($entry['response'] ?? null)
    ) {
        return null;
    }
    $response = $entry['response'];
    if (!isset($response['status'], $response['url'], $response['headers'], $response['body'], $response['contentType'])) {
        return null;
    }
    return [
        'status' => (int) $response['status'],
        'url' => (string) $response['url'],
        'headers' => (string) $response['headers'],
        'body' => (string) $response['body'],
        'contentType' => (string) $response['contentType'],
    ];
}

/** @param array{status:int,url:string,headers:string,body:string,contentType:string} $response */
function writeStatisticsCache(string $path, array $response, int $expiresAt): void
{
    $payload = json_encode([
        'version' => STATS_CACHE_VERSION,
        'expiresAt' => $expiresAt,
        'response' => $response,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false || @file_put_contents($path, $payload, LOCK_EX) === false) {
        throw new RuntimeException('Impossible d’écrire le cache des statistiques.');
    }
    @chmod($path, 0600);
}

function ensureStatisticsCacheDirectory(string $directory): void
{
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Impossible de créer le cache des statistiques.');
    }
    @chmod($directory, 0700);
}

/** @return array{response:array{status:int,url:string,headers:string,body:string,contentType:string},cache:string} */
function requestBulletinsCached(RemoteClient $browser, array $input, ?string $cacheDirectory = null, ?int $now = null): array
{
    $descriptor = statisticsCacheDescriptor($input);
    if ($descriptor === null) {
        return ['response' => requestBulletins($browser, $input), 'cache' => 'bypass'];
    }

    $directory = $cacheDirectory ?? statisticsCacheDirectory();
    try {
        ensureStatisticsCacheDirectory($directory);
    } catch (Throwable $cacheError) {
        error_log('Cache PulseNotes indisponible : ' . $cacheError->getMessage());
        return ['response' => requestBulletins($browser, $input), 'cache' => 'bypass'];
    }
    $cachePath = $directory . DIRECTORY_SEPARATOR . $descriptor['key'] . '.json';
    $lockPath = $directory . DIRECTORY_SEPARATOR . $descriptor['key'] . '.lock';
    $lock = @fopen($lockPath, 'c+');
    if ($lock === false) {
        error_log('Cache PulseNotes indisponible : verrou impossible à ouvrir.');
        return ['response' => requestBulletins($browser, $input), 'cache' => 'bypass'];
    }

    try {
        if (!flock($lock, LOCK_EX)) {
            error_log('Cache PulseNotes indisponible : verrou impossible à acquérir.');
            return ['response' => requestBulletins($browser, $input), 'cache' => 'bypass'];
        }
        $timestamp = $now ?? time();
        $cached = readStatisticsCache($cachePath, $timestamp);
        if ($cached !== null) {
            return ['response' => $cached, 'cache' => 'hit'];
        }

        $response = requestBulletins($browser, $input);
        $decoded = json_decode($response['body'], true);
        if ($response['status'] >= 200 && $response['status'] < 300 && json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            try {
                writeStatisticsCache($cachePath, $response, $timestamp + statisticsCacheTtl());
            } catch (Throwable $cacheError) {
                error_log('Cache PulseNotes non écrit : ' . $cacheError->getMessage());
            }
        }
        return ['response' => $response, 'cache' => 'miss'];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function invalidateStatisticsCache(string $evaluation, ?string $cacheDirectory = null): bool
{
    if ($evaluation === '' || preg_match('/^[A-Za-z0-9_-]+$/', $evaluation) !== 1) {
        throw new InvalidArgumentException('Identifiant d’évaluation invalide.');
    }
    $directory = $cacheDirectory ?? statisticsCacheDirectory();
    if (!is_dir($directory)) {
        return false;
    }
    $key = hash('sha256', $evaluation);
    $cachePath = $directory . DIRECTORY_SEPARATOR . $key . '.json';
    $lock = @fopen($directory . DIRECTORY_SEPARATOR . $key . '.lock', 'c+');
    if ($lock === false) {
        throw new RuntimeException('Impossible de verrouiller l’invalidation du cache.');
    }
    try {
        if (!flock($lock, LOCK_EX)) {
            throw new RuntimeException('Impossible de verrouiller l’invalidation du cache.');
        }
        return is_file($cachePath) && @unlink($cachePath);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

if (defined('PULSENOTES_TESTING') && PULSENOTES_TESTING === true) {
    return;
}

startProxySession();
$route = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    if ($route === '/install.sh' && $method === 'GET') {
        if (deploymentMode() !== 'global') respond(404, ['ok' => false, 'error' => 'Cette route est disponible uniquement sur le service global.']);
        respondInstallerScript();
    }

    if (preg_match('~^/share/([a-f0-9]{64})$~', $route, $matches) === 1 && $method === 'GET') {
        if (deploymentMode() !== 'selfhosted') respond(404, ['ok' => false, 'error' => 'Le partage de notes est réservé aux installations personnelles.']);
        if (array_key_exists('image', $_GET)) respondShareCard($matches[1]);
        respondSharePage($matches[1]);
    }

    if (preg_match('~^/api/shares/([a-f0-9]{64})/card\.(?:png|svg)$~', $route, $matches) === 1 && $method === 'GET') {
        if (deploymentMode() !== 'selfhosted') respond(404, ['ok' => false, 'error' => 'Le partage de notes est réservé aux installations personnelles.']);
        respondShareCard($matches[1]);
    }

    if (preg_match('~^/api/shares/([a-f0-9]{64})$~', $route, $matches) === 1 && $method === 'GET') {
        if (deploymentMode() !== 'selfhosted') respond(404, ['ok' => false, 'error' => 'Le partage de notes est réservé aux installations personnelles.']);
        $share = publicNoteShare($matches[1]);
        if ($share === null) respond(404, ['ok' => false, 'error' => 'Ce partage n’existe pas ou a été désactivé.']);
        respond(200, ['ok' => true, 'data' => $share]);
    }

    if (preg_match('~^/api/shares/([a-f0-9]{64})$~', $route, $matches) === 1 && $method === 'DELETE') {
        if (deploymentMode() !== 'selfhosted') respond(404, ['ok' => false, 'error' => 'Le partage de notes est réservé aux installations personnelles.']);
        if (empty($_SESSION['remoteCookies'])) throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
        revokeNoteShare($matches[1]);
        respond(200, ['ok' => true]);
    }

    if ($route === '/api/shares' && $method === 'GET') {
        if (deploymentMode() !== 'selfhosted') respond(404, ['ok' => false, 'error' => 'Le partage de notes est réservé aux installations personnelles.']);
        if (empty($_SESSION['remoteCookies'])) throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
        respond(200, ['ok' => true, 'data' => ['shares' => listNoteShares(isset($_GET['evaluation']) ? trim((string) $_GET['evaluation']) : null)]]);
    }

    if ($route === '/api/shares' && $method === 'POST') {
        if (deploymentMode() !== 'selfhosted') respond(404, ['ok' => false, 'error' => 'Le partage de notes est réservé aux installations personnelles.']);
        if (empty($_SESSION['remoteCookies'])) throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
        $input = jsonInput();
        $share = createNoteShare(is_array($input['payload'] ?? null) ? $input['payload'] : [], (string) ($input['evaluationSource'] ?? ''));
        respond(201, ['ok' => true, 'data' => $share]);
    }

    if ($route === '/api/status' && $method === 'GET') {
        $account = personalAccount();
        respond(200, [
            'ok' => true,
            'connected' => !empty($_SESSION['remoteCookies']),
            'username' => (string) ($_SESSION['username'] ?? ($account['username'] ?? '')),
            'deploymentMode' => deploymentMode(),
            'instanceName' => trim((string) getenv('PULSENOTES_INSTANCE_NAME')) ?: (deploymentMode() === 'global' ? 'PulseNotes' : 'Serveur personnel'),
            'setupRequired' => deploymentMode() === 'selfhosted' && $account === null,
            'unlockRequired' => deploymentMode() === 'selfhosted' && $account !== null && empty($_SESSION['remoteCookies']),
            'authMethod' => (string) ($account['auth_method'] ?? ''),
            'credentialInvalid' => !empty($account['credential_invalid']),
        ]);
    }

    if ($route === '/api/personal/setup' && $method === 'POST') {
        if (deploymentMode() !== 'selfhosted') throw new InvalidArgumentException('Cette route est réservée aux installations personnelles.');
        if (personalAccount() !== null) throw new InvalidArgumentException('Cette installation personnelle est déjà configurée.');
        $input = jsonInput();
        $username = trim((string) ($input['username'] ?? ''));
        $password = (string) ($input['password'] ?? '');
        $authMethod = personalAuthMethod((string) ($input['authMethod'] ?? ''));
        $localSecret = (string) ($input['localSecret'] ?? '');
        if ($username === '' || $password === '') throw new InvalidArgumentException('Identifiant et mot de passe UVSQ requis.');
        validatePersonalSecret($authMethod, $localSecret);
        $browser = new RemoteBrowser();
        loginCas($browser, $username, $password);
        $key = storePersonalAccount($username, $password, $authMethod, $localSecret);
        $password = $localSecret = '';
        unset($password, $localSecret);
        session_regenerate_id(true);
        $_SESSION['personalUnlockKey'] = base64_encode($key);
        $_SESSION['remoteCookies'] = $browser->cookies();
        $_SESSION['username'] = $username;
        clearPersonalUnlockFailures();
        respond(200, ['ok' => true, 'connected' => true, 'username' => $username, 'authMethod' => $authMethod]);
    }

    if ($route === '/api/personal/unlock' && $method === 'POST') {
        if (deploymentMode() !== 'selfhosted') throw new InvalidArgumentException('Cette route est réservée aux installations personnelles.');
        assertPersonalUnlockAllowed();
        $account = personalAccount();
        if ($account === null) throw new InvalidArgumentException('Configurez d’abord votre installation personnelle.');
        $secret = (string) (jsonInput()['localSecret'] ?? '');
        if (!password_verify($secret, (string) $account['local_hash'])) {
            recordPersonalUnlockFailure();
            throw new InvalidArgumentException('Code local incorrect.');
        }
        $salt = base64_decode((string) $account['credential_salt'], true);
        if ($salt === false) throw new RuntimeException('Configuration personnelle illisible.');
        $key = derivePersonalKey($secret, $salt);
        $secret = '';
        unset($secret);
        $browser = new RemoteBrowser();
        $_SESSION['personalUnlockKey'] = base64_encode($key);
        loginStoredPersonal($browser, $account, $key);
        session_regenerate_id(true);
        $_SESSION['personalUnlockKey'] = base64_encode($key);
        $_SESSION['remoteCookies'] = $browser->cookies();
        $_SESSION['username'] = (string) $account['username'];
        clearPersonalUnlockFailures();
        respond(200, ['ok' => true, 'connected' => true, 'username' => (string) $account['username']]);
    }

    if ($route === '/api/personal/credential' && $method === 'POST') {
        if (deploymentMode() !== 'selfhosted') throw new InvalidArgumentException('Cette route est réservée aux installations personnelles.');
        $account = personalAccount();
        $key = personalSessionKey();
        if ($account === null || $key === null) throw new AuthenticationRequired('Déverrouillez votre installation personnelle.');
        $password = (string) (jsonInput()['password'] ?? '');
        if ($password === '') throw new InvalidArgumentException('Nouveau mot de passe UVSQ requis.');
        $browser = new RemoteBrowser();
        loginCas($browser, (string) $account['username'], $password);
        $encrypted = encryptPersonalCredentialWithKey($password, $key);
        $password = '';
        unset($password);
        applicationDatabase()->prepare('UPDATE personal_account SET credential_cipher = ?, credential_iv = ?, credential_tag = ?, credential_invalid = 0, updated_at = ? WHERE singleton_id = 1')->execute([$encrypted['cipher'], $encrypted['iv'], $encrypted['tag'], time()]);
        $_SESSION['remoteCookies'] = $browser->cookies();
        respond(200, ['ok' => true, 'connected' => true]);
    }

    if ($route === '/api/personal/security' && $method === 'POST') {
        if (deploymentMode() !== 'selfhosted') throw new InvalidArgumentException('Cette route est réservée aux installations personnelles.');
        $account = personalAccount();
        $oldKey = personalSessionKey();
        if ($account === null || $oldKey === null || empty($_SESSION['remoteCookies'])) throw new AuthenticationRequired('Déverrouillez votre installation personnelle.');
        $input = jsonInput();
        $nextMethod = personalAuthMethod((string) ($input['authMethod'] ?? ''));
        $nextSecret = (string) ($input['localSecret'] ?? '');
        validatePersonalSecret($nextMethod, $nextSecret);
        $password = decryptPersonalCredential($account, $oldKey);
        $nextKey = storePersonalAccount((string) $account['username'], $password, $nextMethod, $nextSecret);
        $password = $nextSecret = '';
        unset($password, $nextSecret);
        $_SESSION['personalUnlockKey'] = base64_encode($nextKey);
        respond(200, ['ok' => true, 'authMethod' => $nextMethod]);
    }

    if ($route === '/api/auth' && $method === 'POST') {
        $input = jsonInput();
        $username = trim((string) ($input['username'] ?? ''));
        $password = (string) ($input['password'] ?? '');
        if ($username === '' || $password === '') {
            throw new InvalidArgumentException('Identifiant et mot de passe requis.');
        }

        $browser = new RemoteBrowser();
        loginCas($browser, $username, $password);
        $password = '';
        unset($password);
        session_regenerate_id(true);
        $_SESSION['remoteCookies'] = $browser->cookies();
        $_SESSION['username'] = $username;
        respond(200, ['ok' => true, 'connected' => true, 'username' => $username]);
    }

    if ($route === '/api/logout' && $method === 'POST') {
        jsonInput();
        $_SESSION = [];
        session_regenerate_id(true);
        respond(200, ['ok' => true, 'connected' => false]);
    }

    if ($route === '/api/evaluations/sync' && $method === 'POST') {
        if (empty($_SESSION['remoteCookies'])) throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
        $input = jsonInput();
        $evaluations = is_array($input['evaluations'] ?? null) ? $input['evaluations'] : [];
        respond(200, ['ok' => true, 'data' => ['states' => synchronizeEvaluations($evaluations)]]);
    }

    if ($route === '/api/evaluations/seen' && $method === 'POST') {
        if (empty($_SESSION['remoteCookies'])) throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
        $input = jsonInput();
        markEvaluationIdsSeen(is_array($input['ids'] ?? null) ? $input['ids'] : []);
        respond(200, ['ok' => true]);
    }

    if ($route === '/api/evaluations/debug-state' && $method === 'POST') {
        if (empty($_SESSION['remoteCookies'])) throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
        $input = jsonInput();
        setEvaluationDebugState(trim((string) ($input['id'] ?? '')), trim((string) ($input['state'] ?? '')));
        respond(200, ['ok' => true]);
    }

    if ($route === '/api/cache/evaluation' && $method === 'DELETE') {
        if (empty($_SESSION['remoteCookies'])) {
            throw new AuthenticationRequired('Connectez-vous à votre compte UVSQ.');
        }
        $evaluation = trim((string) (jsonInput()['evaluationId'] ?? ''));
        respond(200, [
            'ok' => true,
            'evaluationId' => $evaluation,
            'invalidated' => invalidateStatisticsCache($evaluation),
        ]);
    }

    if ($route === '/api/request' && $method === 'POST') {
        $input = jsonInput();
        $result = withAuthenticatedBrowser(fn (RemoteBrowser $browser) => requestBulletinsCached($browser, $input));
        $response = $result['response'];

        $decoded = json_decode($response['body'], true);
        $isJson = json_last_error() === JSON_ERROR_NONE;
        respond(200, [
            'ok' => $response['status'] >= 200 && $response['status'] < 400,
            'status' => $response['status'],
            'url' => $response['url'],
            'contentType' => $response['contentType'],
            'data' => $isJson ? $decoded : null,
            'text' => $isJson ? null : $response['body'],
            'cache' => $result['cache'],
        ]);
    }

    if ($route === '/api/download' && $method === 'GET') {
        $semester = (string) ($_GET['semester'] ?? '');
        $document = (string) ($_GET['document'] ?? 'bulletin');
        $response = withAuthenticatedBrowser(fn (RemoteBrowser $browser) => downloadBulletin($browser, $semester, $document, (string) ($_SESSION['username'] ?? '')));
        http_response_code(200);
        header('Content-Type: ' . ($response['contentType'] ?: 'application/pdf'));
        header('Content-Disposition: attachment; filename="' . ($document === 'grades' ? 'releve-notes-' : 'bulletin-') . $semester . '.pdf"');
        header('Cache-Control: no-store');
        echo $response['body'];
        exit;
    }

    respond(404, ['ok' => false, 'error' => 'Route inconnue.']);
} catch (StoredCredentialInvalid $error) {
    $_SESSION['remoteCookies'] = [];
    respond(401, ['ok' => false, 'authRequired' => true, 'credentialInvalid' => true, 'error' => $error->getMessage()]);
} catch (AuthenticationRequired $error) {
    $_SESSION['remoteCookies'] = [];
    respond(401, ['ok' => false, 'authRequired' => true, 'error' => $error->getMessage()]);
} catch (InvalidArgumentException $error) {
    respond(400, ['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log($error->__toString());
    respond(502, ['ok' => false, 'error' => 'Le proxy distant a rencontré une erreur.']);
}
