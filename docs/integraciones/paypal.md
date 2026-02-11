# Integración PayPal – Pasarela de Pagos

> **Ref oficial:** https://developer.paypal.com/docs/checkout/  
> **API Orders v2:** https://developer.paypal.com/docs/api/orders/v2/  
> **API Payments v2:** https://developer.paypal.com/docs/api/payments/v2/  
> **JS SDK:** https://developer.paypal.com/sdk/js/  
> **Dashboard:** https://developer.paypal.com/dashboard/  
> **Sandbox:** https://developer.paypal.com/dashboard/accounts  
> **Fecha:** 2026-02-09

---

## 1. Resumen General

PayPal es una pasarela de pagos global que permite aceptar pagos con:
- **Cuenta PayPal** (redirección al popup de PayPal)
- **Tarjetas de crédito/débito** (Visa, Mastercard, Amex, Discover)
- **Pay Later** (cuotas sin intereses en ciertos países)
- **Venmo** (solo US)
- **Apple Pay / Google Pay** (vía Expanded Checkout)
- **Métodos locales** (iDEAL, Bancontact, BLIK, etc.)

### Tipos de integración

| Tipo                | Descripción                                               |
|--------------------|------------------------------------------------------------|
| **PayPal Checkout** | Botones PayPal + tarjetas. Setup rápido (~15 min)         |
| **Expanded Checkout** | Checkout custom con campos de tarjeta propios            |
| **No-Code Checkout** | Payment Links, botones, QR codes sin código              |
| **Enterprise Checkout** | Braintree Direct para empresas grandes                 |

> Para GO Admin ERP usamos **PayPal Checkout (Standard)** + **Expanded Checkout** (tarjetas hosted fields).

---

## 2. Ambientes

| Ambiente    | URL Base API                          | Dashboard                                   |
|------------|---------------------------------------|----------------------------------------------|
| Sandbox    | `https://api-m.sandbox.paypal.com`    | https://www.sandbox.paypal.com/              |
| Producción | `https://api-m.paypal.com`            | https://www.paypal.com/                      |

> **Nota:** PayPal usa subdominios diferentes para sandbox y producción.

---

## 3. Credenciales

Se obtienen en **Dashboard → My Apps & Credentials → REST API apps**.

| Variable        | Descripción                                      |
|----------------|--------------------------------------------------|
| `client_id`    | ID público de la aplicación REST (para JS SDK)    |
| `client_secret`| Secreto de la aplicación (NUNCA exponer en frontend) |
| `webhook_id`   | ID del webhook configurado (para verificar eventos) |

> **3 credenciales** necesarias para la integración completa.

### Cómo obtener las credenciales paso a paso

1. Ir a https://developer.paypal.com/dashboard/
2. Click en **Apps & Credentials**
3. Seleccionar **Sandbox** o **Live** según el ambiente
4. Click en **Create App** (o seleccionar app existente)
5. Copiar **Client ID** y **Secret**
6. Para webhooks: ir a la app → **Webhooks** → **Add Webhook**
7. Configurar URL y eventos → copiar el **Webhook ID**

### Sandbox: Crear cuentas de prueba

1. Ir a **Dashboard → Testing Tools → Sandbox Accounts**
2. PayPal crea automáticamente:
   - **Business account** (vendedor) → para generar client_id/secret
   - **Personal account** (comprador) → para probar pagos

---

## 4. Autenticación – OAuth 2.0

PayPal usa **OAuth 2.0 Client Credentials** para obtener un access token.

### Obtener Access Token

```bash
curl -X POST https://api-m.sandbox.paypal.com/v1/oauth2/token \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```

**Response:**

```json
{
  "scope": "https://uri.paypal.com/services/invoicing ...",
  "access_token": "A21AAF...",
  "token_type": "Bearer",
  "app_id": "APP-80W284485P519543T",
  "expires_in": 32400,
  "nonce": "2023-01-01T00:00:00Z..."
}
```

> **El token expira en ~9 horas (32400 seg).** Se debe cachear y renovar cuando expire.

### Usar el Access Token

```
Authorization: Bearer A21AAF...
```

---

## 5. API Principal – Orders v2

### 5.1. Crear Orden

```bash
curl -X POST https://api-m.sandbox.paypal.com/v2/checkout/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "intent": "CAPTURE",
    "purchase_units": [{
      "reference_id": "venta_001",
      "description": "Compra en Mi Tienda",
      "amount": {
        "currency_code": "USD",
        "value": "100.00",
        "breakdown": {
          "item_total": { "currency_code": "USD", "value": "85.00" },
          "tax_total": { "currency_code": "USD", "value": "15.00" }
        }
      },
      "items": [{
        "name": "Producto A",
        "quantity": "1",
        "unit_amount": { "currency_code": "USD", "value": "85.00" },
        "category": "PHYSICAL_GOODS"
      }]
    }],
    "application_context": {
      "brand_name": "Mi Tienda",
      "landing_page": "LOGIN",
      "user_action": "PAY_NOW",
      "return_url": "https://midominio.com/pago-exitoso",
      "cancel_url": "https://midominio.com/pago-cancelado"
    }
  }'
```

**Response:**

```json
{
  "id": "5O190127TN364715T",
  "status": "CREATED",
  "links": [
    { "href": "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T", "rel": "self", "method": "GET" },
    { "href": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", "rel": "approve", "method": "GET" },
    { "href": "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/capture", "rel": "capture", "method": "POST" }
  ]
}
```

### 5.2. Intent: CAPTURE vs AUTHORIZE

| Intent      | Comportamiento                                                |
|------------|---------------------------------------------------------------|
| `CAPTURE`  | Captura el pago inmediatamente al aprobarlo                   |
| `AUTHORIZE`| Autoriza (reserva) fondos, captura posterior (hasta 29 días)  |

### 5.3. Capturar Orden

Después de que el comprador aprueba en PayPal:

```bash
curl -X POST https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/capture \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

**Response:**

```json
{
  "id": "5O190127TN364715T",
  "status": "COMPLETED",
  "purchase_units": [{
    "payments": {
      "captures": [{
        "id": "3C679366HH908993F",
        "status": "COMPLETED",
        "amount": { "currency_code": "USD", "value": "100.00" },
        "seller_receivable_breakdown": {
          "gross_amount": { "currency_code": "USD", "value": "100.00" },
          "paypal_fee": { "currency_code": "USD", "value": "3.49" },
          "net_amount": { "currency_code": "USD", "value": "96.51" }
        }
      }]
    }
  }]
}
```

### 5.4. Consultar Orden

```bash
curl https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

## 6. Reembolsos

```bash
# Reembolso total
curl -X POST https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE_ID/refund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN"

# Reembolso parcial
curl -X POST https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE_ID/refund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "amount": { "value": "25.00", "currency_code": "USD" },
    "note_to_payer": "Reembolso parcial por artículo devuelto"
  }'
```

---

## 7. Webhooks

### Configuración

1. **Dashboard** → App → **Webhooks** → Add Webhook
2. **URL:** `https://{dominio}/api/integrations/paypal/webhook`
3. Seleccionar eventos
4. Copiar el **Webhook ID**

### Eventos principales

| Evento                                    | Descripción                            |
|------------------------------------------|----------------------------------------|
| `CHECKOUT.ORDER.APPROVED`                | Comprador aprobó la orden              |
| `CHECKOUT.ORDER.COMPLETED`               | Orden completada (capturada)           |
| `PAYMENT.CAPTURE.COMPLETED`              | Captura de pago exitosa                |
| `PAYMENT.CAPTURE.DENIED`                 | Captura denegada                       |
| `PAYMENT.CAPTURE.REFUNDED`               | Pago reembolsado                       |
| `PAYMENT.CAPTURE.REVERSED`               | Pago revertido (disputa)               |
| `CUSTOMER.DISPUTE.CREATED`               | Disputa abierta por comprador          |
| `CUSTOMER.DISPUTE.RESOLVED`              | Disputa resuelta                       |
| `BILLING.SUBSCRIPTION.CREATED`           | Suscripción creada                     |
| `BILLING.SUBSCRIPTION.ACTIVATED`         | Suscripción activada                   |
| `BILLING.SUBSCRIPTION.CANCELLED`         | Suscripción cancelada                  |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED`    | Pago de suscripción falló              |

### Verificación de Webhook

PayPal usa firma basada en certificado. Se verifica con la API de PayPal:

```bash
curl -X POST https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "auth_algo": "SHA256withRSA",
    "cert_url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-xxx",
    "transmission_id": "xxx",
    "transmission_sig": "xxx",
    "transmission_time": "2024-01-01T00:00:00Z",
    "webhook_id": "WH-xxx",
    "webhook_event": { ... }
  }'
```

**Response:**

```json
{ "verification_status": "SUCCESS" }
```

> Los headers del webhook contienen: `paypal-transmission-id`, `paypal-transmission-time`, `paypal-transmission-sig`, `paypal-cert-url`, `paypal-auth-algo`.

---

## 8. JavaScript SDK (Frontend)

### Cargar el SDK

```html
<script src="https://www.paypal.com/sdk/js?client-id=CLIENT_ID&currency=USD"></script>
```

### Parámetros del SDK

| Parámetro       | Ejemplo         | Descripción                          |
|----------------|-----------------|--------------------------------------|
| `client-id`    | `AeJIB...`      | Client ID de la app REST             |
| `currency`     | `USD`, `COP`    | Moneda por defecto                   |
| `intent`       | `capture`       | `capture` o `authorize`              |
| `components`   | `buttons,hosted-fields` | Componentes a cargar        |
| `enable-funding` | `venmo`       | Habilitar métodos adicionales        |
| `disable-funding` | `credit`     | Deshabilitar métodos                 |

### Render botones PayPal

```javascript
paypal.Buttons({
  createOrder: function(data, actions) {
    // Llamar a tu backend para crear la orden
    return fetch('/api/integrations/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '100.00', currency: 'USD' })
    })
    .then(res => res.json())
    .then(data => data.order_id);
  },
  onApprove: function(data, actions) {
    // Capturar la orden
    return fetch('/api/integrations/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: data.orderID })
    })
    .then(res => res.json())
    .then(details => {
      alert('Pago completado por ' + details.payer.name.given_name);
    });
  },
  onCancel: function(data) {
    console.log('Pago cancelado');
  },
  onError: function(err) {
    console.error('Error en PayPal:', err);
  }
}).render('#paypal-button-container');
```

### React: @paypal/react-paypal-js

```bash
npm install @paypal/react-paypal-js
```

```tsx
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';

function PayPalCheckout({ amount }: { amount: string }) {
  return (
    <PayPalScriptProvider options={{ clientId: 'CLIENT_ID', currency: 'USD' }}>
      <PayPalButtons
        createOrder={(data, actions) => {
          return fetch('/api/integrations/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount }),
          })
            .then(res => res.json())
            .then(data => data.order_id);
        }}
        onApprove={(data, actions) => {
          return fetch('/api/integrations/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: data.orderID }),
          })
            .then(res => res.json())
            .then(details => console.log('Pago completado:', details));
        }}
      />
    </PayPalScriptProvider>
  );
}
```

---

## 9. Monedas y Montos

### Monedas soportadas para LATAM

| Moneda | Código | Monto mínimo | Formato API     |
|--------|--------|-------------|-----------------|
| Dólar  | `USD`  | $0.01       | `"10.00"`       |
| COP    | `COP`  | No soporta pagos en COP directamente* |  |
| MXN    | `MXN`  | $1.00       | `"199.00"`      |
| BRL    | `BRL`  | R$1.00      | `"50.00"`       |

> **⚠️ IMPORTANTE:** PayPal en Colombia opera **solo en USD**. Los montos en COP se convierten automáticamente a USD al momento del pago. Los comercios colombianos reciben el dinero en USD (que luego PayPal convierte a COP al retirar).

### Formato de montos

A diferencia de Stripe/Wompi, PayPal usa **strings con decimales**, NO centavos:

| Ejemplo      | Valor API   | ¿Centavos? |
|-------------|------------|------------|
| $10.00 USD  | `"10.00"`  | ❌ No       |
| $100.50 USD | `"100.50"` | ❌ No       |

---

## 10. Estados de Orden

| Estado                  | Descripción                                      |
|------------------------|--------------------------------------------------|
| `CREATED`              | Orden creada, esperando aprobación del comprador |
| `SAVED`                | Orden guardada (draft)                           |
| `APPROVED`             | Comprador aprobó, lista para capturar            |
| `VOIDED`               | Orden anulada                                    |
| `COMPLETED`            | Pago capturado exitosamente                      |
| `PAYER_ACTION_REQUIRED`| Requiere acción del comprador                    |

---

## 11. Suscripciones (Billing Plans & Subscriptions)

Para cobros recurrentes (membresías de gimnasio, parking, etc.):

### Crear producto

```bash
curl -X POST https://api-m.sandbox.paypal.com/v1/catalogs/products \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Membresía Premium",
    "description": "Acceso completo mensual",
    "type": "SERVICE",
    "category": "EXERCISE_AND_FITNESS"
  }'
```

### Crear plan de facturación

```bash
curl -X POST https://api-m.sandbox.paypal.com/v1/billing/plans \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "PROD-xxx",
    "name": "Membresía Mensual",
    "billing_cycles": [{
      "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
      "tenure_type": "REGULAR",
      "sequence": 1,
      "total_cycles": 0,
      "pricing_scheme": {
        "fixed_price": { "value": "29.99", "currency_code": "USD" }
      }
    }],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "setup_fee": { "value": "0", "currency_code": "USD" },
      "setup_fee_failure_action": "CONTINUE",
      "payment_failure_threshold": 3
    }
  }'
```

### Crear suscripción

```bash
curl -X POST https://api-m.sandbox.paypal.com/v1/billing/subscriptions \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "P-xxx",
    "subscriber": {
      "name": { "given_name": "Juan", "surname": "Pérez" },
      "email_address": "juan@example.com"
    },
    "application_context": {
      "brand_name": "Mi Negocio",
      "return_url": "https://midominio.com/suscripcion-exitosa",
      "cancel_url": "https://midominio.com/suscripcion-cancelada"
    }
  }'
```

---

## 12. Credenciales de Prueba (Sandbox)

### Credenciales sandbox por defecto

| Variable          | Cómo obtener                                          |
|------------------|-------------------------------------------------------|
| `client_id`      | Dashboard → Apps & Credentials → Sandbox → Tu app     |
| `client_secret`  | Dashboard → Apps & Credentials → Sandbox → Tu app     |
| `webhook_id`     | Se genera al crear un webhook en la app sandbox        |

### Cuentas sandbox de prueba

| Tipo       | Email                             | Contraseña        |
|-----------|-----------------------------------|--------------------|
| Business  | `sb-xxx@business.example.com`     | Generada por PayPal |
| Personal  | `sb-xxx@personal.example.com`     | Generada por PayPal |

> Las cuentas sandbox se crean automáticamente. Se pueden gestionar en **Dashboard → Testing Tools → Sandbox Accounts**.

### Tarjetas de prueba sandbox

| Tipo        | Número                | Exp    | CVC |
|------------|----------------------|--------|-----|
| Visa       | `4032039317984658`   | Futuro | Cualquier |
| Mastercard | `5425233430109903`   | Futuro | Cualquier |
| Amex       | `374245455400126`    | Futuro | Cualquier |
| Discover   | `6011000990099818`   | Futuro | Cualquier |

---

## 13. Diferencias con Otros Proveedores

| Aspecto              | PayPal                          | Stripe                         | Wompi                          | MercadoPago                    | PayU                           |
|---------------------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|
| **Credenciales**     | 3: client_id, secret, webhook_id | 3: pk, sk, whsec              | 4: pub, priv, events, integrity | 3: public, access, webhook     | 4: apiKey, apiLogin, merchantId, accountId |
| **Autenticación**    | OAuth 2.0 (access_token)       | Bearer sk_...                  | Bearer priv_...                | Bearer access_token            | apiKey+apiLogin en body        |
| **Token expira**     | ✅ Sí (~9h)                     | ❌ No expira                   | ❌ No expira                   | ❌ No expira                   | ❌ No expira                   |
| **Montos**           | Strings decimales ("10.00")    | Centavos (1000)                | Centavos (1000000)             | Pesos (50000)                  | Pesos/decimales                |
| **API Style**        | REST + HATEOAS links           | REST puro                      | REST                           | REST                           | JSON-RPC                       |
| **Webhook firma**    | Certificado + verify API       | HMAC-SHA256                    | SHA256 checksum                | HMAC-SHA256                    | MD5                            |
| **Colombia**         | Solo USD (convierte COP→USD)   | Solo tarjetas                  | Tarjetas, PSE, Nequi, Efecty  | Tarjetas, PSE, Efecty          | Tarjetas, PSE, Nequi, Efecty  |
| **Checkout hosted**  | ✅ Botones + popup PayPal       | ✅ Checkout Sessions            | ✅ Widget JS                   | ✅ Checkout Pro                 | ❌ (básico)                    |
| **Suscripciones**    | ✅ Billing Plans                | ✅ Nativo completo              | ❌                             | ✅ Básico                      | ✅ Recurrentes                 |
| **SDK JS**           | PayPal JS SDK                  | Stripe.js + Elements           | Wompi Widget                   | MercadoPago.js                 | N/A                            |
| **React SDK**        | @paypal/react-paypal-js        | @stripe/react-stripe-js        | N/A (Widget)                   | N/A                            | N/A                            |
| **Cobertura global** | 200+ países                    | 46+ países                     | Solo Colombia                  | 6 países LATAM                 | 6 países LATAM                |

---

## 14. Flujo Completo de Pago

```
1. Frontend carga PayPal JS SDK con client_id del cliente
2. Comprador hace click en botón PayPal
3. Frontend llama a Backend → POST /api/integrations/paypal/create-order
4. Backend obtiene access_token (OAuth 2.0 con client_id + client_secret)
5. Backend crea orden → POST /v2/checkout/orders
6. Backend retorna order_id al Frontend
7. PayPal SDK abre popup para que el comprador apruebe
8. Comprador aprueba en PayPal
9. Frontend llama a Backend → POST /api/integrations/paypal/capture-order
10. Backend captura → POST /v2/checkout/orders/{id}/capture
11. Backend registra en BD y retorna resultado al Frontend
12. PayPal envía webhook de confirmación (asíncrono)
13. Backend verifica webhook y actualiza estado final en BD
```

---

## 15. API Endpoints de PayPal (Principales)

| Endpoint                                           | Método | Descripción                 |
|----------------------------------------------------|--------|-----------------------------|
| `/v1/oauth2/token`                                 | POST   | Obtener access token        |
| `/v2/checkout/orders`                              | POST   | Crear orden                 |
| `/v2/checkout/orders/{id}`                         | GET    | Consultar orden             |
| `/v2/checkout/orders/{id}`                         | PATCH  | Actualizar orden            |
| `/v2/checkout/orders/{id}/capture`                 | POST   | Capturar pago               |
| `/v2/checkout/orders/{id}/authorize`               | POST   | Autorizar pago              |
| `/v2/payments/captures/{id}/refund`                | POST   | Reembolsar captura          |
| `/v2/payments/authorizations/{id}/capture`         | POST   | Capturar autorización       |
| `/v2/payments/authorizations/{id}/void`            | POST   | Anular autorización         |
| `/v1/catalogs/products`                            | POST   | Crear producto (suscripciones) |
| `/v1/billing/plans`                                | POST   | Crear plan de facturación   |
| `/v1/billing/subscriptions`                        | POST   | Crear suscripción           |
| `/v1/notifications/verify-webhook-signature`       | POST   | Verificar firma de webhook  |

---

## 16. Códigos de Error Comunes

| Código                          | HTTP | Descripción                                  |
|--------------------------------|------|----------------------------------------------|
| `INVALID_RESOURCE_ID`          | 404  | Orden/recurso no encontrado                  |
| `RESOURCE_NOT_FOUND`           | 404  | Recurso no existe                            |
| `NOT_AUTHORIZED`               | 401  | Token inválido o expirado                    |
| `PERMISSION_DENIED`            | 403  | Sin permisos para esta operación             |
| `ORDER_NOT_APPROVED`           | 422  | Intento de capturar sin aprobación            |
| `ORDER_ALREADY_CAPTURED`       | 422  | Orden ya fue capturada                       |
| `DUPLICATE_INVOICE_ID`         | 422  | reference_id duplicado                       |
| `INSTRUMENT_DECLINED`          | 422  | Método de pago rechazado                     |
| `PAYER_CANNOT_PAY`             | 422  | Comprador no puede pagar                     |
| `INTERNAL_SERVER_ERROR`        | 500  | Error interno de PayPal                      |
| `UNPROCESSABLE_ENTITY`         | 422  | Validación falló                             |

---

## 17. Consideraciones de Seguridad

1. **NUNCA** exponer `client_secret` en el frontend
2. **Solo** `client_id` va al navegador (para JS SDK)
3. **Siempre** verificar webhooks con la API `/v1/notifications/verify-webhook-signature`
4. **Cachear** el access token (expira cada ~9h), no pedir uno nuevo por cada request
5. **Usar Idempotency-Key** header para evitar cargos duplicados en reintentos
6. **Validar** montos en backend antes de crear la orden (no confiar en frontend)

---

## 18. Límites y Restricciones

| Aspecto              | Límite                                        |
|---------------------|-----------------------------------------------|
| Access token        | Expira en ~32400 seg (~9 horas)               |
| Rate limit          | Variable por endpoint                         |
| Webhook timeout     | 30 segundos para responder con 200            |
| Webhook reintentos  | Hasta 3 días, backoff exponencial             |
| Autorización        | Capturar dentro de 29 días (3 días honor)     |
| Monto mínimo USD    | $0.01 USD                                     |
| Descripción         | Hasta 127 caracteres                          |

---

## 19. Flujo de Integración con GO Admin ERP

### Paso 1: BD (Provider ya existe, falta Connector)

- **Provider:** `paypal` (ID: `18bee38f-9d27-4360-b2e3-3274bbb0b2d9`), auth_type: `oauth2`
- **Connector:** crear `paypal_checkout` con `supported_countries: ['US','CO','MX','BR','AR','CL','PE']`

### Paso 2: Servicio Backend

Crear en `src/lib/services/integrations/paypal/`:

| Archivo               | Contenido                                                |
|----------------------|----------------------------------------------------------|
| `paypalTypes.ts`     | Interfaces TS: credenciales, orden, captura, reembolso, webhook |
| `paypalConfig.ts`    | URLs sandbox/producción, credential purposes, estados     |
| `paypalService.ts`   | OAuth token, crear/capturar órdenes, reembolsos, webhook  |
| `index.ts`           | Re-exportaciones                                         |

### Paso 3: API Routes

| Ruta                                           | Método | Descripción                     |
|------------------------------------------------|--------|---------------------------------|
| `/api/integrations/paypal/create-order`        | POST   | Crear orden PayPal              |
| `/api/integrations/paypal/capture-order`       | POST   | Capturar orden aprobada         |
| `/api/integrations/paypal/webhook`             | POST   | Recibir eventos de PayPal       |
| `/api/integrations/paypal/health-check`        | POST   | Verificar credenciales (OAuth)  |

### Paso 4: UI

- Agregar `paypal` a `PROVIDER_CREDENTIAL_OVERRIDES` en `StepCredentials.tsx`
- 3 campos: `client_id`, `client_secret`, `webhook_id`
- Validación: obtener OAuth token para verificar credenciales
- Guardar credenciales en `integration_credentials` con 3 purposes

### Paso 5: Componente de pago

- Usar `@paypal/react-paypal-js` (instalar si no existe)
- `PayPalScriptProvider` con `client_id` del cliente (no de GO Admin)
- `PayPalButtons` con callbacks al backend

---

## 20. Comisiones PayPal (Colombia)

| Tipo de transacción            | Comisión                     |
|-------------------------------|------------------------------|
| Venta nacional                | 3.49% + tarifa fija          |
| Venta internacional           | 4.99% + tarifa fija          |
| Tarifa fija por transacción   | ~$0.49 USD                   |
| Reembolso                     | Se devuelve comisión parcial |
| Conversión de moneda          | 3-4% spread sobre tasa ECB   |

> Las tarifas pueden variar. Consultar https://www.paypal.com/co/webapps/mpp/merchant-fees

---

## 21. Notas Importantes para Colombia

1. **Moneda:** PayPal en Colombia opera en **USD**. No acepta COP directamente.
2. **Retiros:** El dinero llega en USD y PayPal lo convierte a COP al retirar a cuenta bancaria colombiana.
3. **Tipo de cambio:** PayPal aplica su propia tasa de cambio (generalmente menos favorable que la TRM).
4. **Regulación:** Los pagos PayPal en Colombia pueden estar sujetos a retención en la fuente del 4%.
5. **Ideal para:** Negocios que venden a clientes internacionales o que manejan precios en USD.
6. **No ideal para:** Pagos locales colombianos (usar Wompi, PayU o MercadoPago en su lugar).
