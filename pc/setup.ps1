# FO-NV-Web – Einrichtung des Build-PCs (Windows 10/11, PowerShell als Administrator)
#
#   Set-ExecutionPolicy -Scope Process Bypass; .\setup.ps1
#
# Installiert die Werkzeuge und legt diese Ordner an (nichts davon kommt jemals auf GitHub):
#   C:\FNV-Web\fnv-web-recomp            Browser-Port (github.com/SgtMetz/fnv-web-recomp, MIT)
#   C:\FNV-Web\fnv_decomp-main-updated   Community-Decompilation (github.com/momusdigital/fnv_decomp)
#
# Das Skript ist wiederholbar: Schon Erledigtes wird übersprungen. Am Ende prüft es alles und
# meldet, was noch fehlt. STAND: noch nicht auf einem echten PC getestet – bei Fehlern die
# Ausgabe an Claude schicken.

$ErrorActionPreference = 'Stop'
$Root    = 'C:\FNV-Web'
$Recomp  = Join-Path $Root 'fnv-web-recomp'
$Decomp  = Join-Path $Root 'fnv_decomp-main-updated'
$Emsdk   = Join-Path $Recomp 'local\dl\emsdk'
$Venv    = Join-Path $Recomp 'local\venv'

function Step($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Install-WingetPkg($id) {
    if (-not (winget list --id $id -e 2>$null | Select-String $id)) {
        winget install --id $id -e --accept-source-agreements --accept-package-agreements
    } else { Write-Host "$id ist schon installiert" }
}

Step '1/6 Grundwerkzeuge (winget)'
if (-not (Have winget)) { throw 'winget fehlt: "App-Installer" aus dem Microsoft Store installieren.' }
Install-WingetPkg 'Git.Git'
Install-WingetPkg 'Python.Python.3.12'
Install-WingetPkg 'OpenJS.NodeJS.LTS'
Install-WingetPkg 'LLVM.LLVM'
# Windows SDK (Header/Libs für gen_import_table.py, gen_com_tables.py und d3d9_caps_dump.cpp)
Install-WingetPkg 'Microsoft.WindowsSDK.10.0.22621'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

Step '2/6 Quellcode holen'
New-Item -ItemType Directory -Force $Root | Out-Null
if (-not (Test-Path $Recomp)) { git clone https://github.com/SgtMetz/fnv-web-recomp $Recomp } else { git -C $Recomp pull --ff-only }
if (-not (Test-Path $Decomp)) { git clone https://github.com/momusdigital/fnv_decomp $Decomp } else { git -C $Decomp pull --ff-only }
[Environment]::SetEnvironmentVariable('FNV_DECOMP', $Decomp, 'User'); $env:FNV_DECOMP = $Decomp

Step '3/6 Python-Umgebung (capstone, ziglang)'
if (-not (Test-Path $Venv)) { py -3.12 -m venv $Venv }
& "$Venv\Scripts\python.exe" -m pip install --upgrade pip
& "$Venv\Scripts\python.exe" -m pip install capstone ziglang

Step '4/6 Emscripten 4.0.10'
if (-not (Test-Path $Emsdk)) { git clone https://github.com/emscripten-core/emsdk $Emsdk }
Push-Location $Emsdk
.\emsdk.bat install 4.0.10
.\emsdk.bat activate 4.0.10
Pop-Location

Step '5/6 Steam-Installation finden'
$steamGame = @(
    "${env:ProgramFiles(x86)}\Steam\steamapps\common\Fallout New Vegas",
    "$env:ProgramFiles\Steam\steamapps\common\Fallout New Vegas"
) + (Get-PSDrive -PSProvider FileSystem | ForEach-Object { "$($_.Root)SteamLibrary\steamapps\common\Fallout New Vegas" }) |
    Where-Object { Test-Path (Join-Path $_ 'FalloutNV.exe') } | Select-Object -First 1
if ($steamGame) {
    [Environment]::SetEnvironmentVariable('FNV_GAME', $steamGame, 'User'); $env:FNV_GAME = $steamGame
    Write-Host "Gefunden: $steamGame"
    & "$Venv\Scripts\python.exe" -B (Join-Path $Recomp 'tools\exe_check.py') (Join-Path $steamGame 'FalloutNV.exe') $Decomp
} else {
    Write-Warning 'Fallout New Vegas nicht gefunden. In Steam installieren (und einmal starten), dann Skript erneut ausführen.'
}

Step '5b/6 vkd3d-compiler (Shader-Werkzeug)'
& (Join-Path $PSScriptRoot 'vkd3d-prepare.ps1')

Step '6/6 Prüfung'
$checks = [ordered]@{
    'git'               = Have git
    'node'              = Have node
    'clang-cl (LLVM)'   = Test-Path 'C:\Program Files\LLVM\bin\clang-cl.exe'
    'llvm-nm (LLVM)'    = Test-Path 'C:\Program Files\LLVM\bin\llvm-nm.exe'
    'Windows SDK'       = Test-Path 'C:\Program Files (x86)\Windows Kits\10\Include'
    'emsdk 4.0.10'      = Test-Path (Join-Path $Emsdk 'upstream\emscripten\em++.py')
    'Python venv'       = Test-Path "$Venv\Scripts\python.exe"
    'fnv_decomp'        = Test-Path (Join-Path $Decomp 'build\image_check.json')
    'FalloutNV.exe'     = [bool]$steamGame
    'vkd3d-compiler'    = Test-Path (Join-Path $Recomp 'local\dl\vkd3d\build\vkd3d-compiler.exe')
    'tint (Dawn)'       = [bool](Get-ChildItem (Join-Path $Recomp 'local\dl\dawn') -Recurse -Filter tint.exe -ErrorAction SilentlyContinue)
}
$checks.GetEnumerator() | ForEach-Object {
    $c = if ($_.Value) { 'Green' } else { 'Red' }
    Write-Host ("{0,-18} {1}" -f $_.Key, $(if ($_.Value) { 'OK' } else { 'FEHLT' })) -ForegroundColor $c
}
Write-Host "`nvkd3d und tint (Shader-Übersetzung) richten wir gemeinsam ein – siehe docs/ANLEITUNG.md, Schritt 3."
