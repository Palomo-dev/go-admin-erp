# Integración Google Ads – API de Publicidad y Conversiones

> **Tipo:** Plataforma de publicidad digital (Search, Display, Shopping, Video, Performance Max)  
> **Proveedor:** Google (Alphabet)  
> **Cobertura:** Global  
> **API Reference:** https://developers.google.com/google-ads/api/reference/rpc/latest  
> **REST Reference:** https://developers.google.com/google-ads/api/rest/reference/rest  
> **Quick Start:** https://developers.google.com/google-ads/api/docs/get-started/make-first-call  
> **OAuth 2.0:** https://developers.google.com/google-ads/api/docs/oauth/overview  
> **Google Cloud Console:** https://console.cloud.google.com  
> **Google Ads UI:** https://ads.google.com  
> **API Center:** https://ads.google.com/aw/apicenter  
> **API Version actual:** v23 (2026)  
> **Fecha:** 2026-02-23

---

## 1. Resumen General

Google Ads es la plataforma de publicidad digital más grande del mundo. La integración con GO Admin ERP permite:

| Funcionalidad                      | Descripción                                                              |
|------------------------------------|--------------------------------------------------------------------------|
| **Conversion Tracking**            | Registrar compras, reservas y leads como conversiones en Google Ads      |
| **Offline Conversions**            | Subir conversiones offline (ventas POS, pagos CxC) para optimizar pujas |
| **Enhanced Conversions**           | Enviar datos hasheados (email, teléfono) para mejor atribución          |
| **Customer Match**                 | Crear audiencias personalizadas desde listas de clientes del CRM        |
| **Remarketing Lists**              | Audiencias de remarketing basadas en comportamiento                     |
| **Campaign Management**            | Consultar métricas de campañas, ad groups y keywords                    |
| **Google Tag (gtag.js)**           | Inyectar tag de seguimiento en la web del cliente                       |
| **Performance Max**                | Campañas automatizadas multi-canal con datos de conversión              |

### Formas de integración

| Tipo                    | Descripción                                                         |
|-------------------------|---------------------------------------------------------------------|
| **Google Ads API (REST)** | API completa para gestión programática (la que usaremos)          |
| **Google Tag (gtag.js)** | JavaScript de tracking en el navegador                             |
| **Google Tag Manager**  | Contenedor de tags sin código (alternativa)                         |
| **Google Ads Scripts**  | Automatización dentro de la UI de Google Ads (JavaScript)           |
| **Google Ads Editor**   | App de escritorio para gestión masiva (no API)                      |

> Para GO Admin ERP usamos **Google Ads API (REST)** para conversiones offline + **gtag.js** para tracking web + **Enhanced Conversions** para mejor atribución.

---

## 2. Arquitectura de Google Ads

```
Google Cloud Console
├── Project (project_id)
│   ├── OAuth 2.0 Credentials
│   │   ├── Client ID (client_id)
│   │   ├── Client Secret (client_secret)
│   │   └── Service Account Key (JSON)
│   └── Google Ads API (habilitada)
│
Google Ads
├── Manager Account (MCC) ← Donde se obtiene el developer_token
│   ├── Client Account 1 (customer_id: 123-456-7890)
│   │   ├── Campaigns
│   │   ├── Ad Groups
│   │   ├── Conversion Actions
│   │   ├── Remarketing Lists
│   │   └── Customer Match Lists
│   └── Client Account 2
│       └── ...
```

### Conceptos clave

- **Manager Account (MCC):** Cuenta de administrador que gestiona otras cuentas de Google Ads. Aquí se obtiene el developer token.
- **Client Account:** La cuenta de Google Ads del cliente sobre la que se ejecutan las API calls.
- **Customer ID:** Número de 10 dígitos que identifica una cuenta (ej: `123-456-7890`). En la API se envía sin guiones: `1234567890`.
- **Developer Token:** Token alfanumérico de 22 caracteres que identifica la app ante los servidores de Google Ads API. Se requiere en cada llamada.
- **OAuth 2.0 Access Token:** Token de autenticación de corta duración (~1 hora) obtenido vía refresh token.
- **Refresh Token:** Token de larga duración para obtener nuevos access tokens sin re-autorizar.
- **Conversion Action:** Definición de una acción de conversión (compra, lead, reserva, etc.) con su ID y configuración.
- **GAQL (Google Ads Query Language):** Lenguaje de consulta propio para reports y búsquedas.

---

## 3. Requisitos Previos

### 3.1. Para GO Admin (una sola vez)

| Requisito                        | Descripción                                                           |
|----------------------------------|-----------------------------------------------------------------------|
| **Google Cloud Project**         | Proyecto en console.cloud.google.com con Google Ads API habilitada   |
| **OAuth 2.0 Credentials**       | Client ID + Client Secret (tipo Web Application)                     |
| **Google Ads Manager Account**   | MCC para obtener developer token                                     |
| **Developer Token**              | Obtenido en API Center del MCC (requiere aprobación de Google)       |
| **Servidor con HTTPS**           | Para OAuth callback y webhooks                                       |

### 3.2. Para cada Cliente de GO Admin

| Requisito                        | Descripción                                                           |
|----------------------------------|-----------------------------------------------------------------------|
| **Cuenta de Google Ads**         | Cuenta del cliente con campañas activas (o nueva)                    |
| **Acceso de administrador**      | El cliente debe autorizar GO Admin vía OAuth                         |
| **Conversion Actions**           | Crear acciones de conversión en la cuenta del cliente                 |
| **Google Tag (opcional)**        | Si tiene web y quiere tracking de navegador                          |

---

## 4. Credenciales Requeridas

### 4.1. Variables de Entorno (servidor GO Admin)

| Variable                      | Descripción                                              | Dónde obtenerla                               |
|-------------------------------|----------------------------------------------------------|-----------------------------------------------|
| `GOOGLE_ADS_CLIENT_ID`       | Client ID de OAuth 2.0                                   | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_ADS_CLIENT_SECRET`   | Client Secret de OAuth 2.0                               | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Developer token de la API                                | Google Ads MCC → API Center                   |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Customer ID del MCC (sin guiones)                      | Google Ads MCC → Configuración                |

### 4.2. Credenciales por Cliente (en BD: `integration_credentials`)

| Campo                  | Descripción                                          | Cómo se obtiene                               |
|------------------------|------------------------------------------------------|------------------------------------------------|
| `access_token`         | Token de acceso OAuth 2.0 (~1 hora)                  | OAuth flow + refresh                          |
| `refresh_token`        | Token para renovar access_token (larga duración)     | OAuth flow inicial                            |
| `customer_id`          | ID de la cuenta Google Ads del cliente                | Seleccionado post-OAuth                       |
| `conversion_action_id` | ID de la acción de conversión principal (opcional)    | Creado vía API o seleccionado de existentes   |

### 4.3. Cómo obtener las credenciales paso a paso

#### Paso 1: Crear proyecto en Google Cloud

1. Ir a https://console.cloud.google.com
2. Crear nuevo proyecto: `GO Admin Ads Integration`
3. Habilitar **Google Ads API**: `console.cloud.google.com/flows/enableapi?apiid=googleads.googleapis.com`

#### Paso 2: Crear credenciales OAuth 2.0

1. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
2. Tipo: **Web Application**
3. Authorized redirect URIs: `https://app.goadmin.io/api/integrations/google-ads/oauth/callback`
4. Copiar **Client ID** y **Client Secret**

#### Paso 3: Obtener Developer Token

1. Crear o usar cuenta MCC existente en https://ads.google.com
2. Ir a **Tools → API Center** (https://ads.google.com/aw/apicenter)
3. Completar formulario de solicitud
4. Inicialmente obtienes **Test Account Access** (solo cuentas de prueba)
5. Solicitar **Basic Access** para producción (revisión de Google, 3-7 días)

#### Paso 4: Flujo OAuth del cliente

```
1. Cliente hace clic en "Conectar con Google Ads" en GO Admin
   ↓
2. Redirect a:
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id={CLIENT_ID}&
     redirect_uri=https://app.goadmin.io/api/integrations/google-ads/oauth/callback&
     scope=https://www.googleapis.com/auth/adwords&
     response_type=code&
     access_type=offline&
     prompt=consent
   ↓
3. Cliente autoriza GO Admin
   ↓
4. Google redirige con authorization code
   ↓
5. Backend intercambia code → access_token + refresh_token
   ↓
6. Backend lista cuentas accesibles (listAccessibleCustomers)
   ↓
7. Cliente selecciona su cuenta de Google Ads
   ↓
8. Backend guarda refresh_token, customer_id en integration_credentials
```

---

## 5. Autenticación – OAuth 2.0 + Developer Token

Google Ads API requiere **dos tipos de autenticación simultáneos**:

1. **OAuth 2.0 Bearer Token** — Identifica al usuario autorizante
2. **Developer Token** — Identifica la aplicación (GO Admin)

### 5.1. Obtener Access Token (desde Refresh Token)

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id={CLIENT_ID}" \
  -d "client_secret={CLIENT_SECRET}" \
  -d "refresh_token={REFRESH_TOKEN}" \
  -d "grant_type=refresh_token"
```

**Response:**

```json
{
  "access_token": "ya29.a0AfH6SM...",
  "expires_in": 3600,
  "scope": "https://www.googleapis.com/auth/adwords",
  "token_type": "Bearer"
}
```

> **El access_token expira en 1 hora.** Se debe renovar usando el refresh_token antes de cada llamada (o cachear y renovar al expirar).

### 5.2. Headers requeridos en cada API call

```
Authorization: Bearer {ACCESS_TOKEN}
developer-token: {DEVELOPER_TOKEN}
login-customer-id: {MCC_CUSTOMER_ID}    # Solo si se usa MCC
Content-Type: application/json
```

### 5.3. Ejemplo completo

```bash
curl -X POST \
  "https://googleads.googleapis.com/v23/customers/1234567890/googleAds:searchStream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ya29.a0AfH6SM..." \
  -H "developer-token: ABcDeFgHiJkLmNoPqRsT12" \
  -H "login-customer-id: 9876543210" \
  -d '{
    "query": "SELECT campaign.id, campaign.name FROM campaign ORDER BY campaign.id"
  }'
```

---

## 6. API Base y Endpoints Principales

### 6.1. URL Base

```
https://googleads.googleapis.com/v23/
```

> La versión actual es **v23**. Google depreca versiones ~12 meses después de lanzar la siguiente. Siempre verificar la versión más reciente.

### 6.2. Endpoints Principales

#### Listar Cuentas Accesibles

```
GET /v23/customers:listAccessibleCustomers
Authorization: Bearer {ACCESS_TOKEN}
developer-token: {DEVELOPER_TOKEN}
```

**Response:**
```json
{
  "resourceNames": [
    "customers/1234567890",
    "customers/9876543210"
  ]
}
```

#### Consultar Campañas (GAQL)

```
POST /v23/customers/{CUSTOMER_ID}/googleAds:searchStream
Content-Type: application/json

{
  "query": "SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' ORDER BY metrics.impressions DESC"
}
```

> **`cost_micros`** = costo en millonésimas de la moneda. Para convertir a la moneda base: `cost_micros / 1_000_000`. Ejemplo: `1500000` micros = `$1.50 USD`.

#### Obtener Información del Cliente

```
GET /v23/customers/{CUSTOMER_ID}
```

#### Crear Acción de Conversión

```
POST /v23/customers/{CUSTOMER_ID}/conversionActions:mutate

{
  "operations": [{
    "create": {
      "name": "GO Admin - Compra POS",
      "category": "PURCHASE",
      "type": "UPLOAD_CLICKS",
      "status": "ENABLED",
      "valueSettings": {
        "defaultValue": 0,
        "alwaysUseDefaultValue": false,
        "defaultCurrencyCode": "COP"
      }
    }
  }]
}
```

**Categorías de conversión:**

| Categoría            | Uso en GO Admin                              |
|----------------------|----------------------------------------------|
| `PURCHASE`           | Compras completadas (POS, e-commerce)       |
| `LEAD`               | Formularios de contacto, cotizaciones       |
| `BOOK_APPOINTMENT`   | Reservas PMS, citas                         |
| `SIGNUP`             | Registros de usuario                        |
| `PAGE_VIEW`          | Visitas a páginas clave                     |
| `ADD_TO_CART`        | Agregar al carrito                          |
| `BEGIN_CHECKOUT`     | Iniciar checkout                            |

#### Subir Conversiones Offline

```
POST /v23/customers/{CUSTOMER_ID}/conversionActions:uploadClickConversions

{
  "conversions": [{
    "conversionAction": "customers/{CUSTOMER_ID}/conversionActions/{CONVERSION_ACTION_ID}",
    "conversionDateTime": "2026-02-23 15:30:00-05:00",
    "conversionValue": 150000,
    "currencyCode": "COP",
    "gclid": "CjwKCAiA...",
    "orderId": "POS-2026-001234"
  }],
  "partialFailure": true
}
```

> **`gclid`** (Google Click ID) es la clave para atribuir la conversión offline al clic del anuncio. Se obtiene del parámetro URL `?gclid=...` cuando el usuario llega a la web desde un anuncio.

#### Subir Enhanced Conversions (sin gclid)

```
POST /v23/customers/{CUSTOMER_ID}/conversionActions:uploadClickConversions

{
  "conversions": [{
    "conversionAction": "customers/{CUSTOMER_ID}/conversionActions/{CONVERSION_ACTION_ID}",
    "conversionDateTime": "2026-02-23 15:30:00-05:00",
    "conversionValue": 150000,
    "currencyCode": "COP",
    "orderId": "POS-2026-001234",
    "userIdentifiers": [
      {
        "hashedEmail": "a1b2c3d4e5f6..."
      },
      {
        "hashedPhoneNumber": "f6e5d4c3b2a1..."
      }
    ]
  }],
  "partialFailure": true
}
```

> Los datos de usuario deben hashearse con **SHA-256** antes de enviar. Normalizar: lowercase, trim whitespace, quitar `+` del email, formato E.164 para teléfono.

#### Customer Match (Subir Lista de Clientes)

```
POST /v23/customers/{CUSTOMER_ID}/offlineUserDataJobs:create

{
  "job": {
    "type": "CUSTOMER_MATCH_USER_LIST",
    "customerMatchUserListMetadata": {
      "userList": "customers/{CUSTOMER_ID}/userLists/{USER_LIST_ID}"
    }
  }
}
```

Luego agregar operaciones al job:

```
POST /v23/{JOB_RESOURCE_NAME}:addOperations

{
  "operations": [{
    "create": {
      "userIdentifiers": [
        { "hashedEmail": "sha256_del_email" },
        { "hashedPhoneNumber": "sha256_del_telefono" }
      ]
    }
  }]
}
```

Y ejecutar:

```
POST /v23/{JOB_RESOURCE_NAME}:run
```

---

## 7. Google Tag (gtag.js) – Tracking en el Navegador

### 7.1. Código Base

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-CONVERSION_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-CONVERSION_ID');
</script>
```

### 7.2. Eventos de Conversión

```javascript
// Compra completada
gtag('event', 'conversion', {
  'send_to': 'AW-CONVERSION_ID/CONVERSION_LABEL',
  'value': 150000,
  'currency': 'COP',
  'transaction_id': 'POS-2026-001234'
});

// Lead / Cotización
gtag('event', 'conversion', {
  'send_to': 'AW-CONVERSION_ID/LEAD_LABEL',
  'value': 50000,
  'currency': 'COP'
});

// Reserva (PMS)
gtag('event', 'conversion', {
  'send_to': 'AW-CONVERSION_ID/BOOKING_LABEL',
  'value': 250000,
  'currency': 'COP'
});
```

### 7.3. Enhanced Conversions (gtag)

```javascript
// Enviar datos del usuario hasheados junto con la conversión
gtag('set', 'user_data', {
  'email': 'cliente@example.com',       // gtag hashea automáticamente
  'phone_number': '+573001234567',
  'first_name': 'Juan',
  'last_name': 'Pérez'
});

gtag('event', 'conversion', {
  'send_to': 'AW-CONVERSION_ID/CONVERSION_LABEL',
  'value': 150000,
  'currency': 'COP',
  'transaction_id': 'POS-2026-001234'
});
```

### 7.4. Inyección del Tag en goadmin-websites

Similar a Meta Pixel. Opciones:

1. **Desde integración:** Leer `conversion_id` de `integration_credentials` y renderizar en layout
2. **Custom scripts:** Inyectar vía `website_settings.custom_scripts`

**Flujo recomendado (Opción 1):**

```
1. Admin activa integración Google Ads en GO Admin ERP
2. Guarda conversion_id y conversion_label en integration_credentials
3. goadmin-websites consulta integraciones activas
4. Si existe google_ads → inyecta gtag.js en <head>
5. Páginas específicas disparan eventos de conversión
```

---

## 8. GAQL – Google Ads Query Language

Google Ads API usa su propio lenguaje de consultas (similar a SQL) para obtener reportes.

### 8.1. Sintaxis Básica

```sql
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.cost_micros
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.impressions DESC
LIMIT 50
```

### 8.2. Recursos Principales

| Recurso              | Descripción                                    |
|----------------------|------------------------------------------------|
| `campaign`           | Campañas publicitarias                        |
| `ad_group`           | Grupos de anuncios dentro de campañas         |
| `ad_group_ad`        | Anuncios individuales                         |
| `keyword_view`       | Rendimiento de keywords                       |
| `conversion_action`  | Acciones de conversión configuradas           |
| `customer`           | Información de la cuenta                      |
| `customer_client`    | Cuentas hijas (para MCC)                      |

### 8.3. Métricas Principales

| Métrica                        | Descripción                                    |
|--------------------------------|------------------------------------------------|
| `metrics.impressions`          | Impresiones del anuncio                       |
| `metrics.clicks`               | Clics en el anuncio                           |
| `metrics.cost_micros`          | Costo en micros (÷1,000,000 = moneda)         |
| `metrics.conversions`          | Número de conversiones                        |
| `metrics.conversions_value`    | Valor total de conversiones                   |
| `metrics.ctr`                  | Click-through rate                            |
| `metrics.average_cpc`          | Costo promedio por clic (micros)              |
| `metrics.cost_per_conversion`  | Costo por conversión (micros)                 |

### 8.4. Segmentos de Fecha

| Segmento              | Descripción             |
|-----------------------|-------------------------|
| `LAST_7_DAYS`         | Últimos 7 días         |
| `LAST_30_DAYS`        | Últimos 30 días        |
| `THIS_MONTH`          | Mes actual             |
| `LAST_MONTH`          | Mes anterior           |
| `THIS_QUARTER`        | Trimestre actual       |
| `LAST_YEAR`           | Año anterior           |

---

## 9. Ambientes

| Ambiente     | Descripción                                          | Restricciones                           |
|-------------|------------------------------------------------------|-----------------------------------------|
| **Test**     | Developer token con Test Account Access              | Solo cuentas de prueba, sin gasto real  |
| **Basic**    | Developer token con Basic Access (aprobado)          | 15,000 operaciones/día                  |
| **Standard** | Developer token con Standard Access                  | Sin límite diario práctico              |

> **Google Ads NO tiene URL diferente para sandbox.** Se usa la misma API `googleads.googleapis.com`. El acceso se controla por el nivel del developer token y el tipo de cuenta (test vs producción).

### Cuentas de Prueba

1. Crear MCC de prueba: https://ads.google.com/nav/selectaccount?sf=mt
2. Desde el MCC de prueba, crear cuenta de cliente de prueba
3. Crear campañas ficticias para testing
4. Las cuentas de prueba **nunca** generan gasto real

---

## 10. Rate Limits

| Recurso                                 | Límite                                      |
|-----------------------------------------|---------------------------------------------|
| **Basic Access**                        | 15,000 operaciones mutate/día               |
| **Standard Access**                     | Sin límite práctico                         |
| **SearchStream**                        | ~100 peticiones concurrentes                |
| **Offline conversion uploads**          | 2,000 conversiones por request              |
| **Customer Match uploads**              | 100,000 identifiers por operación           |
| **Requests por segundo (general)**      | ~1,000 QPS por developer token              |
| **Access Token lifetime**               | 3,600 segundos (1 hora)                     |

---

## 11. Flujo Completo de Integración con GO Admin ERP

### 11.1. Flujo de Conexión (OAuth)

```
1. Admin abre GO Admin ERP → Integraciones → Nueva Conexión
2. Selecciona provider "Google" → connector "Google Ads"
3. Hace clic en "Conectar con Google" (botón OAuth)
4. ⚡ Flujo OAuth:
   a) GO Admin redirige a Google con scope adwords
   b) Usuario autoriza GO Admin en su cuenta Google
   c) Google devuelve authorization code al callback
   d) GO Admin intercambia code → access_token + refresh_token
   e) GO Admin lista cuentas accesibles (listAccessibleCustomers)
   f) Usuario selecciona su cuenta de Google Ads
   g) GO Admin crea conexión (status: active)
   h) GO Admin crea conversion actions básicas:
      - "GO Admin - Compra" (PURCHASE)
      - "GO Admin - Reserva" (BOOK_APPOINTMENT)
      - "GO Admin - Lead" (LEAD)
   i) Guarda refresh_token, customer_id, conversion_action_ids
5. Usuario regresa a GO Admin con todo configurado
```

### 11.2. Flujo de Conversión Offline (POS → Google Ads)

```
1. Cliente llega a la web desde anuncio de Google (URL tiene ?gclid=...)
2. goadmin-websites captura gclid y lo guarda en web_order o customer
3. Cliente compra en POS o paga factura
4. Backend detecta que el cliente tiene gclid asociado
5. Backend sube conversión offline vía API:
   - conversion_action: "GO Admin - Compra"
   - gclid: del cliente
   - value: monto de la compra
   - currency: COP
   - order_id: referencia única
6. Google Ads atribuye la conversión al clic del anuncio
7. Las pujas automáticas (Smart Bidding) se optimizan
```

### 11.3. Flujo de Enhanced Conversions (sin gclid)

```
1. Cliente compra en POS sin haber llegado desde anuncio
2. POS tiene email y/o teléfono del cliente
3. Backend sube enhanced conversion:
   - userIdentifiers: email hasheado + teléfono hasheado
   - value: monto de la compra
   - currency: COP
4. Google intenta matching con usuarios que vieron/hicieron clic en anuncios
5. Si hay match → se registra como conversión asistida
```

### 11.4. Flujo de Customer Match (CRM → Audiencias)

```
1. Admin abre GO Admin ERP → CRM → Segmentos
2. Crea segmento: "Clientes VIP" (compras > $1M COP)
3. Activa "Sincronizar con Google Ads"
4. Backend crea UserList en Google Ads
5. Sube emails/teléfonos hasheados de los clientes del segmento
6. Google Ads crea audiencia de Customer Match
7. El anunciante puede usar esta audiencia en campañas:
   - Remarketing a clientes existentes
   - Lookalike audiences (audiencias similares)
   - Exclusión de clientes actuales
```

### 11.5. Flujo de Reporting

```
1. Admin abre GO Admin ERP → Reportes → Google Ads
2. Backend ejecuta GAQL query:
   SELECT campaign.name, metrics.impressions, metrics.clicks,
          metrics.conversions, metrics.cost_micros
   FROM campaign
   WHERE segments.date DURING LAST_30_DAYS
3. Frontend muestra dashboard con:
   - Impresiones, clics, CTR
   - Costo total, CPC promedio
   - Conversiones, costo por conversión
   - ROAS (Return on Ad Spend)
```

---

## 12. Tablas de BD Relevantes

### Tablas de GO Admin ERP (fuente de datos)

| Tabla                | Uso para Google Ads                               |
|---------------------|---------------------------------------------------|
| `customers`         | Email, teléfono para Customer Match y Enhanced Conversions |
| `sales`             | Ventas completadas → conversiones offline         |
| `payments`          | Pagos recibidos → valor de conversión             |
| `reservations`      | Reservas PMS → conversiones BOOK_APPOINTMENT      |
| `web_orders`        | Pedidos online con gclid → conversiones offline   |
| `organizations`     | Moneda base para currency_code                    |

### Tablas de integraciones

| Tabla                      | Uso                                              |
|---------------------------|--------------------------------------------------|
| `integration_connections` | Conexión activa de Google Ads                     |
| `integration_credentials` | refresh_token, customer_id, developer_token, conversion_action_ids |
| `integration_events`      | Log de conversiones subidas y syncs               |

---

## 13. Códigos de Error Comunes

| Código                                  | Descripción                                           |
|-----------------------------------------|-------------------------------------------------------|
| `AUTHENTICATION_ERROR`                  | Token inválido o expirado (renovar access_token)      |
| `AUTHORIZATION_ERROR`                   | Sin permisos para la cuenta (re-autorizar OAuth)      |
| `DEVELOPER_TOKEN_NOT_APPROVED`          | Developer token en Test mode accediendo producción    |
| `CUSTOMER_NOT_FOUND`                    | Customer ID inválido o no accesible                   |
| `CONVERSION_ACTION_NOT_FOUND`           | ID de acción de conversión no existe                  |
| `CLICK_NOT_FOUND`                       | gclid no encontrado (puede tardar 24h en estar disponible) |
| `CONVERSION_ALREADY_EXISTS`             | Conversión duplicada (mismo gclid + conversion_date_time) |
| `TOO_RECENT_CONVERSION_ACTION`          | Acción de conversión creada hace <6h                  |
| `QUOTA_EXCEEDED`                        | Límite de operaciones diarias excedido                |
| `INVALID_CUSTOMER_ID`                   | Customer ID con formato incorrecto                    |

---

## 14. Consideraciones de Seguridad

1. **NUNCA** exponer `client_secret`, `refresh_token` ni `developer_token` en el frontend
2. **Solo** el `conversion_id` (AW-XXXXXXX) va al navegador (en gtag.js)
3. **Hashear** datos personales (email, teléfono) con SHA-256 antes de enviar
4. **Renovar** access_token antes de expiración (1 hora)
5. **HTTPS** obligatorio en callback URL y todas las comunicaciones
6. **Almacenar** refresh_token encriptado en `integration_credentials`
7. **No enviar** datos sensibles innecesarios a Google
8. **Normalizar** datos antes de hashear: email lowercase, teléfono E.164

### Normalización antes de hashear

```javascript
// Email: lowercase, trim, quitar espacios
const normalizedEmail = email.trim().toLowerCase();
const hashedEmail = crypto.createHash('sha256').update(normalizedEmail).digest('hex');

// Teléfono: formato E.164 (+573001234567)
const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
const hashedPhone = crypto.createHash('sha256').update(normalizedPhone).digest('hex');
```

---

## 15. Diferencias con Otros Proveedores de Publicidad

| Aspecto              | Google Ads                       | Meta Marketing            | TikTok Ads              |
|---------------------|----------------------------------|---------------------------|-------------------------|
| **Auth**             | OAuth 2.0 + developer token      | OAuth 2.0 / System User  | OAuth 2.0               |
| **Token duración**   | 1 hora (refresh token permanente)| ~60 días (renovable)      | ~24h (refresh)          |
| **Conversiones**     | Upload offline + gtag.js         | CAPI + Pixel              | Events API + Pixel      |
| **Query Language**   | GAQL (propio)                    | N/A (REST params)         | N/A                     |
| **Catálogo**         | Google Merchant Center (separado)| Catalog API               | TikTok Catalog          |
| **Pixel/Tag**        | gtag.js                          | fbevents.js               | TikTok Pixel            |
| **Formato precio**   | Micros (÷1,000,000)             | String ("50000 COP")     | Centavos                |
| **Sandbox**          | Test accounts (misma API)        | No hay (test catalogs)   | Sandbox mode            |
| **Audiencias**       | Customer Match + Remarketing     | Custom Audiences          | Custom Audiences        |
| **Aprobación**       | Developer token review (3-7 días)| App Review                | N/A                     |

---

## 16. Plan de Implementación en GO Admin ERP

### Fase 1: BD y Configuración ✅ COMPLETADA

- **Provider:** `google_ads` ya existía en `integration_providers` (id: `24605f28-...`, auth_type: `oauth2`, category: `ads`)
- **Connector:** creado `google_ads` en `integration_connectors` (id: `876a3948-...`)
  - capabilities: `{ pull: true, push: true, realtime: false, webhooks: false }`
  - supported_countries: 16 países
  - required_scopes: `['https://www.googleapis.com/auth/adwords']`
- **Variables de entorno:** agregadas a `.env.example`

### Fase 2: Servicio Backend ✅ COMPLETADA

Archivos creados en `src/lib/services/integrations/google-ads/`:

| Archivo                   | Contenido                                                     |
|--------------------------|----------------------------------------------------------------|
| `googleAdsTypes.ts`       | Interfaces: credenciales, OAuth tokens, conversiones, campañas, health check |
| `googleAdsConfig.ts`      | API URL v18, OAuth URLs, scopes, credential purposes, connector code |
| `googleAdsService.ts`     | OAuth flow completo, token refresh, listAccessibleCustomers, getCustomerInfo, healthCheck, saveCredentials |
| `index.ts`                | Re-exportaciones                                               |

### Fase 3: API Routes OAuth ✅ COMPLETADA

| Ruta                                              | Método   | Descripción                              |
|---------------------------------------------------|----------|------------------------------------------|
| `/api/integrations/google-ads/oauth/authorize`    | POST     | Generar URL de OAuth con state codificado |
| `/api/integrations/google-ads/oauth/callback`     | GET      | Recibir code → tokens → listar cuentas → crear conexión |

**API Routes post-conexión ✅ COMPLETADAS (Fase 5):**

| Ruta                                              | Método   | Descripción                              |
|---------------------------------------------------|----------|------------------------------------------|
| `/api/integrations/google-ads/health-check`       | POST     | Verificar credenciales (listAccessibleCustomers) |
| `/api/integrations/google-ads/campaigns`          | GET      | Obtener campañas con métricas (GAQL)     |
| `/api/integrations/google-ads/upload-conversion`  | POST     | Subir conversión offline (gclid/Enhanced) |
| `/api/integrations/google-ads/upload-audience`    | POST     | Crear lista + subir Customer Match       |

### Fase 4: UI de Credenciales ✅ COMPLETADA

- `google_ads` agregado a `PROVIDER_CREDENTIAL_OVERRIDES` en `StepCredentials.tsx`
- Botón "Conectar con Google" con branding azul (#4285F4) e ícono SVG de Google
- OAuth flow conectado a `/api/integrations/google-ads/oauth/authorize`
- Pasos informativos específicos para Google Ads
- `handleOAuthConnect` refactorizado con `apiRouteMap` para soportar 3 providers

### Fase 5: Funcionalidades Post-Conexión ✅ COMPLETADA

**Métodos agregados a `googleAdsService.ts`:**

| Método | Descripción |
|--------|-------------|
| `createConversionAction()` | Crear acción de conversión (PURCHASE, LEAD, etc.) |
| `uploadOfflineConversions()` | Subir batch de conversiones offline |
| `uploadSingleConversion()` | Subir 1 conversión usando connectionId |
| `executeGaqlQuery()` | Query GAQL genérico |
| `getCampaignMetrics()` | Métricas de campañas por período |
| `getConversionActions()` | Listar acciones de conversión configuradas |
| `createCustomerMatchUserList()` | Crear User List para audiencias |
| `uploadCustomerMatchMembers()` | Subir miembros vía offlineUserDataJob |
| `uploadAudience()` | Flujo completo: crear lista + subir miembros |

### Fase 6: gtag.js en goadmin-websites ✅ COMPLETADA

Archivos en **goadmin-websites**:

| Archivo | Cambio |
|---------|--------|
| `lib/supabase/queries.ts` | +`getGoogleAdsConfig()` — busca `conversion_id` + `conversion_label` en `integration_credentials` vía connector `876a3948-...` |
| `components/site/GoogleAdsTag.tsx` | **Nuevo** — Inyecta `gtag.js` + configura `window.__GOOGLE_ADS_CONVERSION_ID/LABEL` |
| `components/site/GoogleAdsConversion.tsx` | **Nuevo** — Dispara `gtag('event', 'conversion', ...)` en checkout exitoso |
| `components/site/OrganizationLayout.tsx` | +prop `googleAdsConfig`, renderiza `<GoogleAdsTag>` |
| `app/[[...slug]]/page.tsx` | Fetch paralelo de `googleAdsConfig`, pasado al layout y `renderSlugFallback` |
| `app/checkout/resultado/page.tsx` | +`<GoogleAdsConversion>` cuando `payment_status === 'paid'` |

### Fase 7: Hooks automáticos en webhooks ✅ COMPLETADA

Archivos en **goadmin-websites**:

| Archivo | Cambio |
|---------|--------|
| `lib/google-ads/upload-conversion.ts` | **Nuevo** — Helper: OAuth refresh → Google Ads API v23 `uploadClickConversions` (gclid + Enhanced Conversions SHA-256) + logging en `integration_events` |
| `app/api/webhooks/wompi_co/route.ts` | +hook fire-and-forget post-pago exitoso de `web_orders` |
| `app/api/webhooks/stripe/route.ts` | +hook fire-and-forget post-pago exitoso de `web_orders` |
| `app/api/webhooks/mercadopago/route.ts` | +hook fire-and-forget post-pago exitoso de `web_orders` |
| `app/api/webhooks/payu/route.ts` | +hook fire-and-forget post-pago exitoso de `web_orders` |
| `app/api/webhooks/paypal/route.ts` | +hook fire-and-forget post-pago exitoso de `web_orders` |

**Estimado total: 10-12 horas | Completado: ~12 horas (Fases 1-7) ✅ INTEGRACIÓN COMPLETA**

---

## 17. Variables de Entorno

### 17.1. Nuevas (a agregar)

```env
# Google Ads API
GOOGLE_ADS_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=your-client-secret
GOOGLE_ADS_DEVELOPER_TOKEN=ABcDeFgHiJkLmNoPqRsT12
GOOGLE_ADS_LOGIN_CUSTOMER_ID=9876543210
```

### 17.2. Existentes (reutilizables)

```env
NEXT_PUBLIC_APP_URL=https://app.goadmin.io  # Para OAuth callback
```

---

## 18. Costos y Comisiones

| Concepto                      | Costo                                    |
|-------------------------------|------------------------------------------|
| Google Ads API                | Gratis                                   |
| Google Tag (gtag.js)          | Gratis                                   |
| Conversion uploads            | Gratis                                   |
| Customer Match                | Gratis (requiere $50K+ USD gasto histórico) |
| Campañas de Google Ads        | CPC/CPM según subasta (lo paga el cliente) |

> La integración API es **100% gratuita**. El costo solo viene de las campañas publicitarias que el cliente corra en Google Ads.

> **Nota Customer Match:** Google requiere un historial de gasto mínimo (~$50K USD) y buen historial de cumplimiento de políticas para habilitar Customer Match en una cuenta.

---

## 19. Casos de Uso para Clientes de GO Admin ERP

| Módulo        | Caso de uso                                           | Feature de Google Ads utilizado |
|---------------|-------------------------------------------------------|--------------------------------|
| **POS**       | Reportar ventas como conversiones offline              | Offline Conversions            |
| **POS**       | Trackear compras en web del cliente                    | gtag.js + Enhanced Conversions |
| **PMS**       | Reportar reservas como conversiones                    | Offline Conversions            |
| **PMS**       | Trackear reservas online completadas                   | gtag.js Conversion             |
| **CRM**       | Crear audiencias desde segmentos de clientes           | Customer Match                 |
| **CRM**       | Excluir clientes actuales de campañas de adquisición   | Customer Match (exclusion)     |
| **Finanzas**  | Medir ROAS (retorno sobre inversión publicitaria)      | Campaign Reporting (GAQL)      |
| **Reportes**  | Dashboard de métricas de campañas                      | GAQL Queries                   |
| **Web**       | Tracking de compras y leads en la web                  | gtag.js                        |
| **Inventario**| Sincronizar productos a Google Merchant Center (futuro)| Merchant Center API            |

---

## 20. Resumen de Credenciales para `integration_credentials`

| `purpose`              | Tipo       | Ejemplo                            | Uso                                 |
|-----------------------|------------|-------------------------------------|--------------------------------------|
| `refresh_token`        | `oauth2`   | `1//0eXXXXXX...`                   | Renovar access_token                 |
| `customer_id`          | `api_key`  | `1234567890`                       | ID cuenta Google Ads del cliente     |
| `conversion_action_id` | `api_key`  | `123456789`                        | ID acción de conversión principal    |
| `conversion_id`        | `api_key`  | `AW-123456789`                     | Para gtag.js en la web               |
| `conversion_label`     | `api_key`  | `AbCdEfGhIjKl`                    | Label para eventos gtag.js           |

---

## 21. Referencias

- [Google Ads API Overview](https://developers.google.com/google-ads/api/docs/start)
- [Quick Start](https://developers.google.com/google-ads/api/docs/get-started/make-first-call)
- [OAuth 2.0 Overview](https://developers.google.com/google-ads/api/docs/oauth/overview)
- [Authorization & Headers](https://developers.google.com/google-ads/api/rest/auth)
- [REST API Reference](https://developers.google.com/google-ads/api/rest/reference/rest)
- [Conversion Management](https://developers.google.com/google-ads/api/docs/conversions/overview)
- [Offline Conversions](https://developers.google.com/google-ads/api/docs/conversions/upload-offline)
- [Enhanced Conversions](https://developers.google.com/google-ads/api/docs/conversions/upload-online)
- [Customer Match](https://developers.google.com/google-ads/api/docs/remarketing/audience-types/customer-match)
- [GAQL Reference](https://developers.google.com/google-ads/api/docs/query/overview)
- [Campaign Reporting](https://developers.google.com/google-ads/api/docs/reporting/overview)
- [Error Codes](https://developers.google.com/google-ads/api/docs/common-errors)
- [Developer Token Policy](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)
- [API Access Levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
- [Google Tag (gtag.js)](https://developers.google.com/tag-platform/gtagjs)
- [API Versioning](https://developers.google.com/google-ads/api/docs/sunset-dates)
- [Pricing](https://ads.google.com/intl/es/home/pricing/)
