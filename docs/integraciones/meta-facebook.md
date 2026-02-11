# Integración Meta (Facebook / Instagram) – Catálogo, Pixel y Conversions API

> **Ref oficial:** https://developers.facebook.com/docs/  
> **Marketing API:** https://developers.facebook.com/docs/marketing-api/  
> **Catalog API:** https://developers.facebook.com/docs/marketing-api/catalog/  
> **Meta Pixel:** https://developers.facebook.com/docs/meta-pixel/  
> **Conversions API:** https://developers.facebook.com/docs/marketing-api/conversions-api/  
> **Graph API:** https://developers.facebook.com/docs/graph-api/  
> **Dashboard:** https://business.facebook.com/  
> **App Dashboard:** https://developers.facebook.com/apps/  
> **Fecha:** 2026-02-09

---

## 1. Resumen General

La integración de Meta permite a los clientes de GO Admin ERP:

| Funcionalidad            | Descripción                                                       |
|--------------------------|-------------------------------------------------------------------|
| **Catálogo de productos** | Sincronizar productos del inventario a Facebook Commerce Manager  |
| **Meta Pixel**            | Inyectar pixel de seguimiento en la web del cliente               |
| **Conversions API (CAPI)**| Enviar eventos server-side para mejor atribución de campañas      |
| **Facebook Ads**          | Crear campañas con productos del catálogo (Dynamic Ads)           |
| **Instagram Shopping**    | Etiquetar productos en publicaciones e historias de Instagram     |

### Separación con conectores existentes

| Conector existente    | ID                                     | Propósito              |
|----------------------|----------------------------------------|------------------------|
| `meta_instagram`     | `712707e4-613f-436c-9825-f3fbf2d37ed4` | Mensajería Instagram   |
| `meta_messenger`     | `f33b71cc-eb8f-4872-b93c-0f7278db70e3` | Mensajería Messenger   |
| **`meta_marketing`** | **(a crear)**                          | Catálogo + Pixel + CAPI |

> Los conectores de mensajería ya existen. Esta integración es **nueva y separada**: orientada a marketing, catálogo y tracking.

---

## 2. Arquitectura de Meta Business

```
Meta Business Suite
├── Business Manager (business_id)
│   ├── Ad Account (act_XXXXX)
│   ├── Facebook Page (page_id)
│   ├── Instagram Account (ig_user_id)
│   ├── Pixel (pixel_id)
│   ├── Catalog (catalog_id)
│   │   ├── Product Set
│   │   └── Products (items)
│   └── System User (access_token)
└── App (app_id + app_secret)
```

### Conceptos clave

- **Business Manager:** Contenedor de todos los activos de la empresa del cliente
- **System User:** Usuario de servicio con token de larga duración (~60 días, renovable)
- **Pixel:** Código JS que trackea eventos en la web
- **Catalog:** Colección de productos para Dynamic Ads e Instagram Shopping
- **CAPI:** API server-side para enviar eventos sin depender del browser

---

## 3. Credenciales Requeridas

| Variable            | Descripción                                           | Dónde obtenerla                              |
|--------------------|-------------------------------------------------------|----------------------------------------------|
| `access_token`     | Token de acceso (System User o Page Token)            | Business Settings → System Users → Tokens     |
| `pixel_id`         | ID del pixel de Meta                                  | Events Manager → Data Sources → Pixel         |
| `catalog_id`       | ID del catálogo de productos                          | Commerce Manager → Catalogs                   |
| `business_id`      | ID del Business Manager                               | Business Settings → Business Info              |
| `app_id`           | ID de la app de Facebook                              | App Dashboard → Settings → Basic               |
| `app_secret`       | Secreto de la app                                     | App Dashboard → Settings → Basic               |

> **Para GO Admin ERP se necesitan 4 credenciales principales:**
> `access_token`, `pixel_id`, `catalog_id`, `app_secret`

### Cómo obtener las credenciales paso a paso

#### 3.1. Crear App de Facebook

1. Ir a https://developers.facebook.com/apps/
2. Click **Create App** → Tipo: **Business**
3. Agregar productos: **Marketing API**, **Webhooks**
4. En **Settings → Basic**: copiar `App ID` y `App Secret`

#### 3.2. Crear System User y Token

1. Ir a https://business.facebook.com/settings/
2. **Users → System Users** → Add
3. Tipo: **Admin** (para acceso completo a catálogo)
4. Click **Generate Token** → seleccionar la app
5. Permisos requeridos:
   - `catalog_management` — Gestionar catálogo
   - `ads_management` — Gestionar anuncios
   - `pages_read_engagement` — Leer datos de página
   - `business_management` — Gestionar Business Manager
6. Copiar el **Access Token**

> ⚠️ El token de System User dura ~60 días. Se debe renovar periódicamente o usar tokens de larga duración.

#### 3.3. Crear Pixel

1. Ir a **Events Manager** → https://business.facebook.com/events_manager/
2. Click **Connect Data Sources** → **Web** → **Meta Pixel**
3. Nombrar el pixel → copiar el **Pixel ID**
4. (Opcional) Configurar **Conversions API** → copiar el token de acceso

#### 3.4. Crear Catálogo

1. Ir a **Commerce Manager** → https://business.facebook.com/commerce/
2. Click **Add Catalog** → Tipo: **E-commerce** (o según negocio)
3. Copiar el **Catalog ID**
4. Asignar al System User los permisos del catálogo

---

## 4. Autenticación – OAuth 2.0 y Tokens

### Token de System User (recomendado para server-side)

```
Authorization: Bearer {ACCESS_TOKEN}
```

No requiere OAuth flow. El token se genera manualmente en Business Settings.

### Exchange token corto → largo

```bash
curl "https://graph.facebook.com/v19.0/oauth/access_token?\
  grant_type=fb_exchange_token&\
  client_id={APP_ID}&\
  client_secret={APP_SECRET}&\
  fb_exchange_token={SHORT_LIVED_TOKEN}"
```

### Debug token (verificar validez)

```bash
curl "https://graph.facebook.com/v19.0/debug_token?\
  input_token={TOKEN_A_VERIFICAR}&\
  access_token={APP_ID}|{APP_SECRET}"
```

**Response:**

```json
{
  "data": {
    "app_id": "123456",
    "type": "USER",
    "is_valid": true,
    "expires_at": 1707408000,
    "scopes": ["catalog_management", "ads_management", "business_management"]
  }
}
```

---

## 5. API de Catálogo – Product Catalog

### URL Base

```
https://graph.facebook.com/v19.0/
```

### 5.1. Listar Catálogos del Business

```bash
curl "https://graph.facebook.com/v19.0/{BUSINESS_ID}/owned_product_catalogs?\
  access_token={TOKEN}"
```

### 5.2. Agregar Producto al Catálogo

```bash
curl -X POST "https://graph.facebook.com/v19.0/{CATALOG_ID}/products" \
  -H "Authorization: Bearer {TOKEN}" \
  -F "retailer_id=SKU-001" \
  -F 'data={
    "id": "SKU-001",
    "title": "Camiseta Premium",
    "description": "Camiseta de algodón premium",
    "availability": "in stock",
    "condition": "new",
    "price": "50000 COP",
    "link": "https://mitienda.goadmin.io/productos/1",
    "image_link": "https://storage.supabase.co/bucket/products/image.jpg",
    "brand": "Mi Marca",
    "category": "Ropa > Camisetas",
    "inventory": 100
  }'
```

### 5.3. Actualizar Producto

```bash
curl -X POST "https://graph.facebook.com/v19.0/{CATALOG_ID}/products" \
  -H "Authorization: Bearer {TOKEN}" \
  -F "retailer_id=SKU-001" \
  -F 'data={
    "title": "Camiseta Premium - Edición Limitada",
    "price": "45000 COP",
    "availability": "in stock"
  }' \
  -F "method=UPDATE"
```

### 5.4. Eliminar Producto

```bash
curl -X POST "https://graph.facebook.com/v19.0/{CATALOG_ID}/products" \
  -F "retailer_id=SKU-001" \
  -F "method=DELETE" \
  -H "Authorization: Bearer {TOKEN}"
```

### 5.5. Batch de Productos (hasta 5000 por request)

```bash
curl -X POST "https://graph.facebook.com/v19.0/{CATALOG_ID}/items_batch" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "method": "CREATE",
        "retailer_id": "SKU-001",
        "data": {
          "title": "Producto 1",
          "availability": "in stock",
          "price": "25000 COP",
          "image_link": "https://...",
          "link": "https://..."
        }
      },
      {
        "method": "UPDATE",
        "retailer_id": "SKU-002",
        "data": {
          "price": "30000 COP"
        }
      }
    ]
  }'
```

### 5.6. Campos del Producto (Mapeo GO Admin → Facebook)

| Campo Facebook      | Campo GO Admin ERP              | Requerido | Notas                          |
|--------------------|---------------------------------|-----------|--------------------------------|
| `id` / `retailer_id` | `products.sku`               | ✅        | Identificador único             |
| `title`            | `products.name`                 | ✅        | Máx 150 caracteres              |
| `description`      | `products.description`          | ✅        | Máx 5000 caracteres             |
| `availability`     | `products.status`               | ✅        | `in stock`, `out of stock`      |
| `condition`        | —                               | ✅        | `new`, `refurbished`, `used`    |
| `price`            | `product_prices.price`          | ✅        | Formato: `"50000 COP"`          |
| `link`             | URL del producto en la web      | ✅        | `https://{domain}/productos/{id}` |
| `image_link`       | `product_images.storage_path`   | ✅        | URL pública de la imagen        |
| `brand`            | `organizations.name`            | Recom.    | Marca del producto              |
| `category`         | `categories.name`               | Recom.    | Google Product Category          |
| `inventory`        | Calculado desde inventario      | Opcional  | Cantidad disponible             |
| `sale_price`       | Precio con descuento            | Opcional  | Formato: `"40000 COP"`          |
| `additional_image_link` | Imágenes secundarias       | Opcional  | Hasta 10 URLs                   |
| `gtin` / `barcode` | `products.barcode`             | Opcional  | Código de barras EAN/UPC        |

---

## 6. Meta Pixel – Tracking en la Web del Cliente

### 6.1. Código base del Pixel

```html
<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '{PIXEL_ID}');
  fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id={PIXEL_ID}&ev=PageView&noscript=1"/>
</noscript>
<!-- End Meta Pixel Code -->
```

### 6.2. Eventos estándar del Pixel

| Evento              | Cuándo disparar                           | Parámetros                            |
|--------------------|-------------------------------------------|---------------------------------------|
| `PageView`         | Cada carga de página                      | Automático con init                   |
| `ViewContent`      | Ver detalle de producto                   | `content_ids`, `content_type`, `value`, `currency` |
| `AddToCart`        | Agregar al carrito                        | `content_ids`, `content_type`, `value`, `currency` |
| `InitiateCheckout` | Iniciar checkout                          | `value`, `currency`, `num_items`      |
| `Purchase`         | Compra completada                         | `content_ids`, `value`, `currency`, `content_type` |
| `Search`           | Buscar productos                          | `search_string`, `content_category`   |
| `Lead`             | Enviar formulario de contacto             | `value`, `currency`                   |
| `CompleteRegistration` | Registro completado                  | `value`, `currency`                   |
| `Subscribe`        | Suscripción a membresía                   | `value`, `currency`, `predicted_ltv`  |
| `Schedule`         | Reservar/agendar                          | `value`, `currency`                   |

### 6.3. Ejemplo de evento en la web

```javascript
// Ver producto
fbq('track', 'ViewContent', {
  content_ids: ['SKU-001'],
  content_type: 'product',
  value: 50000,
  currency: 'COP',
  content_name: 'Camiseta Premium'
});

// Agregar al carrito
fbq('track', 'AddToCart', {
  content_ids: ['SKU-001'],
  content_type: 'product',
  value: 50000,
  currency: 'COP'
});

// Compra completada
fbq('track', 'Purchase', {
  content_ids: ['SKU-001', 'SKU-002'],
  content_type: 'product',
  value: 95000,
  currency: 'COP',
  num_items: 2
});
```

### 6.4. Inyección del Pixel en goadmin-websites

El proyecto `goadmin-websites` tiene el campo `website_settings.custom_scripts` (text) que puede almacenar scripts personalizados. También se puede:

1. **Opción A — Campo dedicado:** Agregar campo `facebook_pixel_id` a `website_settings`
2. **Opción B — custom_scripts:** Inyectar el pixel via `custom_scripts` existente
3. **Opción C — Desde integración:** Leer `pixel_id` de `integration_credentials` y renderizar en layout

**Recomendación: Opción C** — Desde la integración, así el pixel se activa/desactiva automáticamente con la conexión.

#### Flujo propuesto para inyección del Pixel

```
1. Admin activa integración Meta Marketing en GO Admin ERP
2. Guarda pixel_id en integration_credentials
3. goadmin-websites consulta integraciones activas de la organización
4. Si existe meta_marketing con pixel_id → inyecta <script> del pixel en <head>
5. Cada página dispara PageView automáticamente
6. Páginas de producto, carrito, checkout disparan eventos específicos
```

---

## 7. Conversions API (CAPI) – Eventos Server-Side

La Conversions API envía eventos directamente desde el servidor, complementando al Pixel.

### 7.1. Enviar evento

```bash
curl -X POST "https://graph.facebook.com/v19.0/{PIXEL_ID}/events" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "event_name": "Purchase",
      "event_time": 1707408000,
      "action_source": "website",
      "event_source_url": "https://mitienda.goadmin.io/checkout/success",
      "user_data": {
        "em": ["309a0a5c3e211326ae75ca18196d301a9bdbd1a882a4d2569511033da23f0abd"],
        "ph": ["254aa248acb47dd654ca3ea53f48c2c26d641d23d7e2e93a1ec56258df7674c4"],
        "client_ip_address": "123.45.67.89",
        "client_user_agent": "Mozilla/5.0...",
        "fbc": "fb.1.1554763741205.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
        "fbp": "fb.1.1558571054389.1098115397"
      },
      "custom_data": {
        "value": 95000,
        "currency": "COP",
        "content_ids": ["SKU-001", "SKU-002"],
        "content_type": "product",
        "num_items": 2
      }
    }]
  }'
```

### 7.2. Parámetros de user_data (hashing SHA-256)

| Campo               | Descripción                              | Hash requerido |
|---------------------|------------------------------------------|----------------|
| `em`                | Email del comprador                      | ✅ SHA-256      |
| `ph`                | Teléfono                                 | ✅ SHA-256      |
| `fn`                | Nombre                                   | ✅ SHA-256      |
| `ln`                | Apellido                                 | ✅ SHA-256      |
| `client_ip_address` | IP del navegador                         | ❌ Plain text   |
| `client_user_agent` | User agent del navegador                 | ❌ Plain text   |
| `fbc`               | Click ID de Facebook (cookie `_fbc`)     | ❌ Plain text   |
| `fbp`               | Browser ID de Facebook (cookie `_fbp`)   | ❌ Plain text   |
| `external_id`       | ID interno del usuario                   | ✅ SHA-256      |

> ⚠️ Los datos sensibles (email, teléfono, nombre) **DEBEN** hashearse con SHA-256 antes de enviar.

### 7.3. Deduplicación Pixel + CAPI

Para evitar contar eventos dobles, enviar el mismo `event_id` tanto en el Pixel (browser) como en CAPI (server):

```javascript
// Browser: Pixel
fbq('track', 'Purchase', { value: 95000, currency: 'COP' }, { eventID: 'order_12345' });
```

```json
// Server: CAPI
{
  "event_name": "Purchase",
  "event_id": "order_12345",
  ...
}
```

---

## 8. Webhooks de Meta

### Configuración

1. **App Dashboard** → Webhooks → Add Subscription
2. **Object:** `page` o `ad_account`
3. **Callback URL:** `https://{domain}/api/integrations/meta/webhook`
4. **Verify Token:** Un string secreto que tú defines

### Verificación del webhook (GET)

Facebook envía un GET para verificar:

```
GET /api/integrations/meta/webhook?
  hub.mode=subscribe&
  hub.verify_token=MI_TOKEN_SECRETO&
  hub.challenge=CHALLENGE_STRING
```

**Response:** Devolver `hub.challenge` como texto plano si `verify_token` coincide.

### Recepción de eventos (POST)

```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1707408000,
    "changes": [{
      "field": "feed",
      "value": { ... }
    }]
  }]
}
```

### Verificación de firma

Facebook firma los webhooks con `X-Hub-Signature-256`:

```
X-Hub-Signature-256: sha256=HASH
```

Verificar:
```javascript
const crypto = require('crypto');
const expectedSig = 'sha256=' + crypto
  .createHmac('sha256', APP_SECRET)
  .update(rawBody)
  .digest('hex');
const isValid = expectedSig === receivedSignature;
```

---

## 9. Ambientes

| Ambiente     | URL API                                    | Notas                            |
|-------------|--------------------------------------------|---------------------------------|
| Producción  | `https://graph.facebook.com/v19.0/`        | Token real, datos reales         |
| Test        | No hay sandbox separado                     | Usar catálogo de test y pixel de test |

> **Meta NO tiene sandbox como tal.** Se usa el mismo API. Para testing:
> - Crear un **Test Catalog** en Commerce Manager
> - Crear un **Test Pixel** que no afecte métricas reales
> - Usar **Test Events** en Events Manager → Test Events tab

---

## 10. Rate Limits

| Recurso                  | Límite                                  |
|-------------------------|-----------------------------------------|
| Catalog Batch API       | 5,000 items por batch, 100 batches/hora |
| Conversions API         | 1,000 eventos por request               |
| Graph API general       | 200 calls/user/hour (app-level varies)  |
| Webhooks                | Deben responder en < 20 segundos        |

---

## 11. Flujo Completo de Integración con GO Admin ERP

### 11.1. Flujo de Conexión (OAuth Automático)

```
1. Admin abre GO Admin ERP → Integraciones → Nueva Conexión
2. Selecciona provider "Meta" → connector "Meta Marketing"
3. Hace clic en "Conectar con Facebook" (botón OAuth)
4. ⚡ Flujo OAuth automático:
   a) GO Admin genera URL de OAuth con permisos requeridos
   b) Usuario se redirige a Facebook y autoriza GO Admin
   c) Facebook devuelve auth code al callback
   d) GO Admin intercambia code → short-lived token → long-lived token (~60 días)
   e) GO Admin obtiene business_id del Business Manager del usuario
   f) GO Admin crea conexión automáticamente (status: active)
   g) GO Admin crea catálogo "{orgName} - GO Admin"
   h) GO Admin crea pixel "{orgName} - GO Admin Pixel"
   i) GO Admin sincroniza TODOS los productos activos
   j) Guarda access_token, business_id, catalog_id, pixel_id
5. Usuario regresa a GO Admin con todo configurado

Variables de entorno requeridas (servidor de GO Admin):
- META_APP_ID — ID de la Meta App de GO Admin
- META_APP_SECRET — Secreto de la Meta App de GO Admin
- NEXT_PUBLIC_APP_URL — URL base de GO Admin (https://app.goadmin.io)

API Routes OAuth:
- POST /api/integrations/meta/oauth/authorize → Genera URL de OAuth
- GET  /api/integrations/meta/oauth/callback  → Recibe code, crea todo automático
```

> **Nota:** El usuario NO necesita crear una Meta App, ni System User, ni copiar credenciales.
> GO Admin tiene su propia Meta App registrada y maneja todo el flujo OAuth.

### 11.2. Sincronización en Tiempo Real

```
1. Admin/usuario modifica un producto (nombre, precio, status, imagen)
2. Trigger PostgreSQL (trg_meta_product_sync) detecta el cambio
3. Trigger registra evento 'catalog.product_changed' en integration_events
4. Cron job o Edge Function procesa eventos pendientes
5. Llama POST /api/integrations/meta/product-sync con product_ids
6. Backend obtiene datos actualizados y envía batch a Facebook Catalog API
7. Producto actualizado en Facebook en minutos

--- Triggers activos ---
- trg_meta_product_sync → INSERT/UPDATE/DELETE en products
- trg_meta_price_sync   → INSERT/UPDATE en product_prices
```

### 11.3. Flujo de Pixel

```
1. Setup automático ya creó el pixel y guardó pixel_id
2. goadmin-websites detecta la integración activa (pixel_id en credentials)
3. En el layout, inyecta el script del pixel en <head>
4. Cada página dispara PageView automáticamente
5. Páginas específicas disparan eventos:
   - /productos/[id]  → ViewContent
   - /carrito         → AddToCart (al agregar)
   - /checkout        → InitiateCheckout
   - /checkout/success → Purchase
   - /contacto        → Lead (al enviar form)
   - /reservas        → Schedule
6. (Opcional) CAPI: el backend envía Purchase server-side con dedup
```

### 11.4. Flujo de CAPI

```
1. web_orders recibe orden completada
2. Backend lee datos del pedido y del cliente
3. Hashea email/teléfono con SHA-256
4. Envía evento Purchase a CAPI con event_id = web_order.id
5. Facebook deduplica con el evento del Pixel (mismo event_id)
```

---

## 12. Tablas de BD Relevantes

### Tablas de GO Admin ERP (fuente de datos)

| Tabla               | Uso para Meta                                   |
|--------------------|-------------------------------------------------|
| `products`         | SKU, nombre, descripción, status, categoría      |
| `product_images`   | Imágenes del producto (image_link)               |
| `product_prices`   | Precio actual (price)                            |
| `categories`       | Nombre de categoría para el catálogo             |
| `product_tags`     | Tags para segmentación en Facebook               |
| `organizations`    | Nombre de marca (brand), dominio                 |
| `organization_domains` | URL base para links de productos             |

### Tablas de goadmin-websites (tracking)

| Tabla               | Uso para Meta                                   |
|--------------------|-------------------------------------------------|
| `website_settings` | `custom_scripts`, `analytics_id` para pixel      |
| `web_orders`       | Eventos Purchase para CAPI                       |
| `web_order_items`  | content_ids y cantidades para eventos             |

### Tablas de integraciones

| Tabla                      | Uso                                            |
|---------------------------|------------------------------------------------|
| `integration_connections` | Conexión activa de Meta Marketing               |
| `integration_credentials` | access_token, app_secret, business_id (manuales) + pixel_id, catalog_id (auto-creados) |
| `integration_events`      | Log de syncs de catálogo y eventos CAPI         |

---

## 13. Códigos de Error Comunes

| Código   | Nombre                          | Descripción                               |
|----------|---------------------------------|-------------------------------------------|
| 190      | `OAuthException`               | Token inválido o expirado                  |
| 100      | `Invalid parameter`            | Parámetro faltante o incorrecto            |
| 4        | `Too many calls`               | Rate limit excedido                        |
| 10      | `Permission denied`             | Token sin permisos necesarios              |
| 803      | `Duplicate post`               | Producto duplicado en catálogo             |
| 2635     | `Catalog product not found`    | Producto no existe en catálogo             |
| 1487930  | `Invalid image`                | URL de imagen no accesible o formato malo  |

---

## 14. Consideraciones de Seguridad

1. **NUNCA** exponer `app_secret` ni `access_token` en el frontend
2. **Solo** `pixel_id` va al navegador (en el script del pixel)
3. **Hashear** datos personales (email, teléfono) con SHA-256 antes de enviar a CAPI
4. **Verificar** firma de webhooks con `X-Hub-Signature-256`
5. **Renovar** tokens antes de expiración (~60 días para System User)
6. **HTTPS** obligatorio en todas las URLs (webhook, product links, image links)
7. **No enviar** datos sensibles innecesarios a Facebook

---

## 15. Diferencias con Otros Proveedores de Integraciones

| Aspecto              | Meta Marketing                   | Google Ads            | TikTok Ads           |
|---------------------|----------------------------------|-----------------------|----------------------|
| **Auth**             | OAuth 2.0 / System User token    | OAuth 2.0 + refresh   | OAuth 2.0            |
| **Token duración**   | ~60 días (renovable)             | 1 hora (refresh)      | ~24h (refresh)       |
| **Catálogo**         | Catalog API + batch              | Google Merchant Center | TikTok Catalog       |
| **Pixel/Tag**        | Meta Pixel (fbevents.js)         | gtag.js               | TikTok Pixel         |
| **Server events**    | Conversions API (CAPI)           | Server-to-server       | Events API           |
| **Formato precio**   | `"50000 COP"` (string)          | Micros (50000000000)  | Centavos (5000000)   |
| **Webhook firma**    | HMAC-SHA256 con app_secret       | N/A                   | HMAC-SHA256          |
| **Sandbox**          | No hay (usar test catalogs)      | Test accounts         | Sandbox mode         |

---

## 16. Plan de Implementación en GO Admin ERP

### Paso 1: BD

- **Provider:** `meta` ya existe (ID: `37bc26ea-1957-4baa-a6b4-1934b49e198a`)
- **Connector:** crear `meta_marketing` (nuevo, separado de messenger/instagram)
- **Credenciales:** 4 registros por conexión: `access_token`, `pixel_id`, `catalog_id`, `app_secret`

### Paso 2: Servicio Backend

Crear en `src/lib/services/integrations/meta/`:

| Archivo                | Contenido                                                       |
|-----------------------|------------------------------------------------------------------|
| `metaMarketingTypes.ts`   | Interfaces: credenciales, producto FB, evento CAPI, webhook  |
| `metaMarketingConfig.ts`  | Graph API URL, permisos, eventos, campo mappings              |
| `metaMarketingService.ts` | Token debug, catalog sync, CAPI events, webhook verify        |
| `index.ts`               | Re-exportaciones                                              |

### Paso 3: API Routes

| Ruta                                              | Método    | Descripción                              |
|---------------------------------------------------|-----------|------------------------------------------|
| `/api/integrations/meta/health-check`             | POST      | Verificar token (debug_token)            |
| `/api/integrations/meta/catalog-sync`             | POST      | Sincronizar productos al catálogo        |
| `/api/integrations/meta/send-event`               | POST      | Enviar evento via CAPI                   |
| `/api/integrations/meta/webhook`                  | GET/POST  | Verificar y recibir webhooks             |

### Paso 4: UI

- Agregar `meta` + connector `meta_marketing` a `PROVIDER_CREDENTIAL_OVERRIDES` en `StepCredentials.tsx`
- 4 campos: `access_token`, `pixel_id`, `catalog_id`, `app_secret`
- Validación: debug_token para verificar token
- Guardar credenciales en `integration_credentials`

### Paso 5: goadmin-websites (proyecto separado)

1. Crear API endpoint para consultar integración Meta activa por organización
2. En `layout.tsx`: si existe pixel_id → inyectar script del pixel en `<head>`
3. En páginas de productos: disparar `ViewContent`
4. En carrito: disparar `AddToCart`
5. En checkout completado: disparar `Purchase` + enviar a CAPI

---

## 17. Comisiones y Costos

| Concepto                    | Costo                                    |
|----------------------------|------------------------------------------|
| Catalog API                | Gratis                                   |
| Meta Pixel                 | Gratis                                   |
| Conversions API            | Gratis                                   |
| Facebook Ads (campañas)    | CPC/CPM según subasta (lo paga el cliente) |
| Instagram Shopping         | Gratis (setup), comisión solo si usa FB Checkout |

> La integración en sí es **100% gratuita**. El costo solo viene de las campañas de publicidad que el cliente decida correr.

---

## 18. Casos de Uso para Clientes de GO Admin ERP

| Módulo       | Caso de uso                                         | API Meta utilizada    |
|-------------|------------------------------------------------------|----------------------|
| **POS**     | Subir productos al catálogo para Dynamic Ads          | Catalog Batch API    |
| **POS**     | Trackear compras completadas                          | Pixel + CAPI         |
| **PMS**     | Publicar habitaciones/espacios como productos         | Catalog API          |
| **PMS**     | Trackear reservas completadas                         | Pixel (Schedule)     |
| **CRM**     | Crear audiencias custom desde eventos                 | Custom Audiences API |
| **CRM**     | Trackear registros y leads                            | Pixel (Lead)         |
| **Inventario** | Sync automático de stock y precios                 | Catalog Batch API    |
| **Finanzas** | Atribuir ingresos a campañas de Facebook             | CAPI (Purchase)      |
| **Web**     | SEO + Pixel en todas las páginas                      | Pixel (PageView)     |

---

## 19. Permisos de Facebook App Requeridos

| Permiso                    | Uso                                               |
|---------------------------|---------------------------------------------------|
| `catalog_management`      | CRUD productos en catálogo                        |
| `ads_management`          | Gestionar campañas (opcional)                     |
| `pages_read_engagement`   | Leer métricas de página                           |
| `business_management`     | Acceso a Business Manager y activos               |
| `pages_manage_metadata`   | Gestionar metadata de página                      |

---

## 20. Versión del Graph API

- **Versión actual recomendada:** `v19.0` (o `v20.0` si disponible)
- Facebook depreca versiones cada 2 años
- Siempre incluir versión en la URL: `https://graph.facebook.com/v19.0/`
- Revisar changelog: https://developers.facebook.com/docs/graph-api/changelog/

---

## 21. Resumen de Credenciales para `integration_credentials`

| `purpose`       | Tipo          | Ejemplo                                    | Uso                                |
|----------------|---------------|--------------------------------------------|------------------------------------|
| `access_token` | `oauth2`      | `EAABs...` (token largo)                   | Autenticación a Graph API          |
| `pixel_id`     | `api_key`     | `123456789012345`                          | Inyección del pixel en la web      |
| `catalog_id`   | `api_key`     | `987654321098765`                          | Sync de productos                  |
| `app_secret`   | `api_key`     | `abc123def456...`                          | Verificar webhooks + debug token   |
