@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title GO Admin - Instalador del Agente de Impresion

:: ══════════════════════════════════════════════════════════════
::  CONFIGURACION FIJA (editar solo si cambia el proyecto)
:: ══════════════════════════════════════════════════════════════
set "SUPABASE_URL=https://jgmgphmzusbluqhuqihj.supabase.co"
set "SUPABASE_ANON_KEY=PEGAR_AQUI_LA_ANON_KEY_ANTES_DE_DISTRIBUIR"

echo.
echo  ═══════════════════════════════════════════════
echo    GO Admin ERP - Agente de Impresion
echo    Instalador para Windows
echo  ═══════════════════════════════════════════════
echo.

:: ── 1. Verificar Node.js ──
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [X] Node.js no esta instalado.
    echo.
    echo  Por favor descarga e instala Node.js desde:
    echo    https://nodejs.org  ^(version LTS^)
    echo.
    echo  Despues de instalarlo, vuelve a ejecutar este instalador.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo  [OK] Node.js detectado: %NODE_VERSION%
echo.

:: ── 2. Pedir credenciales ──
echo  Ingresa las credenciales de tu cuenta GO Admin
echo  (las mismas con las que entras a app.goadmin.io)
echo.
set /p AGENT_EMAIL="  Email: "
set /p AGENT_PASSWORD="  Contrasena: "

if "%AGENT_EMAIL%"=="" (
    echo  [X] El email es obligatorio.
    pause
    exit /b 1
)
if "%AGENT_PASSWORD%"=="" (
    echo  [X] La contrasena es obligatoria.
    pause
    exit /b 1
)

:: ── 3. Nombre del agente (opcional) ──
echo.
set /p AGENT_NAME="  Nombre de este equipo (Enter = 'Agente Principal'): "
if "%AGENT_NAME%"=="" set "AGENT_NAME=Agente Principal"

:: ── 4. Crear archivo .env ──
echo.
echo  Creando configuracion...
(
    echo SUPABASE_URL=%SUPABASE_URL%
    echo SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%
    echo AGENT_EMAIL=%AGENT_EMAIL%
    echo AGENT_PASSWORD=%AGENT_PASSWORD%
    echo AGENT_NAME=%AGENT_NAME%
    echo POLL_INTERVAL_MS=5000
    echo HEARTBEAT_INTERVAL_MS=20000
    echo DISCOVERY_PORT=3456
) > "%~dp0.env"
echo  [OK] Configuracion guardada.

:: ── 5. Instalar dependencias ──
echo.
echo  Instalando componentes (esto puede tardar unos minutos)...
cd /d "%~dp0"
call npm install --omit=dev >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Reintentando instalacion con salida visible...
    call npm install
    if !errorlevel! neq 0 (
        echo  [X] Error instalando dependencias. Revisa tu conexion a internet.
        pause
        exit /b 1
    )
)
echo  [OK] Componentes instalados.

:: ── 6. Configurar auto-arranque con Windows ──
echo.
set /p AUTOSTART="  Quieres que el agente arranque solo con Windows? (S/N): "
if /i "%AUTOSTART%"=="S" (
    powershell -NoProfile -Command ^
      "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath('Startup') + '\GO Admin Print Agent.lnk'); $sc.TargetPath = '%~dp0iniciar.bat'; $sc.WorkingDirectory = '%~dp0'; $sc.WindowStyle = 7; $sc.Save()"
    echo  [OK] El agente arrancara automaticamente con Windows.
)

:: ── 7. Finalizar ──
echo.
echo  ═══════════════════════════════════════════════
echo    Instalacion completada
echo  ═══════════════════════════════════════════════
echo.
echo  Para iniciar el agente ahora, presiona cualquier tecla.
echo  (Tambien puedes usar el archivo "iniciar.bat" en cualquier momento)
echo.
pause >nul

call "%~dp0iniciar.bat"
