@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
set "PERIODO=2025-2"
echo.
echo  ================================================================
echo   ATENCION
echo.
echo   Esto borra TODAS las practicas del periodo %PERIODO%, sus
echo   documentos, y los estudiantes que queden sin ninguna practica
echo   en ningun periodo. Incluye lo que hayas cargado a mano o por Excel.
echo.
echo   No se puede deshacer.
echo  ================================================================
echo.
echo  Esto es lo que se iria:
echo.
node "demo\05-limpieza\limpiar-periodo.cjs" %PERIODO% --incluir-estudiantes
echo.
set "OK="
set /p "OK=Escribe BORRAR TODO y pulsa Enter para confirmar (o cierra la ventana): "
if /i not "%OK%"=="BORRAR TODO" (
  echo.
  echo  Cancelado. No se ha modificado nada.
  echo.
  pause
  exit /b 0
)
echo.
node "demo\05-limpieza\limpiar-periodo.cjs" %PERIODO% --confirmar --incluir-estudiantes
echo.
pause
