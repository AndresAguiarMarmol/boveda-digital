@echo off
title Boveda Digital - Wallet Segura
color 0B
echo ================================================================
echo   BOVEDA DIGITAL - Wallet de Documentos Cifrada Zero-Knowledge
echo ================================================================
echo.
echo [1/2] Iniciando Servidor Local y API REST Segura...
start "" /b node server.js > nul 2>&1

timeout /t 1 /nobreak > nul

echo [2/2] Abriendo aplicacion en el navegador con un solo toque...
start http://localhost:3000

echo.
echo Boveda Digital esta activa en: http://localhost:3000
echo Puedes cerrar esta ventana en cualquier momento.
exit
