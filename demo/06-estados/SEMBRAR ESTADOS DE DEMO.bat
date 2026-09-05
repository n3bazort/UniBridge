@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo.
echo  ================================================================
echo   Reparte a los 20 estudiantes de la demostracion por todos los
echo   estados: sin acta, listos para certificar, certificado emitido,
echo   pendiente del Responsable, pendiente del Decano y firmado.
echo.
echo   Rehace los documentos de la demo desde cero.
echo   No toca a ningun otro estudiante.
echo  ================================================================
echo.
echo  [1/2] Sembrando los estados en la base...
echo.
node "demo\06-estados\sembrar-estados.cjs" --confirmar
if errorlevel 1 goto :fin
echo.
echo  [2/2] Generando los archivos con el motor real...
echo.
node "demo\06-estados\generar-archivos.cjs"
:fin
echo.
pause
