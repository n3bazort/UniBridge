@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  ================================================================
echo   Borra los estudiantes de la DEMOSTRACION (cedulas 13159000xx)
echo   que se quedaron sin ninguna practica en ningun periodo.
echo.
echo   Sirve cuando ya borraste las practicas y al reimportar sale
echo   "ya esta registrado": el estudiante seguia en la base.
echo  ================================================================
echo.
echo  Esto es lo que se iria:
echo.
node "demo\05-limpieza\limpiar-periodo.cjs" --huerfanos --solo-demo
echo.
set "OK="
set /p "OK=Escribe BORRAR y pulsa Enter para confirmar (o cierra la ventana): "
if /i not "%OK%"=="BORRAR" (
  echo.
  echo  Cancelado. No se ha modificado nada.
  echo.
  pause
  exit /b 0
)
echo.
node "demo\05-limpieza\limpiar-periodo.cjs" --huerfanos --confirmar --solo-demo
echo.
pause
