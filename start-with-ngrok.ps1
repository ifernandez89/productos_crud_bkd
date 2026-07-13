# Backend + ngrok Launcher (PowerShell)

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Backend + ngrok Launcher" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Este script iniciará:" -ForegroundColor Yellow
Write-Host "  1. Backend NestJS en puerto 4000" -ForegroundColor White
Write-Host "  2. ngrok tunnel para exponer el backend" -ForegroundColor White
Write-Host ""
Write-Host "Presiona Ctrl+C para detener todo" -ForegroundColor Red
Write-Host ""

# Verificar si ngrok está instalado
$ngrokExists = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokExists) {
    Write-Host "[ERROR] ngrok no está instalado" -ForegroundColor Red
    Write-Host ""
    Write-Host "Instala ngrok desde: https://ngrok.com/download" -ForegroundColor Yellow
    Write-Host "O ejecuta: npm install -g ngrok" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

# Iniciar backend en una ventana separada
Write-Host "Iniciando backend NestJS..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run start:dev" -WindowStyle Normal

# Esperar 5 segundos para que el backend inicie
Write-Host "Esperando a que el backend inicie..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Iniciar ngrok en esta ventana
Write-Host ""
Write-Host "Iniciando ngrok tunnel..." -ForegroundColor Green
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   COPIA LA URL DE NGROK Y ACTUALIZA:" -ForegroundColor Yellow
Write-Host "   GitHub Secret: NEXT_PUBLIC_BACKEND_URL" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

& ngrok start --config oauth.yml jarbees-secure
