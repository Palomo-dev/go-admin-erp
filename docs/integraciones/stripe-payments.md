# Integración Stripe – Pasarela de Pagos para Clientes

> **IMPORTANTE:** Esta integración es para que los **clientes de GO Admin ERP** acepten pagos  
> de sus propios clientes (productos, reservas, membresías, facturas, etc.).  
> Es **totalmente independiente** del servicio interno de Stripe ubicado en `src/lib/stripe/`  
> que GO Admin usa para cobrar las suscripciones del SaaS.

> **Ref oficial:** https://docs.stripe.com/payments  
> **Dashboard:** https://dashboard.stripe.com/  
> **API Ref:** https://docs.stripe.com/api  
> **Fecha:** 2026-02-09

---

## 1. Separación de Servicios

| Aspecto | Stripe Interno (SaaS) | Stripe Clientes (Integración) |
|---------|----------------------|-------------------------------|
| **Propósito** | Cobrar suscripciones de GO Admin ERP | Los clientes cobran a SUS clientes |
| **Ubicación** | `src/lib/stripe/` | `src/lib/services/integrations/stripe/` |
| **Credenciales** | `.env` (STRIPE_SECRET_KEY) | `integration_credentials` en Supabase |
| **Cuenta Stripe** | Cuenta de GO Admin | Cuenta propia de cada cliente |
| **Webhook** | `/api/stripe/webhook` | `/api/integrations/stripe/webhook` |
| **API Routes** | `/api/stripe/*` | `/api/integrations/stripe/*` |
| **Provider BD** | N/A | `stripe` en `integration_providers` |

---

## 2. Ambientes

| Ambiente    | URL Base API                    | Prefijo de llaves        |
|------------|----------------------------------|--------------------------|
| Test       | `https://api.stripe.com`        | `pk_test_` / `sk_test…`  |
| Producción | `https://api.stripe.com`        | `pk_live_` / `sk_live_`  |

> Stripe usa la **misma URL** para sandbox y producción. El ambiente se determina por el **prefijo de las llaves**.

---

## 3. Credenciales

Se obtienen en **Dashboard Stripe → Developers → API keys**.

| Variable              | Descripción                                        | Prefijo Test    | Prefijo Live    |
|-----------------------|---------------------------------------------------|-----------------|-----------------|
| `publishable_key`     | Llave pública (frontend, Stripe.js/Elements)       | `pk_test_`      | `pk_live_`      |
| `secret_key`          | Llave secreta (backend, NUNCA exponer)             | `sk_test…`      | `sk_live_`      |
| `webhook_secret`      | Secreto para verificar webhooks                    | `whsec_`        | `whsec_`        |

> **3 credenciales** necesarias para la integración completa.

### Cómo obtener las llaves paso a paso

1. Crear cuenta en [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Ir a **Developers → API keys**
3. Copiar **Publishable key** y **Secret key**
4. Para webhooks: **Developers → Webhooks → Add endpoint**
5. Configurar la URL del webhook y copiar el **Signing secret** (`whsec_...`)

---

## 4. Autenticación

Stripe usa **Bearer Token** con la `secret_key` en el header `Authorization`:

```
Authorization: Bearer $STRIPE_SECRET_KEY
```

Para el frontend, la `publishable_key` se usa con **Stripe.js / Stripe Elements**.

---

## 5. Productos API Principales

### 5.1. Payment Intents (Pagos Únicos)

La API principal para aceptar pagos. Cada PaymentIntent representa un intento de cobro.

**Crear Payment Intent:**

```bash
curl https://api.stripe.com/v1/payment_intents \
  -u "$STRIPE_SECRET_KEY:" \
  -d amount=5000 \
  -d currency=cop \
  -d "payment_method_types[]"=card \
  -d description="Reserva #123"
```

**Response:**

```json
{
  "id": "pi_3abc123def456",
  "object": "payment_intent",
  "amount": 5000,
  "currency": "cop",
  "status": "requires_payment_method",
  "client_secret": "pi_3abc123def456_secret_xyz789",
  "payment_method_types": ["card"]
}
```

**Flujo completo:**

1. **Backend** crea PaymentIntent → obtiene `client_secret`
2. **Frontend** usa Stripe.js con `client_secret` para mostrar formulario
3. **Cliente** ingresa datos de tarjeta
4. **Stripe.js** confirma el pago (`stripe.confirmCardPayment`)
5. **Stripe** envía webhook con resultado → Backend actualiza BD

### 5.2. Checkout Sessions (Página de Pago Hosted)

Stripe hospeda la página de pago completa. Ideal para cobros rápidos.

```bash
curl https://api.stripe.com/v1/checkout/sessions \
  -u "$STRIPE_SECRET_KEY:" \
  -d "line_items[0][price_data][currency]"=cop \
  -d "line_items[0][price_data][product_data][name]"="Reserva Habitación" \
  -d "line_items[0][price_data][unit_amount]"=15000000 \
  -d "line_items[0][quantity]"=1 \
  -d mode=payment \
  -d "success_url"="https://tudominio.com/pago-exitoso?session_id={CHECKOUT_SESSION_ID}" \
  -d "cancel_url"="https://tudominio.com/pago-cancelado"
```

### 5.3. Subscriptions (Suscripciones Recurrentes)

Para que los clientes cobren membresías recurrentes a SUS clientes (ej: gimnasio, club, etc.).

```bash
# 1. Crear producto
curl https://api.stripe.com/v1/products \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="Membresía Mensual"

# 2. Crear precio recurrente
curl https://api.stripe.com/v1/prices \
  -u "$STRIPE_SECRET_KEY:" \
  -d product=prod_xxx \
  -d unit_amount=5000000 \
  -d currency=cop \
  -d "recurring[interval]"=month

# 3. Crear suscripción
curl https://api.stripe.com/v1/subscriptions \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d "items[0][price]"=price_xxx
```

### 5.4. Invoices (Facturas)

Para enviar facturas a clientes con link de pago.

```bash
# Crear factura
curl https://api.stripe.com/v1/invoices \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d collection_method=send_invoice \
  -d days_until_due=30

# Agregar línea
curl https://api.stripe.com/v1/invoiceitems \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d amount=10000000 \
  -d currency=cop \
  -d description="Servicio de consultoría"
```

### 5.5. Payment Links (Links de Pago)

Links de pago sin código que se pueden compartir por WhatsApp, email, etc.

```bash
curl https://api.stripe.com/v1/payment_links \
  -u "$STRIPE_SECRET_KEY:" \
  -d "line_items[0][price]"=price_xxx \
  -d "line_items[0][quantity]"=1
```

---

## 6. Métodos de Pago – Colombia

| Método          | `payment_method_types` | Tipo                   |
|----------------|------------------------|------------------------|
| Visa           | `card`                 | Tarjeta crédito/débito |
| Mastercard     | `card`                 | Tarjeta crédito/débito |
| American Express | `card`               | Tarjeta crédito        |
| Diners Club    | `card`                 | Tarjeta crédito        |
| PSE            | No nativo Stripe       | Transferencia bancaria |
| Nequi          | No nativo Stripe       | Billetera digital      |

> **Nota:** Stripe en Colombia soporta principalmente **tarjetas**. Para PSE, Nequi, Efecty, etc., usar Wompi, PayU o MercadoPago.

### Monedas soportadas para Colombia

- **COP** (Peso Colombiano) — montos en **centavos** (ej: $50,000 COP = `5000000`)
- **USD** (Dólar Americano)

---

## 7. Montos en Centavos

Stripe trabaja con la **unidad más pequeña** de cada moneda:

| Moneda | Ejemplo UI    | Valor en API | Tipo           |
|--------|--------------|-------------|----------------|
| COP    | $50,000      | `5000000`   | Centavos       |
| USD    | $10.99       | `1099`      | Centavos       |
| MXN    | $199.00      | `19900`     | Centavos       |

> **Monto mínimo COP:** $2,000 COP (`200000` centavos)

---

## 8. Webhooks

### Configuración

1. **Dashboard Stripe** → Developers → Webhooks → Add endpoint
2. **URL:** `https://{dominio-cliente}/api/integrations/stripe/webhook`
3. Seleccionar eventos a escuchar
4. Copiar **Signing secret** (`whsec_...`)

### Eventos principales

| Evento                              | Descripción                                |
|-------------------------------------|--------------------------------------------|
| `payment_intent.succeeded`          | Pago completado exitosamente               |
| `payment_intent.payment_failed`     | Pago falló                                 |
| `payment_intent.canceled`           | Pago cancelado                             |
| `charge.succeeded`                  | Cargo exitoso                              |
| `charge.refunded`                   | Cargo reembolsado                          |
| `checkout.session.completed`        | Checkout Session completada                |
| `customer.subscription.created`     | Suscripción creada                         |
| `customer.subscription.updated`     | Suscripción actualizada                    |
| `customer.subscription.deleted`     | Suscripción cancelada                      |
| `invoice.payment_succeeded`         | Pago de factura exitoso                    |
| `invoice.payment_failed`            | Pago de factura falló                      |
| `invoice.finalized`                 | Factura finalizada                         |

### Verificación de firma

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(secretKey);
const event = stripe.webhooks.constructEvent(
  rawBody,           // Body raw (string/buffer)
  signatureHeader,   // req.headers['stripe-signature']
  webhookSecret      // whsec_...
);
```

> Stripe usa **HMAC-SHA256** internamente para firmar. La librería oficial maneja la verificación automáticamente.

---

## 9. Reembolsos

```bash
# Reembolso total
curl https://api.stripe.com/v1/refunds \
  -u "$STRIPE_SECRET_KEY:" \
  -d payment_intent=pi_xxx

# Reembolso parcial
curl https://api.stripe.com/v1/refunds \
  -u "$STRIPE_SECRET_KEY:" \
  -d payment_intent=pi_xxx \
  -d amount=2500000
```

**Razones de reembolso:**
- `duplicate` — Cargo duplicado
- `fraudulent` — Cargo fraudulento
- `requested_by_customer` — Solicitud del cliente

---

## 10. Customers (Clientes)

Stripe permite crear clientes para asociar pagos, suscripciones y métodos de pago.

```bash
curl https://api.stripe.com/v1/customers \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="Juan Pérez" \
  -d email="juan@example.com" \
  -d phone="+573001234567" \
  -d "metadata[crm_id]"="cliente_123"
```

---

## 11. Estados de Payment Intent

| Estado                       | Descripción                                     |
|-----------------------------|-------------------------------------------------|
| `requires_payment_method`   | Esperando método de pago                        |
| `requires_confirmation`     | Esperando confirmación                          |
| `requires_action`           | Requiere acción adicional (3DS, etc.)           |
| `processing`                | En proceso                                      |
| `requires_capture`          | Autorizado, pendiente de captura                |
| `canceled`                  | Cancelado                                       |
| `succeeded`                 | Pago exitoso                                    |

---

## 12. Stripe.js y Elements (Frontend)

### Inicializar Stripe.js

```typescript
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Usar la publishable_key del CLIENTE (no la de GO Admin)
const stripePromise = loadStripe('pk_test_...');

function PaymentForm({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
}
```

### Confirmar pago

```typescript
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: 'https://tudominio.com/pago-exitoso',
      },
    });

    if (error) {
      console.error(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit">Pagar</button>
    </form>
  );
}
```

---

## 13. Credenciales de Prueba

| Variable            | Valor                                      |
|--------------------|--------------------------------------------|
| `publishable_key`  | `pk_test_<TU_PUBLISHABLE_KEY>`             |
| `secret_key`       | `<TU_SECRET_KEY>`                          |
| `webhook_secret`   | Se genera al crear endpoint en Dashboard    |

### Tarjetas de prueba

| Escenario           | Número               | CVC    | Fecha   |
|--------------------|-----------------------|--------|---------|
| Aprobada           | `4242 4242 4242 4242` | Cualquier | Futuro |
| Autenticación 3DS  | `4000 0025 0000 3155` | Cualquier | Futuro |
| Rechazada          | `4000 0000 0000 9995` | Cualquier | Futuro |
| Fondos insuficientes | `4000 0000 0000 9995` | Cualquier | Futuro |
| Tarjeta expirada   | `4000 0000 0000 0069` | Cualquier | Futuro |

---

## 14. Diferencias con Wompi, MercadoPago y PayU

| Aspecto              | Stripe                         | Wompi                          | MercadoPago                    | PayU                           |
|---------------------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|
| **Credenciales**     | 3: pk, sk, whsec               | 4: pub, priv, events, integrity | 3: public, access, webhook     | 4: apiKey, apiLogin, merchantId, accountId |
| **Montos**           | Centavos                       | Centavos                       | Pesos                          | Pesos/decimales                |
| **API Style**        | REST puro                      | REST                           | REST                           | JSON-RPC (comando en body)     |
| **Autenticación**    | Bearer sk_...                  | Bearer priv_...                | Bearer access_token            | apiKey+apiLogin en body        |
| **Webhook firma**    | HMAC-SHA256 (stripe-signature) | SHA256 checksum                | HMAC-SHA256 (x-signature)      | MD5 (sign)                     |
| **Colombia**         | Solo tarjetas                  | Tarjetas, PSE, Nequi, Efecty  | Tarjetas, PSE, Efecty          | Tarjetas, PSE, Nequi, Efecty, Bancolombia |
| **Checkout hosted**  | ✅ Checkout Sessions            | ✅ Widget JS                   | ✅ Checkout Pro                 | ❌ (Web Checkout básico)       |
| **Suscripciones**    | ✅ Nativo completo              | ❌                             | ✅ Básico                      | ✅ Recurrentes                 |
| **SDK JS**           | Stripe.js + Elements           | Wompi Widget                   | MercadoPago.js                 | N/A (fingerprint only)        |
| **Cobertura global** | 46+ países                     | Solo Colombia                  | 6 países LATAM                 | 6 países LATAM                |

---

## 15. Casos de Uso en GO Admin ERP

### POS (Punto de Venta)
- Cobrar ventas con tarjeta usando **Payment Intents**
- Terminal virtual para cobros remotos

### PMS (Reservas de Hotel)
- Cobrar reservas anticipadas con **Checkout Sessions**
- Autorizar tarjeta y capturar al checkout con **capture_method: manual**
- Cobrar no-shows con Payment Intent off-session

### CRM (Membresías)
- Membresías recurrentes con **Subscriptions**
- Cobros automáticos mensuales/anuales

### Finanzas (Facturas)
- Enviar facturas con link de pago usando **Invoices**
- Cobrar cuentas por cobrar

### Integraciones (Links de Pago)
- Compartir **Payment Links** por WhatsApp, email, redes sociales
- Sin necesidad de desarrollo adicional

---

## 16. Flujo de Integración con GO Admin ERP

### Paso 1: Configurar en BD (ya existe)

- **Provider:** `stripe` (ID: `7d9abb20-5bbb-410c-b4da-c2231511be34`)
- **Connector:** `stripe_payments` → crear con `supported_countries: ['CO', 'US', 'MX', 'BR', ...]`

### Paso 2: Servicio Backend

Crear en `src/lib/services/integrations/stripe/` (**SEPARADO** de `src/lib/stripe/`):

| Archivo                | Contenido                                            |
|-----------------------|-------------------------------------------------------|
| `stripeClientTypes.ts` | Interfaces TS: credenciales, PaymentIntent, webhooks  |
| `stripeClientConfig.ts`| URLs, prefijos de llaves, constantes                  |
| `stripeClientService.ts`| Servicio: pagos, reembolsos, checkout, clientes, webhook |
| `index.ts`            | Re-exportaciones                                      |

> **Nota:** Archivos con prefijo `Client` para diferenciar del servicio interno `src/lib/stripe/`.

### Paso 3: API Routes

| Ruta                                            | Método | Descripción                     |
|-------------------------------------------------|--------|---------------------------------|
| `/api/integrations/stripe/create-payment`       | POST   | Crear Payment Intent            |
| `/api/integrations/stripe/webhook`              | POST   | Recibir eventos de Stripe       |
| `/api/integrations/stripe/health-check`         | POST   | Verificar credenciales          |
| `/api/integrations/stripe/checkout-session`     | POST   | Crear Checkout Session          |

### Paso 4: UI

- Agregar `stripe` a `PROVIDER_CREDENTIAL_OVERRIDES` en `StepCredentials.tsx`
- 3 campos: `publishable_key`, `secret_key`, `webhook_secret`
- Validación: crear PaymentIntent de $1 y cancelarlo inmediatamente
- Guardar credenciales en `integration_credentials` con 3 purposes

### Paso 5: Webhook

- URL del webhook usa el dominio de `organization_domains`
- Formato: `https://{host}/api/integrations/stripe/webhook`
- Verificar firma con `stripe.webhooks.constructEvent()`
- **Separado** del webhook interno (`/api/stripe/webhook`)

---

## 17. Consideraciones de Seguridad

1. **NUNCA** exponer `secret_key` en el frontend
2. **Solo** `publishable_key` va al navegador (para Stripe.js)
3. **Siempre** verificar firma del webhook con `webhook_secret`
4. **Usar HTTPS** obligatorio para PCI compliance
5. **No almacenar** datos de tarjeta — Stripe tokeniza todo
6. **PCI SAQ A** — Mínima carga de compliance al usar Stripe.js/Elements
7. **Idempotency keys** para evitar cargos duplicados en reintentos

---

## 18. Límites y Restricciones

| Aspecto            | Límite                                          |
|-------------------|-------------------------------------------------|
| Monto mínimo COP  | $2,000 COP (`200000` centavos)                  |
| Monto mínimo USD  | $0.50 USD (`50` centavos)                       |
| Webhooks timeout   | 20 segundos para responder con 200              |
| Webhook reintentos | Hasta 3 días con backoff exponencial             |
| API rate limit     | 100 requests/segundo (modo test: 25 req/s)       |
| Statement descriptor | Máximo 22 caracteres                          |

---

## 19. SDK y Librerías

| Plataforma | Librería                      | Instalación                    |
|-----------|-------------------------------|--------------------------------|
| Node.js   | `stripe`                      | `npm install stripe`           |
| React     | `@stripe/react-stripe-js`     | `npm install @stripe/react-stripe-js @stripe/stripe-js` |
| Next.js   | Ambas anteriores              | Ya instaladas en el proyecto   |

---

## 20. Códigos de Error Comunes

| Código                    | Descripción                              |
|--------------------------|------------------------------------------|
| `card_declined`          | Tarjeta rechazada                        |
| `insufficient_funds`     | Fondos insuficientes                     |
| `expired_card`           | Tarjeta expirada                         |
| `incorrect_cvc`          | CVC incorrecto                           |
| `processing_error`       | Error de procesamiento                   |
| `authentication_required`| Requiere autenticación 3D Secure         |
| `rate_limit`             | Límite de peticiones excedido            |
| `invalid_api_key`        | Llave de API inválida                    |
| `resource_missing`       | Recurso no encontrado                    |

---

## 21. Detección de Ambiente

```typescript
function detectStripeEnvironment(publishableKey: string): 'test' | 'live' {
  if (publishableKey.startsWith('pk_test_')) return 'test';
  if (publishableKey.startsWith('pk_live_')) return 'live';
  throw new Error('Publishable key inválida');
}
```

# Integración Stripe – Pasarela de Pagos para Clientes

> **IMPORTANTE:** Esta integración es para que los **clientes de GO Admin ERP** acepten pagos  
> de sus propios clientes (productos, reservas, membresías, facturas, etc.).  
> Es **totalmente independiente** del servicio interno de Stripe ubicado en `src/lib/stripe/`  
> que GO Admin usa para cobrar las suscripciones del SaaS.

> **Ref oficial:** https://docs.stripe.com/payments  
> **Dashboard:** https://dashboard.stripe.com/  
> **API Ref:** https://docs.stripe.com/api  
> **Fecha:** 2026-02-09

---

## 1. Separación de Servicios

| Aspecto | Stripe Interno (SaaS) | Stripe Clientes (Integración) |
|---------|----------------------|-------------------------------|
| **Propósito** | Cobrar suscripciones de GO Admin ERP | Los clientes cobran a SUS clientes |
| **Ubicación** | `src/lib/stripe/` | `src/lib/services/integrations/stripe/` |
| **Credenciales** | `.env` (STRIPE_SECRET_KEY) | `integration_credentials` en Supabase |
| **Cuenta Stripe** | Cuenta de GO Admin | Cuenta propia de cada cliente |
| **Webhook** | `/api/stripe/webhook` | `/api/integrations/stripe/webhook` |
| **API Routes** | `/api/stripe/*` | `/api/integrations/stripe/*` |
| **Provider BD** | N/A | `stripe` en `integration_providers` |

---

## 2. Ambientes

| Ambiente    | URL Base API                    | Prefijo de llaves        |
|------------|----------------------------------|--------------------------|
| Test       | `https://api.stripe.com`        | `pk_test_` / `sk_test…`  |
| Producción | `https://api.stripe.com`        | `pk_live_` / `sk_live_`  |

> Stripe usa la **misma URL** para sandbox y producción. El ambiente se determina por el **prefijo de las llaves**.

---

## 3. Credenciales

Se obtienen en **Dashboard Stripe → Developers → API keys**.

| Variable              | Descripción                                        | Prefijo Test    | Prefijo Live    |
|-----------------------|---------------------------------------------------|-----------------|-----------------|
| `publishable_key`     | Llave pública (frontend, Stripe.js/Elements)       | `pk_test_`      | `pk_live_`      |
| `secret_key`          | Llave secreta (backend, NUNCA exponer)             | `sk_test…`      | `sk_live_`      |
| `webhook_secret`      | Secreto para verificar webhooks                    | `whsec_`        | `whsec_`        |

> **3 credenciales** necesarias para la integración completa.

### Cómo obtener las llaves paso a paso

1. Crear cuenta en [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Ir a **Developers → API keys**
3. Copiar **Publishable key** y **Secret key**
4. Para webhooks: **Developers → Webhooks → Add endpoint**
5. Configurar la URL del webhook y copiar el **Signing secret** (`whsec_...`)

---

## 4. Autenticación

Stripe usa **Bearer Token** con la `secret_key` en el header `Authorization`:

```
Authorization: Bearer $STRIPE_SECRET_KEY
```

Para el frontend, la `publishable_key` se usa con **Stripe.js / Stripe Elements**.

---

## 5. Productos API Principales

### 5.1. Payment Intents (Pagos Únicos)

La API principal para aceptar pagos. Cada PaymentIntent representa un intento de cobro.

**Crear Payment Intent:**

```bash
curl https://api.stripe.com/v1/payment_intents \
  -u "$STRIPE_SECRET_KEY:" \
  -d amount=5000 \
  -d currency=cop \
  -d "payment_method_types[]"=card \
  -d description="Reserva #123"
```

**Response:**

```json
{
  "id": "pi_3abc123def456",
  "object": "payment_intent",
  "amount": 5000,
  "currency": "cop",
  "status": "requires_payment_method",
  "client_secret": "pi_3abc123def456_secret_xyz789",
  "payment_method_types": ["card"]
}
```

**Flujo completo:**

1. **Backend** crea PaymentIntent → obtiene `client_secret`
2. **Frontend** usa Stripe.js con `client_secret` para mostrar formulario
3. **Cliente** ingresa datos de tarjeta
4. **Stripe.js** confirma el pago (`stripe.confirmCardPayment`)
5. **Stripe** envía webhook con resultado → Backend actualiza BD

### 5.2. Checkout Sessions (Página de Pago Hosted)

Stripe hospeda la página de pago completa. Ideal para cobros rápidos.

```bash
curl https://api.stripe.com/v1/checkout/sessions \
  -u "$STRIPE_SECRET_KEY:" \
  -d "line_items[0][price_data][currency]"=cop \
  -d "line_items[0][price_data][product_data][name]"="Reserva Habitación" \
  -d "line_items[0][price_data][unit_amount]"=15000000 \
  -d "line_items[0][quantity]"=1 \
  -d mode=payment \
  -d "success_url"="https://tudominio.com/pago-exitoso?session_id={CHECKOUT_SESSION_ID}" \
  -d "cancel_url"="https://tudominio.com/pago-cancelado"
```

### 5.3. Subscriptions (Suscripciones Recurrentes)

Para que los clientes cobren membresías recurrentes a SUS clientes (ej: gimnasio, club, etc.).

```bash
# 1. Crear producto
curl https://api.stripe.com/v1/products \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="Membresía Mensual"

# 2. Crear precio recurrente
curl https://api.stripe.com/v1/prices \
  -u "$STRIPE_SECRET_KEY:" \
  -d product=prod_xxx \
  -d unit_amount=5000000 \
  -d currency=cop \
  -d "recurring[interval]"=month

# 3. Crear suscripción
curl https://api.stripe.com/v1/subscriptions \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d "items[0][price]"=price_xxx
```

### 5.4. Invoices (Facturas)

Para enviar facturas a clientes con link de pago.

```bash
# Crear factura
curl https://api.stripe.com/v1/invoices \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d collection_method=send_invoice \
  -d days_until_due=30

# Agregar línea
curl https://api.stripe.com/v1/invoiceitems \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d amount=10000000 \
  -d currency=cop \
  -d description="Servicio de consultoría"
```

### 5.5. Payment Links (Links de Pago)

Links de pago sin código que se pueden compartir por WhatsApp, email, etc.

```bash
curl https://api.stripe.com/v1/payment_links \
  -u "$STRIPE_SECRET_KEY:" \
  -d "line_items[0][price]"=price_xxx \
  -d "line_items[0][quantity]"=1
```

---

## 6. Métodos de Pago – Colombia

| Método          | `payment_method_types` | Tipo                   |
|----------------|------------------------|------------------------|
| Visa           | `card`                 | Tarjeta crédito/débito |
| Mastercard     | `card`                 | Tarjeta crédito/débito |
| American Express | `card`               | Tarjeta crédito        |
| Diners Club    | `card`                 | Tarjeta crédito        |
| PSE            | No nativo Stripe       | Transferencia bancaria |
| Nequi          | No nativo Stripe       | Billetera digital      |

> **Nota:** Stripe en Colombia soporta principalmente **tarjetas**. Para PSE, Nequi, Efecty, etc., usar Wompi, PayU o MercadoPago.

### Monedas soportadas para Colombia

- **COP** (Peso Colombiano) — montos en **centavos** (ej: $50,000 COP = `5000000`)
- **USD** (Dólar Americano)

---

## 7. Montos en Centavos

Stripe trabaja con la **unidad más pequeña** de cada moneda:

| Moneda | Ejemplo UI    | Valor en API | Tipo           |
|--------|--------------|-------------|----------------|
| COP    | $50,000      | `5000000`   | Centavos       |
| USD    | $10.99       | `1099`      | Centavos       |
| MXN    | $199.00      | `19900`     | Centavos       |

> **Monto mínimo COP:** $2,000 COP (`200000` centavos)

---

## 8. Webhooks

### Configuración

1. **Dashboard Stripe** → Developers → Webhooks → Add endpoint
2. **URL:** `https://{dominio-cliente}/api/integrations/stripe/webhook`
3. Seleccionar eventos a escuchar
4. Copiar **Signing secret** (`whsec_...`)

### Eventos principales

| Evento                              | Descripción                                |
|-------------------------------------|--------------------------------------------|
| `payment_intent.succeeded`          | Pago completado exitosamente               |
| `payment_intent.payment_failed`     | Pago falló                                 |
| `payment_intent.canceled`           | Pago cancelado                             |
| `charge.succeeded`                  | Cargo exitoso                              |
| `charge.refunded`                   | Cargo reembolsado                          |
| `checkout.session.completed`        | Checkout Session completada                |
| `customer.subscription.created`     | Suscripción creada                         |
| `customer.subscription.updated`     | Suscripción actualizada                    |
| `customer.subscription.deleted`     | Suscripción cancelada                      |
| `invoice.payment_succeeded`         | Pago de factura exitoso                    |
| `invoice.payment_failed`            | Pago de factura falló                      |
| `invoice.finalized`                 | Factura finalizada                         |

### Verificación de firma

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(secretKey);
const event = stripe.webhooks.constructEvent(
  rawBody,           // Body raw (string/buffer)
  signatureHeader,   // req.headers['stripe-signature']
  webhookSecret      // whsec_...
);
```

> Stripe usa **HMAC-SHA256** internamente para firmar. La librería oficial maneja la verificación automáticamente.

---

## 9. Reembolsos

```bash
# Reembolso total
curl https://api.stripe.com/v1/refunds \
  -u "$STRIPE_SECRET_KEY:" \
  -d payment_intent=pi_xxx

# Reembolso parcial
curl https://api.stripe.com/v1/refunds \
  -u "$STRIPE_SECRET_KEY:" \
  -d payment_intent=pi_xxx \
  -d amount=2500000
```

**Razones de reembolso:**
- `duplicate` — Cargo duplicado
- `fraudulent` — Cargo fraudulento
- `requested_by_customer` — Solicitud del cliente

---

## 10. Customers (Clientes)

Stripe permite crear clientes para asociar pagos, suscripciones y métodos de pago.

```bash
curl https://api.stripe.com/v1/customers \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="Juan Pérez" \
  -d email="juan@example.com" \
  -d phone="+573001234567" \
  -d "metadata[crm_id]"="cliente_123"
```

---

## 11. Estados de Payment Intent

| Estado                       | Descripción                                     |
|-----------------------------|-------------------------------------------------|
| `requires_payment_method`   | Esperando método de pago                        |
| `requires_confirmation`     | Esperando confirmación                          |
| `requires_action`           | Requiere acción adicional (3DS, etc.)           |
| `processing`                | En proceso                                      |
| `requires_capture`          | Autorizado, pendiente de captura                |
| `canceled`                  | Cancelado                                       |
| `succeeded`                 | Pago exitoso                                    |

---

## 12. Stripe.js y Elements (Frontend)

### Inicializar Stripe.js

```typescript
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Usar la publishable_key del CLIENTE (no la de GO Admin)
const stripePromise = loadStripe('pk_test_...');

function PaymentForm({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
}
```

### Confirmar pago

```typescript
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: 'https://tudominio.com/pago-exitoso',
      },
    });

    if (error) {
      console.error(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit">Pagar</button>
    </form>
  );
}
```

---

## 13. Credenciales de Prueba

| Variable            | Valor                                      |
|--------------------|--------------------------------------------|
| `publishable_key`  | `pk_test_<TU_PUBLISHABLE_KEY>`             |
| `secret_key`       | `<TU_SECRET_KEY>`                          |
| `webhook_secret`   | Se genera al crear endpoint en Dashboard    |

### Tarjetas de prueba

| Escenario           | Número               | CVC    | Fecha   |
|--------------------|-----------------------|--------|---------|
| Aprobada           | `4242 4242 4242 4242` | Cualquier | Futuro |
| Autenticación 3DS  | `4000 0025 0000 3155` | Cualquier | Futuro |
| Rechazada          | `4000 0000 0000 9995` | Cualquier | Futuro |
| Fondos insuficientes | `4000 0000 0000 9995` | Cualquier | Futuro |
| Tarjeta expirada   | `4000 0000 0000 0069` | Cualquier | Futuro |

---

## 14. Diferencias con Wompi, MercadoPago y PayU

| Aspecto              | Stripe                         | Wompi                          | MercadoPago                    | PayU                           |
|---------------------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|
| **Credenciales**     | 3: pk, sk, whsec               | 4: pub, priv, events, integrity | 3: public, access, webhook     | 4: apiKey, apiLogin, merchantId, accountId |
| **Montos**           | Centavos                       | Centavos                       | Pesos                          | Pesos/decimales                |
| **API Style**        | REST puro                      | REST                           | REST                           | JSON-RPC (comando en body)     |
| **Autenticación**    | Bearer sk_...                  | Bearer priv_...                | Bearer access_token            | apiKey+apiLogin en body        |
| **Webhook firma**    | HMAC-SHA256 (stripe-signature) | SHA256 checksum                | HMAC-SHA256 (x-signature)      | MD5 (sign)                     |
| **Colombia**         | Solo tarjetas                  | Tarjetas, PSE, Nequi, Efecty  | Tarjetas, PSE, Efecty          | Tarjetas, PSE, Nequi, Efecty, Bancolombia |
| **Checkout hosted**  | ✅ Checkout Sessions            | ✅ Widget JS                   | ✅ Checkout Pro                 | ❌ (Web Checkout básico)       |
| **Suscripciones**    | ✅ Nativo completo              | ❌                             | ✅ Básico                      | ✅ Recurrentes                 |
| **SDK JS**           | Stripe.js + Elements           | Wompi Widget                   | MercadoPago.js                 | N/A (fingerprint only)        |
| **Cobertura global** | 46+ países                     | Solo Colombia                  | 6 países LATAM                 | 6 países LATAM                |

---

## 15. Casos de Uso en GO Admin ERP

### POS (Punto de Venta)
- Cobrar ventas con tarjeta usando **Payment Intents**
- Terminal virtual para cobros remotos

### PMS (Reservas de Hotel)
- Cobrar reservas anticipadas con **Checkout Sessions**
- Autorizar tarjeta y capturar al checkout con **capture_method: manual**
- Cobrar no-shows con Payment Intent off-session

### CRM (Membresías)
- Membresías recurrentes con **Subscriptions**
- Cobros automáticos mensuales/anuales

### Finanzas (Facturas)
- Enviar facturas con link de pago usando **Invoices**
- Cobrar cuentas por cobrar

### Integraciones (Links de Pago)
- Compartir **Payment Links** por WhatsApp, email, redes sociales
- Sin necesidad de desarrollo adicional

---

## 16. Flujo de Integración con GO Admin ERP

### Paso 1: Configurar en BD (ya existe)

- **Provider:** `stripe` (ID: `7d9abb20-5bbb-410c-b4da-c2231511be34`)
- **Connector:** `stripe_payments` → crear con `supported_countries: ['CO', 'US', 'MX', 'BR', ...]`

### Paso 2: Servicio Backend

Crear en `src/lib/services/integrations/stripe/` (**SEPARADO** de `src/lib/stripe/`):

| Archivo                | Contenido                                            |
|-----------------------|-------------------------------------------------------|
| `stripeClientTypes.ts` | Interfaces TS: credenciales, PaymentIntent, webhooks  |
| `stripeClientConfig.ts`| URLs, prefijos de llaves, constantes                  |
| `stripeClientService.ts`| Servicio: pagos, reembolsos, checkout, clientes, webhook |
| `index.ts`            | Re-exportaciones                                      |

> **Nota:** Archivos con prefijo `Client` para diferenciar del servicio interno `src/lib/stripe/`.

### Paso 3: API Routes

| Ruta                                            | Método | Descripción                     |
|-------------------------------------------------|--------|---------------------------------|
| `/api/integrations/stripe/create-payment`       | POST   | Crear Payment Intent            |
| `/api/integrations/stripe/webhook`              | POST   | Recibir eventos de Stripe       |
| `/api/integrations/stripe/health-check`         | POST   | Verificar credenciales          |
| `/api/integrations/stripe/checkout-session`     | POST   | Crear Checkout Session          |

### Paso 4: UI

- Agregar `stripe` a `PROVIDER_CREDENTIAL_OVERRIDES` en `StepCredentials.tsx`
- 3 campos: `publishable_key`, `secret_key`, `webhook_secret`
- Validación: crear PaymentIntent de $1 y cancelarlo inmediatamente
- Guardar credenciales en `integration_credentials` con 3 purposes

### Paso 5: Webhook

- URL del webhook usa el dominio de `organization_domains`
- Formato: `https://{host}/api/integrations/stripe/webhook`
- Verificar firma con `stripe.webhooks.constructEvent()`
- **Separado** del webhook interno (`/api/stripe/webhook`)

---

## 17. Consideraciones de Seguridad

1. **NUNCA** exponer `secret_key` en el frontend
2. **Solo** `publishable_key` va al navegador (para Stripe.js)
3. **Siempre** verificar firma del webhook con `webhook_secret`
4. **Usar HTTPS** obligatorio para PCI compliance
5. **No almacenar** datos de tarjeta — Stripe tokeniza todo
6. **PCI SAQ A** — Mínima carga de compliance al usar Stripe.js/Elements
7. **Idempotency keys** para evitar cargos duplicados en reintentos

---

## 18. Límites y Restricciones

| Aspecto            | Límite                                          |
|-------------------|-------------------------------------------------|
| Monto mínimo COP  | $2,000 COP (`200000` centavos)                  |
| Monto mínimo USD  | $0.50 USD (`50` centavos)                       |
| Webhooks timeout   | 20 segundos para responder con 200              |
| Webhook reintentos | Hasta 3 días con backoff exponencial             |
| API rate limit     | 100 requests/segundo (modo test: 25 req/s)       |
| Statement descriptor | Máximo 22 caracteres                          |

---

## 19. SDK y Librerías

| Plataforma | Librería                      | Instalación                    |
|-----------|-------------------------------|--------------------------------|
| Node.js   | `stripe`                      | `npm install stripe`           |
| React     | `@stripe/react-stripe-js`     | `npm install @stripe/react-stripe-js @stripe/stripe-js` |
| Next.js   | Ambas anteriores              | Ya instaladas en el proyecto   |

---

## 20. Códigos de Error Comunes

| Código                    | Descripción                              |
|--------------------------|------------------------------------------|
| `card_declined`          | Tarjeta rechazada                        |
| `insufficient_funds`     | Fondos insuficientes                     |
| `expired_card`           | Tarjeta expirada                         |
| `incorrect_cvc`          | CVC incorrecto                           |
| `processing_error`       | Error de procesamiento                   |
| `authentication_required`| Requiere autenticación 3D Secure         |
| `rate_limit`             | Límite de peticiones excedido            |
| `invalid_api_key`        | Llave de API inválida                    |
| `resource_missing`       | Recurso no encontrado                    |

---

## 21. Detección de Ambiente

```typescript
function detectStripeEnvironment(publishableKey: string): 'test' | 'live' {
  if (publishableKey.startsWith('pk_test_')) return 'test';
  if (publishableKey.startsWith('pk_live_')) return 'live';
  throw new Error('Publishable key inválida');
}
```

# Integración Stripe – Pasarela de Pagos para Clientes

> **IMPORTANTE:** Esta integración es para que los **clientes de GO Admin ERP** acepten pagos  
> de sus propios clientes (productos, reservas, membresías, facturas, etc.).  
> Es **totalmente independiente** del servicio interno de Stripe ubicado en `src/lib/stripe/`  
> que GO Admin usa para cobrar las suscripciones del SaaS.

> **Ref oficial:** https://docs.stripe.com/payments  
> **Dashboard:** https://dashboard.stripe.com/  
> **API Ref:** https://docs.stripe.com/api  
> **Fecha:** 2026-02-09

---

## 1. Separación de Servicios

| Aspecto | Stripe Interno (SaaS) | Stripe Clientes (Integración) |
|---------|----------------------|-------------------------------|
| **Propósito** | Cobrar suscripciones de GO Admin ERP | Los clientes cobran a SUS clientes |
| **Ubicación** | `src/lib/stripe/` | `src/lib/services/integrations/stripe/` |
| **Credenciales** | `.env` (STRIPE_SECRET_KEY) | `integration_credentials` en Supabase |
| **Cuenta Stripe** | Cuenta de GO Admin | Cuenta propia de cada cliente |
| **Webhook** | `/api/stripe/webhook` | `/api/integrations/stripe/webhook` |
| **API Routes** | `/api/stripe/*` | `/api/integrations/stripe/*` |
| **Provider BD** | N/A | `stripe` en `integration_providers` |

---

## 2. Ambientes

| Ambiente    | URL Base API                    | Prefijo de llaves        |
|------------|----------------------------------|--------------------------|
| Test       | `https://api.stripe.com`        | `pk_test_` / `sk_test…`  |
| Producción | `https://api.stripe.com`        | `pk_live_` / `sk_live_`  |

> Stripe usa la **misma URL** para sandbox y producción. El ambiente se determina por el **prefijo de las llaves**.

---

## 3. Credenciales

Se obtienen en **Dashboard Stripe → Developers → API keys**.

| Variable              | Descripción                                        | Prefijo Test    | Prefijo Live    |
|-----------------------|---------------------------------------------------|-----------------|-----------------|
| `publishable_key`     | Llave pública (frontend, Stripe.js/Elements)       | `pk_test_`      | `pk_live_`      |
| `secret_key`          | Llave secreta (backend, NUNCA exponer)             | `sk_test…`      | `sk_live_`      |
| `webhook_secret`      | Secreto para verificar webhooks                    | `whsec_`        | `whsec_`        |

> **3 credenciales** necesarias para la integración completa.

### Cómo obtener las llaves paso a paso

1. Crear cuenta en [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Ir a **Developers → API keys**
3. Copiar **Publishable key** y **Secret key**
4. Para webhooks: **Developers → Webhooks → Add endpoint**
5. Configurar la URL del webhook y copiar el **Signing secret** (`whsec_...`)

---

## 4. Autenticación

Stripe usa **Bearer Token** con la `secret_key` en el header `Authorization`:

```
Authorization: Bearer $STRIPE_SECRET_KEY
```

Para el frontend, la `publishable_key` se usa con **Stripe.js / Stripe Elements**.

---

## 5. Productos API Principales

### 5.1. Payment Intents (Pagos Únicos)

La API principal para aceptar pagos. Cada PaymentIntent representa un intento de cobro.

**Crear Payment Intent:**

```bash
curl https://api.stripe.com/v1/payment_intents \
  -u "$STRIPE_SECRET_KEY:" \
  -d amount=5000 \
  -d currency=cop \
  -d "payment_method_types[]"=card \
  -d description="Reserva #123"
```

**Response:**

```json
{
  "id": "pi_3abc123def456",
  "object": "payment_intent",
  "amount": 5000,
  "currency": "cop",
  "status": "requires_payment_method",
  "client_secret": "pi_3abc123def456_secret_xyz789",
  "payment_method_types": ["card"]
}
```

**Flujo completo:**

1. **Backend** crea PaymentIntent → obtiene `client_secret`
2. **Frontend** usa Stripe.js con `client_secret` para mostrar formulario
3. **Cliente** ingresa datos de tarjeta
4. **Stripe.js** confirma el pago (`stripe.confirmCardPayment`)
5. **Stripe** envía webhook con resultado → Backend actualiza BD

### 5.2. Checkout Sessions (Página de Pago Hosted)

Stripe hospeda la página de pago completa. Ideal para cobros rápidos.

```bash
curl https://api.stripe.com/v1/checkout/sessions \
  -u "$STRIPE_SECRET_KEY:" \
  -d "line_items[0][price_data][currency]"=cop \
  -d "line_items[0][price_data][product_data][name]"="Reserva Habitación" \
  -d "line_items[0][price_data][unit_amount]"=15000000 \
  -d "line_items[0][quantity]"=1 \
  -d mode=payment \
  -d "success_url"="https://tudominio.com/pago-exitoso?session_id={CHECKOUT_SESSION_ID}" \
  -d "cancel_url"="https://tudominio.com/pago-cancelado"
```

### 5.3. Subscriptions (Suscripciones Recurrentes)

Para que los clientes cobren membresías recurrentes a SUS clientes (ej: gimnasio, club, etc.).

```bash
# 1. Crear producto
curl https://api.stripe.com/v1/products \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="Membresía Mensual"

# 2. Crear precio recurrente
curl https://api.stripe.com/v1/prices \
  -u "$STRIPE_SECRET_KEY:" \
  -d product=prod_xxx \
  -d unit_amount=5000000 \
  -d currency=cop \
  -d "recurring[interval]"=month

# 3. Crear suscripción
curl https://api.stripe.com/v1/subscriptions \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d "items[0][price]"=price_xxx
```

### 5.4. Invoices (Facturas)

Para enviar facturas a clientes con link de pago.

```bash
# Crear factura
curl https://api.stripe.com/v1/invoices \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d collection_method=send_invoice \
  -d days_until_due=30

# Agregar línea
curl https://api.stripe.com/v1/invoiceitems \
  -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_xxx \
  -d amount=10000000 \
  -d currency=cop \
  -d description="Servicio de consultoría"
```

### 5.5. Payment Links (Links de Pago)

Links de pago sin código que se pueden compartir por WhatsApp, email, etc.

```bash
curl https://api.stripe.com/v1/payment_links \
  -u "$STRIPE_SECRET_KEY:" \
  -d "line_items[0][price]"=price_xxx \
  -d "line_items[0][quantity]"=1
```

---

## 6. Métodos de Pago – Colombia

| Método          | `payment_method_types` | Tipo                   |
|----------------|------------------------|------------------------|
| Visa           | `card`                 | Tarjeta crédito/débito |
| Mastercard     | `card`                 | Tarjeta crédito/débito |
| American Express | `card`               | Tarjeta crédito        |
| Diners Club    | `card`                 | Tarjeta crédito        |
| PSE            | No nativo Stripe       | Transferencia bancaria |
| Nequi          | No nativo Stripe       | Billetera digital      |

> **Nota:** Stripe en Colombia soporta principalmente **tarjetas**. Para PSE, Nequi, Efecty, etc., usar Wompi, PayU o MercadoPago.

### Monedas soportadas para Colombia

- **COP** (Peso Colombiano) — montos en **centavos** (ej: $50,000 COP = `5000000`)
- **USD** (Dólar Americano)

---

## 7. Montos en Centavos

Stripe trabaja con la **unidad más pequeña** de cada moneda:

| Moneda | Ejemplo UI    | Valor en API | Tipo           |
|--------|--------------|-------------|----------------|
| COP    | $50,000      | `5000000`   | Centavos       |
| USD    | $10.99       | `1099`      | Centavos       |
| MXN    | $199.00      | `19900`     | Centavos       |

> **Monto mínimo COP:** $2,000 COP (`200000` centavos)

---

## 8. Webhooks

### Configuración

1. **Dashboard Stripe** → Developers → Webhooks → Add endpoint
2. **URL:** `https://{dominio-cliente}/api/integrations/stripe/webhook`
3. Seleccionar eventos a escuchar
4. Copiar **Signing secret** (`whsec_...`)

### Eventos principales

| Evento                              | Descripción                                |
|-------------------------------------|--------------------------------------------|
| `payment_intent.succeeded`          | Pago completado exitosamente               |
| `payment_intent.payment_failed`     | Pago falló                                 |
| `payment_intent.canceled`           | Pago cancelado                             |
| `charge.succeeded`                  | Cargo exitoso                              |
| `charge.refunded`                   | Cargo reembolsado                          |
| `checkout.session.completed`        | Checkout Session completada                |
| `customer.subscription.created`     | Suscripción creada                         |
| `customer.subscription.updated`     | Suscripción actualizada                    |
| `customer.subscription.deleted`     | Suscripción cancelada                      |
| `invoice.payment_succeeded`         | Pago de factura exitoso                    |
| `invoice.payment_failed`            | Pago de factura falló                      |
| `invoice.finalized`                 | Factura finalizada                         |

### Verificación de firma

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(secretKey);
const event = stripe.webhooks.constructEvent(
  rawBody,           // Body raw (string/buffer)
  signatureHeader,   // req.headers['stripe-signature']
  webhookSecret      // whsec_...
);
```

> Stripe usa **HMAC-SHA256** internamente para firmar. La librería oficial maneja la verificación automáticamente.

---

## 9. Reembolsos

```bash
# Reembolso total
curl https://api.stripe.com/v1/refunds \
  -u "$STRIPE_SECRET_KEY:" \
  -d payment_intent=pi_xxx

# Reembolso parcial
curl https://api.stripe.com/v1/refunds \
  -u "$STRIPE_SECRET_KEY:" \
  -d payment_intent=pi_xxx \
  -d amount=2500000
```

**Razones de reembolso:**
- `duplicate` — Cargo duplicado
- `fraudulent` — Cargo fraudulento
- `requested_by_customer` — Solicitud del cliente

---

## 10. Customers (Clientes)

Stripe permite crear clientes para asociar pagos, suscripciones y métodos de pago.

```bash
curl https://api.stripe.com/v1/customers \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="Juan Pérez" \
  -d email="juan@example.com" \
  -d phone="+573001234567" \
  -d "metadata[crm_id]"="cliente_123"
```

---

## 11. Estados de Payment Intent

| Estado                       | Descripción                                     |
|-----------------------------|-------------------------------------------------|
| `requires_payment_method`   | Esperando método de pago                        |
| `requires_confirmation`     | Esperando confirmación                          |
| `requires_action`           | Requiere acción adicional (3DS, etc.)           |
| `processing`                | En proceso                                      |
| `requires_capture`          | Autorizado, pendiente de captura                |
| `canceled`                  | Cancelado                                       |
| `succeeded`                 | Pago exitoso                                    |

---

## 12. Stripe.js y Elements (Frontend)

### Inicializar Stripe.js

```typescript
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Usar la publishable_key del CLIENTE (no la de GO Admin)
const stripePromise = loadStripe('pk_test_...');

function PaymentForm({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
}
```

### Confirmar pago

```typescript
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: 'https://tudominio.com/pago-exitoso',
      },
    });

    if (error) {
      console.error(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit">Pagar</button>
    </form>
  );
}
```

---

## 13. Credenciales de Prueba

| Variable            | Valor                                      |
|--------------------|--------------------------------------------|
| `publishable_key`  | `pk_test_<TU_PUBLISHABLE_KEY>`             |
| `secret_key`       | `<TU_SECRET_KEY>`                          |
| `webhook_secret`   | Se genera al crear endpoint en Dashboard    |

### Tarjetas de prueba

| Escenario           | Número               | CVC    | Fecha   |
|--------------------|-----------------------|--------|---------|
| Aprobada           | `4242 4242 4242 4242` | Cualquier | Futuro |
| Autenticación 3DS  | `4000 0025 0000 3155` | Cualquier | Futuro |
| Rechazada          | `4000 0000 0000 9995` | Cualquier | Futuro |
| Fondos insuficientes | `4000 0000 0000 9995` | Cualquier | Futuro |
| Tarjeta expirada   | `4000 0000 0000 0069` | Cualquier | Futuro |

---

## 14. Diferencias con Wompi, MercadoPago y PayU

| Aspecto              | Stripe                         | Wompi                          | MercadoPago                    | PayU                           |
|---------------------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|
| **Credenciales**     | 3: pk, sk, whsec               | 4: pub, priv, events, integrity | 3: public, access, webhook     | 4: apiKey, apiLogin, merchantId, accountId |
| **Montos**           | Centavos                       | Centavos                       | Pesos                          | Pesos/decimales                |
| **API Style**        | REST puro                      | REST                           | REST                           | JSON-RPC (comando en body)     |
| **Autenticación**    | Bearer sk_...                  | Bearer priv_...                | Bearer access_token            | apiKey+apiLogin en body        |
| **Webhook firma**    | HMAC-SHA256 (stripe-signature) | SHA256 checksum                | HMAC-SHA256 (x-signature)      | MD5 (sign)                     |
| **Colombia**         | Solo tarjetas                  | Tarjetas, PSE, Nequi, Efecty  | Tarjetas, PSE, Efecty          | Tarjetas, PSE, Nequi, Efecty, Bancolombia |
| **Checkout hosted**  | ✅ Checkout Sessions            | ✅ Widget JS                   | ✅ Checkout Pro                 | ❌ (Web Checkout básico)       |
| **Suscripciones**    | ✅ Nativo completo              | ❌                             | ✅ Básico                      | ✅ Recurrentes                 |
| **SDK JS**           | Stripe.js + Elements           | Wompi Widget                   | MercadoPago.js                 | N/A (fingerprint only)        |
| **Cobertura global** | 46+ países                     | Solo Colombia                  | 6 países LATAM                 | 6 países LATAM                |

---

## 15. Casos de Uso en GO Admin ERP

### POS (Punto de Venta)
- Cobrar ventas con tarjeta usando **Payment Intents**
- Terminal virtual para cobros remotos

### PMS (Reservas de Hotel)
- Cobrar reservas anticipadas con **Checkout Sessions**
- Autorizar tarjeta y capturar al checkout con **capture_method: manual**
- Cobrar no-shows con Payment Intent off-session

### CRM (Membresías)
- Membresías recurrentes con **Subscriptions**
- Cobros automáticos mensuales/anuales

### Finanzas (Facturas)
- Enviar facturas con link de pago usando **Invoices**
- Cobrar cuentas por cobrar

### Integraciones (Links de Pago)
- Compartir **Payment Links** por WhatsApp, email, redes sociales
- Sin necesidad de desarrollo adicional

---

## 16. Flujo de Integración con GO Admin ERP

### Paso 1: Configurar en BD (ya existe)

- **Provider:** `stripe` (ID: `7d9abb20-5bbb-410c-b4da-c2231511be34`)
- **Connector:** `stripe_payments` → crear con `supported_countries: ['CO', 'US', 'MX', 'BR', ...]`

### Paso 2: Servicio Backend

Crear en `src/lib/services/integrations/stripe/` (**SEPARADO** de `src/lib/stripe/`):

| Archivo                | Contenido                                            |
|-----------------------|-------------------------------------------------------|
| `stripeClientTypes.ts` | Interfaces TS: credenciales, PaymentIntent, webhooks  |
| `stripeClientConfig.ts`| URLs, prefijos de llaves, constantes                  |
| `stripeClientService.ts`| Servicio: pagos, reembolsos, checkout, clientes, webhook |
| `index.ts`            | Re-exportaciones                                      |

> **Nota:** Archivos con prefijo `Client` para diferenciar del servicio interno `src/lib/stripe/`.

### Paso 3: API Routes

| Ruta                                            | Método | Descripción                     |
|-------------------------------------------------|--------|---------------------------------|
| `/api/integrations/stripe/create-payment`       | POST   | Crear Payment Intent            |
| `/api/integrations/stripe/webhook`              | POST   | Recibir eventos de Stripe       |
| `/api/integrations/stripe/health-check`         | POST   | Verificar credenciales          |
| `/api/integrations/stripe/checkout-session`     | POST   | Crear Checkout Session          |

### Paso 4: UI

- Agregar `stripe` a `PROVIDER_CREDENTIAL_OVERRIDES` en `StepCredentials.tsx`
- 3 campos: `publishable_key`, `secret_key`, `webhook_secret`
- Validación: crear PaymentIntent de $1 y cancelarlo inmediatamente
- Guardar credenciales en `integration_credentials` con 3 purposes

### Paso 5: Webhook

- URL del webhook usa el dominio de `organization_domains`
- Formato: `https://{host}/api/integrations/stripe/webhook`
- Verificar firma con `stripe.webhooks.constructEvent()`
- **Separado** del webhook interno (`/api/stripe/webhook`)

---

## 17. Consideraciones de Seguridad

1. **NUNCA** exponer `secret_key` en el frontend
2. **Solo** `publishable_key` va al navegador (para Stripe.js)
3. **Siempre** verificar firma del webhook con `webhook_secret`
4. **Usar HTTPS** obligatorio para PCI compliance
5. **No almacenar** datos de tarjeta — Stripe tokeniza todo
6. **PCI SAQ A** — Mínima carga de compliance al usar Stripe.js/Elements
7. **Idempotency keys** para evitar cargos duplicados en reintentos

---

## 18. Límites y Restricciones

| Aspecto            | Límite                                          |
|-------------------|-------------------------------------------------|
| Monto mínimo COP  | $2,000 COP (`200000` centavos)                  |
| Monto mínimo USD  | $0.50 USD (`50` centavos)                       |
| Webhooks timeout   | 20 segundos para responder con 200              |
| Webhook reintentos | Hasta 3 días con backoff exponencial             |
| API rate limit     | 100 requests/segundo (modo test: 25 req/s)       |
| Statement descriptor | Máximo 22 caracteres                          |

---

## 19. SDK y Librerías

| Plataforma | Librería                      | Instalación                    |
|-----------|-------------------------------|--------------------------------|
| Node.js   | `stripe`                      | `npm install stripe`           |
| React     | `@stripe/react-stripe-js`     | `npm install @stripe/react-stripe-js @stripe/stripe-js` |
| Next.js   | Ambas anteriores              | Ya instaladas en el proyecto   |

---

## 20. Códigos de Error Comunes

| Código                    | Descripción                              |
|--------------------------|------------------------------------------|
| `card_declined`          | Tarjeta rechazada                        |
| `insufficient_funds`     | Fondos insuficientes                     |
| `expired_card`           | Tarjeta expirada                         |
| `incorrect_cvc`          | CVC incorrecto                           |
| `processing_error`       | Error de procesamiento                   |
| `authentication_required`| Requiere autenticación 3D Secure         |
| `rate_limit`             | Límite de peticiones excedido            |
| `invalid_api_key`        | Llave de API inválida                    |
| `resource_missing`       | Recurso no encontrado                    |

---

## 21. Detección de Ambiente

```typescript
function detectStripeEnvironment(publishableKey: string): 'test' | 'live' {
  if (publishableKey.startsWith('pk_test_')) return 'test';
  if (publishableKey.startsWith('pk_live_')) return 'live';
  throw new Error('Publishable key inválida');
}
```
