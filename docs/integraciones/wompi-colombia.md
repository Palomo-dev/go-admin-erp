# Wompi Colombia - Documentación de Integración

> **País:** Colombia (COL)  
> **Tipo:** Pasarela de pagos  
> **Moneda:** COP (Pesos Colombianos)  
> **Documentación oficial:** https://docs.wompi.co/docs/colombia/inicio-rapido/  
> **Dashboard comercios:** https://comercios.wompi.co  

---

## 1. Resumen

Wompi es una pasarela de pagos colombiana que permite recibir pagos a través de múltiples métodos. Ofrece tres formas de integración:

1. **Widget & Checkout Web** — Botón de pagos embebido o redirección a página de pago segura.
2. **Plugins de eCommerce** — Integraciones listas para plataformas como WooCommerce, Shopify, etc.
3. **API de pagos** — Integración RESTful completa y personalizada (la que usaremos).

---

## 2. Ambientes y Llaves

### 2.1 Ambientes de Ejecución

| Ambiente    | URL Base                          | Prefijo llaves           | Uso                        |
|-------------|-----------------------------------|--------------------------|----------------------------|
| **Sandbox** | `https://sandbox.wompi.co/v1`     | `pub_test_`, `prv_test_` | Desarrollo y pruebas       |
| **Producción** | `https://production.wompi.co/v1` | `pub_prod_`, `prv_prod_` | Transacciones con dinero real |

> Ambos ambientes son APIs completamente separadas. La especificación es idéntica, solo cambia la URL base y las llaves.

### 2.2 Tipos de Llaves

| Tipo                    | Prefijo (Sandbox)      | Prefijo (Producción)      | Uso                                      |
|-------------------------|------------------------|---------------------------|------------------------------------------|
| **Llave pública**       | `pub_test_`            | `pub_prod_`               | Autenticación en frontend (tokenizar tarjetas, widget) |
| **Llave privada**       | `prv_test_`            | `prv_prod_`               | Autenticación en backend (crear transacciones) |
| **Secreto de eventos**  | `test_events_`         | `prod_events_`            | Verificar autenticidad de webhooks       |
| **Secreto de integridad** | `test_integrity_`    | `prod_integrity_`         | Generar firma de integridad (SHA256)     |

### 2.3 Variables de Entorno Requeridas

```env
# Wompi Colombia
WOMPI_PUBLIC_KEY=pub_prod_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
WOMPI_PRIVATE_KEY=prv_prod_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
WOMPI_EVENTS_SECRET=prod_events_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
WOMPI_INTEGRITY_SECRET=prod_integrity_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
WOMPI_ENVIRONMENT=production  # "sandbox" o "production"
```

---

## 3. Métodos de Pago Disponibles

| Método                                  | `payment_method_type` | Descripción                                                     |
|-----------------------------------------|-----------------------|-----------------------------------------------------------------|
| **Tarjeta de Crédito/Débito**           | `CARD`                | Visa, MasterCard, American Express con CVC                     |
| **Nequi**                               | `NEQUI`               | Pago desde app Nequi vía push notification                     |
| **PSE**                                 | `PSE`                 | Transferencia bancaria desde cualquier banco colombiano        |
| **Botón Bancolombia**                   | `BANCOLOMBIA_TRANSFER`| Transferencia desde cuenta Bancolombia                         |
| **Bancolombia QR**                      | `BANCOLOMBIA_QR`      | Pago escaneando QR con app Bancolombia                         |
| **Corresponsales Bancarios Bancolombia**| `BANCOLOMBIA_COLLECT` | Pago en efectivo en +15,000 corresponsales                    |
| **Daviplata**                           | `DAVIPLATA`           | Pago desde cuenta Daviplata con OTP                            |
| **Puntos Colombia (PCOL)**              | `PCOL`                | Redención de Puntos Colombia                                   |
| **BNPL Bancolombia**                    | `BNPL_BANCOLOMBIA`    | Crédito en 4 cuotas sin intereses (>$100,000 COP)             |
| **SU+ PAY**                             | `SU_PAY`              | Compra en cuotas                                               |

### 3.1 Estados de una Transacción

| Estado      | Descripción                                          |
|-------------|------------------------------------------------------|
| `PENDING`   | Transacción recién creada, esperando resultado       |
| `APPROVED`  | Transacción aprobada                                 |
| `DECLINED`  | Transacción rechazada                                |
| `VOIDED`    | Transacción anulada (solo aplica para tarjetas)      |
| `ERROR`     | Error externo a Wompi autorizando la transacción     |

> **Importante:** Ningún método de pago da resultado síncrono. Siempre se debe hacer **long polling** hasta obtener un `status` final.

---

## 4. Tokens de Aceptación

Cumpliendo con la regulación colombiana y la ley de Habeas Data, **toda transacción** requiere dos tokens de aceptación:

1. **`acceptance_token`** — Aceptación de la política de privacidad.
2. **`accept_personal_auth`** — Aceptación del tratamiento de datos personales.

### 4.1 Obtener Tokens Prefirmados

```
GET /v1/merchants/{llave_publica}
```

**Respuesta:**
```json
{
  "data": {
    "presigned_acceptance": {
      "acceptance_token": "eyJhbGciOiJIUzI1...",
      "permalink": "https://wompi.co/.../TERMINOS-Y-CONDICIONES.pdf",
      "type": "END_USER_POLICY"
    },
    "presigned_personal_data_auth": {
      "acceptance_token": "eyJhbGciOiJIUzI1...",
      "permalink": "https://wompi.com/.../autorizacion-datos-personales.pdf",
      "type": "PERSONAL_DATA_AUTH"
    }
  }
}
```

### 4.2 Enviar Tokens al Crear Transacción

```json
{
  "acceptance_token": "eyJhbGciOiJIUzI1...",
  "accept_personal_auth": "eyJhbGciOiJIUzI1...",
  "amount_in_cents": 2500000,
  "currency": "COP",
  "customer_email": "cliente@example.com",
  "reference": "REF-UNICA-123",
  "payment_method": { ... }
}
```

---

## 5. Firma de Integridad

Para validar la integridad de la información de una transacción, se genera un hash SHA256.

### 5.1 Generación

Concatenar en este orden:
1. `reference` — Referencia de la transacción
2. `amount_in_cents` — Monto en centavos
3. `currency` — Moneda (COP)
4. *(Opcional)* `expiration_time` — Si se usa fecha de expiración
5. `integrity_secret` — Secreto de integridad

```
SHA256("<reference><amount_in_cents><currency><integrity_secret>")
```

### 5.2 Ejemplo en JavaScript/Node.js

```javascript
const crypto = require('crypto');

function generateIntegritySignature(reference, amountInCents, currency, integritySecret) {
  const concatenated = `${reference}${amountInCents}${currency}${integritySecret}`;
  return crypto.createHash('sha256').update(concatenated).digest('hex');
}

// Ejemplo:
const signature = generateIntegritySignature(
  'REF-123',
  2490000,
  'COP',
  'prod_integrity_XXXXXXXX'
);
// Resultado: "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5"
```

> **IMPORTANTE:** Este hash debe generarse **siempre en el servidor** (nunca en el frontend) para no exponer el secreto de integridad.

---

## 6. API de Pagos — Endpoints Principales

### 6.1 Tokenizar Tarjeta

```
POST /v1/tokens/cards
Authorization: Bearer {llave_publica}
```

**Body:**
```json
{
  "number": "4242424242424242",
  "cvc": "123",
  "exp_month": "08",
  "exp_year": "28",
  "card_holder": "José Pérez"
}
```

**Respuesta:**
```json
{
  "status": "CREATED",
  "data": {
    "id": "tok_prod_1_BBb749EAB32e97a2D058Dd538a608301",
    "brand": "VISA",
    "name": "VISA-4242",
    "last_four": "4242",
    "bin": "424242",
    "exp_year": "28",
    "exp_month": "08",
    "card_holder": "José Pérez",
    "expires_at": "2020-06-30T18:52:35.000Z"
  }
}
```

### 6.2 Crear Transacción

```
POST /v1/transactions
Authorization: Bearer {llave_privada}
```

#### Con Tarjeta (CARD)

```json
{
  "acceptance_token": "eyJhbGci...",
  "accept_personal_auth": "eyJhbGci...",
  "amount_in_cents": 2500000,
  "currency": "COP",
  "customer_email": "cliente@example.com",
  "reference": "REF-UNICA-123",
  "signature": "FIRMA_INTEGRIDAD_SHA256",
  "payment_method": {
    "type": "CARD",
    "installments": 2,
    "token": "tok_prod_1_BBb749EAB32e97a2D058Dd538a608301"
  }
}
```

#### Con Nequi

```json
{
  "acceptance_token": "eyJhbGci...",
  "accept_personal_auth": "eyJhbGci...",
  "amount_in_cents": 1500000,
  "currency": "COP",
  "customer_email": "cliente@example.com",
  "reference": "REF-UNICA-456",
  "signature": "FIRMA_INTEGRIDAD_SHA256",
  "payment_method": {
    "type": "NEQUI",
    "phone_number": "3107654321"
  }
}
```

> El cliente recibe una **push notification** en su app Nequi para aceptar o rechazar.

#### Con PSE

```json
{
  "acceptance_token": "eyJhbGci...",
  "accept_personal_auth": "eyJhbGci...",
  "amount_in_cents": 5000000,
  "currency": "COP",
  "customer_email": "cliente@example.com",
  "reference": "REF-UNICA-789",
  "signature": "FIRMA_INTEGRIDAD_SHA256",
  "payment_method": {
    "type": "PSE",
    "user_type": 0,
    "user_legal_id_type": "CC",
    "user_legal_id": "1099888777",
    "financial_institution_code": "1",
    "payment_description": "Pago en GO Admin"
  },
  "customer_data": {
    "phone_number": "573145678901",
    "full_name": "Juan Pérez"
  }
}
```

> Requiere obtener las instituciones financieras primero con `GET /v1/pse/financial_institutions`.  
> Luego redirigir al cliente a la `async_payment_url` que aparece en el campo `payment_method.extra`.

#### Con Bancolombia Transfer

```json
{
  "acceptance_token": "eyJhbGci...",
  "accept_personal_auth": "eyJhbGci...",
  "amount_in_cents": 3000000,
  "currency": "COP",
  "customer_email": "cliente@example.com",
  "reference": "REF-UNICA-101",
  "signature": "FIRMA_INTEGRIDAD_SHA256",
  "payment_method": {
    "type": "BANCOLOMBIA_TRANSFER",
    "payment_description": "Pago en GO Admin",
    "ecommerce_url": "https://midominio.com/thankyou"
  }
}
```

> Redirigir al cliente a la `async_payment_url` que aparece en `payment_method.extra`.

#### Con Daviplata

```json
{
  "acceptance_token": "eyJhbGci...",
  "accept_personal_auth": "eyJhbGci...",
  "amount_in_cents": 150000,
  "currency": "COP",
  "customer_email": "cliente@example.com",
  "reference": "REF-UNICA-202",
  "signature": "FIRMA_INTEGRIDAD_SHA256",
  "payment_method": {
    "type": "DAVIPLATA",
    "user_legal_id": "1134568019",
    "user_legal_id_type": "CC",
    "payment_description": "Pago en GO Admin"
  },
  "payment_method_type": "DAVIPLATA"
}
```

> El sistema envía un código OTP por SMS al número asociado al documento del cliente.  
> Redirigir al cliente a la URL en `payment_method.extra.url` para digitar el código OTP.

### 6.3 Consultar Transacción

```
GET /v1/transactions/{id_transaccion}
Authorization: Bearer {llave_privada}
```

**Respuesta:**
```json
{
  "data": {
    "id": "0101010-0101010101-10101",
    "created_at": "2023-01-17T18:16:06.287Z",
    "amount_in_cents": 1000000,
    "reference": "REF-123",
    "currency": "COP",
    "payment_method_type": "CARD",
    "payment_method": {
      "type": "CARD",
      "extra": {
        "name": "VISA-4242",
        "brand": "VISA",
        "last_four": "4242",
        "processor_response_code": "00"
      },
      "installments": 2
    },
    "status": "APPROVED",
    "status_message": null,
    "merchant": {
      "name": "Mi Comercio",
      "legal_name": "Mi Empresa S.A.S.",
      "email": "comercio@example.com"
    },
    "taxes": []
  }
}
```

### 6.4 Obtener Instituciones Financieras (PSE)

```
GET /v1/pse/financial_institutions
Authorization: Bearer {llave_publica}
```

---

## 7. Eventos (Webhooks)

Wompi notifica cambios en transacciones vía webhook HTTP POST a la URL configurada en el dashboard.

### 7.1 Configuración

Configurar URLs de eventos **por cada ambiente** en https://comercios.wompi.co (sección "Desarrolladores").

### 7.2 Estructura del Evento

```json
{
  "event": "transaction.updated",
  "data": {
    "transaction": {
      "id": "1234-1610641025-49201",
      "amount_in_cents": 4490000,
      "reference": "MZQ3X2DE2SMX",
      "customer_email": "juan@example.com",
      "currency": "COP",
      "payment_method_type": "NEQUI",
      "status": "APPROVED",
      "redirect_url": "https://mitienda.com/pagos/respuesta"
    }
  },
  "environment": "prod",
  "signature": {
    "properties": [
      "transaction.id",
      "transaction.status",
      "transaction.amount_in_cents"
    ],
    "checksum": "3476DDA50F64CD7CBD160689640506FEBEA93239..."
  },
  "timestamp": 1530291411,
  "sent_at": "2018-07-20T16:45:05.000Z"
}
```

### 7.3 Tipos de Eventos

| Evento                                | Descripción                              |
|---------------------------------------|------------------------------------------|
| `transaction.updated`                 | Estado de transacción cambió (APPROVED, DECLINED, VOIDED, ERROR) |
| `nequi_token.updated`                 | Token de Nequi actualizado (APPROVED, DECLINED) |
| `bancolombia_transfer_token.updated`  | Token Bancolombia actualizado (APPROVED, DECLINED) |

### 7.4 Reintentos

- Tu sistema debe responder con **HTTP 200**.
- Si no responde 200, Wompi reintenta **3 veces** en 24 horas:
  - 1er reintento: 30 minutos después
  - 2do reintento: 3 horas después
  - 3er reintento: 24 horas después

### 7.5 Verificación de Autenticidad (Checksum)

Para evitar suplantaciones, verificar el checksum SHA256 del evento:

```javascript
const crypto = require('crypto');

function verifyWompiEvent(event, eventsSecret) {
  // Paso 1: Concatenar los valores de las propiedades indicadas en signature.properties
  const values = event.signature.properties.map(prop => {
    const keys = prop.split('.');
    let value = event.data;
    for (const key of keys) {
      value = value[key];
    }
    return value;
  });
  
  // Paso 2: Concatenar timestamp
  let concatenated = values.join('') + event.timestamp;
  
  // Paso 3: Concatenar secreto de eventos
  concatenated += eventsSecret;
  
  // Paso 4: Generar SHA256
  const calculatedChecksum = crypto
    .createHash('sha256')
    .update(concatenated)
    .digest('hex')
    .toUpperCase();
  
  // Paso 5: Comparar
  return calculatedChecksum === event.signature.checksum;
}
```

> El checksum también está disponible en el header HTTP `X-Event-Checksum`.

---

## 8. Widget & Checkout Web (Alternativa)

### 8.1 Widget (Botón embebido)

```html
<form>
  <script
    src="https://checkout.wompi.co/widget.js"
    data-render="button"
    data-public-key="pub_prod_XXXXXXXX"
    data-currency="COP"
    data-amount-in-cents="4950000"
    data-reference="REF-UNICA-123"
    data-signature:integrity="FIRMA_SHA256"
    data-redirect-url="https://midominio.com/pagos/respuesta"
  ></script>
</form>
```

### 8.2 Web Checkout (Redirección)

```html
<form action="https://checkout.wompi.co/p/" method="GET">
  <input type="hidden" name="public-key" value="pub_prod_XXXXXXXX" />
  <input type="hidden" name="currency" value="COP" />
  <input type="hidden" name="amount-in-cents" value="4950000" />
  <input type="hidden" name="reference" value="REF-UNICA-123" />
  <input type="hidden" name="signature:integrity" value="FIRMA_SHA256" />
  <input type="hidden" name="redirect-url" value="https://midominio.com/respuesta" />
  <button type="submit">Pagar con Wompi</button>
</form>
```

### 8.3 Parámetros Obligatorios

| Parámetro              | Descripción                               |
|------------------------|-------------------------------------------|
| `public-key`           | Llave pública del comercio                |
| `currency`             | Moneda (COP)                              |
| `amount-in-cents`      | Monto en centavos ($95,000 = 9500000)     |
| `reference`            | Referencia única de pago                  |
| `signature:integrity`  | Firma de integridad SHA256                |

### 8.4 Parámetros Opcionales

| Parámetro                          | Descripción                              |
|------------------------------------|------------------------------------------|
| `redirect-url`                     | URL de redirección post-pago             |
| `expiration-time`                  | Fecha de expiración (ISO 8601)           |
| `tax-in-cents:vat`                 | IVA en centavos                          |
| `tax-in-cents:consumption`         | Impoconsumo en centavos                  |
| `customer-data:email`              | Email del pagador                        |
| `customer-data:full-name`          | Nombre completo del pagador              |
| `customer-data:phone-number`       | Teléfono del pagador                     |
| `customer-data:legal-id`           | Documento de identidad                   |
| `customer-data:legal-id-type`      | Tipo de documento (CC, NIT, etc.)        |
| `shipping-address:address-line-1`  | Dirección de envío                       |
| `shipping-address:country`         | País de envío (CO)                       |
| `shipping-address:city`            | Ciudad de envío                          |
| `shipping-address:region`          | Región de envío                          |

---

## 9. Flujo de Integración con GO Admin ERP

### 9.1 Flujo General

```
1. Cliente selecciona productos/servicios en GO Admin
   ↓
2. Backend genera referencia única y firma de integridad
   ↓
3. Backend obtiene tokens de aceptación (GET /merchants/{pub_key})
   ↓
4. Frontend muestra formulario de pago (tarjeta, Nequi, PSE, etc.)
   ↓
5. Backend crea transacción (POST /v1/transactions)
   ↓
6. Si requiere redirección (PSE, Bancolombia, Daviplata):
   - Long polling hasta obtener async_payment_url
   - Redirigir al cliente
   ↓
7. Si es Nequi:
   - Cliente acepta push notification en su celular
   ↓
8. Long polling para verificar status final (GET /v1/transactions/{id})
   ↓
9. Webhook recibe evento transaction.updated
   ↓
10. Backend verifica checksum del webhook
   ↓
11. Backend actualiza estado del pago en Supabase
```

### 9.2 Archivos a Crear

```
src/lib/services/integrations/
  wompi/
    wompiService.ts         # Servicio principal (crear transacción, consultar, etc.)
    wompiWebhook.ts         # Manejo de webhooks
    wompiTypes.ts           # Interfaces TypeScript
    wompiConfig.ts          # Configuración y URLs

src/app/api/integrations/
  wompi/
    create-transaction/route.ts   # API para crear transacciones
    webhook/route.ts              # Endpoint para recibir webhooks
    institutions/route.ts         # Proxy para instituciones PSE
```

### 9.3 Tablas de Supabase Relacionadas

| Tabla                      | Relación                                          |
|----------------------------|---------------------------------------------------|
| `payments`                 | Registro de pagos con referencia Wompi            |
| `sales`                    | Ventas asociadas al pago                          |
| `channel_credentials`      | Almacenar llaves de Wompi por organización        |
| `web_orders`               | Pedidos online con pago pendiente                 |

---

## 10. Tarjetas de Prueba (Sandbox)

| Número             | Franquicia  | Resultado   |
|--------------------|-------------|-------------|
| `4242424242424242` | Visa        | APPROVED    |
| `4111111111111111` | Visa        | DECLINED    |
| `5100000000000000` | MasterCard  | APPROVED    |
| `3711111111111111` | AMEX        | APPROVED    |

> Usar cualquier CVC (3 dígitos) y fecha de expiración futura.  
> Nequi test: usar cualquier número de 10 dígitos.

---

## 11. Consideraciones de Seguridad

1. **Llaves privadas y secretos** solo en el backend (variables de entorno).
2. **Firma de integridad** siempre generada en el servidor.
3. **Verificar checksum** de todos los webhooks antes de procesar.
4. **HTTPS obligatorio** para URLs de eventos.
5. **No almacenar** números de tarjeta completos — usar tokenización de Wompi.
6. **Validar `environment`** en webhooks para no mezclar sandbox con producción.

---

## 12. Límites y Restricciones

- **Moneda:** Solo COP (pesos colombianos).
- **Monto mínimo:** Depende del método de pago.
- **BNPL Bancolombia:** Solo transacciones > $100,000 COP.
- **Daviplata `payment_description`:** Máximo 30 caracteres.
- **PSE `payment_description`:** Máximo 64 caracteres.
- **Bancolombia Transfer `payment_description`:** Máximo 64 caracteres, sin comillas simples (`'`).

---

## 13. Referencias

- [Inicio Rápido](https://docs.wompi.co/docs/colombia/inicio-rapido/)
- [Ambientes y Llaves](https://docs.wompi.co/docs/colombia/ambientes-y-llaves/)
- [Widget & Checkout Web](https://docs.wompi.co/docs/colombia/widget-checkout-web/)
- [Métodos de Pago](https://docs.wompi.co/docs/colombia/metodos-de-pago/)
- [Tokens de Aceptación](https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/)
- [Eventos (Webhooks)](https://docs.wompi.co/docs/colombia/eventos/)
- [Fuentes de Pago](https://docs.wompi.co/docs/colombia/fuentes-de-pago/)
- [Referencia API](https://docs.wompi.co/reference)
- [Dashboard de Comercios](https://comercios.wompi.co)
