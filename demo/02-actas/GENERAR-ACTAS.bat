@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  Generando las actas de calificaciones...
echo.
node "demo\02-actas\generar-actas.cjs"
echo.
pause
