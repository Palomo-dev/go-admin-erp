# Integración PayU Latam – Colombia

> **Ref oficial:** https://developers.payulatam.com/latam/es/docs/integrations/api-integration/payments-api-colombia.html  
> **Panel comercio:** https://merchants.payulatam.com/  
> **Fecha:** 2026-02-09

---

## 1. Ambientes

| Ambiente   | URL API Pagos                                                           | URL API Consultas                                                       | URL API Reportes                                                         |
|-----------|-------------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| Sandbox   | `https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi`       | `https://sandbox.api.payulatam.com/reports-api/4.0/service.cgi`         | `https://sandbox.api.payulatam.com/reports-api/4.0/service.cgi`          |
| Producción| `https://api.payulatam.com/payments-api/4.0/service.cgi`               | `https://api.payulatam.com/reports-api/4.0/service.cgi`                 | `https://api.payulatam.com/reports-api/4.0/service.cgi`                  |

> PayU usa una **única URL** con comandos JSON (`command`) para diferenciar operaciones (pagos, consultas, tokenización, etc.).

---

## 2. Credenciales

Se obtienen en **Panel PayU → Configuración → Configuración técnica**.

| Variable      | Descripción                                       | Ejemplo Sandbox                    |
|---------------|---------------------------------------------------|------------------------------------|
| `apiKey`      | Clave secreta del comercio (NUNCA exponer)        | `4Vj8eK4rloUd272L48hsrarnUA`      |
| `apiLogin`    | Usuario de API del comercio                       | `pRRXKOl8ikMmt9u`                 |
| `merchantId`  | ID numérico del comercio                          | `508029`                           |
| `accountId`   | ID de la cuenta por país (Colombia)               | `512321`                           |

> **4 credenciales** necesarias para la integración completa.

---

## 3. Firma de Autenticación (Signature)

PayU requiere una firma para validar la autenticidad de cada transacción.

### Estructura

```
MD5(ApiKey~merchantId~referenceCode~tx_value~currency)
```

### Ejemplo

```
Cadena: 4Vj8eK4rloUd272L48hsrarnUA~508029~TestPayU~3~USD
MD5:    ba9ffa71559580175585e45ce70b6c37
```

> Se soportan algoritmos: **MD5**, **SHA**, **SHA256**.

---

## 4. Métodos de Pago – Colombia

### Tarjetas de crédito/débito

| Franquicia   | `paymentMethod` | Tipo          |
|-------------|-----------------|---------------|
| Visa        | `VISA`          | Crédito/Débito|
| Mastercard  | `MASTERCARD`    | Crédito/Débito|
| American Express | `AMEX`     | Crédito       |
| Diners Club | `DINERS`        | Crédito       |
| Codensa     | `CODENSA`       | Crédito       |

### Transferencias y billeteras

| Método               | `paymentMethod`       | Tipo               |
|---------------------|-----------------------|--------------------|
| PSE                 | `PSE`                 | Transferencia bancaria |
| Nequi               | `NEQUI`               | Billetera digital  |
| Botón Bancolombia   | `BANCOLOMBIA_TRANSFER`| Transferencia      |
| Google Pay          | `GOOGLE_PAY`          | Billetera digital  |
| QR Bre-B            | `PIX` (Bre-B QR)      | QR                 |

### Efectivo y referencia bancaria

| Método   | `paymentMethod`  | Tipo              |
|---------|------------------|--------------------|
| Efecty  | `EFECTY`         | Pago en efectivo   |
| Baloto  | `BALOTO`         | Pago en efectivo   |
| Su Red  | `OTHERS_CASH`    | Pago en efectivo   |
| Referencia bancaria | `BANK_REFERENCED` | Referencia    |

---

## 5. Estructura de Peticiones

Todas las peticiones son **POST** con body JSON al endpoint correspondiente.

### Encabezado estándar

```json
{
  "language": "es",
  "command": "SUBMIT_TRANSACTION",
  "merchant": {
    "apiKey": "{{apiKey}}",
    "apiLogin": "{{apiLogin}}"
  },
  "transaction": { ... },
  "test": false
}
```

### Comandos disponibles

| Comando                | Descripción                                      |
|-----------------------|--------------------------------------------------|
| `SUBMIT_TRANSACTION`  | Crear un pago                                    |
| `GET_PAYMENT_METHODS` | Listar métodos de pago disponibles               |
| `PING`                | Verificar conectividad con PayU                  |
| `ORDER_DETAIL`        | Consultar detalle de una orden                   |
| `ORDER_DETAIL_BY_REFERENCE_CODE` | Consultar por referenceCode         |
| `TRANSACTION_RESPONSE_DETAIL` | Consultar detalle de una transacción    |

---

## 6. Flujo de Pago – Tarjeta de Crédito

### Request

```json
{
  "language": "es",
  "command": "SUBMIT_TRANSACTION",
  "merchant": {
    "apiKey": "4Vj8eK4rloUd272L48hsrarnUA",
    "apiLogin": "pRRXKOl8ikMmt9u"
  },
  "transaction": {
    "order": {
      "accountId": "512321",
      "referenceCode": "PRODUCT_TEST_2024-01-01",
      "description": "Pago de prueba",
      "language": "es",
      "signature": "{{signature_md5}}",
      "notifyUrl": "https://tudominio.com/api/webhooks/payu_co",
      "additionalValues": {
        "TX_VALUE": { "value": 65000, "currency": "COP" },
        "TX_TAX": { "value": 10378, "currency": "COP" },
        "TX_TAX_RETURN_BASE": { "value": 54622, "currency": "COP" }
      },
      "buyer": {
        "fullName": "Juan Pérez",
        "emailAddress": "buyer@test.com",
        "contactPhone": "3001234567",
        "dniNumber": "123456789"
      }
    },
    "payer": {
      "fullName": "Juan Pérez",
      "emailAddress": "payer@test.com",
      "contactPhone": "3001234567",
      "dniNumber": "123456789",
      "billingAddress": {
        "street1": "Cr 23 No. 53-50",
        "city": "Bogotá",
        "state": "Bogotá D.C.",
        "country": "CO",
        "postalCode": "110111",
        "phone": "3001234567"
      }
    },
    "creditCard": {
      "number": "4037997623271984",
      "securityCode": "321",
      "expirationDate": "2030/12",
      "name": "APPROVED"
    },
    "extraParameters": {
      "INSTALLMENTS_NUMBER": 1
    },
    "type": "AUTHORIZATION_AND_CAPTURE",
    "paymentMethod": "VISA",
    "paymentCountry": "CO",
    "deviceSessionId": "vghs6tvkcle931686k1900o6e1",
    "ipAddress": "127.0.0.1",
    "cookie": "pt1t38347bs6jc9ruv2ecpv7o2",
    "userAgent": "Mozilla/5.0"
  },
  "test": true
}
```

### Response

```json
{
  "code": "SUCCESS",
  "transactionResponse": {
    "orderId": 1400437001,
    "transactionId": "f5e668f1-7ecc-4b83-a4d1-0aaa68260862",
    "state": "APPROVED",
    "paymentNetworkResponseCode": "81",
    "paymentNetworkResponseErrorMessage": null,
    "trazabilityCode": "CRED - 666039917",
    "authorizationCode": "123238",
    "responseCode": "APPROVED",
    "responseMessage": "Aprobada",
    "operationDate": 1624461913704,
    "extraParameters": {
      "BANK_REFERENCED_CODE": "CREDIT"
    }
  }
}
```

---

## 7. Flujo PSE (Transferencia Bancaria)

### Listar bancos PSE

```json
{
  "language": "es",
  "command": "GET_BANKS_LIST",
  "merchant": {
    "apiKey": "{{apiKey}}",
    "apiLogin": "{{apiLogin}}"
  },
  "bankListInformation": {
    "paymentMethod": "PSE",
    "paymentCountry": "CO"
  },
  "test": false
}
```

### Crear transacción PSE

Campos adicionales requeridos:

- `transaction.payer.dniType`: Tipo de documento (`CC`, `CE`, `NIT`, `PP`)
- `extraParameters.FINANCIAL_INSTITUTION_CODE`: Código del banco (ej: `1007` = Bancolombia)
- `extraParameters.USER_TYPE`: `N` (persona natural) o `J` (persona jurídica)
- `extraParameters.PSE_REFERENCE1`, `PSE_REFERENCE2`, `PSE_REFERENCE3`: IP, User-Agent info
- `extraParameters.RESPONSE_URL`: URL de retorno después del pago

> La respuesta incluye `extraParameters.BANK_URL` → redirigir al usuario a esa URL.

---

## 8. Pagos en Efectivo

Para Efecty, Baloto, Su Red:

- `paymentMethod`: `EFECTY`, `BALOTO`, `OTHERS_CASH`
- La respuesta incluye `extraParameters.URL_PAYMENT_RECEIPT_HTML` → URL con el recibo de pago
- El cliente lleva el recibo al punto de pago

> El comprobante tiene fecha de expiración (default 7 días, configurable con `EXPIRATION_DATE`).

---

## 9. Nequi

- `paymentMethod`: `NEQUI`
- El usuario recibe una notificación push en la app Nequi para aprobar el pago
- La transacción queda en estado `PENDING` hasta que el usuario apruebe

---

## 10. Botón Bancolombia

- `paymentMethod`: `BANCOLOMBIA_TRANSFER`
- Respuesta incluye URL de redirección a la app/portal de Bancolombia
- El usuario autoriza el pago desde su cuenta Bancolombia

---

## 11. Impuestos (Colombia)

PayU Colombia requiere enviar información de impuestos:

| Campo                      | Descripción                         | Ejemplo        |
|---------------------------|-------------------------------------|----------------|
| `TX_VALUE`                | Valor total de la transacción       | `65000` COP    |
| `TX_TAX`                  | Valor del IVA                       | `10378` COP    |
| `TX_TAX_RETURN_BASE`      | Base gravable del IVA               | `54622` COP    |

> Si el producto/servicio está exento de IVA: `TX_TAX = 0` y `TX_TAX_RETURN_BASE = 0`.

---

## 12. Confirmación / Webhook

PayU notifica el resultado de las transacciones mediante POST a la **URL de confirmación**.

### Configuración

1. **Panel PayU** → Configuración → Configuración técnica → URL de confirmación
2. O por transacción: campo `notifyUrl` en el body de la petición

### Variables recibidas en el webhook

| Variable             | Descripción                              |
|---------------------|------------------------------------------|
| `merchant_id`       | ID del comercio                          |
| `state_pol`         | Estado de la transacción (4=Aprobada, 6=Rechazada, 7=Pendiente) |
| `risk`              | Puntuación de riesgo                     |
| `response_code_pol` | Código de respuesta                      |
| `reference_sale`    | Referencia de la venta (referenceCode)   |
| `reference_pol`     | Referencia interna PayU                  |
| `sign`              | Firma de validación                      |
| `extra1`, `extra2`  | Datos adicionales                        |
| `payment_method`    | Método de pago utilizado                 |
| `payment_method_type` | Tipo (2=Crédito, 4=PSE, 7=Efectivo)  |
| `installments_number` | Número de cuotas                      |
| `value`             | Monto de la transacción                  |
| `tax`               | IVA                                      |
| `transaction_date`  | Fecha de la transacción                  |
| `currency`          | Moneda                                   |
| `email_buyer`       | Email del comprador                      |
| `transaction_id`    | ID de la transacción                     |

### Validación de firma del webhook

```
signature = MD5(ApiKey~merchantId~referenceCode~new_value~currency~state_pol)
```

> `new_value` puede tener hasta 1 decimal (ej: `150000.0`). Se debe redondear con `HALF_UP`.
> Comparar la firma calculada con el campo `sign` recibido.

### IPs para whitelist (webhooks)

```
18.232.231.205
18.235.148.28
34.195.228.30
34.196.146.74
54.196.229.4
54.90.62.10
```

---

## 13. Consultar Transacciones

### Por Order ID

```json
{
  "language": "es",
  "command": "ORDER_DETAIL",
  "merchant": {
    "apiKey": "{{apiKey}}",
    "apiLogin": "{{apiLogin}}"
  },
  "details": {
    "orderId": 1400437001
  },
  "test": false
}
```

### Por Reference Code

```json
{
  "language": "es",
  "command": "ORDER_DETAIL_BY_REFERENCE_CODE",
  "merchant": {
    "apiKey": "{{apiKey}}",
    "apiLogin": "{{apiLogin}}"
  },
  "details": {
    "referenceCode": "PRODUCT_TEST_2024-01-01"
  },
  "test": false
}
```

---

## 14. Reembolsos

```json
{
  "language": "es",
  "command": "SUBMIT_TRANSACTION",
  "merchant": {
    "apiKey": "{{apiKey}}",
    "apiLogin": "{{apiLogin}}"
  },
  "transaction": {
    "order": {
      "id": 1400437001
    },
    "type": "REFUND",
    "reason": "Solicitud del cliente",
    "parentTransactionId": "f5e668f1-7ecc-4b83-a4d1-0aaa68260862"
  },
  "test": false
}
```

> **Reembolso parcial:** Agregar `additionalValues.TX_VALUE` con el monto a reembolsar.
> Solo transacciones `CAPTURED` o `AUTHORIZATION_AND_CAPTURE` pueden ser reembolsadas.

---

## 15. Tipos de Transacción

| Tipo                        | Descripción                                |
|----------------------------|--------------------------------------------|
| `AUTHORIZATION_AND_CAPTURE`| Autorización + captura en un solo paso     |
| `AUTHORIZATION`            | Solo autorización (reserva fondos)         |
| `CAPTURE`                  | Captura una autorización previa            |
| `CANCELLATION`             | Cancela una autorización previa            |
| `VOID`                     | Anula una transacción capturada            |
| `REFUND`                   | Reembolso total o parcial                  |

> **Colombia solo soporta `AUTHORIZATION_AND_CAPTURE`** para la mayoría de métodos.

---

## 16. Estados de Transacción

| `state` / `state_pol` | Descripción         |
|------------------------|---------------------|
| `APPROVED` / 4         | Aprobada            |
| `DECLINED` / 6         | Rechazada           |
| `PENDING` / 7          | Pendiente           |
| `EXPIRED` / 5          | Expirada            |
| `ERROR` / 104          | Error               |

### Códigos de respuesta comunes

| `responseCode`                  | Descripción                            |
|--------------------------------|----------------------------------------|
| `APPROVED`                     | Transacción aprobada                   |
| `ANTIFRAUD_REJECTED`           | Rechazada por antifraude               |
| `PAYMENT_NETWORK_REJECTED`     | Rechazada por la red de pagos          |
| `ENTITY_DECLINED`              | Rechazada por el banco                 |
| `INSUFFICIENT_FUNDS`           | Fondos insuficientes                   |
| `INVALID_CARD`                 | Tarjeta inválida                       |
| `EXPIRED_CARD`                 | Tarjeta expirada                       |
| `PENDING_TRANSACTION_REVIEW`   | Pendiente de revisión antifraude       |
| `PENDING_PAYMENT_IN_ENTITY`    | Pendiente de pago en entidad           |

---

## 17. Credenciales de Prueba (Sandbox)

| Variable      | Valor                            |
|---------------|----------------------------------|
| `apiKey`      | `4Vj8eK4rloUd272L48hsrarnUA`    |
| `apiLogin`    | `pRRXKOl8ikMmt9u`               |
| `merchantId`  | `508029`                         |
| `accountId`   | `512321` (Colombia)              |

### Tarjetas de prueba

Para **aprobar**: Nombre `APPROVED`, CVV `777`, fecha exp. mes < 6 año futuro.  
Para **rechazar**: Nombre `REJECTED`, CVV `666`, fecha exp. mes > 6 año futuro.

| Franquicia   | Número                  |
|-------------|--------------------------|
| Visa        | `4037997623271984`       |
| Mastercard  | `5123456789012346`       |
| Amex        | `370641901185738`        |
| Diners      | `36169328753412`         |

---

## 18. Diferencias con Wompi y MercadoPago

| Aspecto              | PayU                                  | Wompi                          | MercadoPago                    |
|---------------------|---------------------------------------|--------------------------------|--------------------------------|
| **Credenciales**     | 4: apiKey, apiLogin, merchantId, accountId | 4: pub, priv, events, integrity | 3: public_key, access_token, webhook_secret |
| **Montos**           | Pesos (enteros o decimales)          | Centavos (multiplicar ×100)    | Pesos (enteros)               |
| **Autenticación**    | apiKey+apiLogin en body JSON          | Bearer token / llave pública   | Bearer Access Token            |
| **Firma**            | MD5(apiKey~merchantId~ref~valor~moneda) | SHA256(ref+monto+moneda+secreto) | HMAC-SHA256 x-signature       |
| **API Style**        | JSON RPC (comando en body)            | REST                           | REST                           |
| **Webhook**          | POST con form-urlencoded / query params | POST con JSON body             | POST con JSON body             |
| **Sandbox URL**      | sandbox.api.payulatam.com             | sandbox.wompi.co               | api.mercadopago.com (prefijo TEST-) |
| **Tokenización**     | API propia de tokenización            | SDK JS Wompi                   | SDK MercadoPago.js             |
| **Impuestos**        | TX_TAX + TX_TAX_RETURN_BASE obligatorios | No requerido                  | No requerido                   |

---

## 19. Flujo de Integración con GO Admin ERP

### Paso 1: Configurar en BD (ya hecho)

- **Provider:** `payu` (ID: `1084bdca-1c07-4989-a3d8-8169de72e6c0`)
- **Connector:** `payu_co` → crear con `supported_countries: ['CO']`

### Paso 2: Servicio Backend

Crear en `src/lib/services/integrations/payu/`:

| Archivo              | Contenido                                          |
|---------------------|-----------------------------------------------------|
| `payuTypes.ts`      | Interfaces TS: credenciales, request/response pagos, webhooks |
| `payuConfig.ts`     | URLs, comandos, constantes                          |
| `payuService.ts`    | Servicio: firma, pagos, consultas, reembolsos, webhook |
| `index.ts`          | Re-exportaciones                                    |

### Paso 3: API Routes

| Ruta                                          | Método | Descripción                    |
|-----------------------------------------------|--------|--------------------------------|
| `/api/integrations/payu/create-payment`       | POST   | Crear pago                     |
| `/api/integrations/payu/webhook`              | POST   | Recibir confirmaciones PayU    |
| `/api/integrations/payu/payment-methods`      | GET    | Listar métodos disponibles     |
| `/api/integrations/payu/health-check`         | POST   | Verificar credenciales (PING)  |
| `/api/integrations/payu/banks`                | GET    | Listar bancos PSE              |

### Paso 4: UI

- Agregar `payu` a `PROVIDER_CREDENTIAL_OVERRIDES` en `StepCredentials.tsx`
- 4 campos: `api_key`, `api_login`, `merchant_id`, `account_id`
- Validación vía comando `PING`
- Guardar credenciales en `integration_credentials` con 4 purposes

### Paso 5: Webhook

- URL del webhook usa el dominio de `organization_domains` (igual que Wompi/MP)
- Formato: `https://{host}/api/webhooks/payu_co`
- Validar firma MD5 del webhook comparando con `sign`

---

## 20. Consideraciones de Seguridad

1. **NUNCA** exponer `apiKey` en el frontend
2. **Validar firma** (`sign`) en cada webhook recibido
3. **Whitelist IPs** de PayU para webhooks
4. **Impuestos obligatorios** en Colombia (TX_TAX, TX_TAX_RETURN_BASE)
5. **deviceSessionId** único por transacción para antifraude
6. **referenceCode** único por transacción
7. **No almacenar** datos de tarjeta — usar tokenización de PayU

---

## 21. deviceSessionId (Antifraude)

PayU requiere generar un `deviceSessionId` único por sesión del comprador para el módulo antifraude.

### Generar en frontend

```html
<script type="text/javascript"
  src="https://maf.pagosonline.net/ws/fp/tags.js?id={deviceSessionId}{payerCookieValue}">
</script>
<noscript>
  <iframe style="width:100px;height:100px;border:0;position:absolute;top:-5000px;"
    src="https://maf.pagosonline.net/ws/fp/tags.js?id={deviceSessionId}{payerCookieValue}">
  </iframe>
</noscript>
```

> Reemplazar `{deviceSessionId}` con un UUID único y `{payerCookieValue}` con el valor de la cookie del pagador.
