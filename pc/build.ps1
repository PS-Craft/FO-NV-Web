# FO-NV-Web – Browser-Version aus deiner eigenen FalloutNV.exe bauen und ein Upload-Paket schnüren.
# Voraussetzung: setup.ps1 ist durchgelaufen und alle Punkte stehen auf OK.
#
#   .\build.ps1                 kompletter Build (beim ersten Mal ca. 10–20 Minuten)
#   .\build.ps1 -SkipShaders    Shader nicht neu übersetzen
#
# Ergebnis:  C:\FNV-Web\upload\
#   www\          -> auf das Weblaufwerk in den Ordner der (Sub-)Domain
#   fnv-mobile\   -> auf das Weblaufwerk neben den Web-Ordner (verkleinerte Archive fürs iPad)
# Die Spieldateien (Data\) lädst du einmalig separat hoch (Anleitung Schritt 4).

param([switch]$SkipShaders)
$ErrorActionPreference = 'Stop'
$Root   = 'C:\FNV-Web'
$Recomp = Join-Path $Root 'fnv-web-recomp'
$Py     = Join-Path $Recomp 'local\venv\Scripts\python.exe'
$Here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Hosting = Join-Path (Split-Path -Parent $Here) 'hosting'
$Exe    = Join-Path $env:FNV_GAME 'FalloutNV.exe'
if (-not (Test-Path $Exe)) { throw "FalloutNV.exe nicht gefunden (FNV_GAME=$env:FNV_GAME). Erst setup.ps1 ausführen." }
$env:PYTHON = $Py

function Run($what, [string[]]$cmd) {
    Write-Host "`n=== $what" -ForegroundColor Cyan
    $sw = [Diagnostics.Stopwatch]::StartNew()
    & $cmd[0] $cmd[1..($cmd.Length - 1)]
    if ($LASTEXITCODE -ne 0) { throw "$what fehlgeschlagen (Exit $LASTEXITCODE)" }
    Write-Host ("    fertig in {0:n0} s" -f $sw.Elapsed.TotalSeconds)
}

Push-Location $Recomp
try {
    Run 'Programm in C++ übersetzen (recomp.py)'       @($Py, '-B', 'tools/recomp.py', '--exe', $Exe, '--shards', '64')
    Run 'Import-Tabelle'                               @($Py, '-B', 'tools/gen_import_table.py', '--exe', $Exe)
    Run 'COM-Tabellen'                                 @($Py, '-B', 'tools/gen_com_tables.py')
    if (-not (Test-Path 'out/recomp/d3d9_caps.inc')) {
        Run 'Direct3D-9-Fähigkeiten (d3d9_caps_dump)'  @('C:\Program Files\LLVM\bin\clang-cl.exe', '--target=i686-pc-windows-msvc', '/O1',
                                                          'tools/d3d9_caps_dump.cpp', 'd3d9.lib', '/Fe:out/d3d9_caps_dump.exe')
        & .\out\d3d9_caps_dump.exe | Set-Content -Encoding ascii out/recomp/d3d9_caps.inc
    }
    if (-not $SkipShaders) {
        $sdp = Get-ChildItem (Join-Path $env:FNV_GAME 'Data\Shaders') -Filter *.sdp | ForEach-Object FullName
        Run 'Shader übersetzen (vkd3d + tint)'         (@($Py, '-B', 'tools/shader_spike.py') + $sdp)
        Run 'Shader-Manifest'                          @($Py, '-B', 'tools/shader_manifest.py')
    }
    Run 'WebAssembly bauen (Emscripten, -O2)'          @($Py, '-B', 'tools/recomp_build_web.py', '--target', 'browser')
    Run 'iPad-Archive (kleinere Texturen/Sounds)'      @($Py, '-B', 'tools/mobile_archives.py', '--game', $env:FNV_GAME)
    Run 'Paket schnüren (recomp_bundle.py)'            @($Py, '-B', 'tools/recomp_bundle.py')
} finally { Pop-Location }

Write-Host "`n=== Upload-Ordner zusammenstellen" -ForegroundColor Cyan
$Up = Join-Path $Root 'upload'
if (Test-Path $Up) { Remove-Item -Recurse -Force $Up }
New-Item -ItemType Directory -Force "$Up\www" | Out-Null
Copy-Item -Recurse (Join-Path $Recomp 'out\dist\*') "$Up\www"
Copy-Item (Join-Path $Hosting 'fs.php') "$Up\www\fs.php"
Copy-Item (Join-Path $Hosting 'htaccess.txt') "$Up\www\.htaccess"
Copy-Item (Join-Path $Hosting 'fs-config.example.php') "$Up\www\fs-config.example.php"
Copy-Item -Recurse (Join-Path $Recomp 'out\mobile') "$Up\fnv-mobile"
$size = (Get-ChildItem -Recurse $Up | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Fertig: {0} ({1:n0} MB). Weiter mit Schritt 5 der Anleitung." -f $Up, $size) -ForegroundColor Green
