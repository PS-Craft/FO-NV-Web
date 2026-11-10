# FO-NV-Web – alles auf das Weblaufwerk hochladen (WinSCP, SFTP oder FTPS).
#
#   .\deploy.ps1               App + Spiel-Build + iPad-Archive (schnell, nur Geändertes)
#   .\deploy.ps1 -GameFiles    zusätzlich einmalig FalloutNV.exe + Data\ (~10 GB, dauert)
#
# Liest pc\deploy.local.json (Vorlage: deploy.example.json). Das Passwort wird beim ersten Mal abgefragt und
# verschlüsselt für dein Windows-Konto in pc\deploy.password.xml gespeichert (nie committet).
# fnv-private\.htpasswd (Startzugang "admin") wird nur hochgeladen, wenn es auf dem Server noch keine gibt –
# später angelegte Zugänge und Passwörter werden also nie überschrieben.
# pc\deploy.state.json (nie committet) merkt sich die Prüfsummen der hochgeladenen Dateien: geänderte Dateien gleicher
# Länge (neu gebautes fnv_web.wasm, index.html …) übersieht der Größenabgleich sonst.
param([switch]$GameFiles)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $Here 'deploy.local.json') -Raw | ConvertFrom-Json
$Up = 'C:\FNV-Web\upload'
if (-not (Test-Path "$Up\www\index.html")) { throw 'Kein Upload-Ordner – erst .\build.ps1 ausführen.' }

$winscp = @("${env:ProgramFiles(x86)}\WinSCP\WinSCP.com", "$env:ProgramFiles\WinSCP\WinSCP.com", "$env:LOCALAPPDATA\Programs\WinSCP\WinSCP.com") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $winscp) { winget install --id WinSCP.WinSCP -e --accept-source-agreements --accept-package-agreements; throw 'WinSCP installiert – Skript bitte erneut starten.' }

$pwFile = Join-Path $Here 'deploy.password.xml'
if (-not (Test-Path $pwFile)) { Read-Host "Passwort für $($cfg.user)@$($cfg.host)" -AsSecureString | Export-Clixml $pwFile }
$pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Import-Clixml $pwFile)))
# ftpes = FTP mit expliziter TLS-Verschlüsselung auf Port 21 (all-inkl); ftps = implizit (Port 990); sftp = SSH
$proto = ([string]$cfg.protocol).ToLower()
if ($proto -eq 'ftps' -and [int]$cfg.port -eq 21) { $proto = 'ftpes' }
if ($proto -notin @('sftp', 'ftpes', 'ftps')) { throw "protocol muss sftp, ftpes oder ftps sein (unverschlüsseltes ftp wird nicht benutzt)" }
$url = '{0}://{1}:{2}@{3}:{4}/' -f $proto, [uri]::EscapeDataString($cfg.user), [uri]::EscapeDataString($pw), $cfg.host, $cfg.port
# SFTP: Fingerabdruck des Servers aus deploy.local.json ("hostKey": "ssh-ed25519 255 ..."), damit sich niemand
# dazwischenschalten kann. Ohne Angabe wird jeder Schlüssel angenommen (Warnung). FTPS prüft das TLS-Zertifikat.
$openArgs = ''
if ($proto -eq 'sftp') {
    if ([string]$cfg.hostKey) { $openArgs = "-hostkey=`"$($cfg.hostKey)`"" }
    else { $openArgs = '-hostkey=*'; Write-Warning 'SFTP ohne "hostKey" in deploy.local.json: der Server-Schlüssel wird nicht geprüft.' }
}
# remoteBase = Pfad, wie der FTP-Zugang ihn sieht ('/' = sein Startordner)
$base = ([string]$cfg.remoteBase).TrimEnd('/')
$web = if ([string]$cfg.webFolder) { "$base/$($cfg.webFolder.Trim('/'))" } else { if ($base) { $base } else { '/' } }
$webDir = $web.TrimEnd('/')

# WinSCP-Skript ausführen. Die Skriptdatei enthält das Passwort: sie wird in jedem Fall wieder gelöscht.
# mkdir schlägt fehl, wenn der Ordner existiert: diese Zeilen dürfen scheitern.
function Invoke-WinScp([string[]]$lines, [string]$log, [switch]$Show) {
    $script = (@('option batch abort', 'option confirm off', "open `"$url`" $openArgs") + $lines + 'exit' |
        ForEach-Object { if ($_ -like 'mkdir*' -or $_ -like 'rm *') { "option batch continue`n$_`noption batch abort" } else { $_ } }) -join "`n"
    $tmp = New-TemporaryFile
    try {
        Set-Content $tmp $script -Encoding UTF8
        $a = @('/ini=nul', "/script=$tmp"); if ($log) { $a += "/log=$log" }
        # Fortschritt gleich zeigen; die Zeile mit der Adresse (enthält das Passwort) nie ausgeben
        $out = & $winscp @a | ForEach-Object { $l = "$_"; if ($l -notmatch '://') { if ($Show) { Write-Host $l }; $l } }
        return @{ code = $LASTEXITCODE; out = @($out) }
    } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

# Prüfsummen: was hat sich seit dem letzten Hochladen geändert? (shader\: Namen sind Prüfsummen, ändern sich nie)
$stateFile = Join-Path $Here 'deploy.state.json'
$old = @{}
if (Test-Path $stateFile) { (Get-Content $stateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $old[$_.Name] = $_.Value } }
$new = @{}; $changed = @()
$root = (Resolve-Path "$Up\www").Path.TrimEnd('\') + '\'
Get-ChildItem $root -Recurse -File -Force | Where-Object { $_.FullName -notmatch '\\shader\\' } | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length).Replace('\', '/')
    $new[$rel] = (Get-FileHash $_.FullName -Algorithm SHA1).Hash
    if ($old[$rel] -ne $new[$rel]) { $changed += $rel }
}

$lines = @("mkdir `"$base/fnv-private`"", "mkdir `"$base/fnv-data`"", "mkdir `"$base/fnv-cache`"", "mkdir `"$base/fnv-mobile`"", "mkdir `"$base/fnv-game`"")
# mkdir "/" bricht die FTP-Sitzung ab, der Stamm existiert immer
if ($web -ne '/') { $lines += "mkdir `"$web`"" }
$lines += "synchronize remote -criteria=size `"$Up\www`" `"$web`""
foreach ($rel in $changed) { $lines += "put `"$root$($rel.Replace('/', '\'))`" `"$webDir/$rel`"" }
# vorkomprimierte Fassungen von Dateien, die tools/assemble.mjs verändert: auf dem Server löschen, sonst liefert
# Apache weiter die alte .br/.gz aus (darf scheitern, wenn sie schon weg sind)
foreach ($f in @('precheck.js.br', 'precheck.js.gz')) { if (-not (Test-Path "$root$f")) { $lines += "rm `"$webDir/$f`"" } }
$lines += "synchronize remote -criteria=size `"$Up\fnv-mobile`" `"$base/fnv-mobile`""
if ($GameFiles) {
    $lines += "put `"$env:FNV_GAME\FalloutNV.exe`" `"$base/fnv-game/`""
    # Fallout_default.ini & Co.: ohne sie startet das Spiel mit falschen Speicher-Vorgaben und stürzt beim Laden ab (OOM)
    $lines += "put `"$env:FNV_GAME\*.ini`" `"$base/fnv-game/`""
    $lines += "mkdir `"$base/fnv-game/Data`""
    $lines += "synchronize remote -criteria=size `"$env:FNV_GAME\Data`" `"$base/fnv-game/Data`""
}
Write-Host "Lade hoch nach $($cfg.host):$base … ($($changed.Count) geänderte Dateien)" -ForegroundColor Cyan
$r = Invoke-WinScp $lines "$Here\deploy.log" -Show
if ($r.code -ne 0) { throw "Upload fehlgeschlagen (siehe pc\deploy.log)" }
$new | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8

# Startzugang nur, wenn noch keine Benutzerliste existiert. "Nicht gefunden" gilt nur, wenn die Verbindung steht und
# der Ordner lesbar ist – ein Verbindungsfehler darf die echte Benutzerliste nie mit dem Startzugang überschreiben.
$r = Invoke-WinScp @('option batch continue', "stat `"$base/fnv-private`"", "stat `"$base/fnv-private/.htpasswd`"")
$stats = @($r.out | Where-Object { $_ -match '^\s*[-dl][-rwxsStT]{9}' })      # Zeilen einer gelungenen Abfrage
if (-not ($stats | Where-Object { $_ -match 'fnv-private\s*$' })) { throw 'Konnte fnv-private auf dem Server nicht prüfen – Benutzerliste nicht angefasst. Bitte erneut starten.' }
if (-not ($stats | Where-Object { $_ -match '\.htpasswd\s*$' })) {
    $r = Invoke-WinScp @("put `"$Up\fnv-private\.htpasswd`" `"$base/fnv-private/.htpasswd`"")
    if ($r.code -ne 0) { throw 'Startzugang konnte nicht hochgeladen werden.' }
    Write-Host 'Startzugang "admin" angelegt.' -ForegroundColor Yellow
}
Write-Host 'Fertig.' -ForegroundColor Green
