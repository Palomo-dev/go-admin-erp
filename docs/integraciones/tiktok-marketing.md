# Integración TikTok Marketing – Publicidad y Catálogo para Clientes

> **IMPORTANTE:** Esta integración es para que los **clientes de GO Admin ERP** puedan  
> publicitar sus productos en TikTok, usar el TikTok Pixel para tracking de conversiones,  
> y sincronizar su catálogo de productos para TikTok Shopping / Dynamic Showcase Ads.

> **Ref oficial:** https://business-api.tiktok.com/portal/docs  
> **TikTok Ads Manager:** https://ads.tiktok.com/  
> **Events API:** https://business-api.tiktok.com/portal/docs?id=1771100865818625  
> **Catalog API:** https://business-api.tiktok.com/portal/docs?id=1740314628585474  
> **Fecha:** 2026-02-09

---

## 1. Visión General

TikTok for Business ofrece tres componentes clave para e-commerce:

| Componente | Propósito | Equivalente en Meta |
|-----------|----------|-------------------|
| **TikTok Pixel** | Tracking de conversiones en el sitio web (client-side) | Facebook Pixel |
| **Events API** | Envío de eventos server-side (S2S) | Conversions API (CAPI) |
| **Catalog Manager** | Feed de productos para anuncios dinámicos | Product Catalog |

### Diferencias clave vs Meta Marketing

| Aspecto | Meta (Facebook) | TikTok |
|---------|----------------|--------|
| **Base URL** | `graph.facebook.com/v19.0` | `business-api.tiktok.com/open_api/v1.3` |
| **Autenticación** | System User Token | OAuth 2.0 con `access_token` long-lived |
| **ID principal** | `business_id` | `advertiser_id` (= cuenta de anuncios) |
| **Pixel ID** | `pixel_id` | `pixel_code` |
| **Catálogo** | Product Catalog → batch items | Catalog → product file/feed |
| **Events** | CAPI (`/{pixel_id}/events`) | Events API (`/pixel/track/`) |
| **Hashing** | SHA-256 obligatorio | SHA-256 obligatorio |

---

## 2. Arquitectura de la API

### 2.1. Base URL

```
https://business-api.tiktok.com/open_api/v1.3
```

### 2.2. Autenticación

TikTok Business API usa **OAuth 2.0** con long-lived access tokens:

1. **Crear App** en https://business-api.tiktok.com/portal → obtener `app_id` y `secret`
2. **Obtener auth_code** vía URL de autorización del advertiser
3. **Intercambiar por access_token** vía `POST /oauth2/access_token/`
4. El token **no expira** a menos que sea revocado manualmente

```
POST /open_api/v1.3/oauth2/access_token/
{
  "app_id": "APP_ID",
  "secret": "APP_SECRET",
  "auth_code": "AUTH_CODE"
}
```

**Response:**
```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "access_token": "TOKEN_LARGO",
    "advertiser_ids": ["12345678901"]
  }
}
```

### 2.3. Headers Estándar

```
Access-Token: {access_token}
Content-Type: application/json
```

> **Nota:** TikTok usa el header `Access-Token` (no `Authorization: Bearer`).

---

## 3. TikTok Pixel

### 3.1. ¿Qué es?

El TikTok Pixel es un fragmento de JavaScript que se inyecta en el sitio web del cliente para:
- Trackear visitas y conversiones
- Crear audiencias de remarketing
- Optimizar delivery de anuncios

### 3.2. Crear Pixel via API

```
POST /open_api/v1.3/pixel/create/
Headers: Access-Token: {access_token}

{
  "advertiser_id": "ADVERTISER_ID",
  "pixel_name": "GO Admin - Mi Negocio Pixel"
}
```

**Response:**
```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "pixel_code": "CXXXXXXXXXXXXXXX"
  }
}
```

### 3.3. Listar Pixels Existentes

```
GET /open_api/v1.3/pixel/list/?advertiser_id=ADVERTISER_ID
Headers: Access-Token: {access_token}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "pixels": [
      {
        "pixel_code": "CXXXXXXXXXXXXXXX",
        "pixel_name": "Mi Pixel",
        "status": "active"
      }
    ]
  }
}
```

### 3.4. Inyección en el Sitio Web (goadmin-websites)

```html
<!-- TikTok Pixel Code -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
  ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
  ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
  for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
  ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
  ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
  ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
  ttq._o=ttq._o||{};ttq._o[e]=n||{};
  var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
  var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('PIXEL_CODE');
  ttq.page();
}(window, document, 'ttq');
</script>
```

### 3.5. Eventos Estándar del Pixel

| Evento | Trigger | Página |
|--------|---------|--------|
| `ViewContent` | Ver producto | `/productos/[id]` |
| `AddToCart` | Agregar al carrito | `/productos/[id]`, `/carrito` |
| `InitiateCheckout` | Iniciar checkout | `/checkout` |
| `PlaceAnOrder` / `CompletePayment` | Completar compra | `/checkout/success` |
| `Contact` | Enviar formulario | `/contacto` |
| `SubmitForm` | Enviar cualquier form | Cualquier página con form |
| `Search` | Buscar productos | `/buscar` |
| `Subscribe` | Suscripción | `/suscripcion` |

**Ejemplo de evento ViewContent:**
```javascript
ttq.track('ViewContent', {
  content_id: 'SKU-001',
  content_type: 'product',
  content_name: 'Camiseta Azul',
  quantity: 1,
  price: 29.99,
  value: 29.99,
  currency: 'COP'
});
```

**Ejemplo de evento CompletePayment:**
```javascript
ttq.track('CompletePayment', {
  content_id: 'SKU-001,SKU-002',
  content_type: 'product',
  content_name: 'Pedido #1234',
  quantity: 2,
  value: 150000,
  currency: 'COP'
});
```

---

## 4. Events API (Server-Side)

### 4.1. ¿Qué es?

La Events API permite enviar eventos de conversión directamente desde el servidor, sin depender del navegador. Es el equivalente de la Conversions API (CAPI) de Meta.

### 4.2. Endpoint

```
POST /open_api/v1.3/pixel/track/
Headers: Access-Token: {access_token}
Content-Type: application/json
```

### 4.3. Estructura del Evento

```json
{
  "pixel_code": "CXXXXXXXXXXXXXXX",
  "event": "CompletePayment",
  "event_id": "web_order_uuid_12345",
  "timestamp": "2026-02-09T14:30:00Z",
  "context": {
    "ad": {
      "callback": "TTCLID_VALUE"
    },
    "page": {
      "url": "https://mitienda.com/checkout/success",
      "referrer": "https://mitienda.com/checkout"
    },
    "user": {
      "external_id": "HASHED_CUSTOMER_ID",
      "email": "HASHED_EMAIL",
      "phone_number": "HASHED_PHONE",
      "ip": "192.168.1.1",
      "user_agent": "Mozilla/5.0..."
    },
    "user_agent": "Mozilla/5.0..."
  },
  "properties": {
    "contents": [
      {
        "content_id": "SKU-001",
        "content_type": "product",
        "content_name": "Camiseta Azul",
        "quantity": 1,
        "price": 29.99
      }
    ],
    "content_type": "product",
    "currency": "COP",
    "value": 29.99,
    "order_id": "ORD-2026-001"
  }
}
```

### 4.4. Batch de Eventos

```json
{
  "pixel_code": "CXXXXXXXXXXXXXXX",
  "batch": [
    {
      "event": "CompletePayment",
      "event_id": "evt_001",
      "timestamp": "2026-02-09T14:30:00Z",
      "context": { ... },
      "properties": { ... }
    },
    {
      "event": "ViewContent",
      "event_id": "evt_002",
      "timestamp": "2026-02-09T14:31:00Z",
      "context": { ... },
      "properties": { ... }
    }
  ]
}
```

### 4.5. Hashing de Datos Personales

Igual que Meta, TikTok requiere SHA-256 para datos personales:

```typescript
// Datos que DEBEN hashearse:
// - email → sha256(trim(lowercase(email)))
// - phone_number → sha256(trim(phone con +57))
// - external_id → sha256(customer_id)
```

### 4.6. Deduplicación

TikTok deduplica eventos entre Pixel y Events API usando `event_id`:
- Pixel: `ttq.track('CompletePayment', { event_id: 'order_123' })`
- Events API: `"event_id": "order_123"`
- Si ambos envían el mismo `event_id`, TikTok solo cuenta uno.

---

## 5. Catalog Manager

### 5.1. ¿Qué es?

El Catalog Manager permite subir un feed de productos para:
- **Dynamic Showcase Ads (DSA)**: Mostrar productos relevantes automáticamente
- **Collection Ads**: Mostrar catálogo en anuncios
- **TikTok Shop** (si disponible en el país)

### 5.2. Crear Catálogo

```
POST /open_api/v1.3/catalog/create/
Headers: Access-Token: {access_token}

{
  "bc_id": "BUSINESS_CENTER_ID",
  "catalog_name": "GO Admin - Mi Negocio"
}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "catalog_id": "CATALOG_ID_123"
  }
}
```

### 5.3. Listar Catálogos

```
GET /open_api/v1.3/catalog/list/?bc_id=BUSINESS_CENTER_ID
Headers: Access-Token: {access_token}
```

### 5.4. Subir Productos al Catálogo (Feed File)

TikTok soporta subir productos via archivo CSV/TSV/XML o via API de productos:

```
POST /open_api/v1.3/catalog/product/upload/
Headers: Access-Token: {access_token}

{
  "bc_id": "BUSINESS_CENTER_ID",
  "catalog_id": "CATALOG_ID_123",
  "products": [
    {
      "sku_id": "SKU-001",
      "title": "Camiseta Azul Premium",
      "description": "Camiseta de algodón 100% en color azul",
      "availability": "IN_STOCK",
      "condition": "NEW",
      "price": {
        "price": "29990",
        "currency": "COP"
      },
      "sale_price": {
        "sale_price": "24990",
        "currency": "COP"
      },
      "landing_page_url": "https://mitienda.com/productos/123",
      "image_link": "https://cdn.mitienda.com/img/camiseta-azul.jpg",
      "additional_image_link": [
        "https://cdn.mitienda.com/img/camiseta-azul-2.jpg"
      ],
      "brand": "Mi Marca",
      "google_product_category": "Apparel & Accessories > Clothing > Shirts",
      "item_group_id": "CAMISETAS"
    }
  ]
}
```

### 5.5. Campos del Producto TikTok

| Campo | Requerido | GO Admin Campo | Descripción |
|-------|----------|---------------|-------------|
| `sku_id` | ✅ | `products.sku` | Identificador único del producto |
| `title` | ✅ | `products.name` | Nombre del producto (máx 150 chars) |
| `description` | ✅ | `products.description` | Descripción (máx 5000 chars) |
| `availability` | ✅ | `products.status` → mapeo | `IN_STOCK`, `OUT_OF_STOCK`, `PREORDER` |
| `condition` | ✅ | `'NEW'` (default) | `NEW`, `REFURBISHED`, `USED` |
| `price` | ✅ | `product_prices.price` | Precio en centavos o con moneda |
| `landing_page_url` | ✅ | `https://{domain}/productos/{id}` | URL del producto |
| `image_link` | ✅ | `product_images.storage_path` (primary) | Imagen principal |
| `brand` | ✅ | `organizations.name` | Marca |
| `sale_price` | ❌ | Precio con descuento si aplica | Precio de oferta |
| `additional_image_link` | ❌ | `product_images.storage_path` (no primary) | Imágenes adicionales |
| `google_product_category` | ❌ | `categories.name` → mapeo | Categoría Google |
| `item_group_id` | ❌ | `categories.name` | Agrupación |

### 5.6. Mapeo de Disponibilidad

| GO Admin `status` | TikTok `availability` |
|-------------------|-----------------------|
| `active` | `IN_STOCK` |
| `inactive` | `OUT_OF_STOCK` |
| `draft` | `OUT_OF_STOCK` |
| `archived` | `OUT_OF_STOCK` |

---

## 6. Credenciales Necesarias

### 6.1. Credenciales del Cliente (3 manuales)

| Credencial | Propósito | Dónde obtener |
|-----------|----------|--------------|
| `access_token` | Autenticación API | TikTok Business Center → App → OAuth |
| `advertiser_id` | Identificar cuenta de anuncios | TikTok Ads Manager → Account Info |
| `app_secret` | Para verificar webhooks | TikTok Business API → App → Basic Info |

### 6.2. Credenciales Auto-Generadas (2 automáticas)

| Credencial | Propósito | Creado por |
|-----------|----------|-----------|
| `pixel_code` | ID del pixel creado | GO Admin via `POST /pixel/create/` |
| `catalog_id` | ID del catálogo creado | GO Admin via `POST /catalog/create/` |

### 6.3. Credenciales en BD (`integration_credentials`)

| `purpose` | Tipo | Origen |
|-----------|------|--------|
| `access_token` | Manual | Usuario ingresa en wizard |
| `app_secret` | Manual | Usuario ingresa en wizard |
| `advertiser_id` | Manual | Usuario ingresa en wizard |
| `pixel_code` | Auto | GO Admin crea via API |
| `catalog_id` | Auto | GO Admin crea via API |

---

## 7. Rate Limits

| Endpoint | Límite |
|---------|--------|
| General | 10 requests/segundo por app |
| Catalog Product Upload | 20 productos por request, 600/minuto |
| Events API | 500 eventos por batch, 1000 requests/minuto |
| Pixel Create | 50/día por advertiser |
| Reporting | 10 requests/minuto |

---

## 8. Eventos Estándar Completos

### 8.1. Eventos de E-Commerce

| Evento | Descripción | Propiedades Clave |
|--------|------------|-------------------|
| `ViewContent` | Ver un producto | `content_id`, `content_name`, `value`, `currency` |
| `AddToCart` | Agregar al carrito | `content_id`, `content_name`, `quantity`, `value`, `currency` |
| `AddToWishlist` | Agregar a favoritos | `content_id`, `content_name` |
| `InitiateCheckout` | Iniciar checkout | `content_id`, `value`, `currency`, `quantity` |
| `AddPaymentInfo` | Ingresar info de pago | `content_id`, `value`, `currency` |
| `PlaceAnOrder` | Colocar pedido | `content_id`, `value`, `currency`, `quantity` |
| `CompletePayment` | Pago completado | `content_id`, `value`, `currency`, `quantity`, `order_id` |

### 8.2. Eventos de Engagement

| Evento | Descripción |
|--------|------------|
| `Contact` | Contactar al negocio |
| `SubmitForm` | Enviar formulario |
| `Subscribe` | Suscribirse |
| `Search` | Buscar en el sitio |
| `ClickButton` | Click en CTA |

---

## 9. Mapeo GO Admin → TikTok

### 9.1. Tablas del ERP (fuente de datos)

| Tabla GO Admin | Uso para TikTok |
|---------------|----------------|
| `products` | SKU, nombre, descripción, status |
| `product_images` | image_link, additional_image_link |
| `product_prices` | price, sale_price |
| `categories` | google_product_category, item_group_id |
| `organizations` | brand |
| `organization_domains` | landing_page_url base |

### 9.2. Tablas Web (goadmin-websites)

| Tabla | Uso para TikTok |
|-------|----------------|
| `website_settings` | `custom_scripts` para inyectar pixel, `analytics_id` |
| `web_orders` | Eventos CompletePayment, customer_email/phone para hashing |
| `web_order_items` | content_ids, quantities, prices para eventos |

### 9.3. Tablas de Integraciones

| Tabla | Uso |
|-------|-----|
| `integration_providers` | Provider `tiktok` |
| `integration_connectors` | Connector `tiktok_marketing` |
| `integration_connections` | Conexión activa por organización |
| `integration_credentials` | access_token, app_secret, advertiser_id, pixel_code, catalog_id |
| `integration_events` | Log de syncs y eventos enviados |

---

## 10. Flujo Completo de Integración

### 10.1. Flujo de Conexión (OAuth Automático)

```
1. Admin abre GO Admin ERP → Integraciones → Nueva Conexión
2. Selecciona provider "TikTok" → connector "TikTok Marketing"
3. Hace clic en "Conectar con TikTok" (botón OAuth)
4. ⚡ Flujo OAuth automático:
   a) GO Admin genera URL de OAuth con permisos requeridos
   b) Usuario se redirige a TikTok Business y autoriza GO Admin
   c) TikTok devuelve auth_code al callback
   d) GO Admin intercambia auth_code → access_token (long-lived, no expira)
   e) GO Admin obtiene advertiser_id de la respuesta del token
   f) GO Admin crea conexión automáticamente (status: active)
   g) GO Admin crea pixel "{orgName} - GO Admin Pixel"
   h) GO Admin crea catálogo "{orgName} - GO Admin"
   i) GO Admin sincroniza TODOS los productos activos
   j) Guarda access_token, app_secret, advertiser_id, pixel_code, catalog_id
5. Usuario regresa a GO Admin con todo configurado

Variables de entorno requeridas (servidor de GO Admin):
- TIKTOK_APP_ID — ID de la TikTok App de GO Admin
- TIKTOK_APP_SECRET — Secreto de la TikTok App de GO Admin
- NEXT_PUBLIC_APP_URL — URL base de GO Admin (https://app.goadmin.io)

API Routes OAuth:
- POST /api/integrations/tiktok/oauth/authorize → Genera URL de OAuth
- GET  /api/integrations/tiktok/oauth/callback  → Recibe auth_code, crea todo automático
```

> **Nota:** El usuario NO necesita crear una TikTok App, ni copiar credenciales manualmente.
> GO Admin tiene su propia TikTok App registrada y maneja todo el flujo OAuth.

### 10.2. Sincronización en Tiempo Real

```
1. Admin/usuario modifica un producto (nombre, precio, status, imagen)
2. Trigger PostgreSQL (trg_tiktok_product_sync) detecta el cambio
3. Trigger registra evento 'catalog.product_changed' en integration_events
4. API POST /api/integrations/tiktok/product-sync procesa cambios
5. Backend transforma datos y envía a TikTok Catalog API
6. Producto actualizado en TikTok en minutos

--- Reutiliza triggers existentes ---
- trg_meta_product_sync → ya registra eventos para TODAS las integraciones activas
- La API de product-sync detecta qué integraciones están activas y envía a cada una
```

### 10.3. Flujo de Pixel

```
1. Setup automático ya creó el pixel y guardó pixel_code
2. goadmin-websites detecta la integración activa (pixel_code en credentials)
3. En el layout, inyecta el script del TikTok Pixel en <head>
4. Cada página dispara ttq.page() automáticamente
5. Páginas específicas disparan eventos:
   - /productos/[id]  → ViewContent
   - /carrito         → AddToCart
   - /checkout        → InitiateCheckout
   - /checkout/success → CompletePayment
   - /contacto        → Contact
   - /buscar          → Search
6. (Complemento) Events API: el backend envía CompletePayment server-side con dedup
```

### 10.4. Flujo de Events API (Server-Side)

```
1. web_orders recibe orden completada
2. Backend lee datos del pedido y del cliente
3. Hashea email/teléfono con SHA-256
4. Envía evento CompletePayment a Events API con event_id = web_order.id
5. TikTok deduplica con el evento del Pixel (mismo event_id)
6. Registra el evento en integration_events
```

---

## 11. Estructura de Archivos

```
src/lib/services/integrations/tiktok/
├── tiktokMarketingTypes.ts      # Interfaces y tipos TypeScript
├── tiktokMarketingConfig.ts     # Constantes, URLs, mapeos
├── tiktokMarketingService.ts    # Servicio principal (CRUD + sync)
└── index.ts                     # Re-exports

src/app/api/integrations/tiktok/
├── health-check/route.ts        # Verificar access_token
├── setup/route.ts               # Setup automático (pixel + catálogo + sync)
├── catalog-sync/route.ts        # Sync completo de catálogo
├── product-sync/route.ts        # Sync incremental (tiempo real)
├── send-event/route.ts          # Enviar evento a Events API
└── webhook/route.ts             # Recibir webhooks de TikTok

docs/integraciones/
└── tiktok-marketing.md          # Este documento
```

---

## 12. Configuración en TikTok Business Center

### Paso a paso para el cliente:

1. **Crear cuenta** en https://ads.tiktok.com/ (TikTok Ads Manager)
2. **Crear Business Center** en https://business.tiktok.com/
3. **Crear App** en https://business-api.tiktok.com/portal → Developer → My Apps
   - Tipo: **Business**
   - Scopes: `Pixel Management`, `Catalog Management`, `Ad Account Management`
4. **Obtener OAuth token:**
   - En la App, ir a "Authorized Accounts"
   - El advertiser autoriza la app
   - Se genera un `auth_code`
   - GO Admin intercambia por `access_token` (no expira)
5. **Anotar 3 datos:**
   - `access_token` (del paso anterior)
   - `app_secret` (App Dashboard → Basic Info)
   - `advertiser_id` (Ads Manager → Account Info)
6. **Ingresar en GO Admin** → Integraciones → Nueva Conexión → TikTok Marketing

---

## 13. Códigos de Error Comunes

| Código | Nombre | Descripción |
|--------|--------|-------------|
| 40001 | `Access token is invalid` | Token expirado o revocado |
| 40002 | `Insufficient permissions` | Falta scope/permiso |
| 40100 | `Advertiser not found` | advertiser_id incorrecto |
| 40700 | `Rate limit exceeded` | Demasiadas requests |
| 50001 | `Internal server error` | Error interno de TikTok |
| 51001 | `Pixel not found` | pixel_code incorrecto |
| 52001 | `Catalog not found` | catalog_id incorrecto |
| 52102 | `Product validation failed` | Datos del producto inválidos |

---

## 14. Seguridad

### 14.1. Almacenamiento de Credenciales

- `access_token` y `app_secret` se guardan en `integration_credentials.secret_ref`
- Nunca se exponen en el frontend
- Se transmiten solo via HTTPS

### 14.2. Verificación de Webhooks (si aplica)

TikTok no usa firma HMAC para webhooks como Meta. En su lugar:
- Verifica IP de origen (rangos de TikTok)
- Valida estructura del payload
- Opcionalmente usa un `verify_token` custom

### 14.3. Hashing de Datos

```typescript
// Todos los datos personales DEBEN hashearse con SHA-256 antes de enviar:
import crypto from 'crypto';

function hashSHA256(value: string): string {
  return crypto.createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

// Ejemplo:
// email: hashSHA256('usuario@email.com')
// phone: hashSHA256('+573001234567')
// external_id: hashSHA256('customer_uuid')
```

---

## 15. Comparativa Completa: Meta vs TikTok

| Feature | Meta Marketing | TikTok Marketing |
|---------|---------------|-----------------|
| **Crear Pixel** | `POST /{business_id}/adspixels` | `POST /pixel/create/` |
| **Listar Pixels** | `GET /{business_id}/adspixels` | `GET /pixel/list/` |
| **Crear Catálogo** | `POST /{business_id}/owned_product_catalogs` | `POST /catalog/create/` |
| **Subir Productos** | `POST /{catalog_id}/items_batch` | `POST /catalog/product/upload/` |
| **Enviar Evento** | `POST /{pixel_id}/events` | `POST /pixel/track/` |
| **Batch Eventos** | En `data[]` array | En `batch[]` array |
| **Auth Header** | `Authorization: Bearer TOKEN` | `Access-Token: TOKEN` |
| **Token Expira** | ~60 días (System User) | No expira (hasta revocar) |
| **Max Batch Size** | 5000 productos | 20 productos/request |
| **Dedup Key** | `event_id` | `event_id` |

---

## 16. Notas de Implementación

### 16.1. Reutilización de Código

- El mapeo de productos (`getProductsForSync`) es compartido con Meta
- Solo cambia la transformación final (formato Facebook vs formato TikTok)
- Los triggers de BD ya existen y detectan cambios para TODAS las integraciones activas
- La API `product-sync` debe iterar sobre todas las conexiones activas de marketing

### 16.2. Consideraciones para Colombia

- TikTok Ads está disponible en Colombia
- Moneda: COP (código ISO: `COP`)
- Formato de teléfono para hashing: `+57XXXXXXXXXX`
- TikTok Shop NO está disponible en Colombia aún (solo Catalog Ads)

### 16.3. Limitaciones Conocidas

- El Catalog Upload de TikTok es más limitado que Meta (20 productos/request vs 5000)
- No hay API para crear Business Center automáticamente
- Los webhooks de TikTok son menos maduros que los de Meta
- El pixel de TikTok no soporta todos los parámetros avanzados de Meta
