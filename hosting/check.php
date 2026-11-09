<?php
// Prüfseite für die Einrichtung: https://<domain>/check.php (hinter dem Passwortschutz).
// Absichtlich in einfachem PHP geschrieben, damit sie auch auf zu alten PHP-Versionen läuft und das meldet.
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$ok = true;
function line($good, $label, $detail) {
    global $ok;
    if (!$good) $ok = false;
    echo ($good ? '[OK]     ' : '[FEHLER] ') . $label . ': ' . $detail . "\n";
}

echo "FO-NV-Web Server-Check\n======================\n\n";
line(version_compare(PHP_VERSION, '8.0.0', '>='), 'PHP-Version', PHP_VERSION . (version_compare(PHP_VERSION, '8.0.0', '>=') ? '' : '  -> mindestens 8.0 nötig (KAS: Domain/Subdomain bearbeiten -> PHP-Version 8.x)'));
line(class_exists('ZipArchive'), 'PHP-Erweiterung zip', class_exists('ZipArchive') ? 'vorhanden' : 'fehlt (nur für Backups nötig)');
line(function_exists('password_hash'), 'password_hash', function_exists('password_hash') ? 'vorhanden' : 'fehlt');
echo 'Server-Software:  ' . (isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : '?') . "\n";
echo 'PHP-Schnittstelle: ' . PHP_SAPI . "\n";
echo 'Dieser Ordner:    ' . __DIR__ . "\n";

$user = '';
foreach (array('REMOTE_USER', 'REDIRECT_REMOTE_USER', 'PHP_AUTH_USER') as $k) {
    if (!empty($_SERVER[$k])) { $user = $_SERVER[$k] . " (aus $k)"; break; }
}
$authHeader = !empty($_SERVER['HTTP_AUTHORIZATION']) || !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
line($user !== '' || $authHeader, 'Anmeldung kommt bei PHP an', $user !== '' ? $user : ($authHeader ? 'nur als Authorization-Kopfzeile' : 'nein – .htaccess-Regel für HTTP_AUTHORIZATION prüfen'));

$cfgFile = __DIR__ . '/fs-config.php';
if (!is_file($cfgFile)) {
    line(false, 'fs-config.php', 'fehlt');
} else {
    $cfg = require $cfgFile;
    line(true, 'fs-config.php', 'gelesen');
    foreach (array('game', 'data', 'mobile', 'cache', 'private') as $k) {
        $p = isset($cfg[$k]) ? $cfg[$k] : '';
        $exists = $p !== '' && is_dir($p);
        $writable = $exists && is_writable($p);
        $need = in_array($k, array('data', 'cache', 'private'), true);
        if ($k === 'mobile' && !$exists) { echo "[--]     Ordner $k: $p (fehlt – nur iPad-Archive, optional)\n"; continue; }
        if (!$exists && in_array($k, array('data', 'cache'), true)) { echo "[--]     Ordner $k: $p (wird beim ersten Speichern angelegt)\n"; continue; }
        line($exists && (!$need || $writable), "Ordner $k", $p . ($exists ? ($writable ? ' (beschreibbar)' : ' (nur lesbar)') : ' (FEHLT)'));
    }
    $game = isset($cfg['game']) ? $cfg['game'] : '';
    line(is_file($game . '/FalloutNV.exe'), 'FalloutNV.exe', is_file($game . '/FalloutNV.exe') ? filesize($game . '/FalloutNV.exe') . ' Bytes' : 'nicht gefunden in ' . $game);
    $esm = '';
    foreach (array('Data', 'data', 'DATA') as $d) if (is_file("$game/$d/FalloutNV.esm")) $esm = "$game/$d/FalloutNV.esm";
    line($esm !== '', 'Data/FalloutNV.esm', $esm !== '' ? filesize($esm) . ' Bytes' : 'nicht gefunden');
    $bsas = $esm !== '' ? glob(dirname($esm) . '/*.bsa') : array();
    line(count($bsas) >= 10, 'Archive (.bsa)', count($bsas) . ' gefunden');
    $priv = isset($cfg['private']) ? $cfg['private'] : '';
    line(is_readable($priv . '/.htpasswd'), 'Benutzerdatei', $priv . '/.htpasswd' . (is_readable($priv . '/.htpasswd') ? ' lesbar' : ' nicht lesbar'));
}

$ht = @file_get_contents(__DIR__ . '/.htaccess');
if ($ht !== false && preg_match('/^AuthUserFile\s+(\S+)/m', $ht, $m)) {
    line(is_readable($m[1]), '.htaccess AuthUserFile', $m[1] . (is_readable($m[1]) ? ' (lesbar)' : ' (NICHT lesbar – serverBase in deploy.local.json prüfen)'));
}
foreach (array('fs.php', 'api.php', 'lib.php', 'game.html', 'index.html', 'build/fnv_web.wasm', 'build/fnv_web.js') as $f) {
    line(is_file(__DIR__ . '/' . $f), "Datei $f", is_file(__DIR__ . '/' . $f) ? 'vorhanden' : 'FEHLT');
}

echo "\n" . ($ok ? "Alles in Ordnung.\n" : "Bitte die mit [FEHLER] markierten Punkte beheben.\n");
