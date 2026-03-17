# Integración Booking.com – Connectivity API

> **Ref oficial:** https://developers.booking.com/connectivity/docs  
> **Developer Portal:** https://developers.booking.com/connectivity/home  
> **Provider Portal:** https://connect.booking.com  
> **Extranet:** https://admin.booking.com  
> **Onboarding:** https://portal.connectivity.booking.com/s/topiccatalog  
> **Authentication:** https://developers.booking.com/connectivity/docs/authentication  
> **Going Live:** https://developers.booking.com/connectivity/docs/going_live  
> **Changelog:** https://developers.booking.com/connectivity/docs/changelog  
> **Fecha:** 2026-03-09

---

## 1. Resumen General

La integración de Booking.com Connectivity API permite a GO Admin ERP actuar como **Connectivity Partner** certificado, gestionando propiedades listadas en Booking.com directamente desde el PMS.

| Funcionalidad | Descripción |
|---------------|-------------|
| **Reservas en tiempo real** | Recibir, confirmar y gestionar reservas de Booking.com automáticamente |
| **Tarifas y disponibilidad** | Sincronizar precios, inventario y restricciones en tiempo real |
| **Contenido de propiedad** | Gestionar descripciones, fotos, amenities y políticas |
| **Mensajería con huéspedes** | Enviar/recibir mensajes con huéspedes desde GO Admin |
| **Reviews** | Leer y responder reseñas de huéspedes |
| **Promociones** | Crear y gestionar promociones y ofertas especiales |
| **Reportes** | Obtener datos de rendimiento, ocupación e ingresos |
| **Pagos** | Gestionar pagos y facturación vía Payments by Booking.com |

### Relación con integración iCal existente

| Método | Estado | Alcance |
|--------|--------|---------|
| **iCal (actual)** | ✅ Implementado | Solo disponibilidad (bloqueos). Latencia 15-30 min |
| **Connectivity API (futuro)** | 📋 Planificado | Completo: reservas, precios, contenido, mensajes, tiempo real |

> La integración iCal actual seguirá funcionando como **fallback** para propiedades que no estén conectadas vía API.

### Separación con conectores existentes

| Conector en BD | Propósito |
|----------------|-----------|
| `booking_ical` | iCal import/export (Channel Manager actual) |
| `booking_ota` | ✅ **Implementado** — API Connectivity Partner (OAuth2 client_credentials) |

---

## 2. Arquitectura de Booking.com Connectivity

```
Booking.com Ecosystem
├── Connectivity Portal (connect.booking.com)
│   ├── Machine Accounts (credenciales API)
│   ├── Provider Portal (gestión de cuenta partner)
│   └── Feature Management (habilitar funciones)
├── Extranet (admin.booking.com)
│   ├── Properties (propiedades listadas)
│   ├── Reservations (reservas)
│   └── Connection Requests (solicitudes de conexión)
└── Connectivity APIs
    ├── OTA XML (OpenTravel Alliance 2003B)
    ├── B.XML (Booking.com XML propietario)
    └── JSON (APIs modernas REST)
```

### Conceptos clave

- **Connectivity Partner**: Empresa certificada que gestiona propiedades en Booking.com via API (PMS, Channel Manager)
- **Machine Account**: Cuenta de servicio con credenciales para autenticarse en la API. Se crea por propiedad en el Provider Portal
- **Connection**: Permiso otorgado por una propiedad al Connectivity Partner para gestionar aspectos específicos (reservas, tarifas, contenido, etc.)
- **Connection Types**: Permisos granulares que componen una conexión (Reservations, Rates & Availability, Content, Photos, etc.)
- **Property (Hotel ID)**: Identificador único de la propiedad en Booking.com
- **OTA XML**: Schema XML del OpenTravel Alliance usado para reservas y tarifas
- **B.XML**: Schema XML propietario de Booking.com que complementa OTA
- **RUID**: Request Unique Identifier — ID de cada request para debugging con soporte de Booking.com
- **PCI Compliance**: Requerido para manejar datos de tarjetas de crédito de huéspedes

---

## 3. Requisitos Previos

### 3.1. Para GO Admin (una sola vez)

| Requisito | Descripción |
|-----------|-------------|
| **Aplicar como Connectivity Partner** | Registrarse en el [programa de partners](https://portal.connectivity.booking.com/s/topiccatalog) |
| **Cuenta en Provider Portal** | Acceso a [connect.booking.com](https://connect.booking.com) |
| **Certificación por API** | Pasar pruebas técnicas para cada API que se desee usar |
| **PCI Compliance** | Attestation de cumplimiento PCI DSS para manejar datos de tarjetas |
| **PII Compliance** | Cumplimiento de regulaciones de datos personales |
| **Servidor HTTPS** | TLS 1.2 obligatorio para todas las llamadas |
| **Propiedad de prueba** | Crear test property para desarrollo y certificación |

### 3.2. Para cada Propiedad (Cliente de GO Admin)

| Requisito | Descripción |
|-----------|-------------|
| **Propiedad listada en Booking.com** | La propiedad debe existir en el Extranet |
| **Solicitud de conexión** | La propiedad envía connection request desde el Extranet |
| **Connection Types** | Definir qué aspectos gestiona GO Admin (reservas, tarifas, etc.) |
| **Machine Account** | Crear cuenta de máquina vinculada a la propiedad |

---

## 4. Credenciales y Autenticación

### 4.1. Métodos de Autenticación

Booking.com soporta dos métodos (el credential-based fue deprecado el 31 dic 2025):

| Método | Estado | Descripción |
|--------|--------|-------------|
| **Token-based** | ✅ Activo (recomendado) | Generar API token desde machine account credentials |
| **Credential-based** | ❌ Deprecado (sunset 31 dic 2025) | Basic auth con username/password |

### 4.2. Token-based Authentication (recomendado)

```
1. Crear Machine Account en Provider Portal (connect.booking.com)
2. Obtener client_id y client_secret
3. POST /token → obtener access_token (JWT)
4. Usar access_token en header Authorization: Bearer {token}
5. Renovar token antes de expiración
```

**Obtener token:**

```
POST https://account.booking.com/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={MACHINE_ACCOUNT_CLIENT_ID}
&client_secret={MACHINE_ACCOUNT_CLIENT_SECRET}
```

**Respuesta:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 599
}
```

**Usar token:**

```
GET https://supply-xml.booking.com/hotels/ota/OTA_HotelDescriptiveInfo
Authorization: Bearer {access_token}
Content-Type: application/xml
```

### 4.3. Machine Accounts

- Se crean en el **Provider Portal** (connect.booking.com)
- Son a nivel de propiedad (una o más propiedades por cuenta)
- Separar cuentas de **test** y **producción**
- Menos propiedades por cuenta = payloads más manejables

### 4.4. Variables de Entorno (servidor GO Admin)

```env
# Booking.com Connectivity API
BOOKING_MACHINE_CLIENT_ID=xxx
BOOKING_MACHINE_CLIENT_SECRET=xxx
BOOKING_ENVIRONMENT=test  # "test" o "production"
```

### 4.5. Credenciales por Propiedad (en BD: `integration_credentials`)

Se guardan como 3 registros separados en `integration_credentials` al crear la conexión desde el wizard estándar (`/app/integraciones/conexiones/nueva`):

| Campo | `credential_type` | Descripción |
|-------|-------------------|-------------|
| `machine_client_id` | `machine_client_id` | Client ID del machine account |
| `machine_client_secret` | `machine_client_secret` | Client Secret del machine account |
| `hotel_id` | `hotel_id` | ID de la propiedad en Booking.com |

> El `access_token` JWT se genera en runtime por `bookingAuthService.ts` y se cachea en memoria (~10 min TTL). No se persiste en BD.

---

## 5. Base URLs y Formatos

### 5.1. URLs Base

| Servidor | URL | Uso |
|----------|-----|-----|
| **Non-PCI** | `https://supply-xml.booking.com` | Información no relacionada con reservas |
| **PCI (secure)** | `https://secure-supply-xml.booking.com` | Retrieval de reservas y datos sensibles |
| **OAuth** | `https://account.booking.com` | Generación de tokens |

### 5.2. Formatos de Request/Response

| Formato | Descripción | Uso |
|---------|-------------|-----|
| **OTA XML** | Schema OpenTravel Alliance 2003B | Reservas, tarifas, disponibilidad |
| **B.XML** | XML propietario de Booking.com | Funciones que OTA no soporta |
| **JSON** | REST moderno | APIs nuevas (Content, Photos, Connections, etc.) |

> En la práctica se usan **ambos formatos**. No mezclar OTA y B.XML en el mismo flujo.

**Encoding:** UTF-8 obligatorio para todos los request bodies.

---

## 6. APIs Principales

### 6.1. Reservations API

Gestión completa de reservas de Booking.com.

**Endpoints OTA XML:**

| Endpoint | Método | Servidor | Descripción |
|----------|--------|----------|-------------|
| `/hotels/ota/OTA_HotelResNotif` | GET | secure-supply-xml | Obtener nuevas reservas |
| `/hotels/ota/OTA_HotelResNotif` | POST | secure-supply-xml | Confirmar (acknowledge) reservas |
| `/hotels/ota/OTA_HotelResModifyNotif` | GET | secure-supply-xml | Obtener modificaciones/cancelaciones |
| `/hotels/ota/OTA_HotelResModifyNotif` | POST | secure-supply-xml | Confirmar modificaciones/cancelaciones |

**Endpoint B.XML:**

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/xml/reservations` | POST | Obtener reservas (new, modified, cancelled) en un solo endpoint |
| `/xml/reservationssummary` | POST | Resumen de reservas pendientes |

#### Flujo de reservas (OTA XML — recomendado)

```
1. GET /OTA_HotelResNotif (cada 20 segundos)
   ↓
2. Booking.com responde con OTA_HotelResNotifRQ (lista de reservas pendientes)
   ↓
3. GO Admin procesa cada reserva:
   - Crea/actualiza reserva en Supabase
   - Asigna espacio si hay match de room type
   - Registra en channel_connections
   ↓
4. POST /OTA_HotelResNotif con OTA_HotelResNotifRS (acknowledge)
   ↓
5. Booking.com remueve de la cola de pendientes
   ↓
(Esperar 5 seg entre acknowledge y siguiente GET)
```

> **IMPORTANTE**: Si no se confirma en 30 min, Booking.com envía email fallback a la propiedad.

#### Datos de una reserva

| Campo | Descripción |
|-------|-------------|
| Reservation ID | ID único de la reserva en Booking.com |
| Guest Name | Nombre del huésped |
| Guest Email/Phone | Datos de contacto |
| Check-in / Check-out | Fechas de estancia |
| Room Type | Tipo de habitación reservada |
| Rate Plan | Plan tarifario |
| Total Price | Precio total de la reserva |
| Payment Info | Datos de pago (requiere PCI) |
| Special Requests | Solicitudes especiales del huésped |
| Meal Plan | Plan de comidas (BB, HB, FB, RO) |
| Status | new, modified, cancelled |
| Number of Guests | Adultos + niños |

---

### 6.2. Rates & Availability API

Gestión de inventario, precios y restricciones.

**Endpoints principales:**

| Endpoint | Método | Formato | Descripción |
|----------|--------|---------|-------------|
| `/hotels/ota/OTA_HotelAvailNotif` | POST | OTA XML | Actualizar disponibilidad y restricciones |
| `/hotels/ota/OTA_HotelRateAmountNotif` | POST | OTA XML | Actualizar tarifas |
| `/hotels/ota/OTA_HotelInvNotif` | POST | OTA XML | Actualizar inventario (stop sell, etc.) |
| `/xml/availability` | POST | B.XML | Actualizar inventario, tarifas y restricciones (todo en uno) |

#### Tipos de precios soportados

| Tipo | Descripción | Certificación |
|------|-------------|---------------|
| **Standard** | Precio fijo por habitación con max occupancy | Básica |
| **Derived (RLO)** | Precio base + variación por nº huéspedes | Requiere certificación |
| **OBP (Occupancy-Based)** | Precio diferente por ocupación exacta | Requiere certificación |
| **LOS (Length of Stay)** | Precio según duración de estancia | Requiere certificación |

#### Restricciones disponibles

| Restricción | Descripción |
|-------------|-------------|
| `MinLOS` | Estancia mínima (noches) |
| `MaxLOS` | Estancia máxima (noches) |
| `ClosedToArrival` | No permite check-in en esta fecha |
| `ClosedToDeparture` | No permite check-out en esta fecha |
| `StopSell` | Cierra la venta completamente |

#### Ejemplo B.XML — Actualizar disponibilidad y precio

```xml
POST https://supply-xml.booking.com/xml/availability
Authorization: Bearer {access_token}
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<request>
  <hotel_id>12345</hotel_id>
  <room id="ROOM_TYPE_ID">
    <date value="2026-04-01">
      <rate id="RATE_PLAN_ID">
        <price>150000</price>          <!-- Precio en moneda de la propiedad -->
        <rooms_to_sell>5</rooms_to_sell>
        <closed>0</closed>
        <minimumstay>2</minimumstay>
        <maximumstay>14</maximumstay>
        <closedonarrival>0</closedonarrival>
        <closedondeparture>0</closedondeparture>
      </rate>
    </date>
  </room>
</request>
```

> Se debe cargar disponibilidad y precios para **mínimo 12 meses** por adelantado.

---

### 6.3. Content API (JSON)

Gestión de contenido de la propiedad.

| Endpoint | Descripción |
|----------|-------------|
| `OTA_HotelDescriptiveContentNotif` | Actualizar descripciones, políticas, servicios |
| `OTA_HotelDescriptiveInfo` | Obtener información actual de la propiedad |
| Property Details API | Gestionar detalles avanzados (JSON) |
| Facilities API | Gestionar amenities y facilidades |
| Rooms API | Gestionar tipos de habitación |

---

### 6.4. Photo API (JSON)

Gestión de fotos de la propiedad.

| Operación | Endpoint | Descripción |
|-----------|----------|-------------|
| Subir foto | `POST /properties/{hotel_id}/photos` | Subir nueva foto |
| Listar fotos | `GET /properties/{hotel_id}/photos` | Obtener fotos actuales |
| Eliminar foto | `DELETE /properties/{hotel_id}/photos/{photo_id}` | Eliminar foto |
| Reordenar | `PUT /properties/{hotel_id}/photos/order` | Cambiar orden de fotos |

---

### 6.5. Messaging API

Comunicación con huéspedes.

| Endpoint | Descripción |
|----------|-------------|
| `/messages/latest` | Obtener mensajes recientes |
| `/messages` | Enviar mensaje al huésped |

> Requiere token-based authentication y habilitar acceso en Provider Portal.

---

### 6.6. Connections API (JSON)

Gestión de conexiones con propiedades.

| Operación | Descripción |
|-----------|-------------|
| Aceptar/rechazar conexión | Gestionar solicitudes de propiedades |
| Desactivar conexión | Desconectar una propiedad |
| Obtener conexiones activas | Listar propiedades conectadas |
| Verificar estado | Comprobar estado de una conexión |

#### Connection Types disponibles

| Tipo | Descripción |
|------|-------------|
| **Reservations** | Gestionar reservas |
| **Rates and Availability** | Gestionar tarifas e inventario |
| **Content** | Gestionar descripción y detalles |
| **Photos** | Gestionar fotos |
| **Guest Reviews** | Leer/responder reseñas |
| **Reporting** | Obtener reportes |
| **Promotions** | Gestionar promociones |
| **Messaging** | Mensajería con huéspedes |
| **Performance data and insights** | Datos de rendimiento |
| **Payments by Booking.com onboarding** | Gestión de pagos |

#### Estados de conexión

| Estado | Descripción |
|--------|-------------|
| `pending` | Propiedad envió solicitud, pendiente de aceptar |
| `connected` | Conexión activa |
| `not found` | Rechazada o sin conexión |

---

### 6.7. Otras APIs

| API | Descripción |
|-----|-------------|
| **Contracting API** | Crear nuevas propiedades en Booking.com |
| **Licences API** | Gestionar licencias y permisos legales |
| **Promotions API** | Crear/gestionar ofertas especiales |
| **Guest Review API** | Leer y responder reseñas |
| **Reporting API** | Obtener reportes de rendimiento |
| **Charges API** | Gestionar cargos adicionales |
| **Key Collection API** | Configurar métodos de check-in (llaves, self check-in) |
| **Market Insights API** | Datos de demanda del mercado |
| **Opportunities API** | Sugerencias de mejora para la propiedad |
| **Property Scores API** | Puntuaciones de calidad de la propiedad |
| **Request to Book API** | Flujo de aprobación manual de reservas |
| **Payments API** | Gestión de pagos de Booking.com |

---

## 7. Rate Limiting

| Endpoint | Límite |
|----------|--------|
| General | Varía por endpoint, Booking.com se reserva el derecho de cambiar sin previo aviso |
| Reservaciones (GET) | Cada 20 segundos recomendado |
| Acknowledge | Esperar 5 seg entre acknowledge y siguiente GET |
| Exceder límite | HTTP 429 Too Many Requests |

> Booking.com impone límites por minuto por provider. Implementar exponential backoff en caso de 429.

---

## 8. Comparativa iCal vs Connectivity API

| Funcionalidad | iCal (actual) | Connectivity API |
|---------------|:-------------:|:----------------:|
| Sincronizar disponibilidad | ✅ | ✅ |
| Evitar doble booking | ✅ | ✅ |
| Reservas completas (huésped, precio) | ❌ | ✅ |
| Gestión de precios y tarifas | ❌ | ✅ |
| Restricciones (min stay, stop sell) | ❌ | ✅ |
| Contenido de propiedad | ❌ | ✅ |
| Fotos | ❌ | ✅ |
| Mensajería con huéspedes | ❌ | ✅ |
| Reviews y respuestas | ❌ | ✅ |
| Promociones y ofertas | ❌ | ✅ |
| Reportes de rendimiento | ❌ | ✅ |
| Pagos y facturación | ❌ | ✅ |
| Latencia de sincronización | 15-30 min | Tiempo real (~20 seg) |
| Requiere certificación | No | Sí |
| PCI Compliance | No | Sí (para datos de pago) |

---

## 9. Flujo Completo de Integración con GO Admin ERP

### 9.1. Flujo de Onboarding (una sola vez)

```
1. GO Admin aplica al Booking.com Connectivity Partner Program
   ↓
2. Booking.com evalúa y aprueba la aplicación
   ↓
3. GO Admin recibe acceso al Provider Portal (connect.booking.com)
   ↓
4. Crear Machine Account de prueba
   ↓
5. Crear test property para desarrollo
   ↓
6. Implementar APIs requeridas (Reservations + Rates & Availability como mínimo)
   ↓
7. Pasar certificación técnica por API
   ↓
8. Obtener PCI/PII compliance attestation
   ↓
9. Ir a producción (Going Live)
```

### 9.2. Flujo de Conexión por Propiedad

```
1. Propiedad ya listada en Booking.com
   ↓
2. Propiedad entra a Extranet → sección "Conectividad"
   ↓
3. Busca "GO Admin" en lista de Connectivity Partners
   ↓
4. Envía connection request con connection types deseados:
   - ✅ Reservations
   - ✅ Rates and Availability
   - ✅ Content (opcional)
   - ✅ Photos (opcional)
   ↓
5. GO Admin recibe solicitud en Provider Portal / Connections API
   ↓
6. GO Admin acepta la conexión
   ↓
7. Se crea Machine Account vinculado a la propiedad
   ↓
8. GO Admin guarda credenciales en integration_credentials:
   - machine_client_id
   - machine_client_secret
   - hotel_id
   ↓
9. GO Admin sincroniza datos iniciales:
   - Obtener room types y rate plans (OTA_HotelDescriptiveInfo)
   - Mapear rooms de Booking.com → spaces de GO Admin
   - Cargar 12 meses de disponibilidad y precios
   ↓
10. Conexión activa: reservas llegan en tiempo real
```

### 9.3. Flujo de Reserva Entrante (Booking.com → GO Admin)

```
1. Huésped reserva en Booking.com
   ↓
2. GO Admin poll: GET /OTA_HotelResNotif (cada 20 seg)
   ↓
3. Booking.com responde con datos completos de la reserva:
   - Reservation ID, Guest info, Dates, Room, Price, Payment
   ↓
4. GO Admin procesa:
   a) Crea reserva en tabla `reservations` (channel: 'booking')
   b) Asigna espacio según mapeo room_type → space
   c) Crea registro en reservation_spaces
   d) Registra huésped en `customers` si no existe
   e) Actualiza disponibilidad en Booking.com
   ↓
5. POST /OTA_HotelResNotif (acknowledge — confirma procesamiento)
   ↓
6. Reserva visible en GO Admin PMS
   ↓
7. Si hay modificación/cancelación:
   - GET /OTA_HotelResModifyNotif
   - Actualizar reserva en Supabase
   - POST /OTA_HotelResModifyNotif (acknowledge)
```

### 9.4. Flujo de Actualización de Disponibilidad (GO Admin → Booking.com)

```
1. Evento en GO Admin:
   - Nueva reserva directa
   - Check-in / Check-out
   - Bloqueo manual
   - Reserva de otro canal (Airbnb, etc.)
   ↓
2. Trigger detecta cambio de disponibilidad
   ↓
3. GO Admin calcula disponibilidad actualizada por room type
   ↓
4. POST /xml/availability o POST /OTA_HotelAvailNotif
   ↓
5. Booking.com actualiza disponibilidad en su plataforma
   ↓
6. Evita overbooking entre canales
```

### 9.5. Flujo de Actualización de Precios (GO Admin → Booking.com)

```
1. Admin modifica tarifa en GO Admin (Revenue Management)
   ↓
2. GO Admin calcula precios por fecha, room type y rate plan
   ↓
3. POST /OTA_HotelRateAmountNotif
   ↓
4. Booking.com actualiza precios en su plataforma
   ↓
5. Huéspedes ven precios actualizados al buscar
```

---

## 10. Base de Datos

### 10.1. Tablas Existentes (reutilizar)

| Tabla | Uso para Booking.com |
|-------|---------------------|
| `reservations` | Reservas de Booking.com (channel: 'booking') |
| `reservation_spaces` | Asignación espacio ↔ reserva |
| `customers` | Datos del huésped |
| `spaces` | Espacios/habitaciones del PMS |
| `space_types` | Tipos de habitación |
| `channel_connections` | Conexión con Booking.com (connection_type: 'api') |
| `integration_connections` | Conexión de integración |
| `integration_credentials` | Credenciales (machine account, hotel_id) |

### 10.2. Tablas Nuevas (propuestas)

```sql
-- Mapeo de room types de Booking.com ↔ space_types de GO Admin
CREATE TABLE booking_room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES channel_connections(id) ON DELETE CASCADE,
  booking_room_id text NOT NULL,        -- ID del room type en Booking.com
  booking_room_name text,               -- Nombre en Booking.com
  booking_rate_plan_id text,            -- ID del rate plan en Booking.com
  space_type_id uuid REFERENCES space_types(id),
  rate_plan_config jsonb DEFAULT '{}',  -- Config de tarifas
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(connection_id, booking_room_id, booking_rate_plan_id)
);

-- Log de sincronizaciones con Booking.com
CREATE TABLE booking_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES channel_connections(id),
  sync_type text NOT NULL,          -- 'reservation_poll', 'availability_push', 'rate_push', 'content_sync'
  direction text NOT NULL,          -- 'inbound', 'outbound'
  endpoint text,                    -- Endpoint llamado
  request_ruid text,                -- RUID para debugging con Booking.com
  status text NOT NULL,             -- 'success', 'error', 'partial'
  items_processed integer DEFAULT 0,
  error_message text,
  request_payload text,
  response_payload text,
  created_at timestamptz DEFAULT now()
);

-- Reservas Booking.com (datos adicionales específicos del canal)
CREATE TABLE booking_reservation_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid REFERENCES reservations(id) ON DELETE CASCADE,
  booking_reservation_id text NOT NULL UNIQUE, -- ID en Booking.com
  booking_hotel_id text NOT NULL,
  guest_requests text,                -- Solicitudes especiales
  meal_plan text,                     -- RO, BB, HB, FB, AI
  payment_info jsonb DEFAULT '{}',    -- Info de pago (PCI compliant)
  commission_amount numeric,          -- Comisión de Booking.com
  booking_status text,                -- new, modified, cancelled
  acknowledged_at timestamptz,        -- Cuándo se confirmó
  raw_data jsonb DEFAULT '{}',        -- Datos crudos de la API
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## 11. Archivos a Crear

### 11.1. Servicios Backend — ✅ Implementados

```
src/lib/services/integrations/booking/
├── bookingTypes.ts              ✅ Interfaces TypeScript
├── bookingConfig.ts             ✅ URLs, endpoints, constantes
├── bookingAuthService.ts        ✅ Token management (OAuth2 client_credentials)
├── bookingReservationService.ts ✅ Poll, parse, acknowledge reservas
├── bookingAvailabilityService.ts ✅ Push disponibilidad y precios
├── bookingContentService.ts     ✅ Sync contenido, fotos
├── bookingConnectionService.ts  ✅ Gestión de conexiones
├── bookingXmlParser.ts          ✅ Parser OTA XML ↔ objetos GO Admin
└── index.ts                     ✅ Re-exportaciones
```

### 11.2. API Routes — ✅ Implementadas

| Ruta | Método | Estado | Descripción |
|------|--------|--------|-------------|
| `/api/integrations/booking/poll-reservations` | POST | ✅ | Ejecutar poll de reservas (manual o cron) |
| `/api/integrations/booking/push-availability` | POST | ✅ | Enviar disponibilidad actualizada |
| `/api/integrations/booking/push-rates` | POST | ✅ | Enviar tarifas actualizadas |
| `/api/integrations/booking/health-check` | POST | ✅ | Verificar credenciales y conexión |
| `/api/integrations/booking/list-connections` | GET | ✅ | Listar conexiones activas |
| `/api/integrations/booking/create-connection` | POST | ✅ | Crear nueva conexión API |
| `/api/integrations/booking/sync-status` | GET | ✅ | Estado de sincronización |

### 11.3. UI Componentes

| Componente | Estado | Descripción |
|------------|--------|-------------|
| **Wizard estándar** (`/integraciones/conexiones/nueva`) | ✅ | Conexión Booking.com integrada al wizard existente con campos `hotel_id`, `machine_client_id`, `machine_client_secret` |
| `BookingSyncStatusCard.tsx` | ✅ | Estado de sincronización y health-check por conexión |
| `BookingRoomMappingDialog.tsx` | 📋 Pendiente | Mapeo room types Booking.com ↔ space types GO Admin |
| `BookingReservationBadge.tsx` | 📋 Pendiente | Badge indicador de canal Booking.com en reservas |

> **Nota:** Se eliminó `BookingApiConnectionDialog.tsx` (dialog separado). La conexión ahora usa el wizard estándar de integraciones, con validación vía `/api/integrations/booking/health-check` y guardado de 3 credenciales separadas.

---

## 12. Seguridad

1. **HTTPS obligatorio** — TLS 1.2 para todas las llamadas
2. **Machine Account secrets** — Solo en backend (variables de entorno o BD encriptada)
3. **PCI DSS** — Requerido para manejar datos de tarjetas de huéspedes
4. **PII Compliance** — Proteger datos personales de huéspedes (GDPR, regulaciones locales)
5. **Token rotation** — Renovar access_token antes de expiración (~10 min)
6. **RUID logging** — Guardar RUID de cada request para soporte con Booking.com
7. **IP Allowlist** — Usar nombres de dominio, NO IPs fijas (cambian frecuentemente)
8. **Separar test/prod** — Machine accounts separadas para cada ambiente

---

## 13. Comisiones y Costos

| Concepto | Costo |
|----------|-------|
| Uso de la API | Gratuito (incluido en partnership) |
| Comisión por reserva | 15% promedio (varía por mercado y propiedad, lo cobra Booking.com al hotelero) |
| Certificación | Sin costo monetario (requiere tiempo de desarrollo) |
| PCI Compliance | Varía según proveedor de attestation |

> La comisión de Booking.com se cobra directamente a la propiedad. GO Admin como Connectivity Partner no paga comisión adicional por las APIs.

---

## 14. Ambientes

| Ambiente | Base URL | Machine Account | Propiedades |
|----------|----------|-----------------|-------------|
| **Test** | `https://supply-xml.booking.com` | Test machine account | Test properties |
| **Producción** | `https://supply-xml.booking.com` | Production machine account | Real properties |

> A diferencia de otros proveedores, Booking.com **usa la misma URL base** para test y producción. La separación se hace por machine account y propiedades.

---

## 15. Plan de Implementación

### Fase A — Onboarding y Certificación (4-8 semanas)

1. Aplicar al Booking.com Connectivity Partner Program
2. Obtener acceso al Provider Portal
3. Crear test property
4. Crear Machine Account de prueba
5. Implementar autenticación token-based
6. Pasar certificación de Reservations API
7. Pasar certificación de Rates & Availability API

### Fase B — Integración Core (4-6 semanas)

1. `bookingAuthService.ts` — Autenticación y token management
2. `bookingXmlParser.ts` — Parser OTA XML
3. `bookingReservationService.ts` — Poll + acknowledge reservas
4. `bookingAvailabilityService.ts` — Push disponibilidad y precios
5. API Routes para poll y push
6. Cron job: poll reservas cada 20 seg (Edge Function o Vercel Cron)
7. Triggers: push disponibilidad al crear/modificar reservas
8. UI: Wizard de conexión + mapeo de room types

### Fase C — Contenido y Fotos (2-3 semanas)

1. `bookingContentService.ts` — Sync descripciones y políticas
2. Photo API — Subir/gestionar fotos desde GO Admin
3. Facilities API — Sync amenities
4. UI: Panel de gestión de contenido por propiedad

### Fase D — Funcionalidades Avanzadas (3-4 semanas)

1. Messaging API — Chat con huéspedes desde CRM inbox
2. Guest Review API — Leer y responder reseñas
3. Promotions API — Crear ofertas especiales
4. Reporting API — Dashboard de rendimiento del canal
5. Revenue Management — Precios dinámicos integrados

### Fase E — Optimización (2 semanas)

1. Dashboard consolidado multi-canal (Booking + Airbnb + Direct)
2. Alertas automáticas (overbooking, baja disponibilidad)
3. Reportes comparativos entre canales
4. Optimización de performance (batch updates, connection pooling)

---

## 16. Variables de Entorno (resumen)

### 16.1. Servidor GO Admin (nuevas)

```env
# Booking.com Connectivity API
BOOKING_MACHINE_CLIENT_ID=your_machine_client_id
BOOKING_MACHINE_CLIENT_SECRET=your_machine_client_secret
BOOKING_ENVIRONMENT=test
```

### 16.2. Credenciales por Propiedad (BD)

| `purpose` | Tipo | Ejemplo | Uso |
|-----------|------|---------|-----|
| `machine_client_id` | `api_key` | `abc123...` | Autenticación OAuth2 |
| `machine_client_secret` | `api_key` | `xyz789...` | Autenticación OAuth2 |
| `hotel_id` | `api_key` | `12345678` | Identificar propiedad |
| `access_token` | `oauth2` | `eyJhbG...` | Token JWT (renovable) |

---

## 17. Consideraciones Específicas para Colombia

| Aspecto | Detalle |
|---------|---------|
| **Moneda** | COP (Pesos Colombianos) — configurar en propiedad |
| **Impuestos** | IVA 19% — configurar en Extranet de Booking.com |
| **Idioma** | Español — contenido en español para mercado local |
| **Zona horaria** | America/Bogota (UTC-5) — importante para fechas |
| **Regulación** | Registro Nacional de Turismo (RNT) requerido para operar |
| **Facturación** | Booking.com factura comisión directamente a la propiedad |

---

## 18. Diferencias con Otros Proveedores

| Aspecto | Booking.com | Airbnb | Expedia |
|---------|-------------|--------|---------|
| **Auth** | OAuth2 client_credentials (Machine Account) | OAuth2 (Connectivity Partner) | OAuth2 |
| **Formato** | OTA XML + B.XML + JSON | REST JSON | OTA XML + JSON |
| **Reservas** | Pull (polling cada 20s) | Push (webhooks) | Pull + Push |
| **Token duración** | ~10 min (renovable) | Variable | Variable |
| **Certificación** | Por API individual | Global | Por API |
| **Test** | Test properties (misma URL) | Sandbox separado | Test properties |
| **Comisión promedio** | 15% | 12% (host) | 15-20% |
| **XML Version** | OTA 2003B | N/A | OTA 2014A |

---

## 19. Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| HTTP 401 | Token expirado o inválido | Renovar token |
| HTTP 403 | Sin permisos para la propiedad | Verificar connection types |
| HTTP 429 | Rate limit excedido | Implementar exponential backoff |
| Reservas duplicadas | No se confirma (acknowledge) correctamente | Verificar flujo de acknowledge |
| Datos faltantes | Machine account sin propiedad asociada | Vincular propiedad en Provider Portal |
| XML parse error | Formato incorrecto | Verificar UTF-8, schema OTA 2003B |
| Fallback email | No se procesan reservas en 30 min | Verificar cron job de polling |

---

## 20. Notas Importantes

- **Compatibilidad iCal**: La integración iCal actual sigue como fallback para propiedades sin acceso API
- **Migración**: Las `channel_connections` con `connection_type: 'ical'` y channel `booking` pueden migrarse a `connection_type: 'api'` sin perder histórico
- **Multi-property**: Un Machine Account puede gestionar múltiples propiedades
- **Feature Management**: Algunas funciones requieren habilitarse manualmente en Provider Portal → Administration → Feature Management
- **Soporte**: Contactar Connectivity Support vía Provider Portal proporcionando RUID del request
- **Changelog**: Revisar regularmente el [changelog](https://developers.booking.com/connectivity/docs/changelog) para cambios en la API

---

## 21. Referencias

- [Connectivity Developer Portal](https://developers.booking.com/connectivity/home)
- [About the Connectivity APIs](https://developers.booking.com/connectivity/docs)
- [Authentication](https://developers.booking.com/connectivity/docs/authentication)
- [Token-based Authentication](https://developers.booking.com/connectivity/docs/token-based-authentication)
- [Reservations API Overview](https://developers.booking.com/connectivity/docs/reservations-api/reservations-overview)
- [Rates & Availability API Overview](https://developers.booking.com/connectivity/docs/ari)
- [Connections API Overview](https://developers.booking.com/connectivity/docs/connections-api/connections-overview)
- [Contracting API](https://developers.booking.com/connectivity/docs/contracting-api/understanding-the-contracting-api)
- [Going Live](https://developers.booking.com/connectivity/docs/going_live)
- [Glossary](https://developers.booking.com/connectivity/docs/glossary_of_terms)
- [Provider Portal](https://connect.booking.com)
- [Extranet](https://admin.booking.com)

---

## Estado de Implementación

| Componente | Estado | Detalle |
|------------|--------|--------|
| iCal Import/Export (Channel Manager) | ✅ Implementado | Conector `booking_ical` funcional |
| Servicios backend (`src/lib/services/integrations/booking/`) | ✅ Implementado | 9 archivos: auth, reservations, availability, content, connections, XML parser, types, config, index |
| API Routes (`/api/integrations/booking/`) | ✅ Implementado | 7 endpoints: poll-reservations, push-availability, push-rates, health-check, list-connections, create-connection, sync-status |
| Wizard de conexión (credenciales OAuth2) | ✅ Implementado | Integrado al wizard estándar (`/integraciones/conexiones/nueva`). Campos: hotel_id, machine_client_id, machine_client_secret |
| Validación de credenciales (health-check) | ✅ Implementado | Se verifica conexión antes de guardar |
| `BookingSyncStatusCard` (UI) | ✅ Implementado | Muestra estado de sync por conexión en Channel Manager |
| Provider en BD (`integration_providers`) | ✅ Configurado | `auth_type: oauth2`, provider ID: `d379fcab-12ad-41c7-80f9-91c66373d72f` |
| Conectores en BD (`integration_connectors`) | ✅ Configurado | `booking_ota` (eabc8169) + `booking_ical` (d5c764da) |
| Mapeo room types | 📋 Pendiente | `BookingRoomMappingDialog.tsx` |
| Badge canal Booking.com en reservas | 📋 Pendiente | `BookingReservationBadge.tsx` |
| Onboarding como Connectivity Partner | 📋 Pendiente | Requiere aplicar al programa de Booking.com |
| Certificación técnica | 📋 Pendiente | Pendiente aprobación de partner |

### Cambios recientes (2026-03-09)

- **Eliminado** `BookingApiConnectionDialog.tsx` — Se refactorizó para usar el wizard estándar
- **Actualizado** `auth_type` de `api_key` → `oauth2` en `integration_providers`
- **Agregado** override `booking` en `PROVIDER_CREDENTIAL_OVERRIDES` (StepCredentials.tsx)
- **Agregado** validación Booking.com en `handleValidate` del wizard (usa health-check)
- **Agregado** guardado de 3 credenciales separadas en `handleSave` del wizard
- **Actualizado** Channel Manager y Conexiones page para redirigir al wizard estándar
- **Corregido** `push-availability/route.ts` — campo `success` duplicado en response
