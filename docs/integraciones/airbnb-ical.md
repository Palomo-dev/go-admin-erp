# Integración Airbnb & Channel Manager (iCal)

## Descripción

Integración bidireccional con Airbnb, Booking.com, Expedia y otros OTAs mediante el protocolo iCal. Permite sincronizar disponibilidad automáticamente entre GO Admin ERP PMS y plataformas externas.

## Arquitectura

```
┌─────────────┐    iCal Export     ┌──────────┐
│  GO Admin   │ ──────────────────▶│  Airbnb  │
│  PMS        │                    │ Booking  │
│             │◀────────────────── │ Expedia  │
└─────────────┘    iCal Import     └──────────┘
       │
       ▼
┌─────────────────────────────┐
│  Supabase                   │
│  - channel_connections      │
│  - channel_blocks           │
│  - ical_sync_logs           │
│  - reservations (channel)   │
└─────────────────────────────┘
```

## Flujo de Datos

### Export (GO Admin → OTA)

1. Se genera un token único por conexión espacio-canal
2. La URL `GET /api/pms/ical/{token}` genera un feed `.ics` en tiempo real
3. El OTA se suscribe a esta URL y la consulta periódicamente
4. El feed incluye:
   - Reservas activas (tentative, confirmed, checked_in)
   - Bloqueos de otros canales (para evitar overbooking)
   - Bloqueos manuales

### Import (OTA → GO Admin)

1. Se configura la URL iCal del OTA en la conexión
2. `POST /api/pms/ical/sync` descarga y parsea el feed
3. Los eventos se guardan como `channel_blocks`
4. Se detectan cambios: creaciones, actualizaciones, eliminaciones
5. La sincronización puede ser manual o automática (cron)

## Base de Datos

### channel_connections

Almacena la configuración de cada conexión espacio-canal.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| organization_id | integer | FK organizations |
| space_id | uuid | FK spaces |
| channel | text | airbnb, booking, expedia, etc. |
| connection_type | text | ical, api, channel_manager |
| ical_import_url | text | URL del calendario externo |
| ical_export_token | text | Token único para el feed de export |
| sync_enabled | boolean | Si la sincronización está activa |
| sync_interval_minutes | integer | Intervalo de sincronización |
| last_sync_at | timestamptz | Última sincronización |
| last_sync_status | text | success, error, partial |
| commission_percent | numeric | Comisión del canal |

### channel_blocks

Bloqueos importados desde canales externos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| connection_id | uuid | FK channel_connections |
| space_id | uuid | FK spaces |
| channel | text | Canal de origen |
| external_event_uid | text | UID del evento iCal |
| summary | text | Resumen del evento |
| start_date | date | Fecha inicio |
| end_date | date | Fecha fin |
| is_reservation | boolean | Si se convirtió en reserva |
| reservation_id | uuid | FK reservations (opcional) |

### ical_sync_logs

Historial de sincronizaciones para debugging.

## API Endpoints

### GET /api/pms/ical/{token}

Feed iCal público. No requiere autenticación, solo el token secreto.

**Respuesta:** `text/calendar` (.ics)

**Uso en Airbnb:**
1. Ir a la configuración del anuncio en Airbnb
2. Sección "Disponibilidad" → "Sincronización de calendarios"
3. Pegar la URL en "Importar un nuevo calendario"

### POST /api/pms/ical/sync

Sincroniza calendarios externos. Requiere autenticación.

**Body:**
```json
{
  "organization_id": 1,
  "connection_id": "uuid-opcional"
}
```

**Respuesta:**
```json
{
  "message": "Sincronización completada: 3 conexión(es) procesada(s)",
  "overall_status": "success",
  "results": [
    {
      "connection_id": "uuid",
      "channel": "airbnb",
      "events_found": 5,
      "events_created": 2,
      "events_updated": 1,
      "events_deleted": 0,
      "errors": []
    }
  ]
}
```

## Canales Soportados

| Canal | iCal Import | iCal Export | Comisión Default |
|-------|:-----------:|:-----------:|:----------------:|
| Airbnb | ✅ | ✅ | 12% |
| Booking.com | ✅ | ✅ | 15% |
| Expedia / Vrbo | ✅ | ✅ | 15% |
| TripAdvisor | ✅ | ✅ | 12% |
| Google Vacation Rentals | ✅ | ✅ | 0% |
| Otro (iCal) | ✅ | ✅ | Configurable |

## Instrucciones por Canal

### Airbnb

**Obtener URL iCal de Airbnb (import):**
1. Ir a [airbnb.com/hosting/calendar](https://airbnb.com/hosting/calendar)
2. Seleccionar el anuncio
3. Click en "Disponibilidad y precios" → "Sincronización de calendarios"
4. En "Exportar calendario", copiar la URL

**Conectar GO Admin a Airbnb (export):**
1. En la misma sección, click "Importar calendario"
2. Pegar la URL de export de GO Admin (se copia desde Channel Manager)
3. Nombrar como "GO Admin PMS"

### Booking.com

**Obtener URL iCal de Booking (import):**
1. Ir al Extranet de Booking.com
2. Tarifas y Disponibilidad → Sincronización de calendario
3. Copiar la URL del calendario iCal

**Conectar GO Admin a Booking (export):**
1. En la misma sección, agregar nueva conexión
2. Pegar la URL de export de GO Admin

## Archivos del Proyecto

### Servicios
- `src/lib/services/icalService.ts` — Generador/parser iCal + CRUD conexiones
- `src/lib/services/channelManagerService.ts` — Abstracción channel manager + proveedores

### API Routes
- `src/app/api/pms/ical/[token]/route.ts` — Feed iCal público (export)
- `src/app/api/pms/ical/sync/route.ts` — Sincronización (import)

### UI Componentes
- `src/components/pms/channel-manager/ChannelManagerHeader.tsx`
- `src/components/pms/channel-manager/SpaceConnectionsList.tsx`
- `src/components/pms/channel-manager/AddConnectionDialog.tsx`

### Página
- `src/app/app/pms/channel-manager/page.tsx`

## Variables de Entorno

```env
# Requeridas (ya existentes)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Para URLs de export
NEXT_PUBLIC_APP_URL=https://tudominio.com
```

## Futuras Mejoras

1. **Cron automático** — Edge Function o Vercel Cron para sincronizar cada 30 min
2. **Webhooks** — Notificar cuando se detecta un nuevo bloqueo/reserva
3. **Channel Manager externo** — Integración con Channex, SiteMinder, etc.
4. **Conversión automática** — Convertir bloqueos en reservas del PMS
5. **Precios dinámicos** — Sincronizar tarifas además de disponibilidad
6. **Dashboard de ocupación** — Vista consolidada de todos los canales

---

## Fase Futura: Airbnb Connectivity API (Oficial)

### Descripción

La **Airbnb Connectivity API** es la API oficial de Airbnb para Software Partners certificados. Permite integración en tiempo real con funcionalidades completas que iCal no puede ofrecer. Esta fase se planifica para cuando GO Admin alcance el volumen y madurez necesarios para aplicar al programa.

### Requisitos para Acceder

| Requisito | Detalle |
|-----------|---------|
| **Programa** | [Airbnb Connectivity Partner Program](https://www.airbnb.com/platform/connectivity) |
| **Tipo de empresa** | PMS / Channel Manager con base de clientes activa |
| **Proceso** | Aplicación → revisión técnica → certificación → producción |
| **Tiempo estimado** | 3-6 meses desde aplicación hasta producción |
| **Volumen mínimo** | Airbnb evalúa el número de propiedades gestionadas (no se publica mínimo exacto) |

### Comparativa iCal vs Connectivity API

| Funcionalidad | iCal (actual) | Connectivity API |
|---------------|:-------------:|:----------------:|
| Sincronizar disponibilidad | ✅ | ✅ |
| Evitar doble booking | ✅ | ✅ |
| Datos de reservas completos (huésped, precio) | ❌ | ✅ |
| Gestión de precios y tarifas | ❌ | ✅ |
| Creación/modificación de listings | ❌ | ✅ |
| Mensajería con huéspedes | ❌ | ✅ |
| Webhooks en tiempo real | ❌ | ✅ |
| Fotos y contenido del anuncio | ❌ | ✅ |
| Latencia de sincronización | 15-30 min | Tiempo real |
| Requiere certificación | No | Sí |

### Endpoints Principales (referencia)

Basados en la documentación pública del programa de conectividad:

- **Listings API** — CRUD de anuncios (título, descripción, fotos, amenities, reglas)
- **Calendar API** — Disponibilidad y precios por noche en tiempo real
- **Reservations API** — Crear, leer, modificar, cancelar reservas
- **Messaging API** — Enviar/recibir mensajes con huéspedes
- **Reviews API** — Leer reseñas de huéspedes
- **Webhooks** — Notificaciones push para nuevas reservas, cancelaciones, mensajes, etc.

### Arquitectura Propuesta

```
┌─────────────┐    REST API + Webhooks    ┌──────────────────┐
│  GO Admin   │ ◀════════════════════════▶│  Airbnb          │
│  PMS        │    (Connectivity API)     │  Connectivity    │
└─────────────┘                           └──────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Supabase                           │
│  - channel_connections (type: api)  │
│  - reservations (channel: airbnb)   │
│  - airbnb_listings (nueva tabla)    │
│  - airbnb_messages (nueva tabla)    │
│  - airbnb_webhooks_log              │
└─────────────────────────────────────┘
```

### Plan de Implementación

**Fase A — Certificación**
1. Aplicar al Airbnb Connectivity Partner Program
2. Preparar documentación técnica de GO Admin
3. Implementar sandbox de pruebas con la API de staging
4. Pasar revisión técnica de Airbnb

**Fase B — Integración Core**
1. Autenticación OAuth2 con Airbnb
2. Sincronización de listings (lectura)
3. Calendar API: precios y disponibilidad en tiempo real
4. Reservations API: recibir reservas automáticamente en el PMS
5. Webhooks: endpoint para recibir eventos en tiempo real

**Fase C — Funcionalidades Avanzadas**
1. Mensajería integrada con huéspedes desde GO Admin
2. Gestión de contenido de listings desde GO Admin
3. Sincronización de precios dinámicos
4. Dashboard de rendimiento por listing
5. Reviews y respuestas automáticas

### Variables de Entorno (futuras)

```env
# Airbnb Connectivity API (fase futura)
AIRBNB_CLIENT_ID=xxx
AIRBNB_CLIENT_SECRET=xxx
AIRBNB_WEBHOOK_SECRET=xxx
AIRBNB_API_BASE_URL=https://api.airbnb.com/v3
```

### Tablas Nuevas (propuestas)

```sql
-- Listings sincronizados desde Airbnb
CREATE TABLE airbnb_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES channel_connections(id),
  airbnb_listing_id text NOT NULL UNIQUE,
  title text,
  status text, -- active, inactive, pending
  property_type text,
  room_type text,
  price_per_night numeric,
  currency text DEFAULT 'USD',
  photos jsonb DEFAULT '[]',
  amenities jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Mensajes con huéspedes
CREATE TABLE airbnb_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES channel_connections(id),
  reservation_id uuid REFERENCES reservations(id),
  airbnb_thread_id text,
  direction text NOT NULL, -- inbound, outbound
  message_text text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

### Notas Importantes

- **Compatibilidad**: La implementación iCal actual seguirá funcionando como fallback para hosts que no tengan acceso a la API
- **Migración**: Las `channel_connections` con `connection_type: 'ical'` podrán migrarse a `connection_type: 'api'` sin perder histórico
- **Multi-canal**: La misma arquitectura se puede replicar para Booking.com (Connectivity Partner API) y Expedia (EQC API)

---

## Estado

✅ **IMPLEMENTADO** — iCal Export + Import + Channel Manager UI
📋 **PLANIFICADO** — Airbnb Connectivity API (pendiente certificación)
