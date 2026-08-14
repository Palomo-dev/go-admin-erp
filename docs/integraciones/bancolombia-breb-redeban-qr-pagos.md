# Integración QR Dinámicos de Pago — Bancolombia, Bre-B y Redeban

> **Estado:** Documentación de planificación y diseño (fase a fase)
> **Fecha:** 2026-08-14
> **Proyecto:** GO Admin ERP (Next.js + Supabase + TypeScript)
> **Supabase Project ID:** `jgmgphmzusbluqhuqihj`
> **Módulos afectados:** finanzas, integraciones, pos, pms, parking, transporte, notificaciones

---

## Tabla de contenidos

1. [Objetivo y alcance](#1-objetivo-y-alcance)
2. [Resumen ejecutivo](#2-resumen-executivo)
3. [Estado actual del sistema](#3-estado-actual-del-sistema)
4. [Documentación oficial de cada plataforma](#4-documentación-oficial-de-cada-plataforma)
5. [Estándar QR interoperable Colombia (EMVCo)](#5-estándar-qr-interoperable-colombia-emvco)
6. [Arquitectura propuesta](#6-arquitectura-propuesta)
7. [Modelo de datos (Supabase)](#7-modelo-de-datos-supabase)
8. [Fases de implementación](#8-fases-de-implementación)
9. [Flujos completos por módulo](#9-flujos-completos-por-módulo)
10. [Webhooks y notificaciones de pago](#10-webhooks-y-notificaciones-de-pago)
11. [Conciliación bancaria automática](#11-conciliación-bancaria-automática)
12. [Seguridad y cumplimiento](#12-seguridad-y-cumplimiento)
13. [Onboarding y requisitos comerciales](#13-onboarding-y-requisitos-comerciales)
14. [Variables de entorno](#14-variables-de-entorno)
15. [Referencias oficiales](#15-referencias-oficiales)

---

## 1. Objetivo y alcance

### 1.1 Objetivo

Conectar los métodos de pago y los bancos del ERP con **Bancolombia**, **Bre-B** (Banco de la República) y **Redeban Multicolor** para:

- Generar **QR dinámicos** de pago interoperables (estándar EMVCo Colombia) desde el ERP.
- Recibir **notificaciones en tiempo real** (webhooks) cuando un cliente paga escaneando el QR desde su app bancaria.
- Conciliar automáticamente el pago contra la cuenta bancaria del comercio.
- Aplicar el flujo en **POS**, **PMS (mesas/checkout)**, **Finanzas**, **Parking** y **Transporte**.

### 1.2 Alcance

| Incluido | No incluido (futura fase) |
|----------|---------------------------|
| Generación de QR dinámico EMVCo | Pagos con tarjeta tokenizada (3DS) |
| Webhooks inbound de los 3 proveedores | Dispersiones / payouts salientes Bre-B |
| Registro del pago en `payments` | Suscripciones recurrentes automáticas |
| Conciliación bancaria automática | Integración directa con ACH Colombia (PSE crudo) |
| Notificaciones internas al usuario | Reembolsos automáticos vía API |
| Multi-banco y multi-conexión por sucursal | FX / moneda distinta a COP |

### 1.3 Módulos del ERP impactados

Según las reglas del proyecto (`code-style-guide.md`), los módulos base son:

- `finanzas` → `/app/finanzas/metodos-pago`, `/app/finanzas/bancos`, `/app/finanzas/conciliacion-bancaria`
- `integraciones` → `/app/integraciones/conexiones`
- `pos` → `/app/pos`, `/app/pos/mesas/[id]`
- `pms` → `/app/pms/checkout`
- `parking` → `/app/parking/operacion`
- `transporte` → `/app/transporte`
- `notificaciones` → `/app/notificaciones`

> **Regla de scope:** todo código nuevo se ubica bajo la carpeta del módulo correspondiente. Los servicios compartidos (QR, webhooks) viven en `src/lib/services/integrations/{provider}/`.

---

## 2. Resumen ejecutivo

El ERP ya cuenta con un sistema de pagos maduro:

- Tabla central **`payments`** que registra todos los pagos (POS, PMS, Parking, Folios, Cuentas por cobrar/pagar, Facturas).
- Tabla **`organization_payment_methods`** con campo `integration_connection_id` que enlaza un método de pago a una conexión de integración.
- Tablas de integración completas: `integration_providers`, `integration_connectors`, `integration_connections`, `integration_credentials`, `integration_events`, `integration_webhooks`, `integration_object_mappings`.
- Conciliación bancaria existente: `bank_accounts`, `bank_transactions`, `bank_reconciliations`, `bank_reconciliation_items`.
- Pasarelas ya integradas: **Wompi** (que ya soporta `BANCOLOMBIA_QR`), **MercadoPago**, **Stripe**, **PayU**, **PayPal**.

**Breve diagnóstico:** la infraestructura de integraciones ya soporta webhooks, credenciales encriptadas y eventos. Lo que falta es:

1. Registrar 3 nuevos providers/connectors (Bancolombia, Bre-B, Redeban) en `integration_providers`/`integration_connectors`.
2. Crear los servicios `src/lib/services/integrations/{bancolombia,breb,redeban}/`.
3. Crear las API routes de generación de QR y recepción de webhooks.
4. Extender los `CheckoutDialog` (POS, PMS) y el flujo de Parking/Transporte para mostrar el QR y esperar confirmación.
5. Al confirmar el webhook, insertar en `payments`, `bank_transactions` y disparar notificación interna.

**Recomendación clave:** Bancolombia y Bre-B **no exponen APIs públicas directas** con endpoints documentados públicamente. La ruta más rápida es:

- **Bancolombia QR** → vía **Wompi** (ya integrado, soporta `BANCOLOMBIA_QR`) **o** vía API QR Code de Bancolombia (requiere onboarding comercial).
- **Bre-B** → vía proveedor BaaS (**Mono** o **Passport PaaS**) porque el Banco de la República no da acceso directo a desarrolladores.
- **Redeban** → vía API REST directa (`https://ccapi.redeban.com`) con Auth-Token, es el más accesible para integración inmediata.

---

## 3. Estado actual del sistema

### 3.1 Tablas existentes relevantes (Supabase — proyecto `jgmgphmzusbluqhuqihj`)

#### 3.1.1 Núcleo de pagos

**`payments`** (registro central de todos los pagos)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `organization_id` | integer FK → `organizations` | |
| `branch_id` | integer FK → `branches` | |
| `source` | text | `'sale'`, `'invoice_sales'`, `'folio'`, `'parking_session'`, `'parking_pass'`, `'pms'`, `'account_receivable'`, `'account_payable'`, `'web_order'`, `'invoice_purchase'` |
| `source_id` | text | ID de la entidad origen |
| `method` | text FK → `payment_methods(code)` | |
| `amount` | numeric | |
| `currency` | char(3) FK → `currencies(code)` | |
| `reference` | text | Referencia bancaria/transaccional |
| `processor_response` | jsonb | Respuesta completa del procesador |
| `status` | text | `'pending'`, `'completed'`, `'failed'`, `'cancelled'`, `'reversed'`, `'paid'` |
| `discount_amount` | numeric default 0 | |
| `change_amount` | numeric default 0 | Vuelto (efectivo) |
| `created_by` | uuid FK → `auth.users` | |
| `payment_date` | timestamptz default now() | |

**`payment_methods`** (catálogo global)

| Columna | Tipo | Notas |
|---------|------|-------|
| `code` | text PK | Ej: `cash`, `card`, `qr`, `transfer` |
| `name` | text | |
| `requires_reference` | boolean default false | |
| `is_active` | boolean default true | |
| `is_system` | boolean default false | Si es del sistema (no editable) |

Métodos ya existentes en BD: `cash`, `card`, `transfer`, `credit`, `check`, `qr`, `QR`, `002` (p. QR), `mp`, `stripe`, `paypal`, `payu`, `wompi`, `nequi`, `daviplata`, `pse`, `spei`, `conekta`, `oxxo`, `cashapp`, `venmo`, `zelle`, `001` (sistecredito), `SQS`.

> **Acción requerida:** consolidar los códigos QR duplicados (`qr`, `QR`, `002`) y agregar códigos nuevos: `bancolombia_qr`, `breb_qr`, `redeban_qr`.

**`organization_payment_methods`** (configuración por organización)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | integer PK | |
| `organization_id` | integer FK → `organizations` | |
| `payment_method_code` | text FK → `payment_methods(code)` | |
| `is_active` | boolean default true | |
| `settings` | jsonb default `'{}'` | `gateway`, `gateway_config`, `account_mapping` |
| `show_on_website` | boolean default true | |
| `website_display_order` | integer | |
| `website_display_name` | text | |
| `website_description` | text | |
| `website_icon` | text | |
| **`integration_connection_id`** | uuid FK → `integration_connections(id)` ON DELETE SET NULL | **Clave: vincula el método a una conexión** |

#### 3.1.2 Bancos y conciliación

**`bank_accounts`**

| Columna | Tipo |
|---------|------|
| `id` | integer PK |
| `organization_id` | integer FK |
| `branch_id` | integer FK |
| `name` | text |
| `account_number` | text |
| `bank_name` | text |
| `account_type` | text |
| `currency` | char(3) default `'USD'` |
| `balance` | numeric default 0 |
| `initial_balance` | numeric default 0 |
| `is_active` | boolean default true |
| `created_by` | uuid |

**`bank_transactions`**

| Columna | Tipo |
|---------|------|
| `id` | integer PK |
| `organization_id` | integer FK |
| `bank_account_id` | integer FK |
| `trans_date` | timestamptz default now() |
| `description` | text |
| `amount` | numeric |
| `reference` | text |
| `matched_journal_line_id` | integer FK → `journal_lines` |
| `transaction_type` | text (`'debit'`/`'credit'`) |
| `status` | text default `'unmatched'` |
| `import_source` | text |
| `import_id` | text |
| `uuid` | uuid default `gen_random_uuid()` |
| `branch_id` | integer |

**`bank_reconciliations`** + **`bank_reconciliation_items`**

- `bank_reconciliation_items.matched_payment_id` → FK a `payments(id)` ON DELETE SET NULL
- `bank_reconciliation_items.bank_transaction_id` → FK a `bank_transactions(id)` ON DELETE SET NULL
- `bank_reconciliation_items.matched_journal_line_id` → FK a `journal_lines(id)` ON DELETE SET NULL

> **Conclusión:** el modelo de conciliación ya soporta match entre `bank_transactions` y `payments`. Solo hay que alimentar `bank_transactions` desde los webhooks de los proveedores.

**`bank_transfers`** (transferencias entre cuentas propias)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `organization_id` | integer FK |
| `from_account_id` | integer FK → `bank_accounts` |
| `to_account_id` | integer FK → `bank_accounts` |
| `amount` | numeric |
| `transfer_date` | timestamptz default now() |
| `reference` | text |
| `status` | text default `'completed'` |
| `branch_id` | integer |

#### 3.1.3 Sistema de integraciones

**`integration_providers`** (catálogo de proveedores)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | Ej: `wompi`, `stripe`, `bancolombia`, `breb`, `redeban` |
| `name` | text | |
| `category` | text | `'payments'`, `'ota'`, `'messaging'`, `'ads'`, `'delivery'`, `'social'` |
| `auth_type` | text | |
| `website_url` | text | |
| `docs_url` | text | |
| `logo_url` | text | |
| `is_active` | boolean default true | |
| `metadata` | jsonb default `'{}'` | |

Proveedores ya registrados: `airbnb`, `booking`, `expedia`, `google_ads`, `google_vacation_rentals`, `ifood`, `mercadopago`, `meta`, `paypal`, `payu`, `rappi`, `sendgrid`, `stripe`, `tiktok`, `tripadvisor`, `twilio`, `ubereats`, `whatsapp`, `wompi`.

> **Acción requerida:** insertar 3 nuevos providers: `bancolombia`, `breb`, `redeban` (categoría `payments`).

**`integration_connectors`** (conectores específicos por provider)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `provider_id` | uuid FK → `integration_providers` |
| `code` | text UNIQUE |
| `name` | text |
| `supported_countries` | text[] |
| `capabilities` | jsonb (`pull`, `push`, `realtime`, `webhooks`, `qr`, `pse`, `cash`, `nequi`, `refunds`, `payments`, `bancolombia`) |
| `required_scopes` | text[] |
| `is_active` | boolean default true |
| `metadata` | jsonb |

> **Acción requerida:** insertar conectores: `bancolombia_qr`, `breb_qr` (vía Mono/Passport), `redeban_qr`.

**`integration_connections`** (conexiones activas por organización)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `organization_id` | integer FK |
| `connector_id` | uuid FK → `integration_connectors` |
| `branch_id` | integer |
| `name` | text |
| `environment` | text default `'production'` (`'production'`/`'sandbox'`/`'test'`) |
| `country_code` | text |
| `status` | text default `'draft'` (`'draft'`/`'connected'`/`'paused'`/`'error'`/`'revoked'`) |
| `settings` | jsonb default `'{}'` |
| `last_health_check_at` | timestamptz |
| `last_error_at` | timestamptz |
| `last_error_message` | text |
| `error_count_24h` | integer default 0 |
| `connected_at` | timestamptz |
| `last_activity_at` | timestamptz |
| `created_by` | uuid |

**`integration_credentials`** (credenciales encriptadas)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `connection_id` | uuid FK |
| `credential_type` | text (`'api_key'`, `'oauth'`, `'jwt_cert'`, `'mtls'`) |
| `purpose` | text default `'primary'` |
| `secret_ref` | text (referencia al secreto en vault/KMS) |
| `key_prefix` | text (primeros 4 chars para identificación) |
| `status` | text default `'active'` |
| `expires_at` | timestamptz |
| `rotated_at` | timestamptz |
| `metadata` | jsonb |

**`integration_events`** (log de eventos/webhooks)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `connection_id` | uuid FK |
| `source` | text |
| `direction` | text (`'inbound'`/`'outbound'`) |
| `event_type` | text |
| `external_event_id` | text |
| `payload` | jsonb default `'{}'` |
| `status` | text default `'received'` |
| `processed_at` | timestamptz |
| `error_message` | text |
| `correlation_id` | uuid |
| `event_time` | timestamptz |
| `organization_id` | integer |

**`integration_webhooks`** (configuración de webhooks por conexión)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `connection_id` | uuid FK |
| `direction` | text default `'inbound'` |
| `url` | text |
| `events` | text[] |
| `secret_ref` | text default `'none'` |
| `signing_method` | text default `'hmac_sha256'` |
| `is_active` | boolean default true |
| `last_received_at` | timestamptz |
| `metadata` | jsonb |

**`integration_object_mappings`** (mapeo ID externo ↔ ID interno)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `connection_id` | uuid FK |
| `external_type` | text |
| `external_id` | text |
| `internal_table` | text |
| `internal_id` | text |
| `last_seen_at` | timestamptz |
| `deleted_at` | timestamptz |
| `metadata` | jsonb |

> **Uso:** mapear el `qr_id` / `collection_id` externo al `payment_id` interno.

**`webhook_endpoints`** (webhooks salientes a sistemas del cliente)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `organization_id` | integer FK |
| `name` | text |
| `target_url` | text |
| `secret` | text |
| `events` | text[] |
| `is_active` | boolean |

#### 3.1.4 Tablas hijas por módulo

**`parking_payments`** (puente parking ↔ payment)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `parking_session_id` | uuid FK → `parking_sessions` |
| `parking_pass_id` | uuid FK → `parking_passes` |
| `payment_id` | uuid FK → `payments(id)` |
| `created_at` / `updated_at` | timestamptz |

**`membership_payments`** (puente membresía ↔ payment)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `membership_id` | integer FK → `memberships` ON DELETE CASCADE |
| `payment_id` | uuid FK → `payments(id)` |
| `created_at` / `updated_at` | timestamptz |

**`sales`** (venta POS/PMS)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `organization_id` / `branch_id` / `customer_id` / `user_id` | FK |
| `total` / `balance` / `subtotal` / `tax_total` / `discount_total` | numeric |
| `status` | text |
| `payment_status` | text default `'pending'` |
| `sale_date` | timestamptz |
| `reservation_id` | uuid FK → `reservations` |
| `table_session_id` | uuid |
| `driver_id` | uuid |
| `delivery_fee` / `tip_amount` / `tip_server_id` | numeric/uuid |
| `salesperson_id` / `commission_rate` / `commission_type` | |

**`web_orders`** (pedidos web)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `order_number` | text |
| `status` | text default `'pending'` |
| `payment_status` | text default `'pending'` |
| `payment_method` | text |
| `payment_reference` | text |
| `payment_method_detail` | text |
| `sale_id` | uuid FK → `sales` |
| `total` / `subtotal` / `tax_total` / `discount_total` / `delivery_fee` / `tip_amount` | numeric |

**`invoice_sales`** (facturas de venta — facturación electrónica)

Incluye `payment_method`, `payment_method_code`, `payment_form`, `qr_image` (QR de la factura DIAN), `xml_uuid`, `document_type`, `reference_code`.

> **Nota:** el `qr_image` de `invoice_sales` es el QR fiscal DIAN, **diferente** del QR de pago Bancolombia/Bre-B/Redeban. No confundir.

**`country_payment_methods`** (recomendaciones por país)

| Columna | Tipo |
|---------|------|
| `id` | integer PK |
| `country_code` | varchar |
| `payment_method_code` | text FK → `payment_methods` |
| `is_active` | boolean |
| `default_settings` | jsonb |
| `display_order` | integer |
| `is_recommended` | boolean default true |

**`dian_payment_methods`** (catálogo DIAN de medios de pago — resolución 165)

| Columna | Tipo |
|---------|------|
| `id` | integer PK |
| `code` | varchar |
| `name` | text |

**`seller_bank_accounts`** (cuentas bancarias de vendedores)

| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `seller_id` | uuid FK |
| `bank_name` / `account_type` / `account_number` / `account_holder_name` / `account_holder_document` | text |
| `routing_number` | text |
| `is_verified` | boolean |
| `bank_document_url` | text |

### 3.2 Código existente relevante

| Archivo | Rol |
|---------|-----|
| `src/components/finanzas/metodos-pago/PaymentMethodsPage.tsx` | UI métodos de pago |
| `src/components/finanzas/metodos-pago/payment-method-types.ts` | Constantes `PAYMENT_GATEWAYS`, `SYSTEM_PAYMENT_METHODS` |
| `src/components/finanzas/bancos/BancosService.ts` | Servicio de cuentas y transacciones bancarias |
| `src/components/finanzas/conciliacion-bancaria/ConciliacionService.ts` | Servicio de conciliación (match payment ↔ bank_transaction) |
| `src/lib/services/integrationsService.ts` | Servicio maestro de integraciones (3291 líneas) |
| `src/lib/services/integrations/wompi/wompiService.ts` | Wompi — **ya soporta `BANCOLOMBIA_QR`** |
| `src/lib/services/integrations/wompi/wompiTypes.ts` | Tipos Wompi (incluye `BANCOLOMBIA_QR`, `NEQUI`, `PSE`, `BANCOLOMBIA_TRANSFER`, `DAVIPLATA`) |
| `src/lib/services/posService.ts` | Registro de pagos POS en `payments` (líneas 1700-1736) |
| `src/lib/services/checkoutService.ts` | Checkout PMS — registro de pagos (líneas 840-863) |
| `src/lib/services/parkingPaymentService.ts` | Pagos parking — `payments` (líneas 269-320) |
| `src/components/pos/CheckoutDialog.tsx` | Dialog checkout POS (2015 líneas) |
| `src/components/pms/checkout/CheckoutDialog.tsx` | Dialog checkout PMS (1367 líneas) |
| `src/components/pos/cajas/paymentMethodLabels.ts` | Etiquetas de métodos de pago |
| `src/app/api/integrations/wompi/webhook/route.ts` | Webhook Wompi (patrón a replicar) |
| `src/app/api/integrations/mercadopago/webhook/route.ts` | Webhook MercadoPago (patrón a replicar) |

### 3.3 Patrón existente de webhook (a replicar)

El webhook de Wompi (`src/app/api/integrations/wompi/webhook/route.ts`) ya implementa:

1. Recibe evento `transaction.updated`.
2. Verifica checksum con `integrity_secret`.
3. Registra el evento en `integration_events`.
4. Actualiza el estado en `payments`.
5. (Opcional) inserta en `bank_transactions`.

Este es el patrón exacto a seguir para Bancolombia, Bre-B y Redeban.

---

## 4. Documentación oficial de cada plataforma

### 4.1 Bancolombia

#### Portales

| Portal | URL | Acceso |
|--------|-----|--------|
| Centro de Ayuda APIs (API Market externo) | https://soportedevs.bancolombia.com | Público con registro |
| API Portal (interno) | https://api-portal.apps.bancolombia.com | Solo empleados |
| Centro de Ayuda APIs internas | https://soportedeveloper-portal.bancolombia.com | Solo empleados |

#### Métodos de autenticación

Bancolombia usa 3 métodos según el producto:

1. **OAuth 2.0 (Client Credentials)** — token vigente 20 minutos (1200 s).
   - Headers: `Content-Type: application/x-www-form-urlencoded`, `Accept: application/vnd.bancolombia.v4+json`, `Authorization: Basic {base64(client-id:client-secret)}`
   - Body: `grant_type=client_credentials&scope={scope}`
   - Uso: `Authorization: Bearer {access_token}`

2. **JWT (RS256)** — requiere certificado X.509 (par llave pública/privada).
   - Headers: `json-web-token: {JWT}`, `x-client-certificate: {cert_base64}`, `client-id`, `client-secret`

3. **API Key** — `client-id` y `client-secret` en headers.

#### Productos relevantes

| Producto | Descripción | Autenticación |
|----------|-------------|---------------|
| **QR Code 2.0.0** | Genera QR interoperable EMVCo, recibe notificaciones en tiempo real | OAuth 2.0 o JWT |
| **Payment Button (Botón Bancolombia)** | Recibir transferencias desde cuentas Bancolombia vía web | OAuth 2.0 (scopes `Transfer-Intention:write:app`, `Transfer-Intention:read:app`) |
| **Transactional Information** | Consulta de transacciones por período (conciliación) | OAuth 2.0 |
| **Recaudos** | Convenios de recaudo con archivos Asobancaria 2001/2011 | Comercial |

#### Flujo QR Code Bancolombia

1. Comercio genera QR dinámico vía API QR Code.
2. Cliente escanea desde APP Personas, APP BALM o APP Nequi.
3. Transferencia se ejecuta inmediatamente.
4. Notificación al comercio:
   - **Modelo estático:** delegados (SMS/email, hasta 3 c/u).
   - **Modelo integración API:** POST a URL del comercio con mensaje cifrado JWT.

#### Flujo Payment Button (Botón Bancolombia)

1. Comercio llama API Payment Button (POST) → retorna URL de redirección.
2. Cliente autentica y autoriza en Bancolombia.
3. **Callback obligatorio:** POST a `confirmationURL` con estado `pending`/`approved`/`rejected`. Tiempo de respuesta máximo **3 segundos**.

#### Wompi como alternativa (ya integrada)

Wompi (Grupo Bancolombia) ya está integrada en el ERP y soporta:
- `BANCOLOMBIA_QR` — pago vía QR Bancolombia
- `BANCOLOMBIA_TRANSFER` — Botón Bancolombia
- `NEQUI`, `DAVIPLATA`, `PSE`, `CARD`

> **Recomendación:** para QR Bancolombia, usar Wompi (ruta corta) **o** la API QR Code directa (requiere onboarding comercial con Bancolombia).

#### Onboarding sandbox

1. Solicitud de acceso (https://soportedevs.bancolombia.com/hc/es-419/articles/12467698138388) — 24 h hábiles.
2. Crear aplicación en Portal Sandbox.
3. Obtener `client_id` y `client_secret` (solo visible una vez).
4. Suscribir la app al producto API.
5. Descargar colecciones Postman/Insomnia del API Market.

#### Paso a producción

- Cuenta de ahorros/corriente activa con Bancolombia.
- Pruebas exitosas en sandbox.
- Proceso comercial con ejecutivo de cuenta.
- Firma del **Reglamento de APIs Bancolombia**.
- Solicitud de credenciales productivas (con TPS, timeout, días/horas de operación).
- Reset de `client_secret` cada 6 meses.

### 4.2 Bre-B (Banco de la República)

#### Modelo de acceso

**El Banco de la República NO expone APIs públicas directamente a desarrolladores.** El acceso es a través de:

- **EASPBVI** (Entidades Administradoras de Sistemas de Pago de Bajo Valor Inmediatos) — vinculación formal con BanRep (complejo, requiere autorización Superfinanciera).
- **Proveedores BaaS/Fintech** (recomendado): **Mono**, **Passport PaaS (Visionamos)**, **EBANX**, **Kushki**, **Cobre**, **OnePay**.

#### Estándar QR interoperable (EMVCo Colombia)

Bre-B usa el estándar **EMVCo QR Code** adaptado por las EASPBV. Documentos:
- Campos QR Code EMVCo: https://www.achcolombia.com.co/campos-qr-code-emvco
- Lineamientos interoperabilidad QR v4: https://www.redeban.com/sites/default/files/2024-10/documento-lineamientos-interoperabilidad-qr-version-4-2024.pdf

#### Proveedor recomendado: Mono

- **URL Sandbox:** `https://sandbox.api.cuentamono.com`
- **Landing:** https://breb.app/
- **Docs:** https://docs.mono.la/docs/guides/breb-participant
- **Autenticación:** OAuth 2.0 Client Credentials.

**Crear Collection con QR:**
```
POST /api/v1/collections
{
  "amount": 50000,
  "currency": "COP",
  "key_type": "ALPHA",
  "key_value": "@miempresa",
  "description": "Pago de factura",
  "expires_in": 900,
  "metadata": { "order_id": "ORD-12345" }
}
```

**Eventos webhook:**
- `collection.ready`, `collection.attempt_successful`, `collection.attempt_unsuccessful`, `collection.paid`, `collection.minimum_paid`, `collection.expired`, `collection.cancelled`
- Verificación firma: HMAC-SHA256 en header `X-Signature`.

**Sandbox — simular pago:**
```
POST /api/v1/sandbox/collections/simulate-payment
{ "collection_id": "bbcol_abc123", "amount": 50000 }
```

#### Proveedor alternativo: Passport PaaS (Visionamos)

- **URL Sandbox:** `https://api.paas.sandbox.co.passportfintech.com`
- **Docs:** https://docs.passportfintech.com/ES
- **Crear QR:** `POST /v1/qrcodes` con `type: "DYNAMIC"`, `channel: "ECOMM"`, `amount.value`, `expiration`, `reference`.
- **Eventos webhook:** `payment.accepted`, `payment.settled`, `payment.failed`.
- **Resolución de llaves:** `POST /v1/resolve-key`.
- **Gestión de llaves Bre-B:** `POST /v1/keys` (tipos: `ID`, `PHONE`, `EMAIL`, `ALPHA`, `BCODE`).

#### Límites Bre-B (2026)

- Máximo por transacción: **COP $12.110.000** (1.000 UVB).
- Tiempo máximo de procesamiento: **20 segundos**.
- Disponibilidad: **24/7/365**.
- Tarifa usuarios: gratis primeros 3 años (desde oct-2025); 4º año $6,46 COP/operación a entidades.

#### Conciliación Bre-B

- Reportes del **MOL** (Mecanismo Operativo de Liquidación) vía portal GTA.
- Especificaciones MOL v2.5.0: https://www.redcoopcentral.com/wp-content/uploads/2026/01/MOL_Documento-de-Especificaciones-Tecnicas-v2.5.0-002.pdf
- Proveedores como Cobre y BBVA API Market ofrecen conciliación vía API.

### 4.3 Redeban Multicolor

#### Portales

| Portal | URL |
|--------|-----|
| Portal desarrolladores | https://developers.redeban.com/api/ |
| Docs de pagos | https://developers.redeban.com/docs/payments/ |
| Centro de conocimiento | https://redeban.com/centro-de-conocimiento |
| Dashboard sandbox | https://dashboard-stg.redeban.com |
| Dashboard producción | https://dashboard.redeban.com |

#### URLs base

| Ambiente | Tarjetas (ccapi) | No-card (noccapi) |
|----------|------------------|-------------------|
| Sandbox | `https://ccapi-stg.redeban.com` | `https://noccapi-stg.redeban.com` |
| Producción | `https://ccapi.redeban.com` | `https://noccapi.redeban.com` |

#### Autenticación

Header `Auth-Token`: `Base64(APPLICATION-CODE;UNIXTIMESTAMP;SHA256(APP_KEY+UNIXTIMESTAMP))`.

```python
import time, hashlib
from base64 import b64encode
unix_timestamp = str(int(time.time()))
uniq_token_hash = hashlib.sha256(server_app_key + unix_timestamp).hexdigest()
auth_token = b64encode(f"{server_application_code};{unix_timestamp};{uniq_token_hash}")
```

Credenciales:
- `SERVER_APP_CODE` / `SERVER_APP_KEY` — backend (nunca en cliente).
- `CLIENT_APP_CODE` / `CLIENT_APP_KEY` — SDKs de tokenización.

#### Generar QR dinámico

```
POST /v2/qr/generate/
{
  "qr": { "type": "DIN", "expiration_time": 12233 },
  "order": {
    "amount": 200000,
    "description": "QR Generation",
    "dev_reference": "DE-123",
    "currency": "COP",
    "country": "COL"
  },
  "cost_breakdown": [
    { "type": "vat", "amount": 1000, "calculation_type": "02" },
    { "type": "inc", "amount": 1000, "calculation_type": "02" },
    { "type": "taxable_amount", "amount": 10100, "calculation_type": "01" }
  ],
  "additional_amounts": [
    { "type": "tip", "amount": 10, "calculation_type": "02" }
  ],
  "carrier": {
    "id": "redeban",
    "extra_params": {
      "payer": { "id": "123444", "name": "Fulanito", "email": "fulanito@test.com" }
    }
  }
}
```

Response: `{ "qr": { "image": "base64...", "id": "qr_id_generado" } }`

#### Webhooks Redeban

- URL configurada vía dashboard o con asesor comercial.
- POST con JSON similar al response de la orden.
- Campos clave: `transaction.status` (`pending`/`approved`/`cancelled`/`failure`/`review`), `transaction.id`, `transaction.dev_reference`, `transaction.amount`, `transaction.paid_date`.

#### Conciliación Redeban

- **SICWEB:** aplicación web de consulta y conciliación (https://www.redeban.com/otras-soluciones/sic).
- **API SAC:** ajustes a transacciones (totales, parciales, múltiples).
- **Cámara de compensación:** recepción, validación, liquidación.
- Reportes de conciliación consolidada tarjetas + transferencias (incluye Bre-B).

#### Onboarding

- Email: `integraciones@redeban.com`.
- Cuenta de desarrollador basada en email.
- Contraseña enviada por correo.
- Acceso al dashboard para configurar app y URLs de webhook.

#### Tarifas (referencia)

- Mantenimiento QR: $99 (máx) – $40 (mín).
- Transferencias P2P (4-9M mes): originador $10,5 / receptor $9,5.
- Micro ticket (≤ $3.500): $31,5.

---

## 5. Estándar QR interoperable Colombia (EMVCo)

Los tres proveedores usan el mismo estándar **EMV® QR Code Specification for Payment Systems** adaptado para Colombia (Circular Externa 005 de 2023 de la Superfinanciera).

### 5.1 Campos del payload QR

| TAG | Campo | Longitud | Mandatorio | Descripción |
|-----|-------|----------|------------|-------------|
| 00 | Payload Format Indicator | 2 | Sí | `"01"` |
| 01 | Point of Initiation Method | 2 | Sí | `"11"` = estático, `"12"` = dinámico |
| 52-59 | Merchant Account Information | Variable | Sí | Identificación del comercio |
| 52 | Merchant Category Code | 4 | Sí | MCC |
| 53 | Transaction Currency | 3 | Sí | `"170"` = COP |
| 54 | Transaction Amount | Variable | Sí (dinámico) | Monto en centavos |
| 55 | Tip/Fee | Variable | No | Propinas |
| 58 | Country Code | 2 | Sí | `"CO"` |
| 59 | Merchant Name | Variable | Sí | Nombre comercio |
| 60 | Merchant City | Variable | Sí | Ciudad |
| 61 | Postal Code | Variable | No | |
| 62 | Additional Data Field Template | Variable | Sí | Datos adicionales Colombia |

### 5.2 Campos adicionales Colombia

- **Canal:** `IM`, `POS`, `APP`, `ECOMM`, `MPOS`, `ATM`, `CB`, `OFC`
- **Identificación del Adquiriente**
- **Código de Comercio**
- **Código del Agregador**
- **Impuestos:** VAT, TIP, INC
- **Descuentos**
- **Referencia de pago** (`qr_code_reference` — obligatorio 3 meses post-launch)

### 5.3 Identificadores por red

| Red | Código |
|-----|--------|
| Redeban | `CO.COM.RBM.RED` |
| Credibanco | `CO.COM.CRB.RED` |
| ACH Colombia | `CO.COM.ACH.RED` |
| Banco de la República | `CO.COM.BRC.RED` |

### 5.4 Tipos de QR

| Tipo | Tag 01 | Descripción |
|------|--------|-------------|
| Estático | `11` | QR fijo, cliente ingresa monto |
| Dinámico | `12` | QR único por transacción con monto predefinido |
| Híbrido | `11` + Tag 54 > 0 | QR estático con monto |

> **Para este proyecto:** se usan **QR dinámicos** (Tag 01 = `12`) porque cada pago del POS/PMS/Parking tiene un monto específico y una referencia única.

---

## 6. Arquitectura propuesta

### 6.1 Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                          │
│  POS CheckoutDialog  │  PMS CheckoutDialog  │  Parking/Transporte│
└──────────┬───────────┴──────────┬────────────┴─────────┬────────┘
           │                       │                      │
           ▼                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              API ROUTES (src/app/api/integrations/)              │
│  /bancolombia/create-qr   /breb/create-qr   /redeban/create-qr   │
│  /bancolombia/webhook     /breb/webhook     /redeban/webhook     │
│  /bancolombia/status      /breb/status      /redeban/status      │
│  /bancolombia/health-check ...                                  │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│         SERVICIOS (src/lib/services/integrations/)               │
│  bancolombia/  │  breb/  │  redeban/  │  qrShared/               │
│  - service.ts  │ - monoService.ts │ - service.ts │ - emvco.ts    │
│  - types.ts    │ - passportService│ - types.ts   │ - qrCache.ts  │
│  - config.ts   │ - types.ts       │ - config.ts  │ - poller.ts   │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                         │
│  payments │ bank_transactions │ bank_reconciliation_items        │
│  integration_connections │ integration_credentials              │
│  integration_events │ integration_webhooks │ integration_object_mappings │
│  organization_payment_methods │ payment_methods                 │
│  notifications                                                   │
└─────────────────────────────────────────────────────────────────┘
           ▲
           │ webhooks inbound
┌──────────┴──────────────────────────────────────────────────────┐
│              PROVEEDORES EXTERNOS                                │
│  Bancolombia API QR Code  │  Mono/Passport (Bre-B)  │  Redeban   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Principios de diseño

1. **Reutilizar la infraestructura existente** de `integration_*` (no crear tablas nuevas para conexiones/credenciales/eventos).
2. **Un servicio por proveedor** bajo `src/lib/services/integrations/{provider}/`, siguiendo el patrón de `wompi/`.
3. **Servicio compartido `qrShared/`** para utilidades EMVCo, cache de QR, polling de estado y mapeo a `payments`.
4. **Una API route por operación** (`create-qr`, `webhook`, `status`, `health-check`) bajo `src/app/api/integrations/{provider}/`.
5. **El QR se renderiza en el cliente** desde un string EMVCo o imagen base64 devuelta por el backend.
6. **Polling + webhook:** el cliente hace polling del estado cada 3-5 s mientras muestra el QR; el webhook actualiza el estado en background para resiliencia.
7. **Idempotencia:** cada QR lleva una referencia única (`dev_reference` / `reference`) que se usa como clave idempotente.
8. **Multi-sucursal:** `integration_connections.branch_id` permite conexiones distintas por sucursal (ej: cada sucursal con su código de comercio Redeban).

### 6.3 Estrategia multi-proveedor

El ERP ya tiene `organization_payment_methods.integration_connection_id`. El flujo es:

1. El usuario configura una **conexión** por proveedor en `/app/integraciones/conexiones`.
2. En `/app/finanzas/metodos-pago`, vincula el método de pago `bancolombia_qr` (o `breb_qr`, `redeban_qr`) a esa conexión.
3. En el checkout, al seleccionar el método, el ERP resuelve la conexión activa para la sucursal y llama al servicio correspondiente.

---

## 7. Modelo de datos (Supabase)

### 7.1 Cambios de esquema requeridos

#### 7.1.1 Nuevos registros en `payment_methods` (INSERT, no DDL)

```sql
INSERT INTO payment_methods (code, name, requires_reference, is_active, is_system) VALUES
  ('bancolombia_qr', 'Bancolombia QR', false, true, true),
  ('breb_qr', 'Bre-B QR (Pago Inmediato)', false, true, true),
  ('redeban_qr', 'Redeban QR', false, true, true)
ON CONFLICT (code) DO NOTHING;
```

> **Consolidación pendiente (fase 0):** los códigos `qr`, `QR`, `002`, `SQS` están duplicados/sucios. Se debe limpiar con un script de migración de datos (no DDL) — **preguntar antes de tocar datos existentes**.

#### 7.1.2 Nuevos registros en `integration_providers` (INSERT)

```sql
INSERT INTO integration_providers (code, name, category, auth_type, website_url, docs_url, is_active, metadata) VALUES
  ('bancolombia', 'Bancolombia', 'payments', 'oauth2',
   'https://www.bancolombia.com', 'https://soportedevs.bancolombia.com', true,
   '{"products": ["qr_code", "payment_button", "transactional_information"]}'),
  ('breb', 'Bre-B (Banco de la República)', 'payments', 'oauth2',
   'https://www.banrep.gov.co', 'https://docs.mono.la/docs/guides/breb-participant', true,
   '{"providers": ["mono", "passport", "ebanx", "kushki", "cobre", "onepay"]}'),
  ('redeban', 'Redeban Multicolor', 'payments', 'auth_token',
   'https://www.redeban.com', 'https://developers.redeban.com/api/', true,
   '{"apis": {"ccapi": "https://ccapi.redeban.com", "noccapi": "https://noccapi.redeban.com"}}')
ON CONFLICT (code) DO NOTHING;
```

#### 7.1.3 Nuevos registros en `integration_connectors` (INSERT)

```sql
INSERT INTO integration_connectors (provider_id, code, name, supported_countries, capabilities, required_scopes, is_active, metadata)
SELECT id, 'bancolombia_qr', 'Bancolombia QR Code', ARRAY['CO'],
       '{"pull": true, "push": true, "realtime": false, "webhooks": true, "qr": true}',
       ARRAY['Transfer-Intention:write:app', 'Transfer-Intention:read:app'], true,
       '{"product": "qr_code", "version": "2.0.0"}'
FROM integration_providers WHERE code = 'bancolombia'
ON CONFLICT (code) DO NOTHING;

INSERT INTO integration_connectors (provider_id, code, name, supported_countries, capabilities, required_scopes, is_active, metadata)
SELECT id, 'breb_mono', 'Bre-B vía Mono', ARRAY['CO'],
       '{"pull": true, "push": true, "realtime": true, "webhooks": true, "qr": true}',
       ARRAY['collections', 'outgoing_transfers'], true,
       '{"baas": "mono", "sandbox": "https://sandbox.api.cuentamono.com"}'
FROM integration_providers WHERE code = 'breb'
ON CONFLICT (code) DO NOTHING;

INSERT INTO integration_connectors (provider_id, code, name, supported_countries, capabilities, required_scopes, is_active, metadata)
SELECT id, 'breb_passport', 'Bre-B vía Passport PaaS', ARRAY['CO'],
       '{"pull": true, "push": true, "realtime": false, "webhooks": true, "qr": true}',
       ARRAY['qrcodes', 'payments', 'keys'], true,
       '{"baas": "passport", "sandbox": "https://api.paas.sandbox.co.passportfintech.com"}'
FROM integration_providers WHERE code = 'breb'
ON CONFLICT (code) DO NOTHING;

INSERT INTO integration_connectors (provider_id, code, name, supported_countries, capabilities, required_scopes, is_active, metadata)
SELECT id, 'redeban_qr', 'Redeban QR Dinámico', ARRAY['CO'],
       '{"pull": true, "push": true, "realtime": false, "webhooks": true, "qr": true}',
       ARRAY[], true,
       '{"ccapi": "https://ccapi.redeban.com", "endpoint": "/v2/qr/generate/"}'
FROM integration_providers WHERE code = 'redeban'
ON CONFLICT (code) DO NOTHING;
```

#### 7.1.4 Nueva tabla `payment_qr_sessions` (DDL — **preguntar antes de aplicar**)

Para追踪 el ciclo de vida de cada QR generado (pendiente → pagado → expirado), se propone una tabla dedicada. **Esto es lo único que requiere DDL nuevo**; el resto reutiliza tablas existentes.

```sql
CREATE TABLE IF NOT EXISTS payment_qr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id integer REFERENCES branches(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  source text NOT NULL,                    -- 'sale', 'parking_session', 'folio', etc.
  source_id text NOT NULL,                 -- ID de la entidad origen
  provider text NOT NULL,                  -- 'bancolombia', 'breb', 'redeban'
  external_qr_id text,                     -- ID del QR en el proveedor
  external_collection_id text,             -- ID de collection (Bre-B/Mono)
  qr_string text,                          -- payload EMVCo
  qr_image_url text,                       -- URL o data URI de la imagen
  amount numeric NOT NULL,
  currency char(3) NOT NULL DEFAULT 'COP',
  reference text NOT NULL,                 -- dev_reference / referencia única
  status text NOT NULL DEFAULT 'pending',  -- pending, paid, expired, cancelled, failed
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  payer_info jsonb DEFAULT '{}'::jsonb,
  processor_response jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_qr_sessions_reference ON payment_qr_sessions(reference);
CREATE INDEX idx_payment_qr_sessions_external_qr_id ON payment_qr_sessions(external_qr_id);
CREATE INDEX idx_payment_qr_sessions_status ON payment_qr_sessions(status);
CREATE INDEX idx_payment_qr_sessions_source ON payment_qr_sessions(source, source_id);

ALTER TABLE payment_qr_sessions ENABLE ROW LEVEL SECURITY;
```

> **Nota:** antes de aplicar este DDL, confirmar con el equipo. Alternativamente, se puede almacenar el estado del QR en `payments.processor_response` y `payments.status='pending'`, sin tabla nueva — pero la tabla dedicada facilita el polling, la expiración automática y la auditoría.

### 7.2 Mapeo de tablas

```
payment_qr_sessions.connection_id  → integration_connections.id
payment_qr_sessions.payment_id     → payments.id
payment_qr_sessions.source/source_id → misma convención que payments.source/source_id
integration_object_mappings        → mapea external_qr_id ↔ payment_qr_sessions.id
integration_events                 → log de cada webhook recibido
bank_transactions                  → insertado al confirmar el pago (conciliación)
notifications                      → notificación al usuario cuando se confirma
```

---

## 8. Fases de implementación

### Fase 0 — Preparación y limpieza (1-2 días)

**Objetivo:** dejar el modelo de datos limpio antes de agregar proveedores.

- [ ] Auditar y consolidar códigos QR duplicados en `payment_methods` (`qr`, `QR`, `002`, `SQS`). **Preguntar al equipo antes de migrar datos.**
- [ ] Insertar 3 nuevos `payment_methods`: `bancolombia_qr`, `breb_qr`, `redeban_qr`.
- [ ] Insertar 3 nuevos `integration_providers`: `bancolombia`, `breb`, `redeban`.
- [ ] Insertar 4 nuevos `integration_connectors`: `bancolombia_qr`, `breb_mono`, `breb_passport`, `redeban_qr`.
- [ ] Agregar etiquetas en `src/components/pos/cajas/paymentMethodLabels.ts`:
  ```typescript
  bancolombia_qr: 'Bancolombia QR',
  breb_qr: 'Bre-B (Pago Inmediato)',
  redeban_qr: 'Redeban QR',
  ```
- [ ] Agregar constantes en `src/components/finanzas/metodos-pago/payment-method-types.ts`:
  ```typescript
  export const PAYMENT_GATEWAYS = {
    ...,
    BANCOLOMBIA: 'bancolombia',
    BREB: 'breb',
    REDEBAN: 'redeban',
  };
  ```

### Fase 1 — Infraestructura compartida (3-5 días)

**Objetivo:** crear utilidades reutilizables por los 3 proveedores.

- [ ] `src/lib/services/integrations/qrShared/emvco.ts` — builder/parser de payloads EMVCo (TAGs 00-62).
- [ ] `src/lib/services/integrations/qrShared/qrSessionService.ts` — CRUD de `payment_qr_sessions` (crear, obtener por referencia, marcar pagado, marcar expirado).
- [ ] `src/lib/services/integrations/qrShared/qrPoller.ts` — lógica de polling de estado (cliente) con backoff.
- [ ] `src/lib/services/integrations/qrShared/paymentConfirmation.ts` — función compartida que al confirmar un pago:
  1. Actualiza `payment_qr_sessions.status = 'paid'`.
  2. Inserta/actualiza `payments` (status `completed`, `processor_response`).
  3. Inserta `bank_transactions` (crédito en la cuenta del comercio).
  4. Crea `integration_object_mappings` (external_qr_id ↔ payment_id).
  5. Dispara `notifications` al usuario.
  6. (Opcional) actualiza `sales.payment_status` / `web_orders.payment_status`.
- [ ] Componente UI `src/components/shared/QrPaymentDialog.tsx` — muestra QR, cuenta regresiva de expiración, estado en tiempo real, botón "Ya pagué".

### Fase 2 — Redeban (acceso más rápido) (5-7 días)

**Por qué primero:** Redeban expone API REST pública con Auth-Token, sin onboarding comercial complejo.

- [ ] `src/lib/services/integrations/redeban/redebanConfig.ts` — URLs base, credenciales desde env.
- [ ] `src/lib/services/integrations/redeban/redebanTypes.ts` — interfaces (`RedebanQrRequest`, `RedebanQrResponse`, `RedebanWebhookPayload`).
- [ ] `src/lib/services/integrations/redeban/redebanService.ts`:
  - `generateAuthToken()` — Base64(APP_CODE;TIMESTAMP;SHA256(APP_KEY+TIMESTAMP)).
  - `createQr(params)` — POST `/v2/qr/generate/`.
  - `getTransactionStatus(id)` — GET `/order/{id}` (noccapi).
  - `verifyWebhookSignature(payload, headers)` — validación.
- [ ] API routes:
  - `src/app/api/integrations/redeban/create-qr/route.ts`
  - `src/app/api/integrations/redeban/webhook/route.ts`
  - `src/app/api/integrations/redeban/status/route.ts`
  - `src/app/api/integrations/redeban/health-check/route.ts`
- [ ] Integrar en `CheckoutDialog` del POS y PMS: al seleccionar `redeban_qr`, llamar a `/api/integrations/redeban/create-qr`, mostrar `QrPaymentDialog`, hacer polling a `/status`.
- [ ] Integrar en Parking y Transporte (mismo flujo).

### Fase 3 — Bre-B vía Mono (5-7 días)

- [ ] `src/lib/services/integrations/breb/monoConfig.ts`
- [ ] `src/lib/services/integrations/breb/monoTypes.ts`
- [ ] `src/lib/services/integrations/breb/monoService.ts`:
  - `getAccessToken()` — OAuth 2.0 Client Credentials.
  - `createCollection(params)` — POST `/api/v1/collections`.
  - `simulatePayment(collectionId, amount)` — sandbox `/api/v1/sandbox/collections/simulate-payment`.
  - `verifyWebhookSignature(payload, signature)` — HMAC-SHA256.
- [ ] API routes:
  - `src/app/api/integrations/breb/create-qr/route.ts`
  - `src/app/api/integrations/breb/webhook/route.ts`
  - `src/app/api/integrations/breb/status/route.ts`
  - `src/app/api/integrations/breb/health-check/route.ts`
- [ ] Integrar en los mismos puntos del checkout (POS, PMS, Parking, Transporte).
- [ ] Pruebas en sandbox Mono con `simulate-payment`.

### Fase 4 — Bancolombia (vía Wompi existente + API directa opcional) (5-7 días)

**Ruta corta (recomendada):** Wompi ya soporta `BANCOLOMBIA_QR`. Solo falta exponerlo en el checkout.

- [ ] Verificar que `wompiService.createTransaction` con `payment_method.type: 'BANCOLOMBIA_QR'` funcione end-to-end.
- [ ] Agregar opción `bancolombia_qr` en `CheckoutDialog` que use el flujo Wompi existente.
- [ ] Asegurar que el webhook de Wompi (`/api/integrations/wompi/webhook`) actualice `payment_qr_sessions` además de `payments`.

**Ruta larga (opcional, si se requiere API directa):**

- [ ] `src/lib/services/integrations/bancolombia/bancolombiaConfig.ts`
- [ ] `src/lib/services/integrations/bancolombia/bancolombiaTypes.ts`
- [ ] `src/lib/services/integrations/bancolombia/bancolombiaService.ts`:
  - `getAccessToken()` — OAuth 2.0 (token 20 min).
  - `createQrIntention(params)` — API QR Code.
  - `verifyJwtNotification(token, cert)` — validación JWT.
- [ ] API routes:
  - `src/app/api/integrations/bancolombia/create-qr/route.ts`
  - `src/app/api/integrations/bancolombia/webhook/route.ts` (valida JWT, responde en < 3 s)
  - `src/app/api/integrations/bancolombia/status/route.ts`
  - `src/app/api/integrations/bancolombia/health-check/route.ts`
- [ ] Onboarding comercial con Bancolombia (paralelo, puede tardar semanas).

### Fase 5 — Conciliación bancaria automática (3-5 días)

- [ ] Al confirmar un pago vía webhook, insertar automáticamente en `bank_transactions`:
  ```sql
  INSERT INTO bank_transactions (organization_id, bank_account_id, trans_date, description, amount, reference, transaction_type, status, import_source, import_id)
  VALUES (:org_id, :bank_account_id, now(), :description, :amount, :reference, 'credit', 'unmatched', :provider, :external_id);
  ```
- [ ] El `import_source` será `'bancolombia'`, `'breb'`, o `'redeban'`.
- [ ] Auto-match: si `bank_transactions.reference` coincide con `payments.reference`, crear `bank_reconciliation_items` con `is_matched=true` automáticamente.
- [ ] Extender `ConciliacionService` con `autoMatchFromWebhook(paymentId, bankTransactionId)`.
- [ ] Job programado (Supabase Edge Function o cron) que marque `payment_qr_sessions` expirados (status `expired` cuando `expires_at < now()`).

### Fase 6 — Notificaciones y UI (2-3 días)

- [ ] Al confirmar pago, crear registro en `notifications`:
  - `type: 'payment_received'`
  - `title: 'Pago recibido via QR'`
  - `body: 'Pago de ${amount} ${currency} confirmado por ${provider}'`
  - `link: /app/finanzas/conciliacion-bancaria`
- [ ] Toast en el checkout cuando el webhook confirme (vía Realtime subscription de Supabase en `payment_qr_sessions`).
- [ ] Vista de historial de QR en `/app/finanzas/metodos-pago/qr-sessions` (lista de sesiones con estado, monto, pagador).

### Fase 7 — Testing, lint, build (2-3 días)

- [ ] Tests unitarios de `emvco.ts` (builder/parser).
- [ ] Tests de integración de cada webhook con payloads de ejemplo de cada proveedor.
- [ ] Tests E2E del flujo completo (generar QR → simular pago → verificar `payments` + `bank_transactions` + `notifications`).
- [ ] `npm run lint`, `npm run build`, `npm test` — según reglas del proyecto.
- [ ] Verificar RLS en `payment_qr_sessions`.

### Fase 8 — Producción y onboarding (paralelo, semanas)

- [ ] **Redeban:** contactar `integraciones@redeban.com`, obtener credenciales sandbox, luego producción.
- [ ] **Bre-B/Mono:** registrarse en https://breb.app/, agendar onboarding, obtener credenciales OAuth.
- [ ] **Bancolombia:** (si ruta directa) solicitar sandbox, firma de Reglamento de APIs, proceso comercial con ejecutivo.
- [ ] Configurar URLs de webhook públicas (ej: `https://erp.dominio.co/api/integrations/{provider}/webhook`).
- [ ] Rotación de credenciales cada 6 meses (Bancolombia).

---

## 9. Flujos completos por módulo

### 9.1 POS (venta directa y mesas)

**Archivos:** `src/components/pos/CheckoutDialog.tsx`, `src/app/app/pos/mesas/[id]/page.tsx`, `src/lib/services/posService.ts`

```
1. Cajero/mesero abre CheckoutDialog con total a pagar.
2. Selecciona método "Bancolombia QR" / "Bre-B QR" / "Redeban QR".
3. Frontend POST /api/integrations/{provider}/create-qr
   Body: { source: 'sale', source_id: null, amount, currency: 'COP', reference: 'POS-{saleId}-{timestamp}' }
4. Backend:
   a. Resuelve integration_connection activa para la sucursal.
   b. Obtiene credenciales desde integration_credentials (vía secret_ref).
   c. Llama al servicio del proveedor (createQr / createCollection).
   d. INSERT en payment_qr_sessions (status='pending', expires_at=now()+5min).
   e. Retorna { qr_string, qr_image_url, qr_session_id, expires_at }.
5. Frontend muestra QrPaymentDialog con la imagen y cuenta regresiva.
6. Cliente escanea QR desde su app bancaria y paga.
7. Proveedor envía webhook a /api/integrations/{provider}/webhook.
8. Backend webhook:
   a. Verifica firma (HMAC-SHA256 / JWT / checksum).
   b. INSERT en integration_events (direction='inbound').
   c. Llama paymentConfirmation.confirm({ qr_session_id, external_id, payer_info }).
   d. paymentConfirmation:
      - UPDATE payment_qr_sessions SET status='paid', paid_at=now().
      - INSERT en payments (source='sale', source_id=saleId, method='bancolombia_qr', status='completed', processor_response=payload).
      - INSERT en bank_transactions (transaction_type='credit', import_source=provider).
      - INSERT en integration_object_mappings.
      - INSERT en notifications.
      - (Realtime) el frontend recibe el update y cierra el dialog automáticamente.
9. POS continúa con generación de factura (flujo existente en posService).
```

**Para mesas (`/app/pos/mesas/[id]`):** mismo flujo, el `source_id` es el `table_session_id` o el `sale_id` asociado a la mesa.

### 9.2 PMS (checkout de reserva)

**Archivos:** `src/components/pms/checkout/CheckoutDialog.tsx`, `src/lib/services/checkoutService.ts`

```
1. Recepción abre CheckoutDialog con folio de la reserva.
2. Selecciona método QR.
3. POST /api/integrations/{provider}/create-qr
   Body: { source: 'folio', source_id: folioId, amount: balance, currency, reference: 'PMS-{reservationCode}-{timestamp}' }
4. Se genera QR, se muestra al huésped.
5. Huésped paga escaneando.
6. Webhook confirma → paymentConfirmation:
   - INSERT payments (source='folio', source_id=folioId).
   - UPDATE folios balance.
7. checkoutService.processCheckout continúa:
   - Crea sale desde items del folio.
   - Registra pago en payments (source='sale').
   - Genera factura.
   - Crea tareas de housekeeping.
   - Actualiza reserva a 'checked_out'.
```

### 9.3 Parking

**Archivos:** `src/app/app/parking/operacion/page.tsx`, `src/lib/services/parkingPaymentService.ts`

```
1. Cliente termina sesión de parking (o quiere pagar pase).
2. Operador selecciona "Pagar con QR".
3. POST /api/integrations/{provider}/create-qr
   Body: { source: 'parking_session', source_id: sessionId, amount, currency: 'COP', reference: 'PK-{sessionCode}' }
4. Se muestra QR en pantalla (o se imprime en ticket).
5. Cliente paga.
6. Webhook → paymentConfirmation:
   - INSERT payments (source='parking_session', source_id=sessionId, method='redeban_qr').
   - INSERT parking_payments (parking_session_id, payment_id).
   - INSERT bank_transactions.
   - UPDATE parking_sessions status='paid'.
7. parkingFinanceService genera factura si aplica.
```

### 9.4 Transporte (boletos/envíos)

**Archivos:** `src/app/app/transporte/`, `src/lib/services/tripsService.ts`

```
1. Pasajero compra boleto (o se paga envío).
2. Operador selecciona "Pagar con QR".
3. POST /api/integrations/{provider}/create-qr
   Body: { source: 'sale', source_id: boletoId/envioId, amount, reference: 'TR-{codigo}' }
4. QR se muestra o se envía al pasajero.
5. Pasajero paga.
6. Webhook → paymentConfirmation:
   - INSERT payments (source='sale').
   - INSERT bank_transactions.
   - Marca boleto/envío como pagado.
   - Genera QR de boleto (el QR del boleto es diferente — es de validación, no de pago).
```

### 9.5 Finanzas (cuentas por cobrar / facturas)

**Archivos:** `src/app/app/finanzas/`, `src/lib/services/`

```
1. Usuario abre factura de venta o cuenta por cobrar.
2. Click "Generar QR de pago".
3. POST /api/integrations/{provider}/create-qr
   Body: { source: 'invoice_sales', source_id: invoiceId, amount: balance, reference: 'INV-{invoiceNumber}' }
4. QR se muestra (o se envía por email/WhatsApp al cliente).
5. Cliente paga en su tiempo (QR válido hasta expires_at).
6. Webhook → paymentConfirmation:
   - INSERT payments (source='invoice_sales', source_id=invoiceId).
   - UPDATE invoice_sales balance.
   - Si balance=0, marca factura como pagada.
   - INSERT bank_transactions.
   - Notificación al usuario.
```

### 9.6 Mesas (`/app/pos/mesas/[id]`)

Las mesas usan el mismo `CheckoutDialog` del POS pero con contexto de mesa. El `source` es `'sale'` y el `source_id` es el `sale_id` vinculado al `table_session_id`. El flujo es idéntico al POS.

---

## 10. Webhooks y notificaciones de pago

### 10.1 Esquema unificado de webhook

Todos los webhooks siguen el mismo patrón:

```typescript
// src/app/api/integrations/{provider}/webhook/route.ts
export async function POST(req: Request) {
  const raw = await req.text();
  const payload = JSON.parse(raw);

  // 1. Verificar firma/seguridad
  const valid = await verifySignature(provider, raw, req.headers);
  if (!valid) return Response.json({ error: 'invalid signature' }, { status: 401 });

  // 2. Registrar evento crudo
  await supabase.from('integration_events').insert({
    connection_id: connectionId,
    source: provider,
    direction: 'inbound',
    event_type: payload.event_type,
    external_event_id: payload.event_id,
    payload,
    status: 'received',
    organization_id,
  });

  // 3. Resolver sesión QR por referencia
  const qrSession = await qrSessionService.getByReference(payload.dev_reference);
  if (!qrSession) return Response.json({ ok: true }); // idempotente

  // 4. Confirmar pago (función compartida)
  await paymentConfirmation.confirm({
    qr_session_id: qrSession.id,
    external_id: payload.transaction.id,
    payer_info: payload.payer,
    processor_response: payload,
  });

  // 5. Responder rápido (< 3 s para Bancolombia)
  return Response.json({ ok: true });
}
```

### 10.2 Verificación de firma por proveedor

| Proveedor | Método | Header |
|-----------|--------|--------|
| Bancolombia | JWT (RS256) + certificado X.509 | `json-web-token`, `x-client-certificate` |
| Bre-B (Mono) | HMAC-SHA256 | `X-Signature` |
| Bre-B (Passport) | HMAC-SHA256 | (definido en dashboard) |
| Redeban | (configurable con asesor) | (validar con Redeban) |
| Wompi (Bancolombia QR) | Checksum SHA256 con `integrity_secret` | (ya implementado) |

### 10.3 Idempotencia

- Cada webhook lleva un `external_event_id` único. Antes de procesar, verificar si ya existe en `integration_events.external_event_id` para esa conexión.
- Si ya existe y está procesado, responder `200 OK` sin reprocesar.
- Si el `payment_qr_sessions.status` ya es `'paid'`, ignorar.

### 10.4 Reintentos

- Los proveedores reintentan si el webhook no responde 200.
- El backend debe ser idempotente (punto anterior).
- Si el webhook falla definitivamente, el polling del frontend (`/status`) actúa como fallback.

### 10.5 Notificaciones internas

Al confirmar un pago, insertar en `notifications`:

```typescript
{
  user_id: userId,           // usuario que generó el QR
  organization_id,
  type: 'payment_received',
  title: 'Pago recibido via QR',
  body: `Pago de ${amount} ${currency} confirmado por ${provider}`,
  data: { payment_id, qr_session_id, source, source_id },
  link: '/app/finanzas/conciliacion-bancaria',
  read: false,
}
```

### 10.6 Realtime (Supabase)

El frontend se suscribe a cambios en `payment_qr_sessions` para cerrar el dialog automáticamente:

```typescript
supabase
  .channel(`qr-session-${qrSessionId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'payment_qr_sessions',
    filter: `id=eq.${qrSessionId}`,
  }, (payload) => {
    if (payload.new.status === 'paid') onPaid(payload.new);
    if (payload.new.status === 'expired') onExpired(payload.new);
  })
  .subscribe();
```

---

## 11. Conciliación bancaria automática

### 11.1 Flujo

```
Webhook confirma pago
       ↓
INSERT bank_transactions (transaction_type='credit', import_source=provider, reference=qr_reference)
       ↓
Auto-match: buscar payments con misma reference
       ↓
Si hay match → INSERT bank_reconciliation_items (is_matched=true, matched_payment_id, bank_transaction_id)
       ↓
Recalcular bank_reconciliations.difference
```

### 11.2 Extensión de `ConciliacionService`

Agregar función:

```typescript
async autoMatchFromWebhook(paymentId: string, bankTransactionId: number) {
  // Buscar conciliación abierta para la cuenta
  const reconciliation = await this.getOpenReconciliation(bankAccountId);
  if (!reconciliation) return; // no hay conciliación abierta, queda para después

  // Crear item matcheado
  await supabase.from('bank_reconciliation_items').insert({
    reconciliation_id: reconciliation.id,
    bank_transaction_id: bankTransactionId,
    matched_payment_id: paymentId,
    match_type: 'qr_payment',
    amount,
    is_matched: true,
    match_date: new Date().toISOString(),
  });

  // Recalcular diferencia
  await this.recalcularDiferencia(reconciliation.id);
}
```

### 11.3 Job de expiración

Edge Function o cron cada minuto:

```sql
UPDATE payment_qr_sessions
SET status = 'expired', updated_at = now()
WHERE status = 'pending' AND expires_at < now();
```

### 11.4 Reportes de conciliación por proveedor

Extender `ConciliacionPage` con filtro por `import_source` (Bancolombia, Bre-B, Redeban, manual, archivo).

---

## 12. Seguridad y cumplimiento

### 12.1 Almacenamiento de credenciales

- **NUNCA** en código o `.env` commiteado.
- Usar `integration_credentials.secret_ref` → referencia a Supabase Vault o KMS.
- `key_prefix` para identificación visual sin exponer el secreto.
- Rotación cada 6 meses (Bancolombia).

### 12.2 Validación de webhooks

- Verificar firma SIEMPRE antes de procesar.
- Si la firma es inválida → 401 + log en `integration_events` con `status='rejected'`.
- IP whitelisting si el proveedor lo soporta.

### 12.3 Habeas Data (Ley 1581/2012)

- El `payer_info` del webhook contiene datos personales del pagador (nombre, documento, banco).
- Registrar en `payment_qr_sessions.payer_info` (jsonb) con propósito de conciliación.
- Aplicar política de retención (ej: 10 años para fines contables/fiscales).
- No exponer `payer_info` en APIs públicas sin autorización.

### 12.4 PCI DSS

- Si se usa SDK de tokenización de Redeban (futura fase tarjeta), los datos de tarjeta **no** pasan por el servidor del ERP → no requiere certificación PCI.
- Si se procesa tarjeta directamente → **sí** requiere PCI DSS (no recomendado).

### 12.5 Normativa aplicable

- Circular Externa 005 de 2023 (Superfinanciera) — estándar QR EMVCo interoperable.
- Circular Reglamentaria Externa DSP-465 (BanRep) — Bre-B.
- Circular Externa Operativa DSP-470 (DICE) y DSP-471 (MOL) — Bre-B.
- Ley 1581 de 2012 — protección de datos personales.
- ISO 20022 — mensajería Bre-B (pacs.008, pacs.002, pacs.028).

### 12.6 TLS y cifrado

- TLS 1.2+ en todas las conexiones.
- HTTPS obligatorio para webhooks.
- mTLS si el proveedor lo requiere (Bre-B MOL a nivel institucional).

---

## 13. Onboarding y requisitos comerciales

### 13.1 Redeban (más rápido)

1. Email a `integraciones@redeban.com` con correo del desarrollador y nombre de la empresa.
2. Cuenta de desarrollador + contraseña por email.
3. Acceso a dashboard sandbox (`https://dashboard-stg.redeban.com`).
4. Obtener `SERVER_APP_CODE` / `SERVER_APP_KEY`.
5. Configurar URL de webhook con asesor.
6. Pruebas en sandbox.
7. Afiliación comercial para producción (Formulario Único, Cámara de comercio, RUT, referencias).

### 13.2 Bre-B vía Mono

1. Registro en https://breb.app/.
2. Agendar cita de onboarding.
3. Obtener `client_id` / `client_secret` (OAuth 2.0).
4. Configurar webhooks en dashboard.
5. Pruebas en sandbox (`https://sandbox.api.cuentamono.com`) con `simulate-payment`.
6. Credenciales de producción tras validación.

### 13.3 Bancolombia (ruta directa — opcional)

1. Solicitud de acceso sandbox (24 h hábiles).
2. Crear aplicación en Portal Sandbox.
3. Obtener `client_id` / `client_secret`.
4. Suscribir al producto QR Code.
5. Pruebas en sandbox.
6. Proceso comercial con ejecutivo:
   - Cuenta activa con Bancolombia.
   - Firma del Reglamento de APIs.
   - Solicitud de credenciales productivas (TPS, timeout, horarios).
7. Producción.

### 13.4 Bancolombia (ruta Wompi — recomendada)

Wompi ya está integrado. Solo se requiere:
1. Configurar conexión Wompi en `/app/integraciones/conexiones` (si no existe).
2. Habilitar `BANCOLOMBIA_QR` como método de pago.
3. El webhook de Wompi ya existe y funciona.

---

## 14. Variables de entorno

Agregar al `.env.local` (y al gestor de secretos de producción):

```bash
# === Redeban ===
REDEBAN_SANDBOX_APP_CODE=
REDEBAN_SANDBOX_APP_KEY=
REDEBAN_PRODUCTION_APP_CODE=
REDEBAN_PRODUCTION_APP_KEY=
REDEBAN_WEBHOOK_SECRET=

# === Bre-B vía Mono ===
MONO_SANDBOX_CLIENT_ID=
MONO_SANDBOX_CLIENT_SECRET=
MONO_PRODUCTION_CLIENT_ID=
MONO_PRODUCTION_CLIENT_SECRET=
MONO_WEBHOOK_SECRET=

# === Bre-B vía Passport PaaS (alternativo) ===
PASSPORT_SANDBOX_API_KEY=
PASSPORT_SANDBOX_API_SECRET=
PASSPORT_PRODUCTION_API_KEY=
PASSPORT_PRODUCTION_API_SECRET=
PASSPORT_WEBHOOK_SECRET=

# === Bancolombia API directa (opcional) ===
BANCOLOMBIA_CLIENT_ID=
BANCOLOMBIA_CLIENT_SECRET=
BANCOLOMBIA_CERT_PATH=./certs/bancolombia.pem
BANCOLOMBIA_CERT_KEY_PATH=./certs/bancolombia-key.pem
BANCOLOMBIA_WEBHOOK_JWT_AUDIENCE=

# === Generales QR ===
QR_DEFAULT_EXPIRATION_SECONDS=300   # 5 minutos
QR_POLLING_INTERVAL_MS=3000
QR_MAX_POLLING_ATTEMPTS=100
APP_BASE_URL=https://erp.dominio.co  # para URLs de webhook
```

> **Importante:** en producción, las credenciales se guardan en `integration_credentials.secret_ref` (Supabase Vault), no en `.env`. Las variables `.env` son solo para desarrollo local.

---

## 15. Referencias oficiales

### 15.1 Bancolombia

- Centro de Ayuda APIs: https://soportedevs.bancolombia.com
- Solicitud Sandbox: https://soportedevs.bancolombia.com/hc/es-419/articles/12467698138388
- OAuth: https://soportedevs.bancolombia.com/hc/es-419/articles/21843720412180
- JWT: https://soportedevs.bancolombia.com/hc/es-419/articles/11542467193492
- QR Code: https://soportedevs.bancolombia.com/hc/es-419/articles/11488204001940
- Payment Button: https://soportedevs.bancolombia.com/hc/es-419/articles/4406775114644
- Callback: https://soportedevs.bancolombia.com/hc/es-419/articles/21331561653140
- Transactional Information: https://soportedevs.bancolombia.com/hc/es-419/categories/25767081504020
- Paso a producción: https://soportedevs.bancolombia.com/hc/es-419/articles/22036835683860
- Botón Bancolombia (comercial): https://www.bancolombia.com/pagos/boton-bancolombia
- Recaudo PSE: https://www.bancolombia.com/pagos/recaudo-pse

### 15.2 Bre-B

- Banco de la República — Bre-B: https://www.banrep.gov.co/es/normatividad/sistemas-pago/pagos-inmediatos-bre-b
- Documento técnico Bre-B (Feb 2026): https://banrep.gov.co/es/publicaciones-investigaciones/documentos-tecnicos-presentaciones/documento-bre-b-febrero-2026
- Manual de vinculación: https://www.banrep.gov.co/es/manual-vinculacion-sistemas-pago-administrados-banco-republica-0
- MOL v2.5.0: https://www.redcoopcentral.com/wp-content/uploads/2026/01/MOL_Documento-de-Especificaciones-Tecnicas-v2.5.0-002.pdf
- Mono docs: https://docs.mono.la/docs/guides/breb-participant
- Mono API reference: https://docs.mono.la/docs/api-reference/breb-participant
- Mono landing: https://breb.app/
- Passport PaaS docs: https://docs.passportfintech.com/ES
- Passport Postman: https://www.postman.com/passport-baas/bre-b-api-nodo-visionamos-passport-for-developers/overview
- EBANX Bre-B: https://docs.ebanx.com/docs/pay-in/processing/payment-methods/country-specific/colombia/breb
- Cobre Bre-B: https://docs.cobre.com/es/bre-b-1952108m0
- Kushki payouts Bre-B: https://docs.kushki.com/co/payouts/transfer/breb/

### 15.3 Redeban

- Portal desarrolladores: https://developers.redeban.com/api/
- Docs de pagos: https://developers.redeban.com/docs/payments/
- Centro de conocimiento: https://redeban.com/centro-de-conocimiento
- Pagos inmediatos Bre-B: https://www.redeban.com/soluciones-de-transferencias/pagos-inmediatos
- Guía cliente Pagos Inmediatos (Mar 2026): https://www.redeban.com/sites/default/files/2026-03/Guia%20del%20Cliente%20Pagos%20Inmediatos%20Marzo%202026.pdf
- SICWEB (conciliación): https://www.redeban.com/otras-soluciones/sic
- API SAC (ajustes): https://www.redeban.com/soluciones-ecommerce-para-pasarelas/api-sac
- Afiliación: https://www.redeban.com/afiliate-nueva
- Tarifas: https://www.redeban.com/sites/default/files/2025-05/Informacion-de-tarifas-costos-y-requisitos-de-vinculacion-del-comercio.pdf
- SDK JS: https://github.com/globalpayredeban/globalpayredeban.js
- SDK Android: https://github.com/globalpayredeban/globalpayredeban-android
- SDK PHP: https://github.com/globalpayredeban/pg-php-sdk

### 15.4 Estándar QR interoperable

- Campos QR Code EMVCo (EASPBV): https://www.achcolombia.com.co/campos-qr-code-emvco
- Lineamientos interoperabilidad QR v4: https://www.redeban.com/sites/default/files/2024-10/documento-lineamientos-interoperabilidad-qr-version-4-2024.pdf
- EMVCo QR Code Specification: https://www.emvco.com/emv-technologies/qrcodes/
- Circular Externa 005 de 2023: https://cijuf.org.co/normatividad/circular-externa/2023/circular-externa-005.html

### 15.5 Wompi (ya integrado — para Bancolombia QR)

- Docs Colombia: https://docs.wompi.co/docs/colombia/metodos-de-pago/
- OpenAPI: https://raw.githubusercontent.com/api-evangelist/wompi/refs/heads/main/openapi/wompi-transactions-api-openapi.yml

### 15.6 Nequi (referencia — API separada)

- Conecta Nequi: https://conecta.nequi.com
- Docs: https://docs.conecta.nequi.com.co/
- APIs Negocios: https://www.nequi.com.co/negocios/apis

---

## Apéndice A — Estructura de archivos propuesta

```
src/
├── app/
│   ├── api/
│   │   └── integrations/
│   │       ├── bancolombia/
│   │       │   ├── create-qr/route.ts
│   │       │   ├── webhook/route.ts
│   │       │   ├── status/route.ts
│   │       │   └── health-check/route.ts
│   │       ├── breb/
│   │       │   ├── create-qr/route.ts
│   │       │   ├── webhook/route.ts
│   │       │   ├── status/route.ts
│   │       │   └── health-check/route.ts
│   │       └── redeban/
│   │           ├── create-qr/route.ts
│   │           ├── webhook/route.ts
│   │           ├── status/route.ts
│   │           └── health-check/route.ts
│   └── app/
│       ├── finanzas/
│       │   └── metodos-pago/
│       │       └── qr-sessions/page.tsx          # historial de QR (fase 6)
│       └── integraciones/
│           └── conexiones/page.tsx               # ya existe — agregar providers
├── components/
│   ├── shared/
│   │   └── QrPaymentDialog.tsx                   # componente reutilizable (fase 1)
│   ├── pos/
│   │   ├── CheckoutDialog.tsx                    # modificar — agregar opción QR
│   │   └── cajas/
│   │       └── paymentMethodLabels.ts            # agregar etiquetas
│   ├── pms/
│   │   └── checkout/
│   │       └── CheckoutDialog.tsx                # modificar — agregar opción QR
│   └── finanzas/
│       └── metodos-pago/
│           └── payment-method-types.ts           # agregar constantes
└── lib/
    └── services/
        └── integrations/
            ├── qrShared/                         # infraestructura compartida
            │   ├── emvco.ts
            │   ├── qrSessionService.ts
            │   ├── qrPoller.ts
            │   └── paymentConfirmation.ts
            ├── bancolombia/
            │   ├── bancolombiaConfig.ts
            │   ├── bancolombiaTypes.ts
            │   └── bancolombiaService.ts
            ├── breb/
            │   ├── monoConfig.ts
            │   ├── monoTypes.ts
            │   ├── monoService.ts
            │   ├── passportConfig.ts             # alternativo
            │   ├── passportTypes.ts
            │   └── passportService.ts
            └── redeban/
                ├── redebanConfig.ts
                ├── redebanTypes.ts
                └── redebanService.ts
```

---

## Apéndice B — Payloads de ejemplo de webhooks

### B.1 Mono (Bre-B) — `collection.attempt_successful`

```json
{
  "event_type": "collection.attempt_successful",
  "event_id": "evt_abc123",
  "timestamp": "2026-08-14T12:00:00Z",
  "data": {
    "collection_id": "bbcol_xyz",
    "attempt_id": "bbcolat_123",
    "transfer_id": "bbit_456",
    "amount": 50000,
    "currency": "COP",
    "payer": {
      "name": "Juan Pérez",
      "document": "12345678",
      "bank": "Bancolombia"
    },
    "state_reason": null
  },
  "signature": "HMAC-SHA256"
}
```

### B.2 Redeban — cambio de estado

```json
{
  "transaction": {
    "status": "approved",
    "status_detail": "approved",
    "id": "id_transaccion",
    "dev_reference": "POS-sale123-1692000000",
    "amount": 200000,
    "paid_date": "2026-08-14T12:00:00Z",
    "refund_amount": null
  },
  "order": {
    "currency": "COP",
    "country": "COL",
    "description": "QR Generation"
  }
}
```

### B.3 Bancolombia — notificación JWT (Payment Button)

El payload viene cifrado en un JWT en el header `json-web-token`. Tras verificar con el certificado X.509:

```json
{
  "event": "transfer.status",
  "data": {
    "transferIntentionId": "abc-123",
    "status": "approved",
    "amount": { "value": 50000, "currency": "COP" },
    "reference": "POS-sale123-1692000000",
    "confirmedAt": "2026-08-14T12:00:00Z"
  }
}
```

---

## Apéndice C — Checklist de verificación por fase

| Fase | Verificación |
|------|--------------|
| 0 | `SELECT code FROM payment_methods WHERE code IN ('bancolombia_qr','breb_qr','redeban_qr')` retorna 3 filas |
| 0 | `SELECT code FROM integration_providers WHERE code IN ('bancolombia','breb','redeban')` retorna 3 filas |
| 1 | `QrPaymentDialog` renderiza un QR de prueba |
| 2 | Redeban: `create-qr` retorna `{ qr_string, qr_image_url, qr_session_id }` |
| 2 | Redeban: webhook con payload de prueba actualiza `payment_qr_sessions.status='paid'` |
| 3 | Mono: `create-qr` + `simulate-payment` → `payments` insertado |
| 4 | Wompi `BANCOLOMBIA_QR` funciona end-to-end |
| 5 | `bank_transactions` se inserta al confirmar pago |
| 5 | Auto-match crea `bank_reconciliation_items` con `is_matched=true` |
| 6 | Notificación aparece en `/app/notificaciones` |
| 6 | Realtime cierra el dialog al confirmar |
| 7 | `npm run lint` sin errores |
| 7 | `npm run build` exitoso |
| 7 | `npm test` pasa |
| 8 | Webhook en producción responde 200 en < 3 s |

---

**Fin del documento.**

> Este documento es de planificación. Antes de aplicar el DDL de `payment_qr_sessions` o migrar datos existentes de `payment_methods`, confirmar con el equipo. La implementación se hace fase a fase, respetando las reglas de scope del proyecto (`code-style-guide.md`).
