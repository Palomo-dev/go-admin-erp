# Integración Expedia Group – Lodging Connectivity API

> **Ref oficial:** https://developers.expediagroup.com/supply/lodging/docs  
> **Developer Hub:** https://developers.expediagroup.com/supply/lodging  
> **Partner Central:** https://apps.expediapartnercentral.com  
> **Contacto:** connectivitypartner@expediagroup.com  
> **License Agreement:** https://developers.expediagroup.com/supply/lodging/license  
> **Changelog:** https://developers.expediagroup.com/supply/lodging/updates  
> **Fecha:** 2026-03-09

---

## 1. Resumen General

La integración de Expedia Group Lodging Connectivity API permite a GO Admin ERP actuar como **Connectivity Partner** certificado, gestionando propiedades listadas en Expedia Group (Expedia, Hotels.com, Vrbo, Orbitz, Travelocity, etc.) directamente desde el PMS.

| Funcionalidad | Descripción |
|---------------|-------------|
| **Reservas en tiempo real** | Recibir, confirmar y gestionar reservas de Expedia Group automáticamente |
| **Tarifas y disponibilidad** | Sincronizar precios, inventario y restricciones en tiempo real |
| **Producto (Room Types / Rate Plans)** | Crear, leer y editar room types y rate plans |
| **Contenido de propiedad** | Gestionar detalles, facilidades y políticas |
| **Imágenes** | Subir y gestionar fotos de la propiedad |
| **Mensajería con huéspedes** | Enviar/recibir mensajes con viajeros |
| **Reviews** | Leer y responder reseñas de huéspedes |
| **Promociones** | Crear y gestionar promociones y ofertas especiales |
| **Depósitos** | Gestionar políticas de depósito |
| **Compliance** | Gestionar información regulatoria |
| **Webhooks (Notifications)** | Recibir notificaciones en tiempo real de eventos |

### Expedia Group — Puntos de Venta (200+ sitios)

| Marca | Mercado |
|-------|---------|
| **Expedia** | Global |
| **Hotels.com** | Global |
| **Vrbo** | Alquileres vacacionales |
| **Orbitz** | EE.UU. |
| **Travelocity** | EE.UU./Canadá |
| **Wotif** | Australia |
| **ebookers** | Europa |
| **Hotwire** | EE.UU. |
| **CheapTickets** | EE.UU. |
| **trivago** | Metasearch (partner) |

### Relación con integración iCal existente

| Método | Estado | Alcance |
|--------|--------|---------|
| **iCal (actual)** | ✅ Implementado | Solo disponibilidad (bloqueos). Latencia 15-30 min |
| **Connectivity API (nuevo)** | 📋 Planificado | Completo: reservas, precios, producto, contenido, mensajes, tiempo real |

> La integración iCal actual seguirá funcionando como **fallback** para propiedades que no estén conectadas vía API.

### Separación con conectores en BD

| Conector en BD | Propósito |
|----------------|-----------|
| `expedia_ical` (b448f1a3) | ✅ iCal import/export (Channel Manager actual) |
| `expedia_ota` (c189e389) | ✅ **Creado** — API completa Connectivity Partner |

---

## 2. Arquitectura de Expedia Group Connectivity

```
Expedia Group Ecosystem
├── Developer Hub (developers.expediagroup.com)
│   ├── Lodging Supply APIs
│   ├── GraphQL Explorer
│   ├── Sandbox Data Management
│   └── Tutorials & Launch Kits
├── Partner Central (apps.expediapartnercentral.com)
│   ├── Properties (propiedades listadas)
│   ├── Reservations (reservas)
│   ├── Revenue Management
│   └── Analytics & Reports
└── Lodging Supply APIs
    ├── XML APIs (legacy + core)
    │   ├── Availability and Rates API (XML)
    │   ├── Booking Notification API (XML)
    │   └── Booking Retrieval / Confirmation API (XML)
    ├── JSON APIs (RESTful)
    │   ├── Product API
    │   ├── Property API
    │   ├── Image API
    │   └── Deposit API
    └── GraphQL API (moderno)
        ├── Reservation Management
        ├── Product Management
        ├── Property Status
        ├── Messaging
        ├── Reviews
        ├── Compliance
        ├── Promotions
        └── Notifications (Webhooks)
```

### Conceptos Clave

- **Connectivity Partner**: Empresa certificada (PMS, Channel Manager, CRS) que gestiona propiedades en Expedia Group vía API
- **Partner Central**: Dashboard web de Expedia Group para hoteleros (similar al Extranet de Booking.com)
- **EQC Credentials**: Credenciales de API (prefijo "EQC") — username/password para autenticación
- **Expedia Property ID**: ID único de la propiedad en Expedia Group
- **Room Type ID**: ID del tipo de habitación (asignado por Expedia)
- **Rate Plan ID**: ID del plan tarifario (asignado por Expedia)
- **Point of Sale (POS)**: Marca donde el viajero realizó la reserva (Expedia, Hotels.com, Orbitz, etc.)
- **Expedia Collect**: Expedia cobra al viajero y paga al hotel (virtual card)
- **Hotel Collect**: El hotel cobra directamente al viajero
- **Virtual Card**: Tarjeta virtual que Expedia envía para reservas Expedia Collect
- **Transaction ID**: ID único generado por Expedia Group en cada respuesta (para troubleshooting)

---

## 3. Requisitos Previos

### 3.1. Para GO Admin (una sola vez)

| Requisito | Descripción |
|-----------|-------------|
| **Aplicar como Connectivity Partner** | Enviar formulario en [Developer Hub](https://developers.expediagroup.com/supply/lodging/contact) |
| **PCI Compliance** | Attestation de cumplimiento PCI DSS (obligatorio) |
| **License Agreement** | Aceptar [acuerdo de licencia](https://developers.expediagroup.com/supply/lodging/license) |
| **Consulta con equipo de conectividad** | Reunión con Technical Account Manager |
| **Desarrollo y testing** | Desarrollar, testear y soft launch |
| **Certificación** | Pasar certificación técnica por cada API |
| **Go Live** | Lanzamiento mundial tras aprobación |

### 3.2. Para cada Propiedad (Cliente de GO Admin)

| Requisito | Descripción |
|-----------|-------------|
| **Propiedad listada en Expedia Group** | La propiedad debe existir en Partner Central |
| **Expedia Property ID** | ID asignado por Expedia |
| **EQC Credentials** | Username/password provistos por Expedia para la propiedad |
| **Room Types y Rate Plans** | Configurados en Partner Central o vía Product API |

---

## 4. Credenciales y Autenticación

### 4.1. Métodos de Autenticación

Expedia Group soporta dos métodos según la API:

| Método | APIs | Descripción |
|--------|------|-------------|
| **Basic Auth** | XML APIs (AR, BN, BR/BC), Product API, Image API, Property API | Username:password encoded en Base64 |
| **OAuth2 (client_credentials)** | GraphQL API (Reservations, Product Mgmt, Messaging, Reviews, Compliance, Notifications, Promotions, Property Status) | Bearer token JWT |

### 4.2. Basic Authentication (XML + JSON APIs)

```
Authorization: Basic {base64(username:password)}
```

- Las credenciales son prefijadas con "EQC" (Expedia Quick Connect)
- Password debe tener ≥16 caracteres con al menos 3 de: mayúsculas, minúsculas, números, símbolos
- Símbolos prohibidos en password: `<`, `>`, `&`, `%`, `+`, `'`, `"`

### 4.3. OAuth2 Token-based (GraphQL API)

```
POST https://api.expediagroup.com/identity/oauth2/v3/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(username:password)}

grant_type=client_credentials
```

**Respuesta:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 1800
}
```

**Usar token:**

```
POST https://api.expediagroup.com/supply/lodging/graphql
Authorization: Bearer {access_token}
Content-Type: application/json
Accept: application/graphql-response+json
```

### 4.4. Best Practices para Tokens

- Cachear el access token en memoria y reutilizarlo
- Máximo 100 solicitudes de token cada 5 minutos
- Renovar proactivamente antes de la expiración (usar `expires_in` dinámicamente)
- No persistir token a disco — guardarlo solo en memoria
- Si se llama desde múltiples servidores, cada uno puede pedir su propio token
- No parsear el contenido del token (puede cambiar)

### 4.5. Credenciales para Vrbo

> Si se integran propiedades directamente en Vrbo además de Expedia, se necesita un token **separado** con credenciales Vrbo. El token de Expedia solo funciona con Expedia IDs.

### 4.6. Credenciales por Propiedad (en BD: `integration_credentials`)

| Campo | `credential_type` | Descripción |
|-------|-------------------|-------------|
| `eqc_username` | `eqc_username` | Username EQC de la propiedad |
| `eqc_password` | `eqc_password` | Password EQC de la propiedad |
| `property_id` | `property_id` | Expedia Property ID |

> El `access_token` OAuth2 se generará en runtime y se cacheará en memoria. No se persiste en BD.

### 4.7. Variables de Entorno (servidor GO Admin)

```env
# Expedia Group Connectivity API
EXPEDIA_EQC_USERNAME=EQC_xxx
EXPEDIA_EQC_PASSWORD=your_secure_password_16chars
EXPEDIA_ENVIRONMENT=test  # "test" o "production"
```

---

## 5. Base URLs y Formatos

### 5.1. URLs Base

| Servidor | URL | Uso |
|----------|-----|-----|
| **XML APIs** | `https://services.expediapartnercentral.com` | Availability & Rates, Booking Notification, Booking Retrieval/Confirmation |
| **JSON APIs** | `https://services.expediapartnercentral.com` | Product API, Image API, Property API, Deposit API |
| **GraphQL API** | `https://api.expediagroup.com/supply/lodging/graphql` | Reservation Mgmt, Product Mgmt, Messaging, Reviews, Compliance, Notifications, Promotions, Property Status |
| **OAuth2 Token** | `https://api.expediagroup.com/identity/oauth2/v3/token` | Obtener access token |

### 5.2. Formatos de Request/Response

| API | Formato | Descripción |
|-----|---------|-------------|
| **Availability and Rates** | XML | Schema propio de Expedia (XSD) |
| **Booking Notification** | XML | Schema propio de Expedia (XSD) |
| **Booking Retrieval/Confirmation** | XML | Schema propio de Expedia (XSD) |
| **Product API** | JSON | REST API |
| **Image API** | JSON | REST API |
| **Property API** | JSON | REST API |
| **Deposit API** | JSON | REST API |
| **GraphQL API** | JSON | GraphQL (queries + mutations) |

> **Encoding:** UTF-8 obligatorio para todos los request bodies (requerido para soportar nombres Unicode y solicitudes especiales en chino, japonés, coreano, etc.).

---

## 6. APIs Principales

### 6.1. Availability and Rates API (XML)

Gestión de inventario, precios y restricciones.

**Endpoint:** `POST /eqc/ar`

**Funcionalidades incluidas:**

| Funcionalidad | Descripción |
|---------------|-------------|
| Actualizar tarifas | Por property, room type, rate plan y rango de fechas |
| Actualizar disponibilidad | Número de habitaciones disponibles por room type |
| Restricciones | MinLOS, MaxLOS, closed-to-arrival, closed-to-departure, stop sell |
| Múltiples actualizaciones | Actualizar varios room types y rate plans simultáneamente |
| Modelos de precios | Per day, per day + LOS, occupancy-based, day-of-arrival |
| Sell Rates / Net Rates | Interfaz como tarifa bruta (sell) o neta (excluyendo comisión) |
| Hasta 2 años | Se puede configurar disponibilidad y precios hasta 2 años en adelante |
| Rate Change Indicator | Compatible con per day pricing y occupancy-based pricing |

**No incluido:**

- Inventario por rate plan (solo por room type)
- IDs internos del hotel (solo Expedia IDs)
- Tax remittance
- Contenido (nombres, descripciones, fotos)
- Políticas de depósito o cancelación
- Resort fees, cleaning fees, etc.

**Ejemplo XML — Actualizar disponibilidad y tarifa:**

```xml
POST https://services.expediapartnercentral.com/eqc/ar
Authorization: Basic {base64_credentials}
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<AvailRateUpdateRQ xmlns="http://www.expediaconnect.com/EQC/AR/2011/06">
  <Authentication username="EQCuser" password="EQCpass"/>
  <Hotel id="123456"/>
  <AvailRateUpdate>
    <DateRange from="2026-04-01" to="2026-04-30"/>
    <RoomType id="200001" closed="false">
      <Inventory totalInventoryAvailable="5"/>
      <RatePlan id="300001" closed="false">
        <Rate currency="COP">
          <PerDay rate="250000.00"/>
        </Rate>
        <Restrictions minLOS="2" maxLOS="14"
                      closedToArrival="false"
                      closedToDeparture="false"/>
      </RatePlan>
    </RoomType>
  </AvailRateUpdate>
</AvailRateUpdateRQ>
```

---

### 6.2. Booking Notification API (XML) — Push

Expedia Group **envía** reservas nuevas, modificaciones y cancelaciones directamente al PMS en tiempo real.

**Endpoint:** Expedia hace POST al endpoint configurado por el Connectivity Partner.

**Flujo:**

```
1. Viajero reserva en Expedia/Hotels.com/Vrbo/etc.
   ↓
2. Expedia Group envía POST con datos de la reserva al endpoint del partner
   ↓
3. GO Admin procesa:
   a) Crea/actualiza reserva en `reservations` (channel: 'expedia')
   b) Asigna espacio según mapeo room_type → space
   c) Registra huésped en `customers`
   d) Retorna confirmation number
   ↓
4. Si no hay respuesta exitosa → retry → fallback a email
```

**Datos incluidos en la notificación:**

| Campo | Descripción |
|-------|-------------|
| Reservation ID | ID único de la reserva en Expedia |
| Guest Name | Nombre del huésped (puede incluir Unicode) |
| Check-in / Check-out | Fechas de estancia |
| Room Type ID | ID del tipo de habitación (Expedia ID) |
| Rate Plan ID | ID del plan tarifario (Expedia ID) |
| Total Price | Precio total de la reserva |
| Virtual Card | Datos de pago (reservas Expedia Collect, requiere PCI) |
| Special Requests | Solicitudes especiales (free-text + coded) |
| Loyalty / Membership | Números de fidelización |
| Point of Sale | Marca donde se realizó la reserva |
| Status | new, modified, cancelled |
| Smoking Preference | Preferencia de fumador |
| Bed Type | Tipo de cama preferido |

> **IMPORTANTE**: Si Expedia no recibe respuesta exitosa, envía fallback por email a la propiedad. Las reservas enviadas por email no recibirán futuras modificaciones vía API.

---

### 6.3. Booking Retrieval / Booking Confirmation API (XML) — Pull

Alternativa pull-based para obtener reservas.

**Endpoints:**

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/eqc/br` | GET | Recuperar reservas pendientes (nuevas, modificadas, canceladas) |
| `/eqc/bc` | POST | Enviar confirmation number a Expedia |

**Flujo:**

```
1. GO Admin poll: GET /eqc/br (periódicamente)
   ↓
2. Expedia responde con reservas pendientes (XML)
   ↓
3. GO Admin procesa cada reserva:
   - Crea/actualiza en Supabase
   - Asigna espacio
   - Registra huésped
   ↓
4. POST /eqc/bc con confirmation number
   ↓
5. Expedia confirma y remueve de pendientes
```

**Requisitos:**

- XML debe cumplir con XSD de Expedia
- UTF-8 obligatorio
- TLS 1.2 requerido
- Basic Auth

> **Nota:** No se puede usar Booking Notification y Booking Retrieval/Confirmation al mismo tiempo. Se debe elegir uno de los dos métodos.

---

### 6.4. Reservation Management (GraphQL API) — Moderno

Capacidad moderna basada en GraphQL para gestión completa de reservas.

**Endpoint:** `POST https://api.expediagroup.com/supply/lodging/graphql`

**Capacidades:**

| Feature | Descripción |
|---------|-------------|
| **Reservation Delivery** | Recibir notificaciones automáticas de nuevas/modificadas/canceladas reservas |
| **Reservation Retrieval** | Consultar reservas por ID, check-in, checkout, status, etc. (465 días pasado, 500 días futuro) |
| **Reservation Update** | Cancelar, modificar, reembolsar reservas |
| **Confirmation Codes** | Actualizar números de confirmación |

**Ejemplo GraphQL — Consultar reservación:**

```graphql
query {
  property(id: "123456") {
    reservations(
      filter: {
        checkinDate: { from: "2026-04-01", to: "2026-04-30" }
        status: [BOOKED, STAYING]
      }
      pageSize: 50
    ) {
      elements {
        id
        status
        checkinDate
        checkoutDate
        primaryGuest {
          firstName
          lastName
          email
        }
        roomStays {
          roomTypeId
          ratePlanId
          amounts {
            totalAmount { value currency }
          }
        }
      }
      totalCount
      cursor
    }
  }
}
```

**Operaciones de actualización (mutations):**

| Mutation | Descripción |
|----------|-------------|
| `cancelReservation` | Cancelar reserva (sin penalidad antes de check-in, con/sin penalidad después) |
| `updateReservation` | Modificar noches (Hotel Collect: agregar/quitar; Expedia Collect: solo quitar) |
| `refundReservation` | Reembolsar montos (solo Expedia Collect) |
| `reconcileReservation` | Reconciliar reserva |

---

### 6.5. Product API (JSON)

Crear, leer y editar room types y rate plans sin usar Partner Central.

**Base URL:** `https://services.expediapartnercentral.com/products/v1/properties/{propertyId}`

| Operación | Endpoint | Descripción |
|-----------|----------|-------------|
| Listar room types | `GET /properties/{id}/roomTypes` | Obtener room types y rate plans |
| Crear room type | `POST /properties/{id}/roomTypes` | Crear nuevo tipo de habitación |
| Editar room type | `PUT /properties/{id}/roomTypes/{rtId}` | Modificar tipo de habitación |
| Crear rate plan | `POST /properties/{id}/roomTypes/{rtId}/ratePlans` | Crear plan tarifario |
| Editar rate plan | `PUT /properties/{id}/roomTypes/{rtId}/ratePlans/{rpId}` | Modificar plan tarifario |

---

### 6.6. Product Management (GraphQL API)

Alternativa GraphQL moderna para gestión de productos.

**Capacidades:**

- Crear, leer y editar room types
- Crear, leer y editar rate plans
- Gestionar configuración de productos
- Hasta 10 TPS por query/mutation

---

### 6.7. Property API (JSON)

Gestión de detalles de la propiedad.

**Base URL:** `https://services.expediapartnercentral.com/properties/v1/`

| Operación | Descripción |
|-----------|-------------|
| Obtener detalles | Información completa de la propiedad |
| Actualizar detalles | Modificar descripciones, facilidades, políticas |

---

### 6.8. Image API (JSON)

Gestión de fotos de la propiedad.

**Base URL:** `https://services.expediapartnercentral.com/properties/v1/{propertyId}/images`

| Operación | Descripción |
|-----------|-------------|
| Subir imagen | Subir nueva foto |
| Listar imágenes | Obtener fotos actuales |
| Eliminar imagen | Eliminar foto |

---

### 6.9. Messaging (GraphQL API)

Comunicación bidireccional con huéspedes antes, durante y después de la estancia.

**Capacidades:**

- Consultar conversaciones por propiedad o por ID
- Enviar mensajes a viajeros
- Webhooks para notificaciones en tiempo real
- Hasta 45 TPS por query/mutation

---

### 6.10. Reviews (GraphQL API)

Leer y responder reseñas de huéspedes.

- Hasta 50 TPS por query/mutation

---

### 6.11. Promotions (GraphQL API)

Crear y gestionar ofertas especiales y promociones.

- `promotions` query: hasta 20 TPS
- Otras operaciones: hasta 50 TPS

---

### 6.12. Notifications / Webhooks (GraphQL API)

Recibir notificaciones push en tiempo real para eventos.

- Hasta 10 TPS por query/mutation
- Configurar endpoints de webhook para recibir eventos

---

### 6.13. Compliance (GraphQL API)

Gestionar información regulatoria de las propiedades.

- `registration` query: hasta 30 TPS
- Otras operaciones: hasta 60 TPS

---

### 6.14. Deposit API (JSON)

Gestión de políticas de depósito.

- Configurar condiciones de depósito por propiedad

---

### 6.15. Property Status (GraphQL API)

Consultar estado y detalles de propiedades bajo demanda.

- `property` query: hasta 150 TPS

---

### 6.16. Sandbox Data Management API

Herramienta para gestionar datos de prueba en el sandbox.

---

## 7. Rate Limiting

### 7.1. GraphQL API

| Límite | Valor | Respuesta si excede |
|--------|-------|---------------------|
| **Request-based (global)** | 50 TPS | HTTP 429 (sin body) |
| **property query** | 150 TPS | HTTP 200 + error message |
| **Compliance (registration)** | 30 TPS | HTTP 200 + error message |
| **Compliance (otros)** | 60 TPS | HTTP 200 + error message |
| **Messaging** | 45 TPS | HTTP 200 + error message |
| **Notifications** | 10 TPS | HTTP 200 + error message |
| **Product Management** | 10 TPS | HTTP 200 + error message |
| **Promotions (query)** | 20 TPS | HTTP 200 + error message |
| **Promotions (otros)** | 50 TPS | HTTP 200 + error message |
| **Reservations (query)** | 30 TPS | HTTP 200 + error message |
| **Reservations (otros)** | 50 TPS | HTTP 200 + error message |
| **Reviews** | 50 TPS | HTTP 200 + error message |

### 7.2. XML / JSON APIs

| Endpoint | Límite | Nota |
|----------|--------|------|
| Availability & Rates | Varía | Expedia puede ajustar sin previo aviso |
| Booking Retrieval | Polling periódico | Seguir recomendaciones de Technical Account Manager |

### 7.3. Estrategias Anti-Rate-Limit

1. **Caching** — Cachear respuestas de datos que no cambian frecuentemente
2. **Espaciar requests** — Distribuir solicitudes en el tiempo
3. **Exponential backoff** — Reintentar con esperas incrementales
4. **Monitoreo** — Rastrear uso y mantenerse bajo el límite
5. **Optimizar código** — Evitar llamadas innecesarias
6. **Off-peak scheduling** — Programar tareas no urgentes en horas de menor tráfico

---

## 8. Comparativa iCal vs Connectivity API

| Funcionalidad | iCal (actual) | Connectivity API |
|---------------|:-------------:|:----------------:|
| Sincronizar disponibilidad | ✅ | ✅ |
| Evitar doble booking | ✅ | ✅ |
| Reservas completas (huésped, precio) | ❌ | ✅ |
| Gestión de precios y tarifas | ❌ | ✅ |
| Restricciones (min stay, stop sell) | ❌ | ✅ |
| Room types y rate plans | ❌ | ✅ |
| Contenido de propiedad | ❌ | ✅ |
| Fotos | ❌ | ✅ |
| Mensajería con huéspedes | ❌ | ✅ |
| Reviews y respuestas | ❌ | ✅ |
| Promociones y ofertas | ❌ | ✅ |
| Políticas de depósito | ❌ | ✅ |
| Compliance regulatorio | ❌ | ✅ |
| Webhooks (notificaciones push) | ❌ | ✅ |
| Latencia de sincronización | 15-30 min | Tiempo real |
| Requiere certificación | No | Sí |
| PCI Compliance | No | Sí (para datos de pago) |

---

## 9. Flujo Completo de Integración con GO Admin ERP

### 9.1. Flujo de Onboarding (una sola vez)

```
1. GO Admin envía formulario en Developer Hub
   ↓
2. Expedia Group evalúa PCI compliance y license agreement
   ↓
3. Reunión con equipo de conectividad (Technical Account Manager)
   ↓
4. GO Admin recibe EQC credentials de prueba
   ↓
5. Desarrollo e implementación de APIs
   ↓
6. Testing con test properties en producción (misma URL)
   ↓
7. Soft launch con propiedad real (7 días de monitoreo)
   ↓
8. Aprobación y go-live mundial
```

### 9.2. Flujo de Conexión por Propiedad

```
1. Propiedad ya listada en Expedia Group (Partner Central)
   ↓
2. Admin en GO Admin navega a Integraciones → Conexiones → Nueva
   ↓
3. Selecciona Expedia Group como proveedor
   ↓
4. Ingresa credenciales:
   - EQC Username
   - EQC Password
   - Expedia Property ID
   ↓
5. GO Admin valida credenciales (health-check)
   ↓
6. Se crea conexión en `integration_connections`
   ↓
7. GO Admin sincroniza datos iniciales:
   - Obtener room types y rate plans (Product API)
   - Mapear rooms de Expedia → spaces de GO Admin
   - Cargar disponibilidad y precios actuales
   ↓
8. Conexión activa: reservas llegan en tiempo real
```

### 9.3. Flujo de Reserva Entrante (Expedia → GO Admin)

#### Opción A: Booking Notification (Push — recomendado)

```
1. Viajero reserva en Expedia/Hotels.com/Orbitz/etc.
   ↓
2. Expedia Group hace POST al endpoint de GO Admin
   ↓
3. GO Admin procesa:
   a) Crea reserva en `reservations` (channel: 'expedia', pos: marca)
   b) Asigna espacio según mapeo room_type → space
   c) Registra huésped en `customers`
   d) Retorna confirmation number en response
   ↓
4. Si no hay respuesta exitosa:
   - Expedia reintenta varias veces
   - Fallback a email si no hay éxito
   ↓
5. Reserva visible en GO Admin PMS
```

#### Opción B: Booking Retrieval (Pull)

```
1. GO Admin poll: GET /eqc/br (periódicamente)
   ↓
2. Expedia responde con reservas pendientes
   ↓
3. GO Admin procesa cada reserva
   ↓
4. POST /eqc/bc con confirmation number
```

#### Opción C: Reservation Management (GraphQL — moderno)

```
1. Webhook notifica nueva reserva a GO Admin
   ↓
2. GO Admin consulta detalles: query { property(id) { reservations { ... } } }
   ↓
3. Procesa y confirma la reserva
```

### 9.4. Flujo de Actualización de Disponibilidad (GO Admin → Expedia)

```
1. Evento en GO Admin:
   - Nueva reserva directa
   - Check-in / Check-out
   - Bloqueo manual
   - Reserva de otro canal (Booking.com, Airbnb, etc.)
   ↓
2. Trigger detecta cambio de disponibilidad
   ↓
3. GO Admin calcula disponibilidad actualizada por room type
   ↓
4. POST /eqc/ar (Availability and Rates API)
   ↓
5. Expedia Group actualiza disponibilidad en todos sus puntos de venta
   ↓
6. Evita overbooking entre canales
```

### 9.5. Flujo de Actualización de Precios (GO Admin → Expedia)

```
1. Admin modifica tarifa en GO Admin (Revenue Management)
   ↓
2. GO Admin calcula precios por fecha, room type y rate plan
   ↓
3. POST /eqc/ar (Availability and Rates API)
   ↓
4. Expedia Group actualiza precios en todos sus puntos de venta
```

---

## 10. Base de Datos

### 10.1. Tablas Existentes (reutilizar)

| Tabla | Uso para Expedia Group |
|-------|----------------------|
| `reservations` | Reservas de Expedia (channel: 'expedia') |
| `reservation_spaces` | Asignación espacio ↔ reserva |
| `customers` | Datos del huésped |
| `spaces` | Espacios/habitaciones del PMS |
| `space_types` | Tipos de habitación |
| `channel_connections` | Conexión con Expedia (connection_type: 'api') |
| `integration_connections` | Conexión de integración |
| `integration_credentials` | Credenciales (EQC username/password, property_id) |

### 10.2. Tablas Nuevas (propuestas)

```sql
-- Mapeo de room types de Expedia ↔ space_types de GO Admin
CREATE TABLE expedia_room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES channel_connections(id) ON DELETE CASCADE,
  expedia_room_type_id text NOT NULL,      -- ID del room type en Expedia
  expedia_room_name text,                  -- Nombre en Expedia
  expedia_rate_plan_id text,               -- ID del rate plan en Expedia
  space_type_id uuid REFERENCES space_types(id),
  rate_plan_config jsonb DEFAULT '{}',     -- Config de tarifas (pricing model, etc.)
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(connection_id, expedia_room_type_id, expedia_rate_plan_id)
);

-- Log de sincronizaciones con Expedia Group
CREATE TABLE expedia_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES channel_connections(id),
  sync_type text NOT NULL,          -- 'reservation_push', 'reservation_pull', 'availability_push', 'rate_push', 'product_sync'
  direction text NOT NULL,          -- 'inbound', 'outbound'
  endpoint text,                    -- Endpoint llamado
  transaction_id text,              -- Transaction ID de Expedia (para troubleshooting)
  status text NOT NULL,             -- 'success', 'error', 'partial'
  items_processed integer DEFAULT 0,
  error_message text,
  request_payload text,
  response_payload text,
  created_at timestamptz DEFAULT now()
);

-- Reservas Expedia (datos adicionales específicos del canal)
CREATE TABLE expedia_reservation_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid REFERENCES reservations(id) ON DELETE CASCADE,
  expedia_reservation_id text NOT NULL UNIQUE, -- ID en Expedia
  expedia_property_id text NOT NULL,
  point_of_sale text,                  -- 'expedia', 'hotels.com', 'orbitz', etc.
  collect_type text,                   -- 'expedia_collect', 'hotel_collect'
  guest_requests text,                 -- Solicitudes especiales
  loyalty_number text,                 -- Número de fidelización
  virtual_card_info jsonb DEFAULT '{}', -- Info de tarjeta virtual (PCI compliant)
  commission_amount numeric,           -- Comisión de Expedia
  expedia_status text,                 -- booked, modified, cancelled, staying, checked_out
  confirmation_number text,            -- Número de confirmación del hotel
  raw_data jsonb DEFAULT '{}',         -- Datos crudos de la API
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## 11. Archivos a Crear

### 11.1. Servicios Backend

```
src/lib/services/integrations/expedia/
├── expediaTypes.ts              # Interfaces TypeScript
├── expediaConfig.ts             # URLs, endpoints, constantes
├── expediaAuthService.ts        # Auth management (Basic + OAuth2)
├── expediaReservationService.ts # Booking Notification/Retrieval, GraphQL reservations
├── expediaAvailabilityService.ts # Push disponibilidad y precios (AR API)
├── expediaProductService.ts     # Product API (room types, rate plans)
├── expediaContentService.ts     # Property API + Image API
├── expediaConnectionService.ts  # Gestión de conexiones
├── expediaXmlParser.ts          # Parser XML ↔ objetos GO Admin
└── index.ts                     # Re-exportaciones
```

### 11.2. API Routes

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/integrations/expedia/webhook` | POST | Recibir Booking Notifications de Expedia |
| `/api/integrations/expedia/poll-reservations` | POST | Poll de reservas (BR API) |
| `/api/integrations/expedia/push-availability` | POST | Enviar disponibilidad y precios (AR API) |
| `/api/integrations/expedia/sync-products` | POST | Sincronizar room types y rate plans |
| `/api/integrations/expedia/health-check` | POST | Verificar credenciales y conexión |
| `/api/integrations/expedia/list-connections` | GET | Listar conexiones activas |
| `/api/integrations/expedia/create-connection` | POST | Crear nueva conexión API |

### 11.3. UI Componentes

| Componente | Descripción |
|------------|-------------|
| **Wizard estándar** (`/integraciones/conexiones/nueva`) | Conexión Expedia integrada al wizard existente con campos `eqc_username`, `eqc_password`, `property_id` |
| `ExpediaSyncStatusCard.tsx` | Estado de sincronización y health-check por conexión |
| `ExpediaRoomMappingDialog.tsx` | Mapeo room types Expedia ↔ space types GO Admin |

---

## 12. Seguridad

1. **HTTPS obligatorio** — TLS 1.2 para todas las llamadas
2. **EQC credentials** — Solo en backend (nunca exponer en frontend, cookies o web storage)
3. **PCI DSS** — Obligatorio para manejar datos de tarjetas virtuales (Expedia Collect)
4. **PII Compliance** — Proteger datos personales de huéspedes
5. **Token management** — Cachear en memoria, renovar antes de expiración
6. **Transaction ID logging** — Guardar transaction-id de cada response para soporte con Expedia
7. **Password policy** — ≥16 caracteres, 3+ tipos de caracteres
8. **URL-based allowlist** — Si se filtran conexiones salientes, usar URL patterns (no IPs)
9. **UTF-8 encoding** — Obligatorio para soportar caracteres internacionales

---

## 13. Comisiones y Costos

| Concepto | Costo |
|----------|-------|
| Uso de la API | Gratuito (incluido en partnership) |
| Comisión por reserva | 15-20% promedio (varía por mercado, propiedad y modelo de cobro) |
| Certificación | Sin costo monetario (requiere tiempo de desarrollo) |
| PCI Compliance | Varía según proveedor de attestation |

### Modelos de Cobro

| Modelo | Descripción |
|--------|-------------|
| **Expedia Collect** | Expedia cobra al viajero → paga al hotel vía virtual card (menos comisión) |
| **Hotel Collect** | El hotel cobra directamente al viajero → paga comisión a Expedia |

> La comisión de Expedia Group se cobra directamente a la propiedad. GO Admin como Connectivity Partner no paga comisión adicional por las APIs.

---

## 14. Ambientes

| Ambiente | URLs | Credenciales | Propiedades |
|----------|------|--------------|-------------|
| **Test** | Mismas URLs de producción | EQC test credentials | Test properties |
| **Producción** | Mismas URLs | EQC production credentials | Real properties |

> Al igual que Booking.com, Expedia Group **usa las mismas URLs base** para test y producción. La separación se hace por credenciales y propiedades. Para testing se usan test properties en entorno de producción.

### Sandbox (GraphQL API)

- Sandbox Data Management API disponible para gestionar datos de prueba
- GraphQL Explorer interactivo disponible en Developer Hub

---

## 15. Plan de Implementación

### Fase A — Onboarding y Certificación (4-8 semanas)

1. Aplicar al Expedia Group Connectivity Partner Program
2. Obtener acceso y credenciales EQC
3. Revisar PCI compliance y license agreement
4. Reunión con Technical Account Manager
5. Crear test properties
6. Implementar autenticación (Basic + OAuth2)
7. Pasar certificación de Availability & Rates API
8. Pasar certificación de Booking Notification o Booking Retrieval

### Fase B — Integración Core (4-6 semanas)

1. `expediaAuthService.ts` — Autenticación (Basic Auth + OAuth2 token management)
2. `expediaXmlParser.ts` — Parser XML de Expedia
3. `expediaReservationService.ts` — Booking Notification/Retrieval + GraphQL
4. `expediaAvailabilityService.ts` — Push disponibilidad y precios (AR API)
5. `expediaProductService.ts` — Product API (room types, rate plans)
6. API Routes para webhook, poll, push
7. Webhook endpoint para Booking Notification
8. Triggers: push disponibilidad al crear/modificar reservas
9. UI: Wizard de conexión + mapeo de room types

### Fase C — Contenido y Fotos (2-3 semanas)

1. `expediaContentService.ts` — Property API + Image API
2. Sync descripciones, facilidades y políticas
3. Gestión de fotos desde GO Admin
4. UI: Panel de gestión de contenido por propiedad

### Fase D — Funcionalidades Avanzadas (3-4 semanas)

1. Messaging API (GraphQL) — Chat con huéspedes desde CRM inbox
2. Reviews API (GraphQL) — Leer y responder reseñas
3. Promotions API (GraphQL) — Crear ofertas especiales
4. Notifications/Webhooks (GraphQL) — Eventos en tiempo real
5. Product Management (GraphQL) — Gestión moderna de room types
6. Reservation Management (GraphQL) — Gestión completa de reservas

### Fase E — Optimización (2 semanas)

1. Dashboard consolidado multi-canal (Expedia + Booking + Airbnb + Direct)
2. Alertas automáticas (overbooking, baja disponibilidad)
3. Reportes comparativos entre canales
4. Optimización de performance (batch updates, caching)

---

## 16. Diferencias con Booking.com

| Aspecto | Expedia Group | Booking.com |
|---------|---------------|-------------|
| **Auth** | Basic Auth (XML/JSON) + OAuth2 (GraphQL) | OAuth2 client_credentials (Machine Account) |
| **Formato reservas** | XML (BN/BR) o GraphQL (moderno) | OTA XML + B.XML |
| **Entrega reservas** | Push (BN) o Pull (BR) o Webhook (GraphQL) | Pull (polling cada 20s) |
| **APIs modernas** | GraphQL (single endpoint) | JSON REST (múltiples endpoints) |
| **Producto/Rooms** | Product API (JSON) + GraphQL | OTA_HotelDescriptiveInfo (XML) |
| **Token duración** | ~30 min (renovable, hasta 100 req/5min) | ~10 min (renovable) |
| **Certificación** | Por API individual con Technical Account Manager | Por API individual |
| **Test** | Test properties (misma URL) | Test properties (misma URL) |
| **Comisión promedio** | 15-20% | 15% |
| **Puntos de venta** | 200+ sitios (Expedia, Hotels.com, Vrbo, Orbitz...) | 1 sitio (Booking.com) |
| **ID de propiedad** | Expedia Property ID | Hotel ID |
| **Credenciales** | EQC username/password | Machine Account client_id/secret |
| **Transaction tracking** | `transaction-id` header | RUID header |

---

## 17. Consideraciones Específicas para Colombia

| Aspecto | Detalle |
|---------|---------|
| **Moneda** | COP (Pesos Colombianos) — configurar en propiedad |
| **Impuestos** | IVA 19% — configurar en Partner Central |
| **Idioma** | Español — contenido en español para mercado local |
| **Zona horaria** | America/Bogota (UTC-5) — importante para fechas |
| **Regulación** | Registro Nacional de Turismo (RNT) requerido |
| **Facturación** | Expedia factura comisión directamente a la propiedad |
| **Modelo de cobro** | Expedia Collect es más común en Colombia |

---

## 18. Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| HTTP 401 | Credenciales inválidas o token expirado | Verificar EQC credentials, renovar token |
| HTTP 403 | Sin permisos para la propiedad | Verificar que la propiedad esté vinculada a las credenciales |
| HTTP 429 | Rate limit excedido | Implementar exponential backoff, respetar TPS limits |
| XML parse error | Formato incorrecto o no cumple XSD | Verificar UTF-8, schema XSD de Expedia |
| Fallback a email | No se responde a Booking Notification | Verificar endpoint, respuesta exitosa, SSL/TLS |
| Token expirado | OAuth2 token no renovado a tiempo | Implementar renovación proactiva basada en `expires_in` |
| Reservas no confirmadas | No se envía confirmation number | Implementar BC (Booking Confirmation) correctamente |
| Password rechazado | No cumple política de 16+ caracteres | Cambiar password cumpliendo la política |
| Unicode issues | Encoding incorrecto | Asegurar UTF-8 en todos los request/response bodies |

---

## 19. Notas Importantes

- **Compatibilidad iCal**: La integración iCal actual sigue como fallback para propiedades sin acceso API
- **No se acepta conexión directa de propiedades**: Solo vía Connectivity Partners (como GO Admin)
- **Booking Notification vs Booking Retrieval**: Elegir uno — no se pueden usar ambos simultáneamente
- **Expedia IDs obligatorios**: Las APIs usan IDs de Expedia (no IDs internos del hotel)
- **Multi-point-of-sale**: Una reserva puede venir de cualquiera de los 200+ sitios de Expedia Group
- **Virtual Cards (PCI)**: Reservas Expedia Collect incluyen virtual card — requiere PCI compliance
- **GraphQL moderno**: Expedia Group está migrando hacia GraphQL — preferir GraphQL para nuevas funcionalidades
- **Connectivity Partner Program**: Programa de beneficios exclusivos para top partners
- **Transaction ID**: Guardar siempre el `transaction-id` de cada response para soporte con Expedia
- **Changelog**: Revisar [updates](https://developers.expediagroup.com/supply/lodging/updates) regularmente

---

## 20. Referencias

- [Expedia Group Developer Hub — Lodging](https://developers.expediagroup.com/supply/lodging)
- [Documentation Hub](https://developers.expediagroup.com/supply/lodging/docs)
- [Availability and Rates API](https://developers.expediagroup.com/supply/lodging/docs/avail_and_rate_apis/avail_rates/getting_started/introduction)
- [Booking Notification API](https://developers.expediagroup.com/supply/lodging/docs/booking_apis/booking_notification/getting_started/introduction)
- [Booking Retrieval / Confirmation API](https://developers.expediagroup.com/supply/lodging/docs/booking_apis/booking_retrieval/getting_started/integration-overview-landing-page)
- [Reservation Management (GraphQL)](https://developers.expediagroup.com/supply/lodging/docs/booking_apis/reservations/getting_started/intro)
- [Product API](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/product/getting_started/introduction)
- [Property API](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/property/getting_started/introduction)
- [Image API](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/image/getting_started/introduction)
- [Messaging (GraphQL)](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/messaging/getting_started/intro)
- [Reviews (GraphQL)](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/reviews/getting_started/intro)
- [Promotions API](https://developers.expediagroup.com/supply/lodging/docs/avail_and_rate_apis/promotions/getting_started/intro)
- [Notifications / Webhooks](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/notifications/getting_started/intro)
- [Compliance (GraphQL)](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/compliance/getting_started/intro)
- [Property Status (GraphQL)](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/property_status/getting_started/intro)
- [Product Management (GraphQL)](https://developers.expediagroup.com/supply/lodging/docs/property_mgmt_apis/product_mgmt/getting_started/intro)
- [Sandbox Data Management](https://developers.expediagroup.com/supply/lodging/docs/developer_tools/sandbox/getting_started/intro)
- [GraphQL Explorer](https://developers.expediagroup.com/supply/lodging/docs/graphiql)
- [Connectivity Partner Program](https://developers.expediagroup.com/supply/lodging/cpp/overview)
- [What's New](https://developers.expediagroup.com/supply/lodging/updates)
- [Partner Central](https://apps.expediapartnercentral.com)
- [Contact](https://developers.expediagroup.com/supply/lodging/contact)
- [License Agreement](https://developers.expediagroup.com/supply/lodging/license)

---

## Estado

✅ **IMPLEMENTADO** — iCal Import/Export (Channel Manager)  
✅ **IMPLEMENTADO** — Provider + Conector OTA en BD (`integration_providers` / `integration_connectors`)  
✅ **IMPLEMENTADO** — Wizard de conexión (StepCredentials: property_id, eqc_username, eqc_password)  
✅ **IMPLEMENTADO** — Validación de credenciales en wizard (handleValidate)  
✅ **IMPLEMENTADO** — Guardado de credenciales en wizard (handleSave → 3 registros en integration_credentials)  
✅ **IMPLEMENTADO** — Botón "Expedia Group API" en Channel Manager Header  
✅ **IMPLEMENTADO** — Servicios backend: expediaConfig, expediaTypes, expediaAuthService, expediaConnectionService  
✅ **IMPLEMENTADO** — API Routes: health-check, list-connections, create-connection  
✅ **IMPLEMENTADO** — Servicios de reservas: expediaXmlParser, expediaReservationService  
✅ **IMPLEMENTADO** — Tablas BD: expedia_reservation_details, expedia_sync_logs  
✅ **IMPLEMENTADO** — API Route: poll-reservations  
✅ **IMPLEMENTADO** — Servicios de disponibilidad y tarifas: expediaAvailabilityService (AR API)  
✅ **IMPLEMENTADO** — Tabla BD: expedia_room_mappings  
✅ **IMPLEMENTADO** — API Route: push-availability (parcial + fullSync)  
✅ **IMPLEMENTADO** — Servicios de producto: expediaProductService (Room Types, Rate Plans, Property Info)  
✅ **IMPLEMENTADO** — API Routes: room-types, property-info  
📋 **PENDIENTE** — Onboarding como Connectivity Partner

### Archivos creados — Fase 3 (Backend Auth + Conexiones)

| Archivo | Propósito |
|---------|-----------|
| `src/lib/services/integrations/expedia/expediaTypes.ts` | Tipos TS, IDs de BD, interfaces de reservas/tarifas/producto |
| `src/lib/services/integrations/expedia/expediaConfig.ts` | URLs, endpoints, rate limits, helpers Basic Auth/OAuth2/GraphQL |
| `src/lib/services/integrations/expedia/expediaAuthService.ts` | Autenticación: Basic Auth (EQC) + OAuth2 tokens (GraphQL) |
| `src/lib/services/integrations/expedia/expediaConnectionService.ts` | CRUD conexiones, health-check, channel_connections |
| `src/lib/services/integrations/expedia/index.ts` | Barrel exports |
| `src/app/api/integrations/expedia/health-check/route.ts` | POST — verificar credenciales y acceso |
| `src/app/api/integrations/expedia/list-connections/route.ts` | GET — listar conexiones de una organización |
| `src/app/api/integrations/expedia/create-connection/route.ts` | POST — crear nueva conexión con credenciales |

### Archivos creados — Fase 4 (Reservas)

| Archivo | Propósito |
|---------|-----------|
| `src/lib/services/integrations/expedia/expediaXmlParser.ts` | Parser XML: BR response → objetos TS, builders para confirm y AR update |
| `src/lib/services/integrations/expedia/expediaReservationService.ts` | Poll BR API, procesar/modificar/cancelar reservas, confirmar, sync logs |
| `src/app/api/integrations/expedia/poll-reservations/route.ts` | POST — ejecutar poll de reservas |
| **Tablas BD** | `expedia_reservation_details` + `expedia_sync_logs` (migración aplicada) |

### Cambios recientes

**Fase 1-2 (2026-03-10):**
- **Actualizado** provider `expedia` en BD: `auth_type: basic`, metadata con endpoints GraphQL/OAuth2
- **Creado** conector `expedia_ota` en BD con capabilities: pull, push, realtime, webhooks, graphql
- **Agregado** override `expedia` en `PROVIDER_CREDENTIAL_OVERRIDES` (StepCredentials.tsx)
- **Agregado** validación Expedia en `handleValidate` del wizard (password ≥16 chars)
- **Agregado** guardado de 3 credenciales separadas en `handleSave` del wizard
- **Agregado** botón "Expedia Group API" en ChannelManagerHeader + redirección al wizard

**Fase 3 (2026-03-10):**
- **Creado** `expediaTypes.ts` — tipos completos (credenciales, reservas, tarifas, producto, health-check, sync)
- **Creado** `expediaConfig.ts` — endpoints AR/BR/BN/Product/Property/Image/GraphQL, rate limits, helpers
- **Creado** `expediaAuthService.ts` — Basic Auth + OAuth2 con token cache + retry con backoff
- **Creado** `expediaConnectionService.ts` — createConnection, getConnections, healthCheck, deactivate
- **Creado** 3 API routes: health-check, list-connections, create-connection

**Fase 4 (2026-03-11):**
- **Creadas** tablas `expedia_reservation_details` y `expedia_sync_logs` en Supabase
- **Creado** `expediaXmlParser.ts` — parser BR response, builder BookingConfirmXml y AvailabilityUpdateXml
- **Creado** `expediaReservationService.ts` — flujo completo: poll → parse → save → confirm
- **Creado** API route `poll-reservations` — POST para ejecutar poll manual/cron
- **Actualizado** `index.ts` con exports de expediaReservationService y expediaXmlParser

**Fase 5 (2026-03-11):**
- **Creada** tabla `expedia_room_mappings` en Supabase (mapeo room types/rate plans → space_types)
- **Creado** `expediaAvailabilityService.ts` — push AR API, sync completo, calculateAvailability/Rates, room mappings CRUD
- **Creado** API route `push-availability` — POST parcial + fullSync
- **Actualizado** `index.ts` con export de expediaAvailabilityService

**Fase 6 (2026-03-11):**
- **Creado** `expediaProductService.ts` — getRoomTypes, getRatePlans, getPropertyInfo, getFullPropertySummary (JSON REST + Basic Auth)
- **Creado** API route `room-types` — GET room types + rate plans
- **Creado** API route `property-info` — GET property info (simple + full summary)
- **Actualizado** `index.ts` con export de expediaProductService
