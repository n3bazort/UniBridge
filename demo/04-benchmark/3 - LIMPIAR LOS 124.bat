@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  Borra los 124 sinteticos (cedulas 9024xxxxxx) y sus archivos.
echo  No toca ningun otro dato.
echo.
node "benchmarks\limpiar-periodo-2024-1.cjs"
echo.
pause
