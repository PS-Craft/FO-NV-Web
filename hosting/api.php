<?php
// API der App: Speicherstände, Backups, DLCs, Cheats, Admin-Center. Aufruf über .htaccess: /api/<route> -> api.php?r=<route>
// Antworten sind JSON; Downloads liefern Dateien. Schreibende Aufrufe sind POST mit Kopfzeile "X-FONV: 1" (Schutz gegen
// Anfragen fremder Seiten, die sonst die gespeicherten Zugangsdaten mitschicken könnten).
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $code, $body): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(int $code, string $msg): void { reply($code, ['ok' => false, 'error' => $msg]); }
function input(): array {
    $raw = (string)file_get_contents('php://input');
    $v = json_decode($raw, true);
    return is_array($v) ? $v : [];
}
function send_file(string $path, string $name, string $type = 'application/octet-stream'): void {
    header('Content-Type: ' . $type);
    header('Content-Length: ' . filesize($path));
    header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($name));
    readfile($path);
    exit;
}

$route = trim((string)($_GET['r'] ?? ''), '/');
// Rückfall, falls der Server /api/<route> nicht zu api.php?r=<route> umschreibt (z. B. bei MultiViews/PATH_INFO)
if ($route === '' && preg_match('~/api(?:\.php)?/([a-z/]+)$~', (string)parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), $m)) $route = trim($m[1], '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'POST' && ($_SERVER['HTTP_X_FONV'] ?? '') !== '1') fail(403, 'Anfrage ohne App-Kennung abgelehnt');

$users = htpasswd_read();

$me = current_user();
if ($route === 'me') {
    if ($me !== null) speed_up_hash($me);     // einmalig: teuren Passwort-Hash auf die schnelle Stufe umstellen
    reply(200, ['user' => $me, 'admin' => is_admin($me), 'mustChangePassword' => must_change($me),
                'zip' => class_exists('ZipArchive'), 'perUser' => (bool)cfg()['per_user']]);
}
if ($me === null) {
    header('WWW-Authenticate: Basic realm="Privat"');
    fail(401, 'Bitte anmelden');
}

// ---- eigenes Passwort ändern (Pflicht nach dem ersten Login mit dem Startpasswort) ----------------------
if ($route === 'account/password' && $method === 'POST') {
    $in = input();
    if (!password_verify((string)($in['current'] ?? ''), $users[$me] ?? '')) { sleep(1); fail(403, 'Aktuelles Passwort falsch'); }
    $pw = (string)($in['password'] ?? '');
    if (strlen($pw) < 8) fail(400, 'Neues Passwort: mindestens 8 Zeichen');
    if (password_verify($pw, $users[$me])) fail(400, 'Das neue Passwort muss sich vom alten unterscheiden');
    $users[$me] = hash_password($pw);
    htpasswd_write($users);
    $meta = meta();
    $meta['mustChange'] = array_values(array_diff($meta['mustChange'] ?? [], [$me]));
    meta_save($meta);
    reply(200, ['ok' => true]);
}

// ---- Speicherstände ------------------------------------------------------------------------------------
/**
 * Ordner der Spielstände: dort, wo das Spiel speichert ("My Games/FalloutNV/Saves" unter /docs, Groß/Klein wie
 * angelegt). Vorher suchte die App in "<Benutzer>/Saves" – Spielstände aus dem Spiel tauchten in der App nie auf, und
 * dort hochgeladene fand das Spiel nicht. Ein alter "Saves"-Ordner direkt im Benutzerordner wird weiter gelesen.
 */
function saves_dir(string $me): string {
    $cur = user_data_dir($me);
    foreach (['My Games', 'FalloutNV', 'Saves'] as $part) {
        $hit = null;
        foreach ((array)@scandir($cur) as $n) if (is_string($n) && strtolower($n) === strtolower($part)) { $hit = $n; break; }
        $cur .= '/' . ($hit ?? $part);
    }
    return $cur;
}
function legacy_saves_dir(string $me): ?string {
    $base = user_data_dir($me);
    foreach ((array)@scandir($base) as $n) if (is_string($n) && strtolower($n) === 'saves') return $base . '/' . $n;
    return null;
}
function save_path(string $me, string $name): string {
    if (!preg_match('/^[^\/\\\\\0]{1,200}\.(fos|nvse)$/i', $name) || str_contains($name, '..')) fail(400, 'Ungültiger Dateiname');
    $p = saves_dir($me) . '/' . $name;
    // ein Stand, der nur im alten Ordner liegt (Download/Löschen)
    $old = legacy_saves_dir($me);
    if (!is_file($p) && $old !== null && is_file($old . '/' . $name)) return $old . '/' . $name;
    return $p;
}
function list_saves(string $me): array {
    $out = [];
    $seen = [];
    foreach (array_filter([saves_dir($me), legacy_saves_dir($me)]) as $d) {
        foreach ((array)@scandir($d) as $n) {
            if (!is_string($n) || !preg_match('/\.fos$/i', $n) || isset($seen[strtolower($n)])) continue;
            $seen[strtolower($n)] = true;
            $p = $d . '/' . $n;
            $out[] = ['name' => $n, 'size' => filesize($p), 'mtime' => filemtime($p)];
        }
    }
    usort($out, fn($a, $b) => $b['mtime'] <=> $a['mtime']);
    return $out;
}

if ($route === 'saves' && $method === 'GET') reply(200, ['saves' => list_saves($me)]);
if ($route === 'saves/download' && $method === 'GET') {
    $p = save_path($me, (string)($_GET['name'] ?? ''));
    if (!is_file($p)) fail(404, 'Nicht gefunden');
    send_file($p, basename($p));
}
if ($route === 'saves/upload' && $method === 'POST') {
    $p = save_path($me, (string)($_GET['name'] ?? ''));
    $data = (string)file_get_contents('php://input');
    if ($data === '' || strlen($data) > 64 << 20) fail(400, 'Leere oder zu große Datei');
    ensure_dir(dirname($p));
    file_put_contents($p, $data, LOCK_EX);
    reply(200, ['ok' => true]);
}
if ($route === 'saves/delete' && $method === 'POST') {
    $p = save_path($me, (string)(input()['name'] ?? ''));
    if (!is_file($p)) fail(404, 'Nicht gefunden');
    unlink($p);
    $se = preg_replace('/\.fos$/i', '.nvse', $p);
    if ($se !== null && is_file($se)) unlink($se);
    reply(200, ['ok' => true]);
}

// ---- Backups: alle Spielstände + Einstellungen eines Benutzers als ZIP ---------------------------------
function backups_dir(string $me): string { return user_private_dir($me) . '/backups'; }
function backup_path(string $me, string $name): string {
    if (!preg_match('/^[A-Za-z0-9._ -]{1,160}\.zip$/', $name) || str_contains($name, '..')) fail(400, 'Ungültiger Backup-Name');
    return backups_dir($me) . '/' . $name;
}
function make_backup(string $me, string $label): string {
    if (!class_exists('ZipArchive')) fail(501, 'PHP-Erweiterung "zip" fehlt auf dem Server');
    $src = user_data_dir($me);
    ensure_dir($src);
    ensure_dir(backups_dir($me));
    $name = date('Y-m-d_His') . ($label !== '' ? '_' . safe_name($label) : '') . '.zip';
    $zip = new ZipArchive();
    if ($zip->open(backups_dir($me) . '/' . $name, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) fail(500, 'ZIP lässt sich nicht anlegen');
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($src, FilesystemIterator::SKIP_DOTS));
    $count = 0;
    foreach ($it as $f) {
        if (!$f->isFile()) continue;
        $rel = substr($f->getPathname(), strlen($src) + 1);
        $zip->addFile($f->getPathname(), str_replace('\\', '/', $rel));
        $count++;
    }
    if ($count === 0) $zip->addFromString('LEER.txt', "Noch keine Spielstände.\n");
    // erst wenn die ZIP wirklich auf der Platte liegt, gilt das Backup (Platte voll, Kontingent …)
    if (!$zip->close() || !is_file(backups_dir($me) . '/' . $name)) {
        @unlink(backups_dir($me) . '/' . $name);
        fail(500, 'Backup konnte nicht geschrieben werden');
    }
    return $name;
}
function rrmdir(string $d): void {
    if (!is_dir($d)) return;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    rmdir($d);
}

if ($route === 'backups' && $method === 'GET') {
    $out = [];
    foreach ((array)@scandir(backups_dir($me)) as $n) {
        if (!is_string($n) || !str_ends_with($n, '.zip')) continue;
        $p = backups_dir($me) . '/' . $n;
        $out[] = ['name' => $n, 'size' => filesize($p), 'mtime' => filemtime($p)];
    }
    usort($out, fn($a, $b) => strcmp($b['name'], $a['name']));
    reply(200, ['backups' => $out]);
}
if ($route === 'backups/create' && $method === 'POST') {
    reply(200, ['ok' => true, 'name' => make_backup($me, substr((string)(input()['label'] ?? ''), 0, 40))]);
}
if ($route === 'backups/download' && $method === 'GET') {
    $p = backup_path($me, (string)($_GET['name'] ?? ''));
    if (!is_file($p)) fail(404, 'Nicht gefunden');
    send_file($p, basename($p), 'application/zip');
}
if ($route === 'backups/delete' && $method === 'POST') {
    $p = backup_path($me, (string)(input()['name'] ?? ''));
    if (!is_file($p)) fail(404, 'Nicht gefunden');
    unlink($p);
    reply(200, ['ok' => true]);
}
if (($route === 'backups/restore' || $route === 'backups/upload') && $method === 'POST') {
    if (!class_exists('ZipArchive')) fail(501, 'PHP-Erweiterung "zip" fehlt auf dem Server');
    if ($route === 'backups/upload') {
        $data = (string)file_get_contents('php://input');
        if ($data === '' || strlen($data) > 256 << 20) fail(400, 'Leere oder zu große Datei');
        ensure_dir(backups_dir($me));
        $name = date('Y-m-d_His') . '_hochgeladen.zip';
        file_put_contents(backups_dir($me) . '/' . $name, $data);
        $p = backups_dir($me) . '/' . $name;
    } else {
        $p = backup_path($me, (string)(input()['name'] ?? ''));
    }
    if (!is_file($p)) fail(404, 'Nicht gefunden');
    $zip = new ZipArchive();
    if ($zip->open($p) !== true) fail(400, 'Keine gültige ZIP-Datei');
    for ($i = 0; $i < $zip->numFiles; $i++) {                // nur harmlose Pfade zulassen
        $n = (string)$zip->getNameIndex($i);
        if ($n === '' || $n[0] === '/' || str_contains($n, '..') || str_contains($n, '\\') || str_contains($n, ':')
            || preg_match('#(^|/)(\.ht[^/]*|[^/]*\.(php\d*|phtml|phar|cgi|pl)(\.[^/]*)?)(/|$)#i', $n)) {
            $zip->close();
            fail(400, 'Backup enthält ungültige Pfade');
        }
    }
    $safety = make_backup($me, 'vor-wiederherstellung');      // Sicherheitskopie des aktuellen Stands
    // erst vollständig daneben entpacken, dann tauschen: scheitert das Entpacken, bleiben die Spielstände unberührt
    $dst = user_data_dir($me);
    $tmp = $dst . '.restore-tmp';
    rrmdir($tmp);
    ensure_dir($tmp);
    if (!is_dir($tmp) || !$zip->extractTo($tmp)) {
        $zip->close();
        rrmdir($tmp);
        fail(500, 'Backup konnte nicht entpackt werden – Spielstände unverändert');
    }
    $zip->close();
    rrmdir($dst);
    if (!rename($tmp, $dst)) fail(500, 'Wiederherstellung fehlgeschlagen – Sicherung: ' . $safety);
    @unlink($dst . '/LEER.txt');
    reply(200, ['ok' => true, 'safety' => $safety]);
}

// ---- DLCs pro Benutzer ---------------------------------------------------------------------------------
if ($route === 'dlc' && $method === 'GET') {
    $prefs = dlc_prefs($me);
    reply(200, ['dlc' => array_map(fn($n) => ['name' => $n, 'enabled' => $prefs[strtolower($n)] ?? false], dlc_available())]);
}
if ($route === 'dlc' && $method === 'POST') {
    $in = input();
    $name = (string)($in['name'] ?? '');
    if (!in_array(strtolower($name), array_map('strtolower', dlc_available()), true)) fail(404, 'DLC nicht gefunden');
    dlc_set($me, $name, !empty($in['enabled']));
    reply(200, ['ok' => true]);
}

// ---- Cheats: freischalten mit einem der Cheat-Passwörter aus dem Admin-Center ---------------------------
function cheats_file(): string { return cfg()['private'] . '/cheats.json'; }
if ($route === 'cheats/unlock' && $method === 'POST') {
    $pw = (string)(input()['password'] ?? '');
    foreach (json_load(cheats_file(), []) as $c) {
        if (password_verify($pw, (string)$c['hash'])) reply(200, ['ok' => true, 'label' => $c['label']]);
    }
    sleep(1);
    fail(403, 'Falsches Cheat-Passwort');
}

// ---- Admin-Center --------------------------------------------------------------------------------------
if (str_starts_with($route, 'admin/')) {
    if (!is_admin($me)) fail(403, 'Nur für Admins');
    $in = $method === 'POST' ? input() : [];
    $meta = meta();
    $admins = $meta['admins'] ?? [];

    if ($route === 'admin/users' && $method === 'GET') {
        $list = [];
        foreach (array_keys($users) as $u) $list[] = ['user' => $u, 'admin' => in_array($u, $admins, true),
            'mustChangePassword' => in_array($u, $meta['mustChange'] ?? [], true)];
        reply(200, ['users' => $list]);
    }
    if ($route === 'admin/users/add' && $method === 'POST') {
        $u = (string)($in['user'] ?? '');
        $pw = (string)($in['password'] ?? '');
        // safe_name(): zwei Namen dürfen nicht im selben Datenordner landen ("a." und "a")
        if (!valid_user($u) || safe_name($u) !== $u) fail(400, 'Benutzername: 1–40 Zeichen, nur Buchstaben, Ziffern, . _ - (nicht mit Punkt beginnen oder enden)');
        if (isset($users[$u])) fail(409, 'Gibt es schon');
        if (strlen($pw) < 8) fail(400, 'Passwort: mindestens 8 Zeichen');
        $users[$u] = hash_password($pw);
        htpasswd_write($users);
        if (!empty($in['admin'])) $meta['admins'][] = $u;
        $meta['mustChange'] = array_values(array_unique([...($meta['mustChange'] ?? []), $u]));   // eigenes Passwort beim 1. Login
        meta_save($meta);
        reply(200, ['ok' => true]);
    }
    if ($route === 'admin/users/password' && $method === 'POST') {
        $u = (string)($in['user'] ?? '');
        $pw = (string)($in['password'] ?? '');
        if (!isset($users[$u])) fail(404, 'Benutzer nicht gefunden');
        if (strlen($pw) < 8) fail(400, 'Passwort: mindestens 8 Zeichen');
        $users[$u] = hash_password($pw);
        htpasswd_write($users);
        if ($u !== $me) { $meta['mustChange'] = array_values(array_unique([...($meta['mustChange'] ?? []), $u])); meta_save($meta); }
        reply(200, ['ok' => true]);
    }
    if ($route === 'admin/users/delete' && $method === 'POST') {
        $u = (string)($in['user'] ?? '');
        if (!isset($users[$u])) fail(404, 'Benutzer nicht gefunden');
        if ($u === $me) fail(409, 'Du kannst dich nicht selbst löschen');
        unset($users[$u]);
        htpasswd_write($users);
        $meta['admins'] = array_values(array_diff($admins, [$u]));
        $meta['mustChange'] = array_values(array_diff($meta['mustChange'] ?? [], [$u]));
        meta_save($meta);
        reply(200, ['ok' => true]);   // Spielstände bleiben erhalten (Datenordner wird nicht gelöscht)
    }
    if ($route === 'admin/users/admin' && $method === 'POST') {
        $u = (string)($in['user'] ?? '');
        if (!isset($users[$u])) fail(404, 'Benutzer nicht gefunden');
        $on = !empty($in['admin']);
        if (!$on && $u === $me) fail(409, 'Du kannst dir die Admin-Rechte nicht selbst nehmen');
        $meta['admins'] = $on ? array_values(array_unique([...$admins, $u])) : array_values(array_diff($admins, [$u]));
        meta_save($meta);
        reply(200, ['ok' => true]);
    }
    if ($route === 'admin/cheats' && $method === 'GET') {
        reply(200, ['cheats' => array_map(fn($c) => ['id' => $c['id'], 'label' => $c['label'], 'created' => $c['created'] ?? null],
            json_load(cheats_file(), []))]);
    }
    if ($route === 'admin/cheats/add' && $method === 'POST') {
        $label = trim(substr((string)($in['label'] ?? ''), 0, 60));
        $pw = (string)($in['password'] ?? '');
        if ($label === '') fail(400, 'Bezeichnung fehlt');
        if (strlen($pw) < 4) fail(400, 'Cheat-Passwort: mindestens 4 Zeichen');
        $list = json_load(cheats_file(), []);
        $list[] = ['id' => bin2hex(random_bytes(6)), 'label' => $label, 'hash' => hash_password($pw), 'created' => time()];
        json_save(cheats_file(), $list);
        reply(200, ['ok' => true]);
    }
    if ($route === 'admin/cheats/delete' && $method === 'POST') {
        $id = (string)($in['id'] ?? '');
        $list = array_values(array_filter(json_load(cheats_file(), []), fn($c) => $c['id'] !== $id));
        json_save(cheats_file(), $list);
        reply(200, ['ok' => true]);
    }
}

fail(404, 'Unbekannte Anfrage');
