@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  Requiere la API levantada en http://localhost:3001
echo.
node "benchmarks\prueba-rendimiento.cjs" 124
echo.
pause
