@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
set "PERIODO=2025-2"
echo.
echo  ================================================================
echo   Se van a BORRAR las practicas de la demostracion (cedulas
echo   13159000xx) del periodo %PERIODO%, con sus documentos,
echo   sus archivos y los estudiantes que queden sin practicas.
echo.
echo   Tus registros de prueba propios NO se tocan.
echo  ================================================================
echo.
echo  Primero, esto es lo que se iria:
echo.
node "demo\05-limpieza\limpiar-periodo.cjs" %PERIODO% --solo-demo --incluir-estudiantes
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
node "demo\05-limpieza\limpiar-periodo.cjs" %PERIODO% --confirmar --solo-demo --incluir-estudiantes
echo.
pause
