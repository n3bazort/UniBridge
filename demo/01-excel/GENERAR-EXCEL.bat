@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  Generando los libros de Excel de la demostracion...
echo.
node "demo\01-excel\generar-excel.cjs"
echo.
pause
