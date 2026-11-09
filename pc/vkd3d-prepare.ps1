# FO-NV-Web - vkd3d-compiler vorbereiten (Teil von setup.ps1).
# Lädt vkd3d 1.19 (WineHQ) und die Khronos-Header, legt build\ mit den Stubs aus pc\vkd3d\ an
# und baut vkd3d-compiler.exe per tools\build_vkd3d.py (zig cc). Idempotent.
$ErrorActionPreference = 'Stop'
$Root    = 'C:\FNV-Web'
$Recomp  = Join-Path $Root 'fnv-web-recomp'
$Base    = Join-Path $Recomp 'local\dl\vkd3d'
$Py      = Join-Path $Recomp 'local\venv\Scripts\python.exe'
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tar     = Join-Path $Base 'vkd3d-1.19.tar.xz'
$Spirv   = Join-Path $Base 'spirvh'
$Build   = Join-Path $Base 'build'
New-Item -ItemType Directory -Force $Base, $Build | Out-Null

if (-not (Test-Path $Tar)) { Invoke-WebRequest 'https://dl.winehq.org/vkd3d/source/vkd3d-1.19.tar.xz' -OutFile $Tar }
if (-not (Test-Path (Join-Path $Spirv 'spirv\unified1\spirv.h'))) {
    $tmp = Join-Path $Base 'spirvh_src'
    if (-not (Test-Path $tmp)) { git clone --depth 1 https://github.com/KhronosGroup/SPIRV-Headers $tmp }
    New-Item -ItemType Directory -Force $Spirv | Out-Null
    Copy-Item -Recurse -Force (Join-Path $tmp 'include\spirv') $Spirv
}
$vh = Join-Path $Base 'vh_src'
if (-not (Test-Path $vh)) { git clone --depth 1 https://github.com/KhronosGroup/Vulkan-Headers $vh }
Copy-Item -Recurse -Force (Join-Path $vh 'include\vulkan') $Spirv
Copy-Item -Recurse -Force (Join-Path $vh 'include\vk_video') $Spirv
New-Item -ItemType Directory -Force (Join-Path $Spirv 'vulkan') | Out-Null
Copy-Item -Force (Join-Path $Spirv 'spirv\unified1\spirv.h') (Join-Path $Spirv 'vulkan\spirv.h')
Copy-Item -Force (Join-Path $Spirv 'spirv\unified1\GLSL.std.450.h') (Join-Path $Spirv 'vulkan\GLSL.std.450.h')

# Stubs und generierte Header aus dem Repo (pc\vkd3d) nach build\ kopieren
Copy-Item -Force (Join-Path $Here 'vkd3d\*') $Build

& $Py -B (Join-Path $Recomp 'tools\build_vkd3d.py') --reset
if ($LASTEXITCODE -ne 0) { throw "build_vkd3d.py fehlgeschlagen (Exit $LASTEXITCODE)" }
if (-not (Test-Path (Join-Path $Build 'vkd3d-compiler.exe'))) { throw 'vkd3d-compiler.exe fehlt nach dem Build' }
Write-Host 'vkd3d-compiler.exe OK' -ForegroundColor Green
