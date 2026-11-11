# FO-NV-Web – Browser-Version aus deiner eigenen FalloutNV.exe bauen und ein Upload-Paket schnüren.
# Voraussetzung: setup.ps1 ist durchgelaufen und alle Punkte stehen auf OK.
#
#   .\build.ps1                 kompletter Build (beim ersten Mal ca. 10–20 Minuten)
#   .\build.ps1 -SkipShaders    Shader nicht neu übersetzen
#   .\build.ps1 -AppOnly       nur App und Server-Dateien neu zusammenstellen (kein Spiel-Build)
#
# iPad-Variante (game-ipad.html + build-ipad/): weniger vorab gestartete Threads und weniger fester Speicher, damit
# Safari den Tab nicht schließt. Einstellbar: $env:FNV_IPAD_POOL (Standard 24; das Spiel nutzt ~17 Threads),
# $env:FNV_IPAD_MEMORY in MiB (Standard 3072, erlaubt 2048–3072). Gemessen: 2048 -> "OOM" schon beim Laden; 2560 ->
# "OOM" nach gut zwei Minuten im Kampf (Protokoll vom iPad). Die Größe ist nur die Obergrenze; belegt wird, was das
# Spiel wirklich benutzt, und Safari am iPad gibt 3072 her.
#
# Eigene Korrekturen an der Engine liegen als pc\patches\*.patch bei und werden vor dem Bau eingespielt.
#
# Ergebnis:  C:\FNV-Web\upload\  (www, fnv-mobile, fnv-private) -> mit .\deploy.ps1 hochladen

param([switch]$SkipShaders, [switch]$AppOnly)
$ErrorActionPreference = 'Stop'
$Root   = 'C:\FNV-Web'
$Recomp = Join-Path $Root 'fnv-web-recomp'
$Py     = Join-Path $Recomp 'local\venv\Scripts\python.exe'
$Here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Hosting = Join-Path (Split-Path -Parent $Here) 'hosting'
$Exe    = if ($env:FNV_GAME) { Join-Path $env:FNV_GAME 'FalloutNV.exe' } else { '' }
if (-not $AppOnly -and -not (Test-Path $Exe)) { throw "FalloutNV.exe nicht gefunden (FNV_GAME=$env:FNV_GAME). Erst setup.ps1 ausführen." }
$env:PYTHON = $Py

function Run($what, [string[]]$cmd) {
    Write-Host "`n=== $what" -ForegroundColor Cyan
    $sw = [Diagnostics.Stopwatch]::StartNew()
    & $cmd[0] $cmd[1..($cmd.Length - 1)]
    if ($LASTEXITCODE -ne 0) { throw "$what fehlgeschlagen (Exit $LASTEXITCODE)" }
    Write-Host ("    fertig in {0:n0} s" -f $sw.Elapsed.TotalSeconds)
}

if (-not $AppOnly) {
  Push-Location $Recomp
  try {
      # eigene Korrekturen an der Engine einspielen (schon eingespielte erkennt die Gegenprobe)
      foreach ($p in Get-ChildItem (Join-Path $Here 'patches') -Filter *.patch -ErrorAction SilentlyContinue | Sort-Object Name) {
          # über cmd, damit die Meldungen von git (stderr) unter Windows PowerShell 5.1 keinen Abbruch auslösen
          cmd /c "git apply --check `"$($p.FullName)`" >nul 2>&1"
          if ($LASTEXITCODE -eq 0) { cmd /c "git apply `"$($p.FullName)`""; Write-Host "Patch eingespielt: $($p.Name)" }
          else {
              cmd /c "git apply --reverse --check `"$($p.FullName)`" >nul 2>&1"
              if ($LASTEXITCODE -ne 0) { throw "Patch passt nicht mehr zur Engine: $($p.Name)" }
          }
      }
      Run 'Programm in C++ übersetzen (recomp.py)'      @($Py, '-B', 'tools/recomp.py', '--exe', $Exe, '--shards', '64')
      Run 'Import-Tabelle'                               @($Py, '-B', 'tools/gen_import_table.py', '--exe', $Exe)
      Run 'COM-Tabellen'                                 @($Py, '-B', 'tools/gen_com_tables.py')
      if (-not (Test-Path 'out/recomp/d3d9_caps.inc')) {
          Run 'Direct3D-9-Fähigkeiten (d3d9_caps_dump)'  @('C:\Program Files\LLVM\bin\clang-cl.exe', '--target=i686-pc-windows-msvc', '/O1',
                                                            'tools/d3d9_caps_dump.cpp', 'd3d9.lib', '/Fe:out/d3d9_caps_dump.exe')
          # erst in eine Zwischendatei: ein abgebrochener Lauf darf keine halbe d3d9_caps.inc hinterlassen (sie würde
          # bei jedem späteren Build wiederverwendet)
          $caps = & .\out\d3d9_caps_dump.exe
          if ($LASTEXITCODE -ne 0 -or -not $caps) { throw 'd3d9_caps_dump fehlgeschlagen' }
          $caps | Set-Content -Encoding ascii out/recomp/d3d9_caps.inc
      }
      if (-not $SkipShaders) {
          $sdp = Get-ChildItem (Join-Path $env:FNV_GAME 'Data\Shaders') -Filter *.sdp | ForEach-Object FullName
          Run 'Shader übersetzen (vkd3d + tint)'         (@($Py, '-B', 'tools/shader_spike.py') + $sdp)
          Run 'Shader-Manifest'                          @($Py, '-B', 'tools/shader_manifest.py')
      }
      Run 'WebAssembly bauen (Emscripten, -O2)'          @($Py, '-B', 'tools/recomp_build_web.py', '--target', 'browser')
      $pool = if ($env:FNV_IPAD_POOL) { $env:FNV_IPAD_POOL } else { '24' }
      $mem  = if ($env:FNV_IPAD_MEMORY) { $env:FNV_IPAD_MEMORY } else { '3072' }
      Run "WebAssembly iPad-Variante ($pool Threads, $mem MiB)" @($Py, '-B', 'tools/recomp_build_web.py', '--target', 'browser',
          '--pthread-pool-size', $pool, '--memory-mib', $mem, '--browser-out', 'out/recomp/web_browser_ipad')
      Run 'iPad-Archive (kleinere Texturen/Sounds)'      @($Py, '-B', 'tools/mobile_archives.py', '--game', $env:FNV_GAME)
      Run 'Paket schnüren (recomp_bundle.py)'            @($Py, '-B', 'tools/recomp_bundle.py')
  } finally { Pop-Location }
}

# ---- App bauen und Upload-Ordner zusammenstellen (dieselbe Logik, die die Tests prüfen) ----------------
$Repo = Split-Path -Parent $Here
$cfgFile = Join-Path $Here 'deploy.local.json'
if (-not (Test-Path $cfgFile)) { throw "pc\deploy.local.json fehlt – Vorlage: pc\deploy.example.json" }
$cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json
Push-Location $Repo
try {
    Run 'App bauen (npm)' @('cmd', '/c', 'npm ci && npm run build')
    $Up = Join-Path $Root 'upload'
    if (-not $cfg.serverBase) { throw 'serverBase fehlt in pc\deploy.local.json (absoluter Server-Pfad, siehe deploy.example.json)' }
    $asm = @('node', 'tools/assemble.mjs', '--recomp', (Join-Path $Recomp 'out\dist'), '--out', $Up,
             '--server-base', $cfg.serverBase, '--init-private')
    # Leere Argumente verschluckt Windows PowerShell 5.1 beim Aufruf von node: --web-folder dann ganz weglassen
    if ([string]$cfg.webFolder) { $asm += '--web-folder', [string]$cfg.webFolder }
    if ($cfg.dlcDefault) { $asm += '--dlc' }
    $ipad = Join-Path $Recomp 'out\recomp\web_browser_ipad'
    if (Test-Path (Join-Path $ipad 'fnv_web.wasm')) { $asm += '--ipad-build', $ipad }
    Run 'Upload-Ordner zusammenstellen' $asm
} finally { Pop-Location }
Copy-Item -Recurse (Join-Path $Recomp 'out\mobile') (Join-Path $Up 'fnv-mobile')
$size = (Get-ChildItem -Recurse $Up | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Fertig: {0} ({1:n0} MB). Weiter mit .\deploy.ps1" -f $Up, $size) -ForegroundColor Green
