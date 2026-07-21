@echo off
chcp 65001 >nul
title GO Admin - Agente de Impresion

cd /d "%~dp0"

if not exist ".env" (
    echo  [X] No se encontro la configuracion.
    echo  Ejecuta primero "instalar.bat"
    pause
    exit /b 1
)

echo.
echo  ═══════════════════════════════════════════════
echo    GO Admin - Agente de Impresion
echo    NO CIERRES ESTA VENTANA
echo    (puedes minimizarla)
echo  ═══════════════════════════════════════════════
echo.

:loop
call npx tsx src/index.ts
echo.
echo  [!] El agente se detuvo. Reiniciando en 10 segundos...
echo      (Cierra esta ventana si quieres detenerlo definitivamente)
timeout /t 10 /nobreak >nul
goto loop
