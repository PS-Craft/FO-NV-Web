# FO-NV-Web – alles auf das Weblaufwerk hochladen (WinSCP, SFTP oder FTPS).
#
#   .\deploy.ps1               App + Spiel-Build + iPad-Archive (schnell, nur Geändertes)
#   .\deploy.ps1 -GameFiles    zusätzlich einmalig FalloutNV.exe + Data\ (~10 GB, dauert)
#
# Liest pc\deploy.local.json (Vorlage: deploy.example.json). Das Passwort wird beim ersten Mal abgefragt und
# verschlüsselt für dein Windows-Konto in pc\deploy.password.xml gespeichert (nie committet).
# fnv-private\.htpasswd (Startzugang "admin") wird nur hochgeladen, wenn es auf dem Server noch keine gibt –
# später angelegte Zugänge und Passwörter werden also nie überschrieben.
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
$openArgs = if ($proto -eq 'sftp') { '-hostkey=*' } else { '' }
# remoteBase = Pfad, wie der FTP-Zugang ihn sieht ('/' = sein Startordner)
$base = ([string]$cfg.remoteBase).TrimEnd('/')
$web = if ([string]$cfg.webFolder) { "$base/$($cfg.webFolder.Trim('/'))" } else { if ($base) { $base } else { '/' } }

$lines = @(
    'option batch abort', 'option confirm off',
    "open `"$url`" $openArgs",
    "mkdir `"$base/fnv-private`"", "mkdir `"$base/fnv-data`"", "mkdir `"$base/fnv-cache`"", "mkdir `"$base/fnv-mobile`"", "mkdir `"$base/fnv-game`"",
    "mkdir `"$web`"",
    "synchronize remote -criteria=size `"$Up\www`" `"$web`"",
    "synchronize remote -criteria=size `"$Up\fnv-mobile`" `"$base/fnv-mobile`""
)
if ($GameFiles) {
    $lines += "put `"$env:FNV_GAME\FalloutNV.exe`" `"$base/fnv-game/`""
    $lines += "synchronize remote -criteria=size `"$env:FNV_GAME\Data`" `"$base/fnv-game/Data`""
}
$lines += 'exit'
# mkdir schlägt fehl, wenn der Ordner existiert: diese Zeilen dürfen scheitern
$script = ($lines | ForEach-Object { if ($_ -like 'mkdir*') { "option batch continue`n$_`noption batch abort" } else { $_ } }) -join "`n"
$tmp = New-TemporaryFile
Set-Content $tmp $script -Encoding UTF8
Write-Host "Lade hoch nach $($cfg.host):$base …" -ForegroundColor Cyan
& $winscp /ini=nul /log="$Here\deploy.log" /script="$tmp"
$code = $LASTEXITCODE
Remove-Item $tmp
if ($code -ne 0) { throw "Upload fehlgeschlagen (siehe pc\deploy.log)" }

# Startzugang nur, wenn noch keine Benutzerliste existiert
$check = "option batch abort`nopen `"$url`" $openArgs`nstat `"$base/fnv-private/.htpasswd`"`nexit"
$tmp = New-TemporaryFile; Set-Content $tmp $check -Encoding UTF8
& $winscp /ini=nul /script="$tmp" | Out-Null
$exists = $LASTEXITCODE -eq 0; Remove-Item $tmp
if (-not $exists) {
    $tmp = New-TemporaryFile
    Set-Content $tmp "option batch abort`nopen `"$url`" $openArgs`nput `"$Up\fnv-private\.htpasswd`" `"$base/fnv-private/.htpasswd`"`nexit" -Encoding UTF8
    & $winscp /ini=nul /script="$tmp"; Remove-Item $tmp
    Write-Host 'Startzugang "admin" angelegt.' -ForegroundColor Yellow
}
Write-Host 'Fertig.' -ForegroundColor Green
