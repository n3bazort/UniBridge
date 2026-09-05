@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  Comprobando las actas contra el lector del sistema...
echo.
node "demo\02-actas\verificar-actas.cjs"
echo.
pause
