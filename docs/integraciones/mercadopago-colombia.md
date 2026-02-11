# MercadoPago Colombia – Documentación de Integración con GO Admin ERP

> **Referencia oficial:** https://www.mercadopago.com.co/developers/es/docs/checkout-api-payments/overview
> **Panel de desarrollador:** https://www.mercadopago.com.co/developers/panel/app
> **API Base:** `https://api.mercadopago.com`
> **SDK JS:** `https://sdk.mercadopago.com/js/v2`
> **Países disponibles:** Argentina, Brasil, México, Uruguay, Colombia, Chile, Perú

---

## 1. Ambientes

| Ambiente     | Descripción                                     | Credenciales       |
|--------------|-------------------------------------------------|---------------------|
| **Pruebas**  | Transacciones simuladas, sin movimiento real     | Credenciales de prueba |
| **Producción** | Transacciones reales con dinero real            | Credenciales de producción |

> Las credenciales de prueba y producción se obtienen desde el [Panel de Tus Integraciones](https://www.mercadopago.com.co/developers/panel/app).

---

## 2. Credenciales (Llaves)

MercadoPago utiliza **2 pares** de credenciales:

### 2.1 Public Key + Access Token

| Credencial       | Uso                                              | Dónde se usa       |
|------------------|--------------------------------------------------|---------------------|
| **Public Key**   | Identificar la cuenta en el frontend (SDK JS)    | Cliente (browser)   |
| **Access Token** | Autenticar requests a la API REST                | Servidor (backend)  |

### 2.2 Client ID + Client Secret

| Credencial         | Uso                                            |
|--------------------|------------------------------------------------|
| **Client ID**      | Identificar la aplicación en flujos OAuth      |
| **Client Secret**  | Autenticar la aplicación en flujos OAuth       |

> Para la integración con GO Admin ERP, usaremos **Public Key** y **Access Token**.

### 2.3 Prefijos de credenciales

| Tipo              | Pruebas                          | Producción                       |
|-------------------|----------------------------------|----------------------------------|
| **Public Key**    | `TEST-xxxxxxxx-xxxx-xxxx-xxxx`   | `APP_USR-xxxxxxxx-xxxx-xxxx`    |
| **Access Token**  | `TEST-xxxxxxxxxxxxxxxxxxxxxxxxx` | `APP_USR-xxxxxxxxxxxxxxxxxx`    |

### 2.4 Secreto de Webhooks

MercadoPago genera una **clave secreta** por aplicación para validar la autenticidad de las notificaciones webhook. Esta clave se obtiene en:

> **Tus Integraciones** → Seleccionar aplicación → **Webhooks** → Revelar clave secreta

---

## 3. Métodos de Pago Disponibles en Colombia

### 3.1 Tarjeta de Crédito

| Método            | `payment_method_id` |
|-------------------|---------------------|
| Visa              | `visa`              |
| Mastercard        | `master`            |
| American Express  | `amex`              |
| Diners Club       | `diners`            |
| Codensa           | `codensa`           |

### 3.2 Tarjeta de Débito

| Método            | `payment_method_id` |
|-------------------|---------------------|
| Visa Débito       | `debvisa`           |
| Mastercard Débito | `debmaster`         |

### 3.3 Transferencia Bancaria

| Método | `payment_method_id` | Descripción                         |
|--------|---------------------|-------------------------------------|
| PSE    | `pse`               | Pago por transferencia interbancaria |

### 3.4 Efectivo

| Método       | `payment_method_id` | Descripción                         |
|--------------|---------------------|-------------------------------------|
| Efecty       | `efecty`            | Pago en puntos Efecty               |
| Baloto       | `baloto`            | Pago en puntos Baloto (Via Baloto)  |

### 3.5 Billetera Digital

| Método       | `payment_method_id` | Descripción                    |
|--------------|---------------------|--------------------------------|
| Mercado Pago | `account_money`     | Saldo en cuenta Mercado Pago   |

---

## 4. Flujo de Pago con Tarjeta (Checkout API)

### 4.1 Diagrama General

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Frontend    │     │  Backend     │     │  MercadoPago API │
│  (SDK JS)    │     │  (Next.js)   │     │                  │
└─────┬───────┘     └──────┬───────┘     └────────┬─────────┘
      │                     │                       │
      │ 1. Captura datos    │                       │
      │    de tarjeta       │                       │
      │    (CardForm)       │                       │
      │                     │                       │
      │ 2. Genera token ────────────────────────────▶
      │    card_token        │                       │
      │◀────────────────────────────────────────────│
      │                     │                       │
      │ 3. Envía token ────▶│                       │
      │    + datos pago     │                       │
      │                     │ 4. POST /v1/payments ─▶
      │                     │    (Access Token)      │
      │                     │◀──────────────────────│
      │                     │    5. Respuesta pago   │
      │◀────────────────────│                       │
      │  6. Resultado       │                       │
```

### 4.2 Importar MercadoPago.js

```html
<script src="https://sdk.mercadopago.com/js/v2"></script>
```

O con npm:

```bash
npm install @mercadopago/sdk-js
```

```javascript
import { loadMercadoPago } from "@mercadopago/sdk-js";

await loadMercadoPago();
const mp = new window.MercadoPago("YOUR_PUBLIC_KEY");
```

### 4.3 Inicializar CardForm

```javascript
const cardForm = mp.cardForm({
  amount: "100.5",
  iframe: true,
  form: {
    id: "form-checkout",
    cardNumber: { id: "form-checkout__cardNumber", placeholder: "Número de tarjeta" },
    expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/YY" },
    securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
    cardholderName: { id: "form-checkout__cardholderName", placeholder: "Titular" },
    issuer: { id: "form-checkout__issuer", placeholder: "Banco emisor" },
    installments: { id: "form-checkout__installments", placeholder: "Cuotas" },
    identificationType: { id: "form-checkout__identificationType", placeholder: "Tipo doc" },
    identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "Número doc" },
    cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "E-mail" },
  },
  callbacks: {
    onFormMounted: (error) => {
      if (error) return console.warn("Form Mounted error:", error);
    },
    onSubmit: (event) => {
      event.preventDefault();
      const {
        paymentMethodId: payment_method_id,
        issuerId: issuer_id,
        cardholderEmail: email,
        amount,
        token,
        installments,
        identificationNumber,
        identificationType,
      } = cardForm.getCardFormData();

      // Enviar al backend
      fetch("/api/integrations/mercadopago/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          issuer_id,
          payment_method_id,
          transaction_amount: Number(amount),
          installments: Number(installments),
          description: "Descripción del producto",
          payer: {
            email,
            identification: { type: identificationType, number: identificationNumber },
          },
        }),
      });
    },
  },
});
```

### 4.4 Crear Pago en el Backend

```javascript
// POST https://api.mercadopago.com/v1/payments
// Header: Authorization: Bearer ACCESS_TOKEN
// Header: X-Idempotency-Key: <UNIQUE_VALUE>

const response = await fetch("https://api.mercadopago.com/v1/payments", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ACCESS_TOKEN}`,
    "X-Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({
    transaction_amount: 100,
    token: "card_token_from_frontend",
    description: "Producto de ejemplo",
    installments: 1,
    payment_method_id: "visa",
    issuer_id: 310,
    payer: {
      email: "comprador@email.com",
      identification: {
        type: "CC",
        number: "12345678",
      },
    },
  }),
});
```

### 4.5 Respuesta de Pago

```json
{
  "status": "approved",
  "status_detail": "accredited",
  "id": 3055677,
  "date_approved": "2024-01-15T10:04:58.396-05:00",
  "payment_method_id": "visa",
  "payment_type_id": "credit_card",
  "transaction_amount": 100,
  "currency_id": "COP",
  "payer": { "email": "comprador@email.com" },
  "refunds": []
}
```

### 4.6 Estados de Pago

| `status`       | `status_detail`          | Descripción                               |
|----------------|--------------------------|-------------------------------------------|
| `approved`     | `accredited`             | Pago aprobado y acreditado                |
| `in_process`   | `pending_contingency`    | Pago en proceso de revisión               |
| `in_process`   | `pending_review_manual`  | Pago en revisión manual antifraude        |
| `rejected`     | `cc_rejected_bad_filled_*` | Datos de tarjeta incorrectos            |
| `rejected`     | `cc_rejected_insufficient_amount` | Fondos insuficientes             |
| `rejected`     | `cc_rejected_other_reason` | Rechazado por otra razón               |
| `cancelled`    | —                        | Pago cancelado                            |
| `refunded`     | —                        | Pago reembolsado                          |

---

## 5. Pago con PSE (Transferencia Bancaria)

### 5.1 Crear Pago PSE

```javascript
// POST https://api.mercadopago.com/v1/payments

{
  "transaction_amount": 50000,
  "description": "Pago de servicio",
  "payment_method_id": "pse",
  "payer": {
    "email": "comprador@email.com",
    "entity_type": "individual",
    "identification": {
      "type": "CC",
      "number": "12345678"
    }
  },
  "transaction_details": {
    "financial_institution": "1007"
  },
  "callback_url": "https://midominio.com/pago/resultado"
}
```

### 5.2 Obtener Instituciones Financieras

```javascript
// GET https://api.mercadopago.com/v1/payment_methods
// Filtrar por id === "pse" → financial_institutions[]
```

### 5.3 Respuesta PSE

La respuesta incluye un `transaction_details.external_resource_url` con la URL de redirección al banco:

```json
{
  "status": "pending",
  "status_detail": "pending_waiting_transfer",
  "transaction_details": {
    "external_resource_url": "https://www.pse.com.co/...",
    "financial_institution": "1007"
  }
}
```

---

## 6. Pago en Efectivo (Efecty / Baloto)

### 6.1 Crear Pago en Efectivo

```javascript
// POST https://api.mercadopago.com/v1/payments

{
  "transaction_amount": 30000,
  "description": "Pago en efectivo",
  "payment_method_id": "efecty",
  "payer": {
    "email": "comprador@email.com"
  }
}
```

### 6.2 Respuesta

```json
{
  "status": "pending",
  "status_detail": "pending_waiting_payment",
  "transaction_details": {
    "external_resource_url": "https://www.mercadopago.com.co/...",
    "payment_method_reference_id": "1234567890",
    "barcode": { "content": "1234567890" }
  },
  "date_of_expiration": "2024-01-20T23:59:59.000-05:00"
}
```

> El comprador recibe un número de referencia para pagar en un punto Efecty/Baloto.

---

## 7. Endpoints Principales de la API

| Método   | Endpoint                                 | Descripción                        |
|----------|------------------------------------------|------------------------------------|
| `POST`   | `/v1/payments`                           | Crear un pago                      |
| `GET`    | `/v1/payments/{id}`                      | Consultar un pago por ID           |
| `PUT`    | `/v1/payments/{id}`                      | Actualizar un pago (cancelar)      |
| `POST`   | `/v1/refunds`                            | Crear un reembolso                 |
| `GET`    | `/v1/payment_methods`                    | Listar métodos de pago disponibles |
| `GET`    | `/v1/payment_methods/card_issuers`       | Listar bancos emisores por método  |
| `GET`    | `/v1/payment_methods/installments`       | Consultar cuotas disponibles       |
| `POST`   | `/v1/card_tokens`                        | Crear token de tarjeta (server-side) |
| `GET`    | `/v1/identification_types`               | Tipos de documento (CC, NIT, CE)   |

### 7.1 Headers Requeridos

```
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json
X-Idempotency-Key: {UNIQUE_UUID}   # Recomendado para POST
```

---

## 8. Webhooks (Notificaciones)

### 8.1 Configuración

Las notificaciones se configuran en:

> **Tus Integraciones** → Aplicación → **Webhooks** → Configurar notificaciones

Se configuran **dos URLs** separadas:
- **URL modo pruebas**: Para desarrollo con credenciales de prueba
- **URL modo producción**: Para transacciones reales

### 8.2 Eventos Disponibles

| Tópico                           | Descripción                                   |
|----------------------------------|-----------------------------------------------|
| `payment`                        | Creación o actualización de un pago           |
| `subscription_authorized_payment`| Pago autorizado de suscripción                |
| `subscription_preapproval`       | Creación/actualización de suscripción         |
| `subscription_preapproval_plan`  | Creación/actualización de plan de suscripción |
| `topic_claims_integration_wh`    | Reclamos sobre ventas                         |

### 8.3 Estructura del Webhook

```json
{
  "id": 12345,
  "live_mode": true,
  "type": "payment",
  "date_created": "2024-01-15T10:04:58.396-05:00",
  "user_id": 44444,
  "api_version": "v1",
  "action": "payment.created",
  "data": {
    "id": "999999999"
  }
}
```

### 8.4 Validación de Autenticidad (x-signature)

MercadoPago envía un header `x-signature` para verificar autenticidad:

```
x-signature: ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839
```

**Pasos para validar:**

1. Extraer `ts` (timestamp) y `v1` (firma) del header `x-signature`
2. Construir el template:
   ```
   id:{data.id};request-id:{x-request-id_header};ts:{ts_header};
   ```
3. Calcular HMAC-SHA256 usando la **clave secreta** del webhook como clave y el template como mensaje
4. Comparar el resultado con `v1`

```javascript
const crypto = require('crypto');

function verifyMercadoPagoWebhook(xSignature, xRequestId, dataId, secret) {
  // 1. Extraer ts y v1
  const parts = xSignature.split(',');
  const ts = parts.find(p => p.startsWith('ts=')).split('=')[1];
  const v1 = parts.find(p => p.startsWith('v1=')).split('=')[1];

  // 2. Construir template
  const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  // 3. Calcular HMAC-SHA256
  const calculated = crypto
    .createHmac('sha256', secret)
    .update(template)
    .digest('hex');

  // 4. Comparar
  return calculated === v1;
}
```

### 8.5 Reintentos

- Tu servidor debe responder con **HTTP 200** o **201**.
- Tiempo de espera: **22 segundos**.
- Si no responde, MercadoPago reintenta cada **15 minutos** hasta recibir confirmación.
- Después del 3er intento, el plazo se extiende pero los envíos continúan.

### 8.6 Acciones después de recibir notificación

Al recibir un webhook de tipo `payment`:

1. Responder **HTTP 200** inmediatamente
2. Consultar el pago completo: `GET /v1/payments/{data.id}`
3. Actualizar el estado en tu base de datos según el `status` del pago

---

## 9. Reembolsos

### 9.1 Reembolso Total

```javascript
// POST https://api.mercadopago.com/v1/payments/{payment_id}/refunds
// Header: Authorization: Bearer ACCESS_TOKEN

// Body vacío para reembolso total
{}
```

### 9.2 Reembolso Parcial

```javascript
{
  "amount": 50000
}
```

---

## 10. Checkout Pro (Alternativa)

MercadoPago también ofrece **Checkout Pro**, una solución hosted donde el comprador es redirigido a MercadoPago para completar el pago:

### 10.1 Crear Preferencia

```javascript
// POST https://api.mercadopago.com/checkout/preferences

{
  "items": [
    {
      "title": "Producto de ejemplo",
      "quantity": 1,
      "unit_price": 95000,
      "currency_id": "COP"
    }
  ],
  "back_urls": {
    "success": "https://midominio.com/pago/exito",
    "failure": "https://midominio.com/pago/error",
    "pending": "https://midominio.com/pago/pendiente"
  },
  "notification_url": "https://midominio.com/api/webhooks/mercadopago_co",
  "auto_return": "approved"
}
```

### 10.2 Respuesta

```json
{
  "id": "123456789-xxxxxxxx-xxxx",
  "init_point": "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=...",
  "sandbox_init_point": "https://sandbox.mercadopago.com.co/checkout/v1/redirect?pref_id=..."
}
```

> Redirigir al comprador a `init_point` (producción) o `sandbox_init_point` (pruebas).

---

## 11. SDK de Node.js (Backend)

### 11.1 Instalación

```bash
npm install mercadopago
```

### 11.2 Uso

```javascript
import { Payment, MercadoPagoConfig } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: 'ACCESS_TOKEN' });
const payment = new Payment(client);

// Crear pago
const result = await payment.create({
  body: {
    transaction_amount: 100,
    token: "card_token",
    description: "Producto",
    installments: 1,
    payment_method_id: "visa",
    issuer_id: 310,
    payer: {
      email: "comprador@email.com",
      identification: { type: "CC", number: "12345678" },
    },
  },
  requestOptions: { idempotencyKey: crypto.randomUUID() },
});
```

---

## 12. Tipos de Documento en Colombia

| Tipo   | Descripción                        |
|--------|------------------------------------|
| `CC`   | Cédula de Ciudadanía               |
| `CE`   | Cédula de Extranjería              |
| `NIT`  | Número de Identificación Tributaria|
| `PP`   | Pasaporte                          |
| `Otro` | Otro tipo de documento             |

---

## 13. Flujo de Integración con GO Admin ERP

### 13.1 Flujo General

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Admin configura credenciales MercadoPago en GO Admin ERP          │
│    (Public Key, Access Token, Webhook Secret)                        │
├──────────────────────────────────────────────────────────────────────┤
│ 2. Cliente final visita la web del comercio ({subdominio}.goadmin.io)│
├──────────────────────────────────────────────────────────────────────┤
│ 3. Web del comercio carga MercadoPago.js con la Public Key           │
├──────────────────────────────────────────────────────────────────────┤
│ 4. Cliente elige método de pago y completa datos                     │
├──────────────────────────────────────────────────────────────────────┤
│ 5. Frontend genera card_token (si tarjeta) y envía al backend        │
├──────────────────────────────────────────────────────────────────────┤
│ 6. Backend crea pago via POST /v1/payments con Access Token          │
├──────────────────────────────────────────────────────────────────────┤
│ 7. MercadoPago envía webhook a la URL configurada                    │
├──────────────────────────────────────────────────────────────────────┤
│ 8. Backend valida webhook (x-signature), consulta pago y actualiza   │
│    el estado en la BD de GO Admin ERP                                │
└──────────────────────────────────────────────────────────────────────┘
```

### 13.2 Archivos a Crear

| Archivo                                                          | Descripción                                      |
|------------------------------------------------------------------|--------------------------------------------------|
| `src/lib/services/integrations/mercadopago/mercadopagoTypes.ts`  | Interfaces TypeScript                            |
| `src/lib/services/integrations/mercadopago/mercadopagoConfig.ts` | URLs, constantes, mapeo de credenciales          |
| `src/lib/services/integrations/mercadopago/mercadopagoService.ts`| Servicio principal                               |
| `src/lib/services/integrations/mercadopago/index.ts`             | Re-exportaciones                                 |
| `src/app/api/integrations/mercadopago/create-payment/route.ts`   | API: Crear pago                                  |
| `src/app/api/integrations/mercadopago/webhook/route.ts`          | API: Recibir webhooks                            |
| `src/app/api/integrations/mercadopago/payment-methods/route.ts`  | API: Listar métodos de pago                      |
| `src/app/api/integrations/mercadopago/health-check/route.ts`     | API: Verificar credenciales                      |

### 13.3 Credenciales en `integration_credentials`

| `purpose`          | Valor                      | Uso                              |
|--------------------|----------------------------|----------------------------------|
| `public_key`       | `TEST-xxx` / `APP_USR-xxx` | Frontend SDK JS                  |
| `access_token`     | `TEST-xxx` / `APP_USR-xxx` | Backend API calls                |
| `webhook_secret`   | Clave secreta del webhook  | Validar autenticidad de webhooks |

### 13.4 Tablas de Supabase Relacionadas

| Tabla                        | Relación                                         |
|------------------------------|--------------------------------------------------|
| `integration_providers`      | Registro `mercadopago` (category: `payments`)    |
| `integration_connectors`     | Registro `mercadopago_co` (countries: `['CO']`)  |
| `integration_connections`    | Conexión por organización                        |
| `integration_credentials`    | 3 registros por conexión (3 llaves)              |
| `organization_domains`       | URL del webhook usa el dominio de la organización|

### 13.5 Validación de Credenciales (Health Check)

Para verificar que las credenciales son válidas, consultar:

```
GET https://api.mercadopago.com/v1/payment_methods
Authorization: Bearer {ACCESS_TOKEN}
```

Si responde **HTTP 200**, las credenciales son válidas.

---

## 14. Consideraciones de Seguridad

1. **Access Token NUNCA en el frontend** — Solo usar en el servidor
2. **Public Key SOLO en el frontend** — Es segura para exponer
3. **Validar SIEMPRE los webhooks** — Usar `x-signature` con HMAC-SHA256
4. **X-Idempotency-Key** — Usar en todos los POST para evitar pagos duplicados
5. **Almacenar credenciales encriptadas** — Usar `integration_credentials` con cifrado
6. **No almacenar datos de tarjeta** — MercadoPago.js se encarga de la tokenización (PCI compliant)

---

## 15. Diferencias con Wompi

| Aspecto                  | Wompi                                    | MercadoPago                              |
|--------------------------|------------------------------------------|------------------------------------------|
| **Credenciales**         | 4 llaves (pub, priv, events, integrity)  | 3 llaves (pub key, access token, webhook secret) |
| **Firma de integridad**  | SHA256 del monto+referencia+secreto      | No requerida (idempotency key)           |
| **Tokenización**         | API REST directa                         | SDK JS (CardForm) en frontend            |
| **Webhook validación**   | SHA256 checksum en body                  | HMAC-SHA256 en header `x-signature`      |
| **PSE**                  | Endpoint separado                        | Mismo endpoint `/v1/payments`            |
| **Cuotas**               | No aplica                                | Soporta cuotas (installments)            |
| **Checkout hosted**      | Widget embebido o Web Checkout           | Checkout Pro (redirección)               |
| **SDK backend**          | No oficial (REST directo)                | SDK oficial `mercadopago` (npm)          |
| **Moneda**               | COP (centavos)                           | COP (pesos, NO centavos)                 |

> **Importante:** MercadoPago usa montos en **pesos** (no centavos). Wompi usa centavos.
> Ejemplo: $95.000 COP → Wompi: `9500000` / MercadoPago: `95000`

---

## 16. Usuarios de Prueba

MercadoPago permite crear usuarios de prueba desde el panel:

> **Tus Integraciones** → Aplicación → **Cuentas de prueba** → Crear cuenta

Se crean dos usuarios:
- **Vendedor**: Usa sus credenciales de prueba para configurar la integración
- **Comprador**: Usa su cuenta para hacer compras de prueba

### Tarjetas de Prueba (Colombia)

| Número                | Tipo       | CVV | Vencimiento | Estado     |
|-----------------------|------------|-----|-------------|------------|
| `4013 5406 8274 6260` | Visa       | 123 | 11/25       | Aprobado   |
| `5031 7557 3453 0604` | Mastercard | 123 | 11/25       | Aprobado   |
| `4013 5406 8274 6260` | Visa       | 123 | 11/25       | Rechazado  |

> El resultado depende del nombre del titular:
> - `APRO` → Pago aprobado
> - `OTHE` → Rechazado por error general
> - `CONT` → Pago pendiente
> - `CALL` → Rechazado, llamar para autorizar
> - `FUND` → Rechazado por fondos insuficientes
> - `SECU` → Rechazado por código de seguridad inválido
> - `EXPI` → Rechazado por fecha de vencimiento

---

## 17. Resumen de Implementación

### Paso 1: Crear documentación (este archivo) ✅
### Paso 2: Crear provider y connector en BD
### Paso 3: Crear servicio (`mercadopagoService.ts`)
### Paso 4: Crear API routes (4 endpoints)
### Paso 5: Integrar UI de credenciales en conexiones
### Paso 6: Pruebas end-to-end con tarjetas de prueba
