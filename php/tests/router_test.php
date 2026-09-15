<?php

declare(strict_types=1);

define('PULSENOTES_TESTING', true);
require dirname(__DIR__) . '/router.php';

final class TestSkipped extends RuntimeException
{
}

final class FakeRemoteClient implements RemoteClient
{
    /** @var list<array{status:int,url:string,headers:string,body:string,contentType:string}> */
    private array $responses;
    private int $delayMicroseconds;
    public int $requestCount = 0;
    /** @var list<array{url:string,options:array}> */
    public array $requests = [];

    /** @param list<array{status:int,url:string,headers:string,body:string,contentType:string}> $responses */
    public function __construct(array $responses, int $delayMicroseconds = 0)
    {
        $this->responses = $responses;
        $this->delayMicroseconds = $delayMicroseconds;
    }

    public function cookies(): array
    {
        return [];
    }

    public function request(string $url, array $options = []): array
    {
        $this->requestCount++;
        $this->requests[] = ['url' => $url, 'options' => $options];
        if ($this->responses === []) {
            throw new RuntimeException('Aucune réponse distante simulée disponible pour ' . $url);
        }
        if ($this->delayMicroseconds > 0) {
            usleep($this->delayMicroseconds);
        }
        return array_shift($this->responses);
    }
}

/** @return array{status:int,url:string,headers:string,body:string,contentType:string} */
function fakeResponse(string $url, string $body, int $status = 200, string $headers = ''): array
{
    return [
        'status' => $status,
        'url' => $url,
        'headers' => $headers,
        'body' => $body,
        'contentType' => 'application/json',
    ];
}

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' — attendu ' . var_export($expected, true) . ', reçu ' . var_export($actual, true));
    }
}

function assertAuthenticationRequired(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (AuthenticationRequired) {
        return;
    }
    throw new RuntimeException($message);
}

function removeTestDirectory(string $directory): void
{
    if (!is_dir($directory)) {
        return;
    }
    foreach (scandir($directory) ?: [] as $entry) {
        if ($entry !== '.' && $entry !== '..') {
            $path = $directory . DIRECTORY_SEPARATOR . $entry;
            if (is_file($path)) {
                unlink($path);
            }
        }
    }
    rmdir($directory);
}

$tests = [];

$tests['sépare les modes global et personnel'] = static function (): void {
    $previous = getenv('PULSENOTES_DEPLOYMENT_MODE');
    try {
        putenv('PULSENOTES_DEPLOYMENT_MODE=global');
        assertSameValue('global', deploymentMode(), 'Le mode global doit être reconnu');
        putenv('PULSENOTES_DEPLOYMENT_MODE=selfhosted');
        assertSameValue('selfhosted', deploymentMode(), 'Le mode personnel doit être reconnu');
        putenv('PULSENOTES_DEPLOYMENT_MODE=inconnu');
        assertSameValue('selfhosted', deploymentMode(), 'Un mode inconnu doit rester sûr');
    } finally {
        $previous === false ? putenv('PULSENOTES_DEPLOYMENT_MODE') : putenv('PULSENOTES_DEPLOYMENT_MODE=' . $previous);
    }
};

$tests['applique le délai de mise à jour personnelle sans interrompre une session'] = static function (): void {
    $publishedAt = 1_700_000_000;
    $beforeDeadline = calculateUpdatePolicy('selfhosted', false, true, $publishedAt, 15, $publishedAt + 14 * 86_400);
    assertSameValue(false, $beforeDeadline['required'], 'Une mise à jour personnelle doit rester différable pendant quinze jours');
    $connected = calculateUpdatePolicy('selfhosted', true, true, $publishedAt, 15, $publishedAt + 16 * 86_400);
    assertSameValue(true, $connected['mandatoryOnLogout'], 'Le délai dépassé doit être annoncé pendant la session');
    assertSameValue(false, $connected['required'], 'Une session personnelle active ne doit jamais être interrompue');
    $disconnected = calculateUpdatePolicy('selfhosted', false, true, $publishedAt, 15, $publishedAt + 16 * 86_400);
    assertSameValue(true, $disconnected['required'], 'La mise à jour doit devenir obligatoire après déconnexion');
};

$tests['force les mises à jour globales et temporise un échec'] = static function (): void {
    $global = calculateUpdatePolicy('global', true, true, 1_700_000_000, 15, 1_700_000_001);
    assertSameValue(true, $global['required'], 'Le service global doit imposer une nouvelle version stable');
    $cooldown = calculateUpdatePolicy('global', false, true, 1_700_000_000, 15, 1_700_000_001, true);
    assertSameValue(false, $cooldown['required'], 'Un échec ne doit pas créer une boucle de mise à jour');
};

$tests['refuse une archive de mise à jour avec traversée de dossier'] = static function (): void {
    if (!class_exists('ZipArchive')) throw new TestSkipped('extension zip absente');
    $directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pulsenotes-update-test-' . bin2hex(random_bytes(6));
    mkdir($directory, 0700, true);
    $archivePath = $directory . DIRECTORY_SEPARATOR . 'dangerous.zip';
    $destination = $directory . DIRECTORY_SEPARATOR . 'extracted';
    mkdir($destination, 0700, true);
    $archive = new ZipArchive();
    if ($archive->open($archivePath, ZipArchive::CREATE) !== true) throw new RuntimeException('Impossible de créer l’archive de test.');
    $archive->addFromString('../escape.txt', 'contenu interdit');
    $archive->addFromString('index.html', 'test');
    $archive->addFromString('api/index.php', '<?php');
    $archive->addFromString('api/router.php', '<?php');
    $archive->close();
    try {
        validateUpdateArchive($archivePath, $destination);
        throw new RuntimeException('Une traversée ZIP aurait dû être refusée.');
    } catch (RuntimeException $error) {
        if (!str_contains($error->getMessage(), 'chemin dangereux')) throw $error;
        assertSameValue(false, is_file($directory . DIRECTORY_SEPARATOR . 'escape.txt'), 'Aucun fichier ne doit sortir du dossier cible');
    } finally {
        updateRemoveTree($directory);
    }
};

$tests['valide les quatre accès locaux personnels'] = static function (): void {
    validatePersonalSecret('pin4', '2048');
    validatePersonalSecret('pin8', '20482048');
    validatePersonalSecret('pattern', '1596');
    validatePersonalSecret('password', 'phrase locale robuste');
    try {
        validatePersonalSecret('pattern', '1123');
    } catch (InvalidArgumentException) {
        return;
    }
    throw new RuntimeException('Un schéma répétant un point doit être refusé.');
};

$tests['chiffre et déchiffre le mot de passe CAS personnel'] = static function (): void {
    $encrypted = encryptPersonalCredential('mot-de-passe-cas', '2048');
    $account = [
        'credential_cipher' => $encrypted['cipher'],
        'credential_iv' => $encrypted['iv'],
        'credential_tag' => $encrypted['tag'],
    ];
    assertSameValue('mot-de-passe-cas', decryptPersonalCredential($account, $encrypted['key']), 'Le secret CAS doit être restitué avec la bonne clé');
    assertAuthenticationRequired(static fn () => decryptPersonalCredential($account, random_bytes(32)), 'Une mauvaise clé locale doit être refusée');
};

$tests['restaure Bulletins avec un ticket CAS encore valide'] = static function (): void {
    $browser = new FakeRemoteClient([
        fakeResponse(BULLETINS_ORIGIN . '/services/data.php', '{"redirect":"/services/doAuth.php"}'),
        fakeResponse(BULLETINS_ORIGIN . '/', '<html>session restaurée</html>'),
        fakeResponse(BULLETINS_ORIGIN . '/services/data.php', '[12,14,16]'),
    ]);
    $response = requestBulletins($browser, [
        'path' => '/services/data.php',
        'method' => 'GET',
        'query' => ['q' => 'listeNotes', 'eval' => '19713'],
    ]);
    assertSameValue('[12,14,16]', $response['body'], 'La requête initiale doit être rejouée après restauration CAS');
    assertSameValue(3, $browser->requestCount, 'Le scénario restauré doit effectuer requête, authentification et rejeu');
};

$tests['demande une reconnexion quand CAS est totalement expiré'] = static function (): void {
    $browser = new FakeRemoteClient([
        fakeResponse(BULLETINS_ORIGIN . '/services/data.php', '{"redirect":"/services/doAuth.php"}'),
        fakeResponse(CAS_LOGIN . '?service=test', '<html>connexion</html>'),
    ]);
    assertAuthenticationRequired(static fn () => requestBulletins($browser, [
        'path' => '/services/data.php',
        'method' => 'GET',
        'query' => ['q' => 'listeNotes', 'eval' => '19713'],
    ]), 'Une expiration CAS complète doit demander une reconnexion');
};

$tests['détecte une redirection directe vers CAS'] = static function (): void {
    $browser = new FakeRemoteClient([
        fakeResponse(CAS_LOGIN . '?service=test', '<html>connexion</html>'),
    ]);
    assertAuthenticationRequired(static fn () => requestBulletins($browser, [
        'path' => '/services/data.php',
        'method' => 'GET',
        'query' => ['q' => 'relevéEtudiant', 'semestre' => '561'],
    ]), 'Une arrivée directe sur CAS doit demander une reconnexion');
};

$tests['met en cache puis invalide une distribution de notes'] = static function (): void {
    $directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pulsenotes-test-' . bin2hex(random_bytes(6));
    try {
        $input = [
            'path' => '/services/data.php',
            'method' => 'GET',
            'query' => ['q' => 'listeNotes', 'eval' => '19713'],
        ];
        $firstBrowser = new FakeRemoteClient([fakeResponse(BULLETINS_ORIGIN . '/services/data.php', '[8,12,16]')]);
        $first = requestBulletinsCached($firstBrowser, $input, $directory, 1_000);
        assertSameValue('miss', $first['cache'], 'Le premier appel doit remplir le cache');
        assertSameValue(1, $firstBrowser->requestCount, 'Le premier appel doit joindre Bulletins');

        $secondBrowser = new FakeRemoteClient([]);
        $second = requestBulletinsCached($secondBrowser, $input, $directory, 1_001);
        assertSameValue('hit', $second['cache'], 'Le second appel doit utiliser le cache');
        assertSameValue(0, $secondBrowser->requestCount, 'Un cache hit ne doit pas joindre Bulletins');
        assertSameValue('[8,12,16]', $second['response']['body'], 'Le cache doit restituer la distribution complète');

        assertSameValue(true, invalidateStatisticsCache('19713', $directory), 'L’invalidation doit supprimer l’entrée ciblée');
        $thirdBrowser = new FakeRemoteClient([fakeResponse(BULLETINS_ORIGIN . '/services/data.php', '[9,13,17]')]);
        $third = requestBulletinsCached($thirdBrowser, $input, $directory, 1_002);
        assertSameValue('miss', $third['cache'], 'Un appel après invalidation doit recharger les données');
        assertSameValue(1, $thirdBrowser->requestCount, 'Le rechargement doit joindre Bulletins une fois');
    } finally {
        removeTestDirectory($directory);
    }
};

$tests['télécharge le bulletin PDF sans altérer son contenu'] = static function (): void {
    $pdf = "%PDF-1.7\ncontenu-binaire-simulé\0\xFF";
    $browser = new FakeRemoteClient([[
        'status' => 200,
        'url' => BULLETINS_ORIGIN . '/services/bulletin_PDF.php?type=BUT&sem_id=561',
        'headers' => '',
        'body' => $pdf,
        'contentType' => 'application/pdf',
    ]]);
    $response = downloadBulletin($browser, '561');
    assertSameValue($pdf, $response['body'], 'Le proxy doit restituer les octets PDF sans transformation');
    assertSameValue('application/pdf', $response['contentType'], 'Le type MIME PDF doit être conservé');
    assertSameValue(BULLETINS_ORIGIN . '/services/bulletin_PDF.php?type=BUT&sem_id=561', $browser->requests[0]['url'], 'La route PDF doit cibler le semestre demandé');
    assertSameValue('POST', $browser->requests[0]['options'][CURLOPT_CUSTOMREQUEST] ?? null, 'Bulletins attend une requête POST pour le PDF');
    try {
        downloadBulletin(new FakeRemoteClient([]), '../561');
        throw new RuntimeException('Un identifiant de semestre invalide aurait dû être refusé.');
    } catch (InvalidArgumentException) {
    }
};

$tests['télécharge le relevé officiel avec l’identifiant étudiant'] = static function (): void {
    $url = BULLETINS_ORIGIN . '/services/bulletin_PDF.php?sem_id=561&etudiant=22500207';
    $browser = new FakeRemoteClient([fakeResponse($url, '%PDF-releve')]);
    $response = downloadBulletin($browser, '561', 'grades', '22500207');
    assertSameValue('%PDF-releve', $response['body'], 'Le relevé doit être transmis sans transformation');
    assertSameValue($url, $browser->requests[0]['url'], 'Le relevé doit cibler le semestre et l’étudiant');
};

$tests['crée, retrouve et invalide un partage de note'] = static function (): void {
    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) throw new TestSkipped('extension pdo_sqlite absente');
    $databasePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pulsenotes-share-' . bin2hex(random_bytes(6)) . '.sqlite';
    putenv('PULSENOTES_DEPLOYMENT_MODE=selfhosted');
    putenv('PULSENOTES_SQLITE_PATH=' . $databasePath);
    $_SESSION['username'] = '22500207';
    register_shutdown_function(static function () use ($databasePath): void { @unlink($databasePath); });
    $payload = [
        'studentName' => 'Noel Bastian',
        'formation' => 'BUT MMI',
        'semesterLabel' => 'S2',
        'evaluation' => ['id' => '19004', 'label' => 'Projet', 'note' => 15.5, 'moduleCode' => 'MM2R13'],
        'stats' => ['rank' => 3, 'total' => 28],
        'sharedAt' => '2026-09-14T20:00:00Z',
    ];
    $evaluationSource = json_encode($payload['evaluation'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $identity = ['semester' => '561', 'label' => 'Projet', 'moduleCode' => 'MM2R13', 'moduleTitle' => 'Développement Web', 'kind' => 'Ressource', 'ues' => ['UE1']];
    $initialStates = synchronizeEvaluations([['id' => '19004', 'fingerprint' => $evaluationSource, 'identity' => $identity]]);
    assertSameValue('seen', $initialStates['19004'] ?? null, 'Le premier chargement doit établir une référence déjà vue');
    $sealed = (string) applicationDatabase()->query('SELECT sealed FROM evaluation_record')->fetchColumn();
    if (str_contains($sealed, 'Projet') || str_contains($sealed, '15.5') || str_contains($sealed, 'seen')) throw new RuntimeException('La base ne doit révéler ni la note ni son état de lecture');
    $created = createNoteShare($payload, $evaluationSource);
    assertSameValue(64, strlen((string) $created['token']), 'Le jeton doit contenir 256 bits aléatoires');
    $storedShare = (string) applicationDatabase()->query('SELECT payload FROM note_share')->fetchColumn();
    if (!str_starts_with($storedShare, 'v2:') || str_contains($storedShare, 'Projet') || str_contains($storedShare, '15.5')) throw new RuntimeException('Le partage doit être chiffré au repos');
    assertSameValue('Projet', publicNoteShare((string) $created['token'])['payload']['evaluation']['label'] ?? null, 'Le partage public doit restituer son instantané');
    assertSameValue(1, count(listNoteShares('19004')), 'Le propriétaire doit retrouver son partage');
    synchronizeMissingShares(evaluationUserKey(), []);
    assertSameValue(true, publicNoteShare((string) $created['token'])['missing'] ?? null, 'Une note absente doit être signalée comme supprimée');
    synchronizeMissingShares(evaluationUserKey(), ['19004']);
    assertSameValue(false, publicNoteShare((string) $created['token'])['missing'] ?? null, 'Une note revenue doit réactiver son instantané');
    revokeNoteShare((string) $created['token']);
    assertSameValue(null, publicNoteShare((string) $created['token']), 'Un partage révoqué ne doit plus être public');
    $changedEvaluation = [...$payload['evaluation'], 'id' => '19005', 'note' => 16.0];
    $changedSource = json_encode($changedEvaluation, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $changedStates = synchronizeEvaluations([['id' => '19005', 'fingerprint' => $changedSource, 'identity' => $identity]]);
    assertSameValue('modified', $changedStates['19005'] ?? null, 'Une note renommée côté ScoDoc doit être rapprochée puis marquée modifiée');
    assertSameValue(1, (int) applicationDatabase()->query('SELECT COUNT(*) FROM evaluation_record')->fetchColumn(), 'Le rapprochement ne doit pas dupliquer la note');
    markEvaluationIdsSeen(['19005']);
    assertSameValue('seen', evaluationRecordById(evaluationUserKey(), '19005')['data']['state'] ?? null, 'Le marquage vu doit rester lisible après déchiffrement');
    assertSameValue('evaluation projet', normalizedIdentityValue('Évaluation   Projet'), 'L’identité doit ignorer accents et espaces répétés');
};

$tests['fusionne deux demandes simultanées pour la même évaluation'] = static function (): void {
    if (!function_exists('pcntl_fork')) {
        throw new TestSkipped('extension pcntl absente');
    }
    $directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pulsenotes-concurrency-' . bin2hex(random_bytes(6));
    ensureStatisticsCacheDirectory($directory);
    $barrier = $directory . DIRECTORY_SEPARATOR . 'start';
    $children = [];
    try {
        for ($index = 0; $index < 2; $index++) {
            $processId = pcntl_fork();
            if ($processId === -1) {
                throw new RuntimeException('Impossible de créer le processus de test.');
            }
            if ($processId === 0) {
                while (!is_file($barrier)) {
                    usleep(1_000);
                }
                try {
                    $browser = new FakeRemoteClient([
                        fakeResponse(BULLETINS_ORIGIN . '/services/data.php', '[10,12,14]'),
                    ], 250_000);
                    $result = requestBulletinsCached($browser, [
                        'path' => '/services/data.php',
                        'method' => 'GET',
                        'query' => ['q' => 'listeNotes', 'eval' => 'concurrent-19713'],
                    ], $directory, 2_000);
                    file_put_contents($directory . DIRECTORY_SEPARATOR . "child-{$index}.json", json_encode([
                        'cache' => $result['cache'],
                        'requests' => $browser->requestCount,
                    ]));
                    exit(0);
                } catch (Throwable $error) {
                    file_put_contents($directory . DIRECTORY_SEPARATOR . "child-{$index}.error", $error->getMessage());
                    exit(1);
                }
            }
            $children[] = $processId;
        }
        file_put_contents($barrier, 'go');
        foreach ($children as $processId) {
            pcntl_waitpid($processId, $status);
            assertSameValue(0, pcntl_wexitstatus($status), 'Chaque processus concurrent doit réussir');
        }

        $results = [];
        for ($index = 0; $index < 2; $index++) {
            $raw = file_get_contents($directory . DIRECTORY_SEPARATOR . "child-{$index}.json");
            $results[] = json_decode($raw === false ? '' : $raw, true);
        }
        $cacheStates = array_column($results, 'cache');
        sort($cacheStates);
        assertSameValue(['hit', 'miss'], $cacheStates, 'Une demande doit remplir le cache et l’autre le réutiliser');
        assertSameValue(1, array_sum(array_column($results, 'requests')), 'Une seule requête distante doit être effectuée');
    } finally {
        foreach ($children as $processId) {
            pcntl_waitpid($processId, $status, WNOHANG);
        }
        removeTestDirectory($directory);
    }
};

$passed = 0;
$skipped = 0;
$failures = 0;
foreach ($tests as $name => $test) {
    try {
        $test();
        $passed++;
        echo "✓ {$name}\n";
    } catch (TestSkipped $error) {
        $skipped++;
        echo "↷ {$name} ({$error->getMessage()})\n";
    } catch (Throwable $error) {
        $failures++;
        fwrite(STDERR, "✗ {$name}\n  {$error->getMessage()}\n");
    }
}

if ($failures > 0) {
    exit(1);
}

echo "{$passed} tests réussis" . ($skipped > 0 ? ", {$skipped} ignoré" : '') . ".\n";
