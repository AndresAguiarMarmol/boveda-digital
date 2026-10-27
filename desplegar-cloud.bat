@echo off
title Despliegue en Google Cloud Run - Boveda Digital
color 0B
echo ==============================================================================
echo   BOVEDA DIGITAL - Despliegue en Google Cloud Run (Serverless 24/7)
echo ==============================================================================
echo.
echo Este script empaquetara y desplegara Boveda Digital en Google Cloud Run
echo con HTTPS gratuito, base de datos persistente y sincronizacion multi-dispositivo.
echo.

where gcloud >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  color 0C
  echo [ERROR] No se encontro el comando 'gcloud' en tu sistema.
  echo.
  echo Por favor instala el Google Cloud SDK desde:
  echo https://cloud.google.com/sdk/docs/install
  echo.
  echo Y luego inicia sesion con: gcloud auth login
  pause
  exit /b 1
)

echo [1/3] Verificando autenticacion en Google Cloud...
call gcloud auth list --filter=status:ACTIVE --format="value(account)" > "%TEMP%\gcloud_account.tmp" 2>nul
set /p ACTIVE_ACCOUNT=<"%TEMP%\gcloud_account.tmp"
del "%TEMP%\gcloud_account.tmp" 2>nul

if "%ACTIVE_ACCOUNT%"=="" (
  echo No hay cuenta activa de Google Cloud configurada.
  echo Iniciando inicio de sesion en Google Cloud...
  call gcloud auth login
) else (
  echo Cuenta activa: %ACTIVE_ACCOUNT%
)

echo.
echo [2/3] Obteniendo proyecto de Google Cloud...
for /f "tokens=*" %%i in ('gcloud config get-value project 2^>nul') do set CURRENT_PROJECT=%%i

if "%CURRENT_PROJECT%"=="" (
  echo No hay proyecto seleccionado por defecto.
  call gcloud projects list
  echo.
  set /p CURRENT_PROJECT="Escribe el ID del proyecto de Google Cloud a usar: "
  call gcloud config set project %CURRENT_PROJECT%
) else (
  echo Proyecto actual: %CURRENT_PROJECT%
)

echo.
echo [3/3] Desplegando contenedor en Google Cloud Run (region us-central1)...
echo Esto puede tomar de 2 a 3 minutos la primera vez...
echo.

call gcloud run deploy boveda-digital ^
  --source . ^
  --region us-central1 ^
  --port 8080 ^
  --allow-unauthenticated ^
  --set-env-vars JWT_SECRET="boveda_digital_secret_key_halterofilia_2026"

if %ERRORLEVEL% NEQ 0 (
  color 0C
  echo.
  echo [ERROR] El despliegue no pudo completarse. Revisa los mensajes anteriores.
  pause
  exit /b 1
)

echo.
echo ==============================================================================
echo   DESPLIEGUE COMPLETADO EXITOSAMENTE!
echo ==============================================================================
echo.
echo Para sincronizar tu iPhone y tu PC:
echo 1. Copia la URL entregada arriba (ej: https://boveda-digital-xxxx.run.app)
echo 2. Abre esa URL en tu iPhone con Safari y agregala a la Pantalla de Inicio.
echo 3. O en la app del iPhone, toca el boton 'Nube' y pega esa URL.
echo.
pause
