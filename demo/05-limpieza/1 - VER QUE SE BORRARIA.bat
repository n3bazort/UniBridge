@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
set "PERIODO=2025-2"
echo.
echo  SIMULACRO del periodo %PERIODO% — no se toca nada.
echo.
node "demo\05-limpieza\limpiar-periodo.cjs" %PERIODO%
echo.
pause
