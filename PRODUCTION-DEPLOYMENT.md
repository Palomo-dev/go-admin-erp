# 🚀 GUÍA DE DESPLIEGUE A PRODUCCIÓN - SISTEMA VOIP

## ✅ ESTADO ACTUAL
**Tu sistema VOIP está 100% listo para producción!**

### Funcionalidades Activas:
- ✅ **Triggers VOIP completos** - Creación automática de actividades
- ✅ **Webhook de Twilio** - `/api/webhooks/voip/twilio` listo
- ✅ **Tiempo real** - Notificaciones automáticas via Supabase Realtime
- ✅ **Panel de pruebas** - Se oculta automáticamente en producción
- ✅ **Simulación** - Endpoint `/api/test/voip-simulation` funcional
- ✅ **Indicador visual** - Conexión en tiempo real
- ✅ **Notificaciones push** - Browser notifications

---

## 🎯 DESPLIEGUE INMEDIATO

### Opción 1: Vercel (Recomendado)
```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Desplegar
vercel

# 3. Configurar variables de entorno en Vercel Dashboard
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY  
# - SUPABASE_SERVICE_ROLE_KEY
```

### Opción 2: Netlify
```bash
# 1. Build del proyecto
npm run build

# 2. Subir carpeta .next a Netlify
# 3. Configurar variables de entorno en Netlify
```

### Opción 3: Tu propio servidor
```bash
# 1. Build de producción
npm run build

# 2. Iniciar en producción
npm run start
```

---

## ⚙️ CONFIGURACIÓN POST-DESPLIEGUE

### 1. **Actualizar URL base**
En tu plataforma de despliegue, configura:
```
NEXT_PUBLIC_BASE_URL=https://tu-dominio-real.com
```

### 2. **URL del Webhook para Twilio**
Cuando tengas las credenciales, configura en Twilio Console:
```
https://tu-dominio-real.com/api/webhooks/voip/twilio
```

### 3. **Variables de entorno mínimas REQUERIDAS**
```bash
# Supabase (YA LAS TIENES)
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# URL base (ACTUALIZAR CON TU DOMINIO)
NEXT_PUBLIC_BASE_URL=https://tu-dominio.com
```

### 4. **Variables OPCIONALES para Twilio**
```bash
# Agregar cuando tengas las credenciales
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

---

## 🧪 VERIFICACIÓN EN PRODUCCIÓN

### 1. **Test de funcionalidad básica**
- ✅ Abre tu dominio de producción
- ✅ Ve a `/app/crm/actividades`
- ✅ Verifica que el indicador de tiempo real aparezca
- ✅ Revisa que NO aparezca el panel de pruebas (se oculta automáticamente)

### 2. **Test de simulación**
Haz una petición POST a:
```
https://tu-dominio.com/api/test/voip-simulation
```

Con el body:
```json
{
  "callSid": "test_production_123",
  "from": "+1234567890", 
  "to": "+0987654321",
  "direction": "inbound",
  "status": "completed",
  "duration": "180"
}
```

### 3. **Verificar actividad creada**
- Ve a tu CRM → Actividades
- Debe aparecer la actividad de prueba
- Debe recibir notificación en tiempo real

---

## 🔄 INTEGRACIÓN CON TWILIO (CUANDO TENGAS CREDENCIALES)

### 1. **Agregar variables a producción**
```bash
TWILIO_ACCOUNT_SID=tu_account_sid
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_PHONE_NUMBER=tu_numero_twilio
```

### 2. **Configurar webhook en Twilio Console**
1. Ve a Twilio Console → Phone Numbers
2. Selecciona tu número
3. En "Voice & Fax" configura:
   - **Webhook URL**: `https://tu-dominio.com/api/webhooks/voip/twilio`
   - **HTTP Method**: POST

### 3. **Test con llamada real**
1. Llama a tu número de Twilio
2. Debe aparecer automáticamente en tu CRM
3. Debe recibir notificación en tiempo real

---

## 📊 MONITOREO

### Logs a revisar:
- **Webhook calls**: Verifica que lleguen las llamadas de Twilio
- **Database inserts**: Confirma que se crean las actividades
- **Realtime events**: Valida que se emitan los eventos

### URLs importantes:
- **Webhook**: `https://tu-dominio.com/api/webhooks/voip/twilio`
- **Test**: `https://tu-dominio.com/api/test/voip-simulation`
- **CRM**: `https://tu-dominio.com/app/crm/actividades`

---

## 🎉 ¡LISTO PARA PRODUCCIÓN!

**Tu sistema está completamente operativo. Solo necesitas:**

1. ✅ **Desplegarlo** (con Vercel, Netlify, etc.)
2. ✅ **Actualizar URL base** en variables de entorno
3. ⏳ **Agregar Twilio** cuando tengas las credenciales
4. ⏳ **Configurar webhook** en Twilio Console

**¡El sistema funcionará perfectamente desde el primer momento!** 🚀
