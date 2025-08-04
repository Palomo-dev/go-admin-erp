# 📞 Configuración Completa de Twilio (VOIP, WhatsApp, Email, SMS)

Este documento detalla cómo configurar Twilio como proveedor único para todos los canales de comunicación: llamadas, WhatsApp, email y SMS.

## ✅ Estado Actual

**FASE 1 COMPLETADA** - Código base implementado:
- ✅ Tipos y interfaces actualizadas
- ✅ Servicio de llamadas (VoipCallService)
- ✅ Servicio de email (EmailService) 
- ✅ Servicio de WhatsApp (WhatsAppService)
- ✅ Webhook endpoints implementados:
  - `/api/webhooks/voip/twilio` (VOIP)
  - `/api/webhooks/email/sendgrid` (Email)
  - `/api/webhooks/whatsapp/twilio` (WhatsApp)
- ✅ Sistema de tiempo real con Supabase Realtime
- ✅ Componente UI para notificaciones
- ✅ Integración con hook de actividades existente

**CONFIGURACIÓN REQUERIDA**:
- 🔄 Configurar cuenta Twilio única
- 🔄 Configurar webhooks para todos los servicios
- 🔄 Configurar variables de entorno
- 🔄 Probar integración completa

## 🚀 Configuración Paso a Paso - Twilio Completo

### 1. **Crear cuenta Twilio y activar servicios**
- Ir a [https://console.twilio.com](https://console.twilio.com)
- Crear cuenta o iniciar sesión
- Verificar número de teléfono
- **Activar servicios necesarios**:
  - 📞 **Voice** (VOIP) - Incluido por defecto
  - 📱 **Messaging** (SMS) - Incluido por defecto  
  - 💬 **WhatsApp** - Ir a Messaging > Try WhatsApp
  - 📧 **SendGrid Email** - Ir a SendGrid > Get Started

### 2. **Obtener credenciales base**
En el dashboard principal de Twilio:
- **Account SID**: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Auth Token**: Click en "Show" para revelarlo
- **Número de teléfono**: Comprar en Phone Numbers > Manage > Buy a number

### 3. **Configurar WhatsApp**
- Ir a **Messaging** > **Try WhatsApp**
- Seguir proceso de sandbox o aprobación
- Obtener **WhatsApp Sender**: `whatsapp:+1234567890`

### 4. **Configurar SendGrid (Email)**
- Ir a **SendGrid** en el menú lateral
- Activar integración SendGrid
- Crear **API Key** en SendGrid
- Verificar dominio sender

### 5. **Configurar variables de entorno**
Copiar `.env.example` a `.env.local` y agregar todas las variables de Twilio:

```env
# =============================================================================
# TWILIO CONFIGURATION (Proveedor único para todos los canales)
# =============================================================================

# Credenciales base de Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# VOIP (Llamadas)
TWILIO_PHONE_NUMBER=+1234567890

# WhatsApp
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890

# SendGrid Email (integrado con Twilio)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_WEBHOOK_KEY=your_sendgrid_webhook_key

# SMS (usa las mismas credenciales de VOIP)
# No requiere configuración adicional
```

### 6. **Configurar webhooks en Twilio (TODOS LOS SERVICIOS)**

#### 🔧 **Preparar entorno de desarrollo**
1. **Instalar ngrok**: `npm install -g ngrok`
2. **Ejecutar aplicación**: `npm run dev`
3. **Abrir túnel**: `ngrok http 3000`
4. **Copiar URL**: `https://abc123.ngrok.io`

#### 📞 **VOIP (Llamadas) - Configurar en Twilio**
1. Ir a **Phone Numbers** > **Manage** > **Active numbers**
2. Seleccionar tu número
3. En sección **Voice**:
   - **Webhook URL**: `https://abc123.ngrok.io/api/webhooks/voip/twilio`
   - **HTTP Method**: `POST`
   - **Primary Handler**: Fallback

#### 💬 **WhatsApp - Configurar en Twilio**
1. Ir a **Messaging** > **Try WhatsApp** > **Sandbox**
2. En sección **Sandbox Configuration**:
   - **Webhook URL**: `https://abc123.ngrok.io/api/webhooks/whatsapp/twilio`
   - **HTTP Method**: `POST`
   - Marcar: ✅ **Message Status Updates**

#### 📧 **Email (Twilio Email API) - Configurar en Twilio**
1. Ir a **Console Twilio** > **Email** > **Manage**
2. **Settings** > **Event Webhooks**
3. Configurar:
   - **HTTP POST URL**: `https://abc123.ngrok.io/api/webhooks/email/twilio`
   - **Eventos**: ✅ `delivered`, `bounced`, `dropped`, `spam_report`, `opened`, `clicked`
   - ✅ **Enable Webhook Signature Validation**

#### 📱 **SMS - Configurar en Twilio**
1. Ir a **Phone Numbers** > **Manage** > **Active numbers**
2. Seleccionar tu número
3. En sección **Messaging**:
   - **Webhook URL**: `https://abc123.ngrok.io/api/webhooks/sms/twilio`
   - **HTTP Method**: `POST`

#### 🌐 **Para producción (cambiar URLs)**:
- VOIP: `https://tu-dominio.com/api/webhooks/voip/twilio`
- WhatsApp: `https://tu-dominio.com/api/webhooks/whatsapp/twilio`
- Email: `https://tu-dominio.com/api/webhooks/email/twilio`
- SMS: `https://tu-dominio.com/api/webhooks/sms/twilio`

### 7. **Probar la integración completa**

#### 📞 **Verificar endpoints activos**
```bash
# VOIP
curl -X GET https://tu-url/api/webhooks/voip/twilio

# WhatsApp
curl -X GET https://tu-url/api/webhooks/whatsapp/twilio

# Email
curl -X GET https://tu-url/api/webhooks/email/twilio

# SMS
curl -X GET https://tu-url/api/webhooks/sms/twilio
```

#### 📞 **Simular evento de VOIP**
```bash
curl -X POST https://tu-url/api/webhooks/voip/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&CallStatus=initiated&From=%2B1234567890&To=%2B0987654321&Direction=inbound"
```

#### 💬 **Simular evento de WhatsApp**
```bash
curl -X POST https://tu-url/api/webhooks/whatsapp/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&From=whatsapp:%2B1234567890&To=whatsapp:%2B0987654321&Body=Mensaje%20de%20prueba"
```

#### 📧 **Simular evento de Email (Twilio Email API)**
```bash
curl -X POST https://tu-url/api/webhooks/email/twilio \
  -H "Content-Type: application/json" \
  -d '{"message_id":"test-message-id","event_type":"delivered","to_email":"test@example.com","from_email":"noreply@tu-dominio.com","subject":"Email de prueba","timestamp":1672531200}'
```

#### 📱 **Simular evento de SMS**
```bash
curl -X POST https://tu-url/api/webhooks/sms/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&From=%2B1234567890&To=%2B0987654321&Body=SMS%20de%20prueba"
```

## 🔧 Funcionalidades Disponibles

### 📞 **VOIP - Eventos de Llamadas**
- ✅ Inicio de llamada (`initiated`)
- ✅ Llamada sonando (`ringing`) 
- ✅ Llamada contestada (`answered`)
- ✅ Llamada completada (`completed`)
- ✅ Llamada no contestada (`no-answer`)
- ✅ Llamada ocupada (`busy`)
- ✅ Error en llamada (`failed`)

### 💬 **WhatsApp - Eventos de Mensajes**
- ✅ Mensaje enviado (`sent`)
- ✅ Mensaje entregado (`delivered`)
- ✅ Mensaje leído (`read`)
- ✅ Mensaje recibido (`received`)
- ✅ Error en mensaje (`failed`)
- ✅ Mensajes multimedia (imágenes, videos, documentos)

### 📧 **Email - Eventos de Twilio Email API**
- ✅ Email procesado (`processed`)
- ✅ Email entregado (`delivered`)
- ✅ Email rebotado (`bounced`)
- ✅ Email descartado (`dropped`)
- ✅ Reporte de spam (`spam_report`)
- ✅ Desuscripción (`unsubscribe`)
- ✅ Email abierto (`opened`)
- ✅ Link clickeado (`clicked`)

### 📱 **SMS - Eventos de Mensajes**
- ✅ SMS enviado (`sent`)
- ✅ SMS entregado (`delivered`)
- ✅ SMS no entregado (`undelivered`)
- ✅ SMS recibido (`received`)
- ✅ Error en SMS (`failed`)
- ✅ SMS multimedia (MMS)

### **Datos Almacenados (Todos los Canales)**
- ID único del mensaje/llamada
- Número/email origen y destino
- Dirección (entrante/saliente)
- Contenido del mensaje
- Estado y timestamps
- Metadatos específicos del proveedor
- Archivos adjuntos (si aplica)

### **UI en Tiempo Real**
- ✅ Indicador de conexión en vivo
- ✅ Notificaciones push en navegador
- ✅ Toast notifications para nuevas comunicaciones
- ✅ Actualización automática de actividades
- ✅ Filtros por tipo de canal (VOIP, WhatsApp, Email, SMS)

## ⚙️ Configuración Avanzada

### **Personalizar mapeo de organizaciones**
En cada servicio, personaliza las funciones de mapeo:

```typescript
// Para VOIP/SMS
async function getOrganizationFromNumber(number: string): Promise<number> {
  const numberToOrg = {
    '+1234567890': 1, // Organización principal
    '+0987654321': 2  // Sucursal
  }
  return numberToOrg[number] || 1
}

// Para Email
async function getOrganizationFromEmail(email: string): Promise<number> {
  const domain = email.split('@')[1]
  const domainToOrg = {
    'empresa.com': 1,
    'sucursal.com': 2
  }
  return domainToOrg[domain] || 1
}
```

### **Filtros de seguridad**
Todos los webhooks validan automáticamente:
- ✅ **Twilio**: Signature HMAC-SHA1
- ✅ **SendGrid**: Signature HMAC-SHA256
- ✅ **WhatsApp Business**: Signature Meta
- ✅ Eventos solo de organizaciones autorizadas
- ✅ Rate limiting (configurar en producción)

## 🐛 Troubleshooting

### **Webhook no recibe eventos**
1. **Verificar URLs**:
   - VOIP: `/api/webhooks/voip/twilio`
   - WhatsApp: `/api/webhooks/whatsapp/twilio`
   - Email: `/api/webhooks/email/sendgrid`
   - SMS: `/api/webhooks/sms/twilio`
2. **Comprobar ngrok** (desarrollo): `ngrok http 3000`
3. **Verificar variables de entorno** estén configuradas
4. **Revisar logs** del servidor en tiempo real

### **Error de signature inválida**
1. **Twilio**: Verificar `TWILIO_AUTH_TOKEN`
2. **SendGrid**: Verificar `SENDGRID_WEBHOOK_KEY`
3. **WhatsApp Business**: Verificar `WHATSAPP_APP_SECRET`
4. **Comprobar URLs** coincidan exactamente en proveedor
5. **Revisar headers** de la petición

### **Actividades no aparecen en UI**
1. **Verificar conexión Supabase** Realtime
2. **Comprobar permisos** de notificación en navegador
3. **Revisar filtros** por organización y tipo
4. **Verificar mapeo** de usuarios y organizaciones
5. **Comprobar RLS** (Row Level Security) en Supabase

### **Logs de Debug**
Para habilitar logs detallados:
```bash
# En desarrollo
DEBUG=webhook:* npm run dev

# Logs específicos
console.log('Variables:', {
  twilio: !!process.env.TWILIO_AUTH_TOKEN,
  sendgrid: !!process.env.SENDGRID_API_KEY,
  supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY
})
```

## 🚀 Próximos Pasos

### **¡LISTO PARA CONFIGURAR!**
1. ✅ **Código implementado** - Todos los servicios y webhooks
2. ✅ **Documentación completa** - Guía paso a paso
3. 🔄 **Configurar Twilio** - Seguir pasos 1-6 arriba
4. 🔄 **Configurar variables** - Ver sección 5
5. 🔄 **Probar webhooks** - Ver sección 7

### **Orden recomendado de configuración**:
1. **Primero**: VOIP (más simple)
2. **Segundo**: SMS (mismas credenciales)
3. **Tercero**: WhatsApp (requiere aprobación)
4. **Cuarto**: Email SendGrid (más complejo)

## 📚 Referencias

- [Twilio Voice Webhooks](https://www.twilio.com/docs/voice/webhooks)
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp)
- [Twilio SMS Webhooks](https://www.twilio.com/docs/messaging/webhooks)
- [SendGrid Event Webhook](https://docs.sendgrid.com/for-developers/tracking-events/event)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

---

## 🎉 **¡Todo Listo!**

**Tu sistema CRM ahora soporta**:
- 📞 **Llamadas VOIP** via Twilio
- 💬 **WhatsApp** via Twilio
- 📧 **Email** via SendGrid
- 📱 **SMS** via Twilio

**¿Necesitas ayuda?** Revisa los logs y sigue esta documentación paso a paso.
