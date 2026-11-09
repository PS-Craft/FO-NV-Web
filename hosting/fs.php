<?php
// Datei-API des Spiels für normales PHP-Webhosting (z. B. all-inkl) – Nachbau von /fs/* aus
// server/serve.mjs des Projekts SgtMetz/fnv-web-recomp (MIT). Verhalten identisch, damit die
// unveränderte Browser-Version des Spiels damit läuft. Aufruf über .htaccess:  /fs/<op>  ->  fs.php?op=<op>
//
//   /fs/index                        Index der Installation (Pfade klein geschrieben -> Größe, mtime; Ordner)
//   /fs/stat|list|read               GET. Zwei Wurzeln: /game (Installation, nur lesen, Groß/Klein egal) und
//                                    /docs (private "My Games"-Kopie: Einstellungen und Spielstände, beschreibbar)
//   /fs/write|truncate|mkdir|remove|rename   POST, nur /docs
//
// Die Pfade stehen in fs-config.php (Vorlage: fs-config.example.php).

declare(strict_types=1);

require __DIR__ . '/lib.php';
$CFG = cfg();
$GAME = $CFG['game'];
$MOBILE = $CFG['mobile'];
$CACHE = $CFG['cache'];
$USER = current_user();
if ($USER === null && is_file($CFG['htpasswd'])) { header('WWW-Authenticate: Basic realm="Privat"'); http_response_code(401); exit; }
// Spielstände und Einstellungen pro Benutzer; DLCs pro Benutzer ein-/ausschaltbar (api.php -> dlc)
$DATA = user_data_dir($USER);
$DLC = array_keys(array_filter(dlc_prefs($USER)));   // eingeschaltete DLC-Namen (klein)

if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');   // Blöcke nicht nachkomprimieren
@ini_set('zlib.output_compression', '0');
// Unter Apache setzt die .htaccess diese Header (SetEnvIf ... FNV_APACHE_HEADERS); doppelt gesendet wären sie ungültig.
if (empty($_SERVER['FNV_APACHE_HEADERS']) && empty($_SERVER['REDIRECT_FNV_APACHE_HEADERS']) && !getenv('FNV_APACHE_HEADERS')) {
    header('Cross-Origin-Opener-Policy: same-origin');
    header('Cross-Origin-Embedder-Policy: require-corp');
    header('Cross-Origin-Resource-Policy: same-origin');
    header('X-Content-Type-Options: nosniff');
}

function out(int $code, string $body = '', ?string $type = null, ?string $cache = null): void {
    http_response_code($code);
    if ($type !== null) header('Content-Type: ' . $type);
    if ($cache !== null) header('Cache-Control: ' . $cache);
    header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}
function json(array|object $v): string {
    return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

// ---- Index der Installation (einmal erzeugt, als Datei zwischengespeichert) -----------------------------
function buildIndex(string $game, string $mobile, array $dlc): string {
    $files = [];
    $dirs = [];
    $walk = function (string $dir, string $key) use (&$walk, &$files, &$dirs, $dlc): void {
        $names = [];
        $entries = @scandir($dir);
        if ($entries === false) return;
        foreach ($entries as $name) {
            if ($name === '.' || $name === '..') continue;
            $real = $dir . '/' . $name;
            $isFile = is_file($real);
            // DLC-Marker (.nam) ausgeschalteter DLCs verstecken: ohne .nam lädt das Spiel das DLC nicht
            if ($isFile && preg_match('/^(.+)\.nam$/i', $name, $mm) && !in_array(strtolower($mm[1]), $dlc, true)) continue;
            $names[] = $name;
            $k = $key . '/' . strtolower($name);
            if (is_dir($real)) $walk($real, $k);
            elseif ($isFile) $files[$k] = [filesize($real), filemtime($real)];
        }
        $dirs[$key] = $names;
    };
    $walk($game, '/game');
    if ($mobile !== '' && is_dir($mobile)) { $walk($mobile, '/game/data/mobile'); unset($dirs['/game/data/mobile']); }
    return json(['f' => (object)$files, 'd' => (object)$dirs]);
}

function gameIndex(string $game, string $mobile, array $dlc, string $cache): array {
    static $idx = null;
    if ($idx !== null) return $idx;
    $file = $cache . '/index-' . ($dlc ? substr(sha1(implode(',', $dlc)), 0, 12) : 'base') . '.json';
    $newest = max(@filemtime($game) ?: 0, @filemtime($game . '/Data') ?: 0, @filemtime($game . '/data') ?: 0,
                  $mobile !== '' ? (@filemtime($mobile) ?: 0) : 0, @filemtime(__DIR__ . '/fs-config.php') ?: 0);
    $mt = @filemtime($file);
    if ($mt !== false && $mt >= $newest && !isset($_GET['rebuild'])) {
        $raw = (string)file_get_contents($file);
    } else {
        $raw = buildIndex($game, $mobile, $dlc);
        @mkdir($cache, 0700, true);
        @file_put_contents($file . '.tmp', $raw);
        @rename($file . '.tmp', $file);
    }
    $idx = ['raw' => $raw, 'data' => json_decode($raw, true)];
    return $idx;
}

// /docs: Groß/Klein egal, Stück für Stück aufgelöst (ändert sich während des Spiels, daher kein Index)
function resolveDocs(string $data, string $rel, bool $forCreate): ?string {
    $cur = $data;
    foreach (array_values(array_filter(explode('/', $rel), 'strlen')) as $part) {
        if ($part === '..' || $part === '.' || str_contains($part, "\0") || str_contains($part, '\\')) return null;
        $next = $cur . '/' . $part;
        if (!file_exists($next)) {
            $match = null;
            $ls = @scandir($cur);
            if ($ls !== false) foreach ($ls as $n) {
                if ($n !== '.' && $n !== '..' && strtolower($n) === strtolower($part)) { $match = $n; break; }
            }
            if ($match !== null) $next = $cur . '/' . $match;
            elseif (!$forCreate) return null;
        }
        $cur = $next;
    }
    return $cur;
}

function locate(?string $p, bool $forCreate, array $ctx): ?array {
    if ($p === null || !preg_match('#^/(game|docs)(/.*)?$#i', $p, $m)) return null;
    $rest = $m[2] ?? '';
    if ($rest === '') $rest = '/';
    if (strtolower($m[1]) === 'game') {
        $key = rtrim(strtolower('/game' . $rest), '/');
        if ($key === '') $key = '/game';
        $idx = gameIndex($ctx['game'], $ctx['mobile'], $ctx['dlc'], $ctx['cache'])['data'];
        $f = $idx['f'][$key] ?? null;
        return ['root' => 'game', 'key' => $key, 'file' => $f, 'dir' => $idx['d'][$key] ?? null,
                'real' => $f !== null ? realGamePath($ctx, $key) : null];
    }
    return ['root' => 'docs', 'real' => resolveDocs($ctx['data'], $rest, $forCreate)];
}

// Index-Schlüssel -> echter Pfad (Groß/Klein wie auf der Platte), über die Ordnerlisten im Index
function realGamePath(array $ctx, string $key): ?string {
    $idx = gameIndex($ctx['game'], $ctx['mobile'], $ctx['dlc'], $ctx['cache'])['data'];
    $mobileKey = '/game/data/mobile';
    if ($ctx['mobile'] !== '' && str_starts_with($key, $mobileKey . '/')) {
        $base = $ctx['mobile']; $k = $mobileKey; $rest = substr($key, strlen($mobileKey) + 1);
        // Ordnerliste von mobile ist aus dem Index entfernt: direkt auf der Platte suchen
        $cur = $base;
        foreach (explode('/', $rest) as $part) {
            $hit = null;
            foreach ((array)@scandir($cur) as $n) if (strtolower((string)$n) === $part) { $hit = $n; break; }
            if ($hit === null) return null;
            $cur .= '/' . $hit;
        }
        return $cur;
    }
    $cur = $ctx['game']; $k = '/game';
    foreach (explode('/', substr($key, strlen('/game/'))) as $part) {
        $hit = null;
        foreach ($idx['d'][$k] ?? [] as $n) if (strtolower($n) === $part) { $hit = $n; break; }
        if ($hit === null) return null;
        $cur .= '/' . $hit; $k .= '/' . $part;
    }
    return $cur;
}

// ---- Anfrage --------------------------------------------------------------------------------------------
$ctx = ['game' => $GAME, 'data' => $DATA, 'mobile' => $MOBILE, 'cache' => $CACHE, 'dlc' => $DLC];
$op = (string)($_GET['op'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($op === 'index') out(200, gameIndex($GAME, $MOBILE, $DLC, $CACHE)['raw'], 'application/json', 'no-cache');

if (!is_dir($DATA)) @mkdir($DATA, 0700, true);
$write = $method === 'POST';
$loc = locate(isset($_GET['p']) ? (string)$_GET['p'] : null, $write, $ctx);
if ($loc === null || ($write && $loc['root'] !== 'docs')) out(403);

try {
    if ($op === 'stat') {
        if ($loc['root'] === 'game') {
            if ($loc['file'] !== null) out(200, json(['dir' => false, 'size' => $loc['file'][0], 'mtime' => $loc['file'][1]]), 'application/json');
            if ($loc['dir'] !== null) out(200, json(['dir' => true, 'size' => 0, 'mtime' => 0]), 'application/json');
            out(404);
        }
        if ($loc['real'] === null || !file_exists($loc['real'])) out(404);
        clearstatcache(true, $loc['real']);
        $isDir = is_dir($loc['real']);
        out(200, json(['dir' => $isDir, 'size' => $isDir ? filesize($loc['real']) : filesize($loc['real']), 'mtime' => filemtime($loc['real'])]), 'application/json');
    } elseif ($op === 'list') {
        if ($loc['root'] === 'game') $names = $loc['dir'];
        else $names = ($loc['real'] !== null && is_dir($loc['real'])) ? array_values(array_diff(scandir($loc['real']), ['.', '..'])) : null;
        if ($names === null) out(404);
        out(200, json($names), 'application/json');
    } elseif ($op === 'read') {
        if ($loc['real'] === null || !is_file($loc['real'])) out(404);
        $o = max(0, (int)($_GET['o'] ?? 0));
        $n = max(0, min((int)($_GET['n'] ?? 0), 64 << 20));
        $fh = fopen($loc['real'], 'rb');
        if ($fh === false) out(404);
        $buf = '';
        if ($n > 0 && fseek($fh, $o) === 0) {
            while (strlen($buf) < $n && !feof($fh)) {
                $chunk = fread($fh, $n - strlen($buf));
                if ($chunk === false || $chunk === '') break;
                $buf .= $chunk;
            }
        }
        fclose($fh);
        $cache = ($loc['root'] === 'game' && !empty($_GET['v'])) ? 'public, max-age=31536000, immutable' : 'no-store';
        out(200, $buf, 'application/octet-stream', $cache);
    } elseif ($op === 'write' && $write) {
        if ($loc['real'] === null) out(404);
        $data = (string)file_get_contents('php://input');
        if (strlen($data) > (64 << 20)) out(413);
        $fh = @fopen($loc['real'], 'c+b');
        if ($fh === false) out(404, 'ENOENT');
        fseek($fh, max(0, (int)($_GET['o'] ?? 0)));
        fwrite($fh, $data);
        fclose($fh);
        out(200);
    } elseif ($op === 'truncate' && $write) {
        if ($loc['real'] === null) out(404);
        $d = dirname($loc['real']);
        if (!is_dir($d)) @mkdir($d, 0700, true);
        if (@file_put_contents($loc['real'], '') === false) out(404, 'EACCES');
        out(200);
    } elseif ($op === 'mkdir' && $write) {
        if ($loc['real'] === null || file_exists($loc['real']) || !@mkdir($loc['real'], 0700)) out(404, 'EEXIST');
        out(200);
    } elseif ($op === 'remove' && $write) {
        if ($loc['real'] === null || !is_file($loc['real']) || !@unlink($loc['real'])) out(404);
        out(200);
    } elseif ($op === 'rename' && $write) {
        $to = locate(isset($_GET['q']) ? (string)$_GET['q'] : null, true, $ctx);
        if ($to === null || $to['root'] !== 'docs' || $loc['real'] === null || $to['real'] === null) out(403);
        if (!@rename($loc['real'], $to['real'])) out(404);
        out(200);
    } else {
        out(400);
    }
} catch (Throwable $e) {
    out(404, $e->getMessage());
}
