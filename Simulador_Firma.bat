@echo off
title Simulador de Firma Digital (Pruebas)
color 0A
echo ==============================================
echo       SIMULADOR DE FIRMA DE DOCUMENTOS
echo ==============================================
echo.

:: La carpeta donde está este .bat (por si arrastras el archivo desde otro lado)
set "BASE_DIR=%~dp0"
set "NODE_SCRIPT=%BASE_DIR%simulate-sign.js"

:: Si no se arrastró nada
if "%~1"=="" (
    echo [ERROR] No arrastraste ningun archivo.
    echo.
    echo INSTRUCCIONES:
    echo 1. Selecciona uno o varios PDFs.
    echo 2. Arrastralos y sueltalos sobre este archivo Simulador_Firma.bat
    echo.
    pause
    exit /b
)

:loop
if "%~1"=="" goto end
echo Procesando: %~nx1
node "%NODE_SCRIPT%" "%~1"
shift
goto loop

:end
echo.
echo ==============================================
echo.
echo ¡Proceso terminado! Ya puedes subir los documentos.
pause
