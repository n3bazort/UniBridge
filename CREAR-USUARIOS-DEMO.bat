@echo off
chcp 65001 >nul
cd /d "%~dp0"
title UniBridge - Crear usuarios de demo

echo ============================================================
echo    Crear usuarios de demostracion
echo ============================================================
echo.
echo Esto crea (o reinicia) estos usuarios para poder entrar:
echo    Admin (devoot):                  devoot@dev.com     / @devdev007
echo    Coordinador (Fabricio Z):        fabricio@dev.com   / @devdev007
echo    Decana (Danna Danna):            danna@dev.com      / @devdev007
echo    Responsable (Byron Calderon Z):  byron@dev.com      / @devdev007
echo.
echo AVISO: si ya tenias datos, este paso reinicia los usuarios.
echo Ejecutalo solo la PRIMERA vez (o cuando quieras empezar limpio).
echo.
pause

echo.
echo Preparando cliente de base de datos...
cd packages\db
call npx prisma generate
cd ..\..

echo Creando usuarios...
call npx ts-node --transpile-only apps/api/seed.ts
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudieron crear los usuarios. Asegurate de que
  echo la base de datos este corriendo (ejecuta INICIAR-LOCAL.bat primero).
)
echo.
pause
