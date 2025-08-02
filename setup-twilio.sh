#!/bin/bash

# =============================================================================
# SCRIPT DE CONFIGURACIÓN RÁPIDA TWILIO
# =============================================================================
# Este script te ayuda a configurar los webhooks de Twilio paso a paso

echo "🚀 CONFIGURACIÓN TWILIO - CRM GO ADMIN ERP"
echo "=========================================="
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
  echo "❌ Error: Ejecuta este script desde la raíz del proyecto"
  exit 1
fi

echo "📋 PASO 1: Verificar archivo .env.local"
if [ ! -f ".env.local" ]; then
  echo "⚠️  No se encontró .env.local"
  echo "📝 Copiando desde .env.example..."
  cp .env.example .env.local
  echo "✅ Archivo .env.local creado"
  echo "🔧 ACCIÓN REQUERIDA: Edita .env.local con tus credenciales de Twilio"
  echo ""
else
  echo "✅ Archivo .env.local existe"
fi

echo "📋 PASO 2: Verificar dependencias"
if command -v ngrok &> /dev/null; then
  echo "✅ ngrok está instalado"
else
  echo "⚠️  ngrok no está instalado"
  echo "📦 Instalando ngrok globalmente..."
  npm install -g ngrok
fi

echo ""
echo "📋 PASO 3: Iniciar aplicación"
echo "🔄 Ejecutando npm run dev..."
echo "📝 NOTA: Deja este proceso corriendo y abre otra terminal"
echo ""

# Función para manejar Ctrl+C
cleanup() {
  echo ""
  echo "🛑 Proceso interrumpido"
  echo ""
  echo "📋 PRÓXIMOS PASOS MANUALES:"
  echo "1. Completa .env.local con tus credenciales de Twilio"
  echo "2. Ejecuta: npm run dev"
  echo "3. En otra terminal: ngrok http 3000"
  echo "4. Configura webhooks en Twilio Console"
  echo "5. Prueba con comandos curl de docs/VOIP_SETUP.md"
  echo ""
  exit 0
}

trap cleanup SIGINT

# Iniciar aplicación
npm run dev
