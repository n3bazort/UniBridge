@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  Requiere que el periodo 2024-1 este ACTIVO en Configuracion.
echo  Borra lo sembrado antes y crea 124 practicas listas para certificar.
echo.
node "benchmarks\sembrar-periodo-2024-1.cjs" 124
echo.
pause
