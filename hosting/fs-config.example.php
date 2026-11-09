<?php
// Vorlage: als "fs-config.php" neben fs.php speichern und die Pfade anpassen.
// Absolute Pfade auf dem Server. Bei all-inkl beginnen sie meist mit /www/htdocs/wXXXXXXX/
// (steht im KAS unter "Account -> Account-Details" bzw. in der FTP-Ansicht).
//
// Empfehlung: Spieldaten und Spielstände AUSSERHALB des Web-Ordners der Domain ablegen.
// Falls das nicht geht, sperrt die .htaccess die Ordner fnv-data/ und fnv-cache/ zusätzlich.
return [
    // die Installation: Ordner mit FalloutNV.exe und Data/ (nur lesen)
    'game'   => '/www/htdocs/wXXXXXXX/fnv-game',
    // beschreibbar: Einstellungen (INIs) und Spielstände – regelmäßig sichern!
    'data'   => '/www/htdocs/wXXXXXXX/fnv-data',
    // optional: verkleinerte Archive für iPad/Handy (tools/mobile_archives.py -> out/mobile)
    'mobile' => '/www/htdocs/wXXXXXXX/fnv-mobile',
    // beschreibbar: Zwischenspeicher für den Dateiindex
    'cache'  => '/www/htdocs/wXXXXXXX/fnv-cache',
    // DLCs laden (Dead Money, Honest Hearts, Old World Blues, Lonesome Road, ...)
    'dlc'    => false,
];
