@echo off
echo.
echo ==========================================
echo   Backend + ngrok Launcher
echo ==========================================
echo.
echo Este script iniciara:
echo   1. Backend NestJS en puerto 4000
echo   2. ngrok tunnel para exponer el backend
echo.
echo Presiona Ctrl+C para detener todo
echo.

REM Verificar si ngrok esta instalado
where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ngrok no esta instalado
    echo.
    echo Instala ngrok desde: https://ngrok.com/download
    echo O ejecuta: npm install -g ngrok
    echo.
    pause
    exit /b 1
)

REM Iniciar backend en una ventana separada
start "Backend NestJS" cmd /k "npm run start:dev"

REM Esperar 5 segundos para que el backend inicie
echo Iniciando backend...
timeout /t 5 /nobreak >nul

REM Iniciar ngrok en esta ventana
echo.
echo Iniciando ngrok tunnel...
echo.
echo ==========================================
echo   COPIA LA URL DE NGROK Y ACTUALIZA:
echo   GitHub Secret: NEXT_PUBLIC_BACKEND_URL
echo ==========================================
echo.
ngrok http 4000
