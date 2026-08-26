# Despliegue Producción – WhatsApp QR (Evolution API)

> **Ref:** [whatsapp-qr-evolution.md](./whatsapp-qr-evolution.md)
> **Fecha:** 2026-08-25

---

## 1. Arquitectura de producción

```
┌─────────────────────────────────────────────────────────────┐
│  Usuarios (navegador / app móvil)                           │
└─────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  ERP (Next.js) – Vercel                                     │
│  • app.goadmin.io                                           │
│  • API routes /api/integrations/whatsapp/qr/*               │
│  • whatsappQrService.ts → HTTP a Evolution API              │
│  • Supabase (BD, realtime, auth)                            │
└─────────────────────────────────────────────────────────────┘
        │                              │
        │ HTTPS (público, con apikey)  │
        ▼                              ▼
┌──────────────────────┐    ┌─────────────────────────────────┐
│  Supabase            │    │  Evolution API (Railway/VPS)    │
│  (Postgres + RT)     │    │  evolution.goadmin.io           │
│                      │    │  • Gateway sobre Baileys        │
│                      │    │  • WebSocket ←→ WhatsApp        │
│                      │    │  • Manejo correcto de LID       │
│                      │    │  • Redis cache + persistencia   │
│                      │    │  • API REST estable             │
└──────────────────────┘    └─────────────────────────────────┘
```

### Por qué Evolution API en lugar de Baileys directo

1. **Manejo correcto de LID**: WhatsApp migró a Linked Identity (LID). Baileys suelto (rc14) no lo maneja bien y los envíos hacen timeout. Evolution API normaliza LID ↔ phone number automáticamente.
2. **Estabilidad**: Persistencia en Redis/DB, reconexión automática, cache de mensajes.
3. **API REST lista para producción**: Endpoints documentados, autenticación con apikey.
4. **Mantenimiento activo**: Evolution API actualiza su fork de Baileys con frecuencia.
5. **Multi-tenant**: Aislamiento por nombre de instancia.

---

## 2. Despliegue en Railway

### 2.1 Crear servicio

```bash
# En Railway, crear nuevo servicio desde imagen Docker
railway run
```

Usar la imagen oficial: `atendai/evolution-api:v2.1.0`

### 2.2 Variables de entorno en Railway

```env
SERVER_URL=https://evolution.tu-dominio.com
PORT=8080
AUTHENTICATION_API_KEY=<generar-con-openssl-rand-base64-32>

# Redis (Railway provee Redis gratis)
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://default:password@redis.railway.internal:6379

# Persistencia
DATABASE_SAVE_DATA_INSTANCE=true

# Webhook events
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_EVENTS_QRCODE_UPDATED=true

# Solo Baileys (QR scan)
INTEGRATIONS=WHATSAPP-BAILEYS
```

### 2.3 Volumen persistente

En Railway, montar un volumen en `/evolution/instances` para persistir credenciales de sesión entre reinicios.

---

## 3. Variables de entorno en Vercel (ERP)

```env
EVOLUTION_API_URL=https://evolution.tu-dominio.com
EVOLUTION_API_KEY=<mismo-que-en-railway>
NEXT_PUBLIC_APP_URL=https://app.goadmin.io
```

---

## 4. Flujo de mensajes

### 4.1 Mensaje entrante (cliente → ERP)

```
Cliente envía WhatsApp
  → Evolution API recibe (WebSocket)
  → Webhook MESSAGES_UPSERT → /api/integrations/whatsapp/qr/inbound
  → whatsappQrService.processInboundCallback()
  → Insert en messages (direction=inbound)
  → Trigger IA auto-response (si ai_mode != manual)
```

### 4.2 Mensaje saliente (IA → cliente)

```
IA genera respuesta → Insert en messages (direction=outbound, role=ai)
  → Trigger trg_channel_dispatch → Edge Function channel-dispatch
  → Detecta provider='baileys' → POST a Evolution API /message/sendText
  → Evolution API envía via WhatsApp
  → Marca dispatched=true en messages.metadata
```

### 4.3 Mensaje saliente manual (agente → cliente)

```
Agente escribe en bandeja → POST /api/integrations/whatsapp/qr/send
  → whatsappQrService.sendText() → Evolution API /message/sendText
  → WhatsApp del cliente
```

---

## 5. Verificación post-deploy

```bash
# 1. Health check Evolution API
curl https://evolution.tu-dominio.com/health

# 2. Crear instancia de prueba
curl -X POST https://evolution.tu-dominio.com/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"test","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'

# 3. Obtener QR
curl -H "apikey: $EVOLUTION_API_KEY" \
  https://evolution.tu-dominio.com/instance/test/connect

# 4. Estado de conexión
curl -H "apikey: $EVOLUTION_API_KEY" \
  https://evolution.tu-dominio.com/instance/test/connectionState
```

---

## 6. Migración desde Baileys directo

Si ya tenías el microservicio `scripts/whatsapp-qr-server.mjs`:

1. Desplegar Evolution API en Railway/VPS
2. Actualizar variables de entorno del ERP:
   - `WHATSAPP_QR_SERVER_URL` → `EVOLUTION_API_URL`
   - `WHATSAPP_QR_SERVER_SECRET` → `EVOLUTION_API_KEY`
3. Detener el microservicio antiguo
4. Re-escanear QR en el ERP (las credenciales de Baileys directo no son compatibles)
5. Los mensajes pendientes con `dispatched:false` serán despachados por el polling de `dispatch-pending`

---

## 7. Costos estimados

| Concepto | Costo |
|---|---|
| Evolution API (licencia MIT) | $0 |
| Railway (1 servicio + Redis) | ~$5-10/mes |
| Vercel (ERP) | ya existente |
| Supabase (BD) | ya existente |
| **Total adicional** | **~$5-10/mes** |
