# =============================================================================
# SCRIPT DE CONFIGURACIÓN RÁPIDA TWILIO - WINDOWS
# =============================================================================
# Este script te ayuda a configurar los webhooks de Twilio paso a paso

Write-Host "🚀 CONFIGURACIÓN TWILIO - CRM GO ADMIN ERP" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Ejecuta este script desde la raíz del proyecto" -ForegroundColor Red
    exit 1
}

Write-Host "📋 PASO 1: Verificar archivo .env.local" -ForegroundColor Yellow
if (-not (Test-Path ".env.local")) {
    Write-Host "⚙️  No se encontró .env.local" -ForegroundColor Yellow
    Write-Host "📝 Copiando desde .env.example..." -ForegroundColor Blue
    Copy-Item ".env.example" ".env.local"
    Write-Host "✅ Archivo .env.local creado" -ForegroundColor Green
    Write-Host "🔧 ACCIÓN REQUERIDA: Edita .env.local con tus credenciales de Twilio" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "✅ Archivo .env.local existe" -ForegroundColor Green
}

Write-Host "📋 PASO 2: Verificar dependencias" -ForegroundColor Yellow
$ngrokInstalled = Get-Command ngrok -ErrorAction SilentlyContinue
if ($ngrokInstalled) {
    Write-Host "✅ ngrok está instalado" -ForegroundColor Green
} else {
    Write-Host "⚠️  ngrok no está instalado" -ForegroundColor Yellow
    Write-Host "📦 Instalando ngrok globalmente..." -ForegroundColor Blue
    npm install -g ngrok
}

Write-Host ""
Write-Host "📋 PASO 3: Instrucciones de configuración" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "🔧 PASOS SIGUIENTES:" -ForegroundColor Cyan
Write-Host "1. Edita .env.local con tus credenciales de Twilio" -ForegroundColor White
Write-Host "2. Ejecuta: npm run dev" -ForegroundColor White
Write-Host "3. En otra terminal PowerShell: ngrok http 3000" -ForegroundColor White
Write-Host "4. Copia la URL de ngrok (ej: https://abc123.ngrok.io)" -ForegroundColor White
Write-Host "5. Configura webhooks en Twilio Console:" -ForegroundColor White
Write-Host "   - VOIP: https://abc123.ngrok.io/api/webhooks/voip/twilio" -ForegroundColor Gray
Write-Host "   - SMS: https://abc123.ngrok.io/api/webhooks/sms/twilio" -ForegroundColor Gray
Write-Host "   - WhatsApp: https://abc123.ngrok.io/api/webhooks/whatsapp/twilio" -ForegroundColor Gray
Write-Host "   - Email: https://abc123.ngrok.io/api/webhooks/email/twilio" -ForegroundColor Gray
Write-Host ""
Write-Host "📚 Documentación completa: docs/VOIP_SETUP.md" -ForegroundColor Magenta
Write-Host ""
Write-Host "¿Quieres abrir el archivo .env.local para editarlo? (y/n): " -NoNewline -ForegroundColor Yellow
$response = Read-Host
if ($response -eq "y" -or $response -eq "Y") {
    Start-Process notepad ".env.local"
}

Write-Host ""
Write-Host "🎉 ¡Configuración lista!" -ForegroundColor Green
Write-Host "Sigue los pasos arriba para completar la configuración" -ForegroundColor White
