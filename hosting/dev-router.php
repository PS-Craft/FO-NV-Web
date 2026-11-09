<?php
// Nur für lokale Tests mit "php -S": ahmt die RewriteRule /fs/<op> -> fs.php?op=<op> aus .htaccess nach.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/fs/([a-z]+)$#', $path, $m)) { $_GET['op'] = $m[1]; require __DIR__ . '/fs.php'; return true; }
return false;
