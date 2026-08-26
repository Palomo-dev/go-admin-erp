# WhatsApp QR (Evolution API) – Arquitectura

> **Fecha:** 2026-08-25
> **Estado:** Activo

---

## 1. Resumen

Integración híbrida de WhatsApp que permite:

1. **Cloud API** (oficial Meta) – sin riesgo de ban, costo por mensaje
2. **QR Scan via Evolution API** – self-hosted, sin costo por mensaje, riesgo medio de ban
3. **Coexistence Mode** (oficial Meta) – combina número personal + API

Este documento describe la integración QR via **Evolution API**.

---

## 2. Por qué Evolution API

Baileys directo (rc14) tiene problemas críticos:
- **No maneja LID correctamente**: WhatsApp migró a Linked Identity. Los envíos hacen timeout.
- **Watchdog roto**: Verifica `sock.ws.readyState` que no existe.
- **Sin persistencia estable**: Las sesiones se corrompen al reiniciar.

Evolution API resuelve esto:
- **Manejo correcto de LID**: Normaliza LID ↔ phone number automáticamente.
- **Persistencia Redis/DB**: Sesiones sobreviven reinicios.
- **API REST documentada**: Endpoints estables con autenticación apikey.
- **Mantenimiento activo**: Actualiza su fork de Baileys con frecuencia.

---

## 3. Arquitectura

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  ERP Next.js │────▶│  Evolution   │────▶│  WhatsApp    │
│  (Vercel)    │     │  API         │     │  Servers     │
│              │◀────│  (Railway)   │◀────│              │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│  Supabase    │     │  Redis       │
│  (BD+RT)     │     │  (cache)     │
└──────────────┘     └──────────────┘
```

### Componentes

| Componente | Ubicación | Función |
|---|---|---|
| ERP Next.js | Vercel | UI + API routes + whatsappQrService |
| Evolution API | Railway/VPS | Gateway WhatsApp (WebSocket persistente) |
| Redis | Railway/VPS | Cache de sesiones y mensajes |
| Supabase | Cloud | BD (messages, conversations, customers) |

---

## 4. Endpoints de Evolution API usados

| Método | Path | Función |
|---|---|---|
| POST | `/instance/create` | Crear instancia por canal |
| GET | `/instance/:name/connect` | Conectar y obtener QR |
| GET | `/instance/:name/connectionState` | Estado de conexión |
| POST | `/message/sendText/:name` | Enviar texto |
| POST | `/message/sendMedia/:name` | Enviar media por URL |
| DELETE | `/instance/:name/logout` | Logout (mantiene instancia) |
| DELETE | `/instance/:name/delete` | Eliminar instancia |

Autenticación: header `apikey: <EVOLUTION_API_KEY>`

---

## 5. Webhooks (Evolution API → ERP)

Evolution API envía webhooks a `/api/integrations/whatsapp/qr/inbound`:

### Eventos

| Evento | Cuándo | Acción ERP |
|---|---|---|
| `QRCODE_UPDATED` | QR generado | Actualiza `whatsapp_qr_sessions.qr_code` |
| `CONNECTION_UPDATE` | Conexión abierta/cerrada | Actualiza `whatsapp_qr_sessions.status` |
| `MESSAGES_UPSERT` | Mensaje entrante | Insert en `messages` + trigger IA |

### Estructura del webhook

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "wa-qr-<channel-id>",
  "data": {
    "key": {
      "remoteJid": "57300xxx@s.whatsapp.net",
      "fromMe": false,
      "id": "messageId"
    },
    "message": {
      "conversation": "Hola"
    },
    "messageTimestamp": 1234567890
  }
}
```

---

## 6. Tablas Supabase

### `whatsapp_qr_sessions`

| Campo | Tipo | Descripción |
|---|---|---|
| channel_id | uuid | FK a channels |
| organization_id | int | FK a organizations |
| session_ref | text | Nombre de instancia en Evolution API |
| status | text | connecting/qr_ready/connected/disconnected |
| qr_code | text | QR en base64 (cuando está qr_ready) |
| phone_number | text | JID del número conectado |
| connected_at | timestamptz | Fecha de conexión |
| disconnected_at | timestamptz | Fecha de desconexión |

### `channel_credentials`

Para canales QR, se crea un registro con:
- `provider = 'baileys'`
- `credentials = {"method":"qr_scan"}`
- `is_valid = true`

Esto permite que la Edge Function `channel-dispatch` detecte que es un canal Baileys y despache via Evolution API.

---

## 7. Archivos del módulo

### Servicio

- `src/lib/services/integrations/whatsapp/whatsappQrService.ts` – Cliente HTTP de Evolution API

### API routes

- `src/app/api/integrations/whatsapp/qr/status/route.ts` – Estado de sesión
- `src/app/api/integrations/whatsapp/qr/start/route.ts` – Iniciar sesión
- `src/app/api/integrations/whatsapp/qr/stop/route.ts` – Detener sesión
- `src/app/api/integrations/whatsapp/qr/logout/route.ts` – Borrar sesión
- `src/app/api/integrations/whatsapp/qr/send/route.ts` – Enviar mensaje
- `src/app/api/integrations/whatsapp/qr/inbound/route.ts` – Webhook de Evolution API
- `src/app/api/integrations/whatsapp/qr/dispatch-pending/route.ts` – Polling de mensajes pendientes

### UI

- `src/components/chat/channels/whatsapp/id/WhatsAppQrCard.tsx` – Card de conexión QR
- `src/components/chat/channels/whatsapp/id/WhatsAppConnectionTabs.tsx` – Tabs de método

### Deploy

- `deploy/whatsapp-qr-server/docker-compose.yml` – Docker compose para Evolution API
- `deploy/whatsapp-qr-server/.env.example` – Variables de entorno
- `deploy/whatsapp-qr-server/Dockerfile` – Referencia (usar imagen oficial)

---

## 8. Advertencia de riesgo

Evolution API usa Baileys internamente, que es una librería **no autorizada por Meta**. WhatsApp puede detectarla y banear el número **permanentemente** sin previo aviso.

**Recomendaciones:**
- Usar solo con números de prueba o internos
- Para producción comercial, usar Cloud API o Coexistence Mode
- La UI muestra advertencia clara que el usuario debe aceptar antes de conectar
