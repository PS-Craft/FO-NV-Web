<?php
// Gemeinsame Helfer für fs.php und api.php: Konfiguration, Benutzer (.htpasswd), Rechte, Datenordner.
declare(strict_types=1);

function cfg(): array {
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/fs-config.php';
        if (!is_file($f)) { http_response_code(500); exit('fs-config.php fehlt'); }
        $c = require $f;
        $c['game'] = rtrim((string)$c['game'], '/');
        $c['data'] = rtrim((string)$c['data'], '/');
        $c['mobile'] = isset($c['mobile']) ? rtrim((string)$c['mobile'], '/') : '';
        $c['cache'] = rtrim((string)($c['cache'] ?? $c['data'] . '/../fnv-cache'), '/');
        $c['private'] = rtrim((string)($c['private'] ?? $c['data'] . '/../fnv-private'), '/');
        $c['htpasswd'] = (string)($c['htpasswd'] ?? $c['private'] . '/.htpasswd');
        $c['dlc'] = !empty($c['dlc']);
        $c['per_user'] = $c['per_user'] ?? true;
    }
    return $c;
}

// ---- kleine Datei-Helfer -------------------------------------------------------------------------------
function ensure_dir(string $d): void { if (!is_dir($d)) @mkdir($d, 0700, true); }

function json_load(string $file, $default) {
    if (!is_file($file)) return $default;
    $v = json_decode((string)file_get_contents($file), true);
    return $v === null ? $default : $v;
}
function json_save(string $file, $value): void {
    ensure_dir(dirname($file));
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, $file);
}

/** Nur harmlose Zeichen für Datei- und Ordnernamen aus Benutzereingaben. */
function safe_name(string $s): string {
    $s = preg_replace('/[^A-Za-z0-9._ -]/', '_', $s) ?? '';
    $s = trim($s, " .");
    return $s === '' ? '_' : substr($s, 0, 120);
}
function valid_user(string $u): bool { return (bool)preg_match('/^[A-Za-z0-9._-]{1,40}$/', $u); }

// ---- Benutzer ------------------------------------------------------------------------------------------
/** @return array<string,string> Benutzer => bcrypt-Hash */
function htpasswd_read(): array {
    $out = [];
    $f = cfg()['htpasswd'];
    if (!is_file($f)) return $out;
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $p = strpos($line, ':');
        if ($p !== false) $out[substr($line, 0, $p)] = substr($line, $p + 1);
    }
    return $out;
}
function htpasswd_write(array $users): void {
    $f = cfg()['htpasswd'];
    ensure_dir(dirname($f));
    $txt = '';
    foreach ($users as $u => $h) $txt .= $u . ':' . $h . "\n";
    $tmp = $f . '.tmp';
    file_put_contents($tmp, $txt, LOCK_EX);
    @chmod($tmp, 0644);   // Apache muss sie lesen können
    rename($tmp, $f);
}
function hash_password(string $pw): string { return password_hash($pw, PASSWORD_BCRYPT); }

/**
 * Rollen: wer Admin ist, wer sein Passwort noch ändern muss. Fehlt die Datei (frisch installiert mit dem
 * Startpasswort aus initial-admin.htpasswd.txt), ist "admin" Admin und muss sein Passwort ändern.
 */
function meta(): array {
    return json_load(cfg()['private'] . '/users.json', ['admins' => ['admin'], 'mustChange' => ['admin']]);
}
function must_change(?string $u): bool { return $u !== null && in_array($u, meta()['mustChange'] ?? [], true); }
function meta_save(array $m): void { json_save(cfg()['private'] . '/users.json', $m); }
function is_admin(?string $u): bool { return $u !== null && in_array($u, meta()['admins'] ?? [], true); }

/**
 * Der angemeldete Benutzer. Hat Apache schon geprüft (REMOTE_USER), gilt das. Sonst prüft PHP selbst die
 * Basic-Auth-Daten gegen die .htpasswd – so ist die API auch geschützt, wenn die .htaccess-Prüfung fehlt.
 */
function current_user(): ?string {
    static $done = false, $user = null;
    if ($done) return $user;
    $done = true;
    foreach (['REMOTE_USER', 'REDIRECT_REMOTE_USER'] as $k) {
        if (!empty($_SERVER[$k]) && valid_user((string)$_SERVER[$k])) return $user = (string)$_SERVER[$k];
    }
    $u = $_SERVER['PHP_AUTH_USER'] ?? null;
    $p = $_SERVER['PHP_AUTH_PW'] ?? null;
    if ($u === null) {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (stripos($h, 'basic ') === 0) {
            $dec = base64_decode(substr($h, 6), true);
            if ($dec !== false && str_contains($dec, ':')) [$u, $p] = explode(':', $dec, 2);
        }
    }
    if ($u === null || $p === null || !valid_user($u)) return $user = null;
    $hash = htpasswd_read()[$u] ?? null;
    return $user = ($hash !== null && password_verify($p, $hash)) ? $u : null;
}

/** Spielstände/Einstellungen: pro Benutzer ein eigener Ordner (oder gemeinsam, wenn per_user aus ist). */
function user_data_dir(?string $u): string {
    $c = cfg();
    if (!$c['per_user']) return $c['data'];
    return $c['data'] . '/users/' . safe_name($u ?? 'gast');
}
function user_private_dir(?string $u): string { return cfg()['private'] . '/users/' . safe_name($u ?? 'gast'); }

// ---- DLCs ----------------------------------------------------------------------------------------------
/** DLC-Namen = .nam-Dateien in Data (das Spiel lädt ein Plugin nur, wenn seine .nam existiert). */
function dlc_available(): array {
    $names = [];
    foreach (['Data', 'data', 'DATA'] as $d) {
        foreach ((array)@scandir(cfg()['game'] . '/' . $d) as $f) {
            if (is_string($f) && preg_match('/^(.+)\.nam$/i', $f, $m)) $names[strtolower($m[1])] = $m[1];
        }
    }
    ksort($names);
    return array_values($names);
}
/** @return array<string,bool> DLC-Name (klein) => an/aus für diesen Benutzer */
function dlc_prefs(?string $u): array {
    $saved = json_load(user_private_dir($u) . '/prefs.json', [])['dlc'] ?? [];
    $out = [];
    foreach (dlc_available() as $name) {
        $k = strtolower($name);
        $out[$k] = array_key_exists($k, $saved) ? (bool)$saved[$k] : cfg()['dlc'];
    }
    return $out;
}
function dlc_set(?string $u, string $name, bool $on): void {
    $f = user_private_dir($u) . '/prefs.json';
    $p = json_load($f, []);
    $p['dlc'][strtolower($name)] = $on;
    json_save($f, $p);
}
