<?php
declare(strict_types=1);

$configuration = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
foreach (is_array($configuration) ? $configuration : [] as $name => $value) {
    putenv((string) $name . '=' . (string) $value);
}
putenv('PULSENOTES_DEPLOYMENT_MODE=global');
require __DIR__ . '/router.php';
