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
16. [Apéndice D — Mono.la como BaaS completo](#apéndice-d--monola-como-baas-completo-banking-as-a-service)

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
| **Portal de desarrolladores público (sandbox)** | https://developer-portal-public-sbx.apps.ambientesbc.com | Público con registro |
| Centro de Ayuda APIs (API Market externo) | https://soportedevs.bancolombia.com | Público con registro |
| API Portal (interno) | https://api-portal.apps.bancolombia.com | Solo empleados |
| Centro de Ayuda APIs internas | https://soportedeveloper-portal.bancolombia.com | Solo empleados |

> **Hallazgo clave:** el portal `https://developer-portal-public-sbx.apps.ambientesbc.com` expone públicamente el catálogo completo de productos API con documentación técnica, endpoints, schemas y ejemplos. Es una SPA (Angular) que renderiza con JavaScript.

#### Catálogo completo de productos públicos (extraído del portal)

El portal lista **70+ productos API públicos**. Los relevantes para QR y pagos son:

| Producto | Versión | Descripción |
|----------|---------|-------------|
| **QR Code** | 3.0.1 | Administración del código QR (QR Management) |
| **QR Code Information** | — | Información de códigos QR |
| **QR Code Refunds** | — | Reembolsos de pagos QR |
| **QR Payments Information** | — | Información de pagos QR |
| **Personal QR Code** | — | QR personal (persona natural) |
| **Payments Button** | 4.0.1 | Botón Bancolombia (transferencias web) |
| **BancolombiaPay Wallet Payments** | 1.0.2 | Billetera digital con QR Transaction |
| **BancolombiaPay Wallet Information** | — | Info de billetera |
| **BancolombiaPay Wallet Syncing** | — | Sincronización de billetera |
| **BancolombiaPay Cash In** | — | Carga de saldo en billetera |
| **BancolombiaPay Payments Keys Administration** | — | Admin llaves de pago |
| **BancolombiaPay Payments Keys Information** | — | Info llaves de pago |
| **BancolombiaPay Payments Keys Transactions** | — | Transacciones de llaves de pago |
| **Transactional Information** | 1.0.1 | Info transaccional por período (conciliación) |
| **Collections Operations And Services** | — | Operaciones de recaudos |
| **Consignments** | — | Consignaciones |
| **Button Access Entitlement** | 1.0.1 | Gestión de relación de confianza (inactivación pago rápido) |
| **Button Customer Relationship** | — | Relación cliente-botón |
| **Button Payment Instruction** | — | Instrucción de pago botón |
| **Cash Withdrawal Management** | — | Gestión de retiros de efectivo |
| **BNPL Payment Gateway** | — | Compra y paga después |
| **Bnpl** | — | BNPL (Buy Now Pay Later) |
| **Consumer Loan** | — | Crédito de consumo |
| **Deposit Account Operations And Services** | — | Operaciones de cuenta de depósito |
| **Interbank Accounts Operations And Services** | — | Cuentas interbancarias |
| **Third Party Cash Operations And Services** | — | Operaciones de efectivo de terceros |
| **In Store Billing Code** | — | Código de cobro en tienda |

#### Métodos de autenticación

Bancolombia usa 3 métodos según el producto:

1. **OAuth 2.0 (Client Credentials)** — token vigente 20 minutos (1200 s).
   - Headers: `Content-Type: application/x-www-form-urlencoded`, `Accept: application/vnd.bancolombia.v4+json`, `Authorization: Basic {base64(client-id:client-secret)}`
   - Body: `grant_type=client_credentials&scope={scope}`
   - Uso: `Authorization: Bearer {access_token}`
   - **Token URL (sandbox):** `https://$(urlCatalog)/security/oauth-provider/oauth2/token`
   - Headers alternativos (portal público): `X-IBM-Client-Id`, `X-IBM-Client-Secret`

2. **JWT (RS256)** — requiere certificado X.509 (par llave pública/privada).
   - Headers: `json-web-token: {JWT}`, `x-client-certificate: {cert_base64}`, `client-id`, `client-secret`

3. **API Key** — `client-id` y `client-secret` en headers.

#### API: Payments Button — Transference Management (v4.0.2)

**Descripción:** Gestionar operaciones de compra en Botón Bancolombia. Permite crear intención de compra, consultar estado de transferencia y autogestionar reversiones.

**API Base URL (sandbox):**
```
https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order
```

**Seguridad:** OAuth 2.0 — Client Credentials Flow

**Scopes:**
- `Transfer-Intention:write:app` — Registro de intención de compra
- `Transfer-Intention:read:app` — Consulta del estado de una transferencia
- `Refund:write:app` — Reversiones parciales/totales

**Endpoints:**

##### 1. POST `/transfer/action/registry` — Registrar intención de compra

Registra una intención de compra de un cliente por parte de un comercio. Retorna un identificador de transferencia y una URL de redirección.

**Headers:**
- `accept: application/json` (required)
- `message-id: {UUID v4}` (required) — Identificador de transacción, formato UUID v4
- `Authorization: Bearer {access_token}`

**Body:**
```json
{
  "data": [
    {
      "commerceTransferButtonId": "w0mp1B0toN",
      "transferReference": "100234567811111111",
      "transferDescription": "Prueba compra",
      "transferAmount": 10000,
      "commerceUrl": "https://gateway.com/payment/route?commerce=Telovendo",
      "confirmationURL": "https://gateway.com/payment/route?commerce=Telovendo"
    }
  ]
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `commerceTransferButtonId` | string (1-50) | Sí | HASH que identifica el botón de transferencia del comercio |
| `transferReference` | string (1-100) | Sí | Código de referencia de la transacción para el comercio |
| `transferDescription` | string (1-255) | No | Descripción de la transferencia |
| `transferAmount` | string (1-16) | Sí | Valor total de la transacción |
| `commerceUrl` | string (1-500) | Sí | URL del comercio para redireccionar al finalizar |
| `confirmationURL` | string (1-500) | No | URL de confirmación (callback) para notificar finalización |

**Response 200:**
```json
{
  "meta": {
    "_messageId": "f0abdbcd-f424-494b-b732-a33f35ea6dd4",
    "_version": "1.0",
    "_requestDate": "2022-11-01T13:53:29.078Z",
    "_responseSize": 1,
    "_clientRequest": "bf0eb30cb41bf8d0d63f93f34646c15d"
  },
  "data": [
    {
      "redirectURL": "https://enigma-mdp-qa.apps.ambientesbc.com/web/transfer-gateway/checkout/ABC123456",
      "header": {
        "id": "ABC123456",
        "type": "Tranference"
      },
      "transferCode": "ABC123456"
    }
  ]
}
```

**Response headers:** `API-Version`, `Content-Type`, `Rate-Limit`, `cache-control`, `content-security-policy`, `message-id`, `strict-transport-security`

**Códigos de error:** 200, 400, 401, 404, 409, 500, 502, 503, 504

**cURL:**
```bash
curl --request POST \
  --url https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order/transfer/action/registry \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {token}' \
  --header 'Content-Type: application/json' \
  --header 'message-id: {uuid-v4}' \
  --data '{"data":[{"commerceTransferButtonId":"w0mp1B0toN","transferReference":"100234567811111111","transferDescription":"Prueba compra","transferAmount":10000,"commerceUrl":"https://gateway.com/payment/route?commerce=Telovendo","confirmationURL":"https://gateway.com/payment/route?commerce=Telovendo"}]}'
```

##### 2. GET `/transfer/{transferCode}/action/validate` — Consultar estado de transferencia

Consulta el estado de una transferencia a través de su código de identificación.

**Path parameters:**
- `transferCode` (string, required) — Identificador único de la transferencia. Ejemplo: `ABCD1234`

**Headers:**
- `accept: application/json` (required)
- `message-id: {UUID v4}` (required)
- `Authorization: Bearer {access_token}`

**Response 200:**
```json
{
  "meta": {
    "_messageId": "3e5d1c94-6075-4ac8-a81d-a33f35ea48c7",
    "_version": "1.0",
    "_requestDate": "2022-11-01T14:39:30.152Z",
    "_responseSize": 1,
    "_clientRequest": "bf0eb30cb41bf8d0d63f93f34646c15d"
  },
  "data": [
    {
      "header": {
        "type": "Transference",
        "id": "_7GbJ61rPnm"
      },
      "transferState": "pending",
      "transferReference": "216633232323",
      "transferAmount": "3458.33"
    }
  ]
}
```

| Campo | Descripción |
|-------|-------------|
| `transferState` | Estado: `pending`, `approved`, `rejected` |
| `transferStateDescription` | Descripción del estado |
| `transferReference` | Referencia del comercio |
| `transferAmount` | Valor total |

**cURL:**
```bash
curl --request GET \
  --url https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order/transfer/ABCD1234/action/validate \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {token}' \
  --header 'message-id: {uuid-v4}'
```

##### 3. POST — Reversión total o parcial (refund)

Autogestionar la reversión total o parcial de una transacción cancelada por el comercio. Usa scope `Refund:write:app`.

**Schemas relacionados:** `refundRequest`, `refundResponse`

**Descargables disponibles en el portal:**
- Colecciones Postman
- Escenarios de prueba

#### API: QR Code — QR Management (v3.0.1)

**Descripción:** API que permite gestionar a las aplicaciones de terceros funcionalidades relacionadas con la administración del código QR.

> **Nota:** El portal muestra el producto pero los endpoints detallados requieren navegar a la API "QR Code - QR Management" dentro del producto. La estructura sigue el mismo patrón que Payments Button (OAuth 2.0, endpoints REST, schemas JSON).

#### API: BancolombiaPay Wallet Payments (v1.0.2)

**Descripción:** Conjunto de APIs que permite a los comercios ofrecer una billetera digital sincronizada con el depósito de bajo monto Bancolombia A la mano. Incluye pagos con QR.

**APIs del producto:**

1. **Wallet Payment** — Gestiona pagos de productos/servicios.
   - `Transfers between accounts` — Transfiere dinero de la billetera del cliente a la cuenta del comercio.
   - `Transfers void` — Anula transferencias solicitadas previamente.

2. **Wallet Payment QR Transaction** — Gestiona pagos vía código QR.
   - `Get Detail QR` — Lee el detalle de la información asociada a un código QR escaneado.
   - `QR Transaction` — Realiza el pago a través de un código QR con el saldo de la billetera.

**Estructura del QR (validación al leer):**
```json
{
  "typeQR": "Masivo",
  "bankidQR": "007",
  "versionQR": "V2.0",
  "creatorNameQR": "Floristeria Momento Floral",
  "amountsQR": "-- opcional--",
  "integrity": "b"
}
```

**Códigos de error QR Transaction:**
| Código | Descripción |
|--------|-------------|
| BP20250 | No se encontraron registros |
| BP20251 | Datos inválidos |
| BP20252 | Faltan parámetros obligatorios |
| BP20253 | Longitud inválida |
| BP20254 | Alguno de los datos no coincide |
| BP20255 | Error en la autenticación |
| BP20256 | Evento no autorizado |
| BP20257 | El evento no pudo ser realizado |
| BP20258 | El evento no pudo ser notificado exitosamente |

**Códigos de error Wallet Payment:**
| Código | Descripción |
|--------|-------------|
| BP10701 | Alguno de los datos no coinciden |
| BP10759/58 | Error en la autenticación |
| BP10713/14/17 | Cuenta inválida o no existe |
| BP10705 | Tracking ID inválido |
| BP10719 | No es posible debitar de la cuenta |
| BP10709/21 | Error cuenta destino |

**Condiciones de uso:**
- El comercio debe tener cuenta Bancolombia de ahorros o corriente activa.
- El dinero se abona a la cuenta del comercio.

#### API: Transactional Information (v1.0.1)

**Descripción:** Consulta información transaccional de productos de financiación (BNPL, Crédito como Servicio, Cash-Out) para conciliación.

**Características:**
- Consulta por período definido (día `D`, semana `S`, mes `M`)
- Soporte para BNPL, Crédito como Servicio y Cash-Out
- Validación de rangos de fechas (no se admiten fechas futuras)
- Retorna URL con información detallada de transacciones

**Campos para BNPL y Crédito de Consumo:**
`id`, `total_purchase`, `third_party_purchase_id`, `sub_third_party_doc_type`, `sub_third_party_doc_num`, `sub_third_party_name`, `user_commission_value`, `third_party_commission_value`, `created_at`, `updated_at`, `status`, `enterprise_name`, `commercial_name`, `document_type`, `document_number`

**Campos para Cash-Out:**
`transaction_code`, `tracking_id`, `amount`, `currency`, `status`, `status_detail`, `create_at`, `update_date_status`, `user_full_name`, `identification_type`, `identification_number`, `channel_tracking_id`, `channel_code`, `point_code`, `point_name`

#### API: Button Access Entitlement (v1.0.1)

**Descripción:** Gestiona relación de confianza previamente establecida con el aliado, permitiendo inactivación cuando el cliente pagador lo solicite.

**Flujo:**
1. Solicitar inactivación del pago rápido
2. Generar petición de inactivación
3. Validar e inactivar token
4. Generar respuesta inactivación

#### Flujo QR Code Bancolombia

1. Comercio genera QR dinámico vía API QR Code (v3.0.1).
2. Cliente escanea desde APP Personas, APP BALM o APP Nequi.
3. Transferencia se ejecuta inmediatamente.
4. Notificación al comercio:
   - **Modelo estático:** delegados (SMS/email, hasta 3 c/u).
   - **Modelo integración API:** POST a URL del comercio con mensaje cifrado JWT.

#### Flujo Payment Button (Botón Bancolombia)

1. Comercio llama `POST /transfer/action/registry` con los datos de la compra.
2. API retorna `transferCode` y `redirectURL`.
3. Cliente es redirigido a `redirectURL` (pasarela Botón Bancolombia).
4. Cliente autentica y autoriza la transferencia.
5. **Callback:** POST a `confirmationURL` con estado `pending`/`approved`/`rejected`. Tiempo de respuesta máximo **3 segundos**.
6. Comercio puede consultar estado vía `GET /transfer/{transferCode}/action/validate`.
7. Si requiere reverso, usa el endpoint de refund con scope `Refund:write:app`.

#### Dos rutas para QR Bancolombia

El ERP soporta **dos rutas paralelas** para QR Bancolombia. El admin elige cuál usar al configurar la conexión:

| | **Ruta A: Wompi** | **Ruta B: API directa Bancolombia** |
|---|-------------------|-------------------------------------|
| **Estado** | ✅ Ya integrada | ⏳ Requiere onboarding comercial |
| **Provider en BD** | `wompi` (id: `46c3d81f-...`) | `bancolombia` (id: `4befaa82-...`) |
| **Conector en BD** | `wompi_co` (id: `39950173-...`) | `bancolombia_qr` (id: `dd2825e0-...`) |
| **Método de pago** | `wompi` (ya existe) con subtipo `BANCOLOMBIA_QR` | `bancolombia_qr` (nuevo) |
| **Credenciales** | Ya en el ERP (public_key, private_key) | client_id + client_secret + commerce_transfer_button_id |
| **Onboarding** | Ya hecho | Portal sandbox + proceso comercial (semanas) |
| **Comisiones** | Wompi cobra fee | Negociación directa con Bancolombia |
| **QR generation** | Wompi genera el QR (base64) | API QR Code v3.0.1 genera el QR |
| **Webhook** | Wompi envía webhook (HMAC-SHA256) | Bancolombia envía JWT a confirmationURL |
| **Conciliación** | Wompi reporta | Bancolombia Transactional Information v1.0.1 |
| **Tiempo implementación** | Días (solo exponer en checkout) | Semanas (onboarding + implementación) |
| **Control** | Limitado a Wompi | Total |
| **¿Cuándo usar?** | Ahora, rápido, sin onboarding | Cuando se quiera eliminar intermediario |

> **Decisión:** implementar **ambas rutas**. Wompi como ruta rápida (ya funciona, solo exponer en checkout) y API directa como ruta avanzada (para el admin que quiera control total y negociar comisiones directamente con Bancolombia).

#### Ruta A: Wompi BANCOLOMBIA_QR (ya integrada)

Wompi (Grupo Bancolombia) ya está integrada en el ERP y soporta:
- `BANCOLOMBIA_QR` — pago vía QR Bancolombia (solo personas naturales)
- `BANCOLOMBIA_TRANSFER` — Botón Bancolombia
- `NEQUI`, `DAVIPLATA`, `PSE`, `CARD`

**Wompi BANCOLOMBIA_QR — flujo:**
1. Crear transacción con `payment_method.type: "BANCOLOMBIA_QR"`.
2. Long polling hasta obtener `qr_image` y `qr_id` en `payment_method.extra`.
3. Renderizar QR: `<img src="data:image/svg+xml;base64,{qr_image}" />`.
4. Cliente escanea y paga desde app Bancolombia/Nequi.
5. Webhook de Wompi notifica el estado final (`APPROVED`/`DECLINED`/`ERROR`).

**Sandbox Wompi:** `sandbox_status: "APPROVED"` simula el pago.

**Conexión:** el admin ya tiene la conexión Wompi configurada. Solo necesita:
1. Ir a `/app/finanzas/metodos-pago`
2. Activar el método `wompi` (si no está activo)
3. En el checkout, el cajero selecciona "Wompi" → subtipo "Bancolombia QR"

**No requiere:** nuevo provider, nuevo conector, nuevas credenciales, ni onboarding con Bancolombia.

#### Ruta B: API directa Bancolombia (onboarding requerido)

Para el admin que quiera conexión directa con Bancolombia (sin Wompi como intermediario):

**Conexión:** el admin va a `/app/integraciones/conexiones/nueva`:
1. Selecciona provider `bancolombia` → conector `bancolombia_qr`
2. Ambiente: sandbox (inicial) → production (después)
3. Ingresa credenciales: `client_id`, `client_secret`, `commerce_transfer_button_id`
4. El ERP valida con health-check contra el portal sandbox
5. Auto-vincula el método `bancolombia_qr` en `organization_payment_methods`

**Credenciales:** se obtienen en https://developer-portal-public-sbx.apps.ambientesbc.com → "Solicitar Ingreso"

**Flujo de pago:**
1. ERP llama `POST /transfer/action/registry` con `commerceTransferButtonId`, `transferReference`, `transferAmount`, `commerceUrl`, `confirmationURL`
2. Bancolombia retorna `transferCode` + `redirectURL`
3. ERP muestra el QR (o redirige al Botón Bancolombia)
4. Cliente paga en la pasarela Bancolombia
5. Bancolombia envía callback a `confirmationURL` con estado `pending`/`approved`/`rejected`
6. ERP verifica firma JWT del callback
7. ERP actualiza payment + entidad origen + bank_transaction

**Ventajas sobre Wompi:**
- Sin fee de Wompi (negociación directa con Bancolombia)
- Acceso a Transactional Information v1.0.1 para conciliación
- Acceso a QR Code v3.0.1 con funcionalidades avanzadas
- Acceso a BancolombiaPay Wallet Payments v1.0.2
- Control total del flujo

**Desventajas:**
- Requiere onboarding comercial (semanas)
- Requiere firma del Reglamento de APIs Bancolombia
- Reset de client_secret cada 6 meses
- Mayor complejidad técnica

> **Recomendación operativa:** usar Wompi (ruta A) para salir rápido a producción. Migrar a API directa (ruta B) cuando el volumen justifique eliminar el fee de Wompi. El ERP soporta ambas simultáneamente: el admin elige cuál usar por sucursal.

#### Onboarding sandbox

1. Solicitud de acceso al portal público: https://developer-portal-public-sbx.apps.ambientesbc.com → "Solicitar Ingreso".
2. Formulario de solicitud de credenciales (envío por correo).
3. Crear aplicación en Portal Sandbox → genera `client_id` y `client_secret` (solo visible una vez).
4. Suscribir la app al producto API deseado (QR Code, Payments Button, etc.).
5. Descargar colecciones Postman y escenarios de prueba desde el portal.
6. Probar en sandbox con la API Base URL: `https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order`.

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
- **Proveedores BaaS/Fintech** (recomendado): **Mono**, **Passport PaaS (Visionamos)**, **Cobre**, **Kushki**, **EBANX**, **OnePay**.

Bre-B opera con una **arquitectura de nodos interoperables**: ninguna entidad accede directamente al núcleo del sistema, sino a través de nodos certificados por el Banco de la República. Esto significa que una entidad pequeña puede ofrecer pagos Bre-B integrándose a un nodo ya certificado (como Mono), sin construir infraestructura propia.

#### Comparación de proveedores

| Criterio | **Mono** ✅ | **Passport (Visionamos)** | **Cobre** |
|----------|------------|---------------------------|-----------|
| **API** | REST + OAuth 2.0, moderna | REST + OAuth 2.0 | REST + OAuth 2.0 |
| **Sandbox** | Completo con simulación de pagos, errores y timeouts | Disponible, requiere registro | Disponible |
| **QR dinámico** | `POST /collections` con QR automático | `POST /v1/qrcodes` (estático/dinámico) | Checkout alojado o R2P con QR EMVCo |
| **Webhooks** | HMAC-SHA256, 9 tipos para collections | Disponible | Disponible |
| **Idempotencia** | Nativa | Manual | Manual |
| **Experiencia UX** | API-first, control total (QR en el ERP) | API-first, control total | Checkout redirige al usuario fuera |
| **Onboarding** | Registro en breb.app, agendar cita | Registro en dashboard sandbox | Contacto comercial B2B |
| **Enfoque** | Fintech/developers | Entidades financieras + integradores | Empresas B2B con volumen |
| **Dispersiones** | Sí, batch hasta 1.000 | Sí | Sí, con split payments |
| **Soporte** | Incluido | Vía dashboard | Comercial |
| **Límite Bre-B** | COP $12.110.000 (1.000 UVT 2026) | COP $11.500.000 | COP $12.110.000 + auto-enrutamiento ACH |

> **Decisión:** **Mono** es el proveedor seleccionado para Bre-B. Razones: API moderna, sandbox completo, control total de UX (el QR se renderiza dentro del CheckoutDialog del ERP), webhooks firmados con HMAC-SHA256 (mismo patrón que Wompi), idempotencia nativa, y documentación clara.

#### Estándar QR interoperable (EMVCo Colombia)

Bre-B usa el estándar **EMVCo QR Code** adaptado por las EASPBV. Documentos:
- Campos QR Code EMVCo: https://www.achcolombia.com.co/campos-qr-code-emvco
- Lineamientos interoperabilidad QR v4: https://www.redeban.com/sites/default/files/2024-10/documento-lineamientos-interoperabilidad-qr-version-4-2024.pdf

#### Proveedor seleccionado: Mono

Mono es infraestructura bancaria para Latinoamérica. Conecta empresas a la red bancaria colombiana, incluyendo Bre-B, sin necesidad de ser banco. Permite mover dinero, mantener saldos, emitir tarjetas y rastrear cada centavo.

**Capacidades de Mono:**
- **Pay-ins** — Recibir pagos desde cualquier cuenta bancaria colombiana vía PSE.
- **Payouts** — Enviar dinero a cuentas bancarias vía ACH, Transfiya o Mono Turbo.
- **Tarjetas virtuales y físicas** — Emitir tarjetas con saldo programable y controles de gasto.
- **Cuentas ledger** — Mantener saldos en un ledger de doble entrada auditable.
- **Bre-B** — Recibir y enviar pagos inmediatos interbancarios vía Bre-B.

**Servicios de Mono:**
1. **Banking** — Cuentas, transferencias (ACH, Transfiya, Mono Turbo), cobros PSE, emisión de tarjetas.
2. **Core** — Ledger programable, emisión de tarjetas, controles de gasto, payouts.
3. **Bre-B Participant** — Enviar y recibir pagos instantáneos Bre-B a través de la API de Mono.

**URLs:**
- **Landing Bre-B:** https://breb.app/
- **Docs:** https://docs.mono.la/docs/guides/breb-participant
- **API Reference:** https://docs.mono.la/docs/api-reference/breb-participant
- **Sandbox:** https://sandbox.api.cuentamono.com
- **Dashboard:** https://mi.cuentamono.com
- **Producción:** https://api.cuentamono.com

**Autenticación:** OAuth 2.0 Client Credentials (Bre-B Participant).

**Quick start:**
1. **Obtener credenciales** — Iniciar sesión en https://mi.cuentamono.com y generar API key de sandbox.
2. **Leer documentación de autenticación** — https://docs.mono.la/docs/guides/breb-participant/authentication (OAuth 2.0).
3. **Hacer llamada de prueba** — Usar curl contra la sandbox base URL.
4. **Configurar webhook** — Registrar endpoint y verificar firma HMAC-SHA256.
5. **Ejecutar flujo end-to-end** — Crear collection, simular pago, recibir webhook.

**Modelos de integración Bre-B con Mono:**
- **Modelo agregador** — Se transfiere dinero a una cuenta de Mono y desde ahí se opera.
- **Modelo directo** — Se opera directamente con la cuenta del comercio.

#### Guía detallada de integración Mono (Fase 3)

##### Beneficios de Mono para el ERP

**1. Pago inmediato interbancario (Bre-B)**
- El cliente paga desde cualquier banco colombiano (Bancolombia, Davivienda, BBVA, Nequi, Scotiabank, etc.)
- El dinero llega en segundos, no en horas como ACH tradicional
- Límite por transacción: COP $12.110.000 (1.000 UVT 2026)
- Disponible 24/7/365 (incluyendo fines de semana y festivos)

**2. QR dinámico dentro del ERP**
- El QR se renderiza dentro del `QrPaymentDialog` (no redirige al usuario fuera del ERP)
- Control total de la experiencia visual: colores, branding, cuenta regresiva
- Referencia única por transacción para trazabilidad
- Expiración configurable (default: 15 minutos = 900 segundos)

**3. Webhooks firmados (HMAC-SHA256)**
- 9 tipos de eventos para collections (ver lista completa abajo)
- Firma HMAC-SHA256 en header `X-Signature` (mismo patrón que Wompi)
- El ERP ya tiene `confirmQrPayment()` idempotente en `paymentConfirmation.ts`
- Validación de firma en el webhook handler antes de procesar

**4. Idempotencia nativa**
- Cada collection tiene un ID único generado por Mono
- Webhooks duplicados no causan doble actualización en el ERP
- El campo `metadata` del ERP viaja en la collection para matching bidireccional

**5. Sandbox completo con simulación**
- Credenciales sandbox inmediatas desde `mi.cuentamono.com`
- Endpoint `simulate-payment` para pruebas end-to-end sin dinero real
- Simulación de errores: `tx_unknown`, `tx_provider_unavailable`, `tx_breb_timeout`, `tx_risk_control`
- Simulación de timeouts y fallos de resolución

**6. Trazabilidad completa ERP → Mono → Banco**
- Cada pago genera la cadena: `payment_qr_sessions` → `payments` → `bank_transactions` → `integration_events`
- Metadata del ERP en la collection: `payment_id`, `sale_id`, `organization_id`, `branch_id`, `source` (pos/pms/mesas/parking/transporte/finanzas)
- Conciliación automática con `paymentConfirmation.ts` (inserta en `bank_transactions` con `import_source='breb'`)

**7. Dispersiones batch (payouts)**
- Hasta 1.000 transferencias en un solo batch
- Útil para pagar proveedores, nómina o reembolsos masivos desde Finanzas
- Resolución automática de destinatario antes de enviar

**8. Multi-banco sin integración individual**
- Una sola conexión con Mono da acceso a todos los bancos de la red Bre-B
- No requiere integrar Bancolombia, Davivienda, BBVA por separado
- El pagador usa su propia app bancaria para escanear el QR

##### Onboarding paso a paso (paralelo a Fase 2)

> **Recomendación:** iniciar el onboarding de Mono en paralelo con la Fase 2 (Redeban) para que las credenciales sandbox estén listas cuando comience la Fase 3.

**Paso 1: Registro (día 1)**
1. Ir a https://breb.app/ o https://mi.cuentamono.com
2. Crear cuenta con email corporativo
3. Verificar email y teléfono

**Paso 2: KYC empresarial (días 2-7)**
1. Completar formulario de empresa:
   - Razón social
   - NIT
   - Cámara de comercio
   - RUT
   - Certificado de existencia y representación legal
2. Verificación de representantes legales
3. Vincular cuenta bancaria del comercio (donde llegarán los fondos)

**Paso 3: Credenciales sandbox (día 1-2, inmediato)**
1. En `mi.cuentamono.com` → API Keys → Crear API key de sandbox
2. Obtener `client_id` y `client_secret`
3. Guardar en el ERP: `/app/integraciones/conexiones/nueva` → seleccionar "Bre-B" → ambiente "sandbox" → ingresar credenciales

**Paso 4: Configurar webhook (día 3)**
1. En el ERP: la URL del webhook se auto-genera al crear la conexión
2. En `mi.cuentamono.com` → Webhooks → registrar la URL del ERP
3. Obtener el secreto de firma (HMAC-SHA256)
4. Guardar el secreto en el ERP (en la página de webhooks de la conexión)

**Paso 5: Pruebas sandbox (días 3-5)**
1. Crear collection desde el ERP (checkout POS → "Bre-B QR")
2. Simular pago: `POST /api/v1/sandbox/collections/simulate-payment`
3. Verificar que el webhook llega al ERP
4. Verificar que `payment_qr_sessions` se actualiza a `paid`
5. Verificar que `payments` se actualiza a `completed`
6. Verificar que `bank_transactions` se inserta con `import_source='breb'`

**Paso 6: Producción (semanas 2-4)**
1. Completar KYC comercial con Mono
2. Firmar contrato de servicios
3. Obtener credenciales de producción (`client_id` + `client_secret` productivos)
4. En el ERP: editar la conexión → cambiar ambiente a "production" → actualizar credenciales
5. Pruebas con montos reales pequeños
6. Go-live

##### Flujo técnico de un pago Bre-B vía Mono

```
1. CAJERO selecciona "Bre-B QR" en checkout
   ↓
2. ERP busca la conexión activa de Mono para la organización/sucursal
   ↓
3. ERP llama POST /api/v1/collections con:
   {
     "amount": 50000,
     "currency": "COP",
     "key_type": "ALPHA",
     "key_value": "@miempresa",
     "description": "POS-12345 Sucursal Centro",
     "expires_in": 900,
     "metadata": {
       "payment_id": "uuid-del-payment",
       "sale_id": "12345",
       "organization_id": 1,
       "branch_id": 2,
       "source": "pos"
     }
   }
   ↓
4. Mono retorna:
   {
     "id": "col_abc123",
     "status": "ready",
     "qr": "data:image/png;base64,...",
     "expires_at": "2026-08-14T20:15:00Z"
   }
   ↓
5. ERP guarda en payment_qr_sessions:
   - reference = "POS-12345-SUC-2-1692023"
   - external_qr_id = "col_abc123"
   - qr_image_url = "data:image/png;base64,..."
   - status = "pending"
   - expires_at = "2026-08-14T20:15:00Z"
   ↓
6. ERP muestra QrPaymentDialog con el QR + cuenta regresiva 15:00
   ↓
7. CLIENTE escanea el QR desde su app bancaria (Bancolombia, Davivienda, etc.)
   ↓
8. Mono procesa el pago Bre-B (segundos)
   ↓
9. Mono envía webhook al ERP:
   POST /api/integrations/breb/webhook
   Headers: X-Signature: HMAC-SHA256(...)
   Body: {
     "event": "collection.paid",
     "data": {
       "id": "col_abc123",
       "amount": { "amount": 50000, "currency": "COP" },
       "status": "paid",
       "metadata": { "payment_id": "uuid-del-payment", ... }
     }
   }
   ↓
10. ERP verifica firma HMAC-SHA256
    ↓
11. ERP llama confirmQrPayment():
    - payment_qr_sessions.status = "paid"
    - payments.status = "completed"
    - bank_transactions INSERT (import_source='breb', import_id='col_abc123')
    ↓
12. QrPoller detecta status="paid" → QrPaymentDialog muestra "Pago confirmado"
    ↓
13. Dialog se cierra automáticamente tras 3 segundos
    ↓
14. Venta/factura/reserva actualizada en el módulo origen
```

##### Estructura de archivos a crear (Fase 3)

```
src/lib/services/integrations/breb/
  ├── monoConfig.ts          — URLs base (sandbox/producción), env vars
  ├── monoTypes.ts           — interfaces (MonoCollection, MonoWebhookPayload, etc.)
  └── monoService.ts         — lógica de API (getAccessToken, createCollection, simulatePayment, verifyWebhookSignature)

src/app/api/integrations/breb/
  ├── create-qr/route.ts     — POST: crea collection, guarda en payment_qr_sessions, retorna QR
  ├── webhook/route.ts       — POST: recibe webhook de Mono, verifica firma, llama confirmQrPayment
  ├── status/route.ts        — GET: consulta estado de payment_qr_sessions por referencia
  └── health-check/route.ts  — POST: valida credenciales con Mono (getAccessToken)
```

##### Comparación: Mono vs Wompi para QR

| Criterio | Mono (Bre-B) | Wompi (Bancolombia QR) |
|----------|--------------|------------------------|
| **Bancos del pagador** | Todos los bancos colombianos | Solo Bancolombia/Nequi |
| **Velocidad** | Inmediato (segundos) | Inmediato |
| **Límite por transacción** | COP $12.110.000 | Sin límite específico |
| **Horario** | 24/7/365 | 24/7/365 |
| **Comisión** | Negociada con Mono | Fee Wompi (% + IVA) |
| **Onboarding** | KYC con Mono (días) | Ya hecho en el ERP |
| **Webhook** | HMAC-SHA256 (X-Signature) | HMAC-SHA256 (events_secret) |
| **QR** | Dentro del ERP (QrPaymentDialog) | Dentro del ERP (Wompi flow) |
| **Sandbox** | simulate-payment endpoint | sandbox_status: "APPROVED" |
| **Idempotencia** | Nativa (collection ID) | Nativa (transaction ID) |
| **Dispersiones** | Batch hasta 1.000 | No aplica |

> **Conclusión:** Mono complementa a Wompi. Wompi cubre QR Bancolombia (sin onboarding adicional). Mono cubre Bre-B (todos los bancos). El ERP puede tener ambas conexiones activas y el cajero elige cuál usar en el checkout.

**Crear Collection con QR (recaudo):**
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

**Tipos de llave Bre-B soportados:**
- `PHONE` — Celular
- `EMAIL` — Correo electrónico
- `ID` — Cédula/documento
- `ALPHA` — Identificador alfanumérico personalizado
- `BCODE` — Código de comercio

**Eventos webhook (9 tipos para collections):**
- `collection.ready` — La collection está lista para recibir pagos.
- `collection.attempt_successful` — Un intento de pago fue exitoso.
- `collection.attempt_unsuccessful` — Un intento de pago fue rechazado.
- `collection.paid` — La collection alcanzó el monto total.
- `collection.minimum_paid` — La collection alcanzó el monto mínimo.
- `collection.expired` — La collection expiró sin pago completo.
- `collection.cancelled` — La collection fue cancelada.
- Verificación firma: HMAC-SHA256 en header `X-Signature`.

**Sandbox — simular pago:**
```
POST /api/v1/sandbox/collections/simulate-payment
{
  "creditor_key_value": "@MN1234567890",
  "amount": { "amount": 50000, "currency": "COP" }
}
```

**Simulación de errores en sandbox:**
```json
{
  "creditor_key_value": "@MN1234567890",
  "amount": { "amount": 50000, "currency": "COP" },
  "error": "tx_risk_control"
}
```

| Error code | Descripción |
|------------|-------------|
| `tx_unknown` | Error inesperado |
| `tx_provider_unavailable` | Bre-B no disponible |
| `tx_breb_timeout` | Timeout de Bre-B |
| `tx_risk_control` | Rechazo por control de riesgo |

**Dispersiones (outgoing transfers):**
- Batch de hasta 1.000 transferencias.
- Resolución automática de destinatario antes de enviar.
- Validación de identidad (`expected_creditor`).
- Idempotencia nativa.
- 10 tipos de webhook para transfers.

**Estados de collections:**
- `pending` → `ready` → `minimum_paid` / `paid` / `expired` / `cancelled`

**Estados de outgoing transfers:**
- `pending` → `resolved` → `settled` / `rejected` / `failed`

#### Proveedor alternativo: Passport PaaS (Visionamos)

- **URL Sandbox:** `https://api.paas.sandbox.co.passportfintech.com`
- **URL Sandbox (nodo Visionamos):** `https://bre-b-sandbox.api.visionamos.passportfintech.com`
- **Docs:** https://docs.passportfintech.com/ES
- **Postman:** https://www.postman.com/passport-baas/bre-b-api-nodo-visionamos-passport-for-developers/overview
- **Crear QR:** `POST /v1/qrcodes` con `type: "DYNAMIC"`, `channel: "ECOMM"`, `amount.value`, `expiration`, `reference`.
- **Iniciar pago:** `POST /v1/payments/breb` con `account_id`, `recipient_id`, `amount`.
- **Eventos webhook:** `payment.accepted`, `payment.settled`, `payment.failed`.
- **Resolución de llaves:** `POST /v1/resolve-key`.
- **Gestión de llaves Bre-B:** `POST /v1/keys` (tipos: `ID`, `PHONE`, `EMAIL`, `ALPHA`, `BCODE`).
- **Monto máximo:** COP $11.500.000.
- **Nota:** el estándar QR EASPBV está "sujeto a cambios" según Passport.

#### Proveedor alternativo: Cobre

- **Docs:** https://docs.cobre.com/es/bre-b-1952108m0
- **Checkout API:** `POST /checkouts` — crea URL de checkout alojada (PSE, Bancolombia, Nequi, BreB QR, BreB Key).
- **Request to Pay (R2P):** API-only, control total de UX, Bre-B Dynamic Key y Dynamic QR (EMVCo).
- **Cobre Keys:** Crear, gestionar y recuperar llaves Bre-B.
- **Split Payments:** Divide pagos que exceden el límite Bre-B en múltiples transacciones.
- **Auto-enrutamiento:** Si excede límite Bre-B, enruta automáticamente a Fast Pay o ACH.
- **Enfoque:** B2B empresarial con volumen.

#### Límites Bre-B (2026)

- Máximo por transacción: **COP $12.110.000** (1.000 UVT).
- Tiempo máximo de procesamiento: **20 segundos**.
- Tiempo de acreditamiento: tiempo real (máximo 30 segundos).
- Disponibilidad: **24/7/365**.
- Tarifa usuarios: gratis primeros 3 años (desde oct-2025); 4º año $6,46 COP/operación a entidades.
- Monto mínimo: 1 COP.

#### Conciliación Bre-B

- Reportes del **MOL** (Mecanismo Operativo de Liquidación) vía portal GTA.
- Especificaciones MOL v2.5.0: https://www.redcoopcentral.com/wp-content/uploads/2026/01/MOL_Documento-de-Especificaciones-Tecnicas-v2.5.0-002.pdf
- Mono proporciona webhooks con estado final de cada transacción para conciliación en tiempo real.
- Cobre y BBVA API Market ofrecen conciliación vía API.

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

## 7.5. Flujo del cliente: cómo conecta el banco y genera QR

### Visión general

El ERP ya tiene un **wizard de conexión de integraciones** en `/app/integraciones/conexiones/nueva` que funciona para Wompi, Stripe, PayU, MercadoPago, PayPal, Meta, TikTok, etc. El wizard tiene 4 pasos:

1. **Proveedor y conector** — selecciona el proveedor (ej: Bancolombia) y el conector (ej: `bancolombia_qr`).
2. **Configuración** — país, ambiente (sandbox/producción), sucursal (opcional).
3. **Ajustes** — nombre de la conexión, merchant ID, URL de webhook (auto-generada), notas.
4. **Credenciales** — campos dinámicos según proveedor, validación en tiempo real, guardado.

Al completar el wizard, el ERP:
- Crea registro en `integration_connections` (status: `draft` → `connected`).
- Guarda credenciales en `integration_credentials` (solo `secret_ref`, no texto plano).
- **Auto-vincula** el método de pago correspondiente en `organization_payment_methods.integration_connection_id`.

### Flujo completo del cliente (5 etapas)

#### Etapa 1: Configurar la conexión (una sola vez — admin)

**Para Bre-B (Mono) y Redeban:** conexión directa nueva.

```
/app/integraciones/conexiones
  → Clic en "Bre-B" (o "Redeban")
  → Wizard Paso 1: seleccionar conector (breb_mono / redeban_qr)
  → Wizard Paso 2: país=CO, ambiente=sandbox (inicial) o production
  → Wizard Paso 3: nombre="Bre-B Sucursal Centro", webhook auto-generado
  → Wizard Paso 4: ingresar credenciales
      Mono:        client_id + client_secret (de mi.cuentamono.com)
      Redeban:     SERVER_APP_CODE + SERVER_APP_KEY (de dashboard.redeban.com)
  → Clic "Validar" → health-check con el proveedor
  → Clic "Crear Conexión"
  → ✅ Conexión creada con status "connected"
  → 🔗 Auto-vinculación: ERP asigna integration_connection_id al método breb_qr/redeban_qr
```

**Para Bancolombia QR:** dos rutas, el admin elige cuál.

**Ruta A — Wompi (rápida, ya conectada):**
```
/app/finanzas/metodos-pago
  → Activar método "wompi" (si no está activo)
  → En checkout, cajero selecciona "Wompi" → subtipo "Bancolombia QR"
  → No requiere nueva conexión ni credenciales
  → Wompi ya está conectado con sus credenciales existentes
```

**Ruta B — API directa Bancolombia (avanzada):**
```
/app/integraciones/conexiones
  → Clic en "Bancolombia"
  → Wizard Paso 1: seleccionar conector bancolombia_qr
  → Wizard Paso 2: país=CO, ambiente=sandbox
  → Wizard Paso 3: nombre="Bancolombia QR Directo", webhook auto-generado
  → Wizard Paso 4: ingresar credenciales
      Bancolombia: client_id + client_secret + commerce_transfer_button_id
                   (de https://developer-portal-public-sbx.apps.ambientesbc.com)
  → Clic "Validar" → health-check con portal Bancolombia
  → Clic "Crear Conexión"
  → ✅ Conexión creada con status "connected"
  → 🔗 Auto-vinculación: ERP asigna integration_connection_id al método bancolombia_qr
```

**Credenciales por proveedor:**

| Proveedor | Ruta | Campos | Dónde obtiene el cliente las credenciales |
|-----------|------|--------|------------------------------------------|
| Bancolombia (vía Wompi) | A | Ya conectado — sin credenciales nuevas | Ya configurado en el ERP |
| Bancolombia (directo) | B | `client_id`, `client_secret`, `commerce_transfer_button_id` | https://developer-portal-public-sbx.apps.ambientesbc.com → "Solicitar Ingreso" |
| Bre-B (Mono) | Directa | `client_id`, `client_secret` | https://mi.cuentamono.com → generar API key |
| Redeban | Directa | `SERVER_APP_CODE`, `SERVER_APP_KEY` | https://dashboard-stg.redeban.com (sandbox) o https://dashboard.redeban.com (prod) |

#### Etapa 2: Configurar cuenta bancaria destino (una sola vez — admin)

```
/app/finanzas/metodos-pago
  → Seleccionar "Bancolombia QR" (ya aparece como "Conectado" con badge verde)
  → Sección Avanzado → Contabilidad:
      → Cuenta bancaria destino (de bank_accounts): donde llega el dinero
      → Cuenta de ingresos: mapeo contable
      → Cuenta por cobrar: mapeo contable
  → Switch "Activo" = ON
```

> **Nota:** actualmente el mapeo de cuenta bancaria es global por organización, no por sucursal. Si se requiere different cuenta por sucursal, hay que extender `AccountMappingForm.tsx` para filtrar `bank_accounts` por `branch_id`.

#### Etapa 3: Generar QR en operación (día a día — cajero)

```
POS / PMS / Mesas / Parking / Transporte / Finanzas
  → Checkout → seleccionar "Bancolombia QR" (o "Bre-B QR" o "Redeban QR")
  → ERP busca la conexión activa para esa organización/sucursal
  → ERP llama al proveedor con las credenciales guardadas:
      Bancolombia: POST /transfer/action/registry → retorna redirectURL + transferCode
      Mono:         POST /api/v1/collections → retorna collection con QR
      Redeban:      POST /v2/qr/generate/ → retorna QR string EMVCo
  → ERP guarda en payment_qr_sessions (reference, amount, provider, expires_at)
  → ERP muestra el QR en el CheckoutDialog (imagen base64 o string EMVCo renderizado)
  → Cliente escanea el QR desde su app bancaria (Bancolombia, Nequi, cualquier banco para Bre-B)
```

#### Etapa 4: Confirmación del pago (automático — webhook)

```
Proveedor envía webhook al ERP:
  Bancolombia: POST a confirmationURL con estado (JWT firmado)
  Mono:         POST con HMAC-SHA256 en header X-Signature
  Redeban:      POST a webhook URL configurada

ERP procesa el webhook:
  1. Verifica la firma (JWT / HMAC-SHA256 / Auth-Token)
  2. Busca payment_qr_session por referencia única
  3. Si ya fue procesado → idempotente (ignora duplicado)
  4. Actualiza payment.status = "approved" (o "rejected" / "expired")
  5. Inserta registro en bank_transactions (para conciliación)
  6. Actualiza la entidad origen:
      - POS: sale.status = "paid"
      - PMS: folio.balance actualizado
      - Mesas: mesa liberada
      - Parking: sesión de parking pagada
      - Finanzas: factura/cuenta por cobrar actualizada
  7. Supabase Realtime notifica al frontend → cierra el QR dialog automáticamente
```

#### Etapa 5: Conciliación bancaria (finanzas)

```
Cada pago confirmado genera:
  - payment (estado: approved)
  - bank_transaction (para conciliación)
  - integration_event (trazabilidad del webhook)

/app/finanzas/conciliacion
  → Auto-match entre bank_transactions y payments
  → Reportes de conciliación
  → Trazabilidad completa: payment → webhook → integration_event → bank_transaction
```

### Tablas involucradas en el flujo

| Tabla | Rol en el flujo |
|-------|-----------------|
| `integration_providers` | Catálogo de proveedores (wompi, bancolombia, breb, redeban) |
| `integration_connectors` | Conectores específicos (wompi_co, bancolombia_qr, breb_mono, redeban_qr) |
| `integration_connections` | Conexión creada por la organización (status, environment, branch_id) |
| `integration_credentials` | Credenciales guardadas (solo secret_ref, no texto plano) |
| `integration_webhooks` | Webhooks configurados por conexión (URL, events, signing_method) |
| `integration_events` | Trazabilidad de cada evento recibido/enviado |
| `organization_payment_methods` | Método de pago activado por organización + `integration_connection_id` |
| `payment_methods` | Catálogo global (bancolombia_qr, breb_qr, redeban_qr) |
| `payments` | Registro del pago (amount, method, status, reference) |
| `payment_qr_sessions` | Sesión QR generada (reference, amount, provider, expires_at, status) |
| `bank_accounts` | Cuenta bancaria destino donde llega el dinero |
| `bank_transactions` | Transacción bancaria para conciliación |
| `integration_jobs` | Jobs de sincronización (polling, reconciliación) |

### Hallazgos del código existente (subagentes)

**Lo que ya funciona:**
- ✅ Wizard de 4 pasos completo en `/app/integraciones/conexiones/nueva`
- ✅ Guardado de credenciales con `secret_ref` (no texto plano)
- ✅ Auto-vinculación de método de pago al crear conexión
- ✅ Página de webhooks por conexión (`/app/integraciones/conexiones/[id]/webhooks`)
- ✅ Health-check para proveedores existentes (Wompi, Stripe, PayU, etc.)
- ✅ OAuth callbacks para Meta, TikTok, Google Ads, WhatsApp
- ✅ `linkConnectionToPaymentMethod()` para vinculación manual
- ✅ `getConnectionUsage()` para ver qué métodos usan una conexión
- ✅ Badge "Conectado" / "Conectar" en lista de métodos de pago
- ✅ Toggle activo/inactivo de métodos de pago
- ✅ Mapeo de cuentas contables y bancarias en `AccountMappingForm`

**Lo que falta implementar (Fase 1A):**
- ❌ Campos de credenciales para Bancolombia, Mono y Redeban en `StepCredentials.tsx`
- ❌ Validación (health-check) para los 3 nuevos proveedores
- ❌ Mapeo `PROVIDER_PAYMENT_METHODS` para auto-vinculación
- ❌ Mapeo `syncPaymentMethodFromConnection` en el servicio
- ❌ Entradas `PAYMENT_INTEGRATIONS` en `PaymentMethodForm.tsx`
- ❌ Selector de cuenta bancaria por sucursal (actualmente es global)

---

## 8. Fases de implementación

### Fase 0 — Preparación y limpieza (1-2 días) ✅ COMPLETADO

**Objetivo:** dejar el modelo de datos limpio antes de agregar proveedores.

**Estado:** completado el 2026-08-14.

- [x] **Auditar códigos QR duplicados** en `payment_methods` — confirmados: `qr` (pago QR), `QR` (QR.), `002` (p. QR), `SQS` (SQq). **Pendiente: consolidar con equipo antes de migrar datos.**
- [x] **Insertar 3 nuevos `payment_methods`:** `bancolombia_qr`, `breb_qr`, `redeban_qr` — INSERT exitoso en Supabase.
- [x] **Insertar 3 nuevos `integration_providers`:** `bancolombia` (id: `4befaa82-...`), `breb` (id: `487d94de-...`), `redeban` (id: `a32ba5c2-...`) — INSERT exitoso.
  - `auth_type` de Redeban: `api_key` (el check constraint solo permite `api_key`, `oauth2`, `basic`, `custom`).
- [x] **Insertar 4 nuevos `integration_connectors`:** `bancolombia_qr` (id: `dd2825e0-...`), `breb_mono` (id: `9bac886a-...`), `breb_passport` (id: `769ea129-...`), `redeban_qr` (id: `bbdfbdd2-...`) — INSERT exitoso.
  - `integration_connectors` no tiene unique constraint en `code`, por lo que no se puede usar `ON CONFLICT`.
- [x] **Agregar etiquetas en `src/components/pos/cajas/paymentMethodLabels.ts`:**
  ```typescript
  bancolombia_qr: 'Bancolombia QR',
  breb_qr: 'Bre-B (Pago Inmediato)',
  redeban_qr: 'Redeban QR',
  ```
- [x] **Agregar constantes en `src/components/finanzas/metodos-pago/payment-method-types.ts`:**
  ```typescript
  export const PAYMENT_GATEWAYS = {
    ...,
    BANCOLOMBIA: 'bancolombia',
    BREB: 'breb',
    REDEBAN: 'redeban'
  };
  // + 3 opciones en PAYMENT_GATEWAY_OPTIONS
  // + 3 constantes en SYSTEM_PAYMENT_METHODS: BANCOLOMBIA_QR, BREB_QR, REDEBAN_QR
  ```
- [x] **Verificación:** `tsc --noEmit` pasa sin errores. ESLint solo reporta error preexistente (`any` en línea 22 de `payment-method-types.ts`, no introducido por este cambio).

**IDs de BD registrados:**

| Tabla | code | id |
|-------|------|----|
| `integration_providers` | `bancolombia` | `4befaa82-4a82-459d-bb9c-f508aa953542` |
| `integration_providers` | `breb` | `487d94de-4273-4b42-a49b-27250ed05fc7` |
| `integration_providers` | `redeban` | `a32ba5c2-064a-4041-b368-c4a2f1f8e4c9` |
| `integration_connectors` | `bancolombia_qr` | `dd2825e0-548b-454b-a522-35efc705c25d` |
| `integration_connectors` | `breb_mono` | `9bac886a-64ff-40c4-8588-e6ea7228f709` |
| `integration_connectors` | `breb_passport` | `769ea129-57fc-490e-9bde-c1d53e762f9d` |
| `integration_connectors` | `redeban_qr` | `bbdfbdd2-6de7-4174-adbe-78c7b47a71ba` |

**Pendiente (requiere aprobación del equipo):**
- Consolidar códigos QR duplicados (`qr`, `QR`, `002`, `SQS`) en `payment_methods`. Esto implica migrar referencias en `payments.method` y `organization_payment_methods.payment_method_code`.

### Fase 1 — Infraestructura compartida (3-5 días) ✅ COMPLETADO

**Objetivo:** crear utilidades reutilizables por los 3 proveedores y configurar el wizard de conexión existente para los nuevos proveedores.

**Estado:** completado el 2026-08-14.

#### 1A. Configuración del wizard de conexión existente ✅

El ERP ya tiene un wizard de 4 pasos en `/app/integraciones/conexiones/nueva` que soporta Wompi, Stripe, PayU, MercadoPago, PayPal, Meta, TikTok, etc. Para que funcione con Bancolombia, Bre-B/Mono y Redeban, se extendió:

- [x] **`src/components/integraciones/conexiones/nueva/StepCredentials.tsx`** — agregadas 3 entradas en `PROVIDER_CREDENTIAL_OVERRIDES`:
  - `bancolombia`: client_id, client_secret, commerce_transfer_button_id (helpUrl: portal sandbox Bancolombia)
  - `breb`: client_id, client_secret (helpUrl: mi.cuentamono.com)
  - `redeban`: server_app_code, server_app_key (helpUrl: dashboard-stg.redeban.com)
- [x] **`src/app/app/integraciones/conexiones/nueva/page.tsx`** — agregados 3 proveedores en `PROVIDER_PAYMENT_METHODS`:
  - `bancolombia: ['bancolombia_qr']`
  - `breb: ['breb_qr']`
  - `redeban: ['redeban_qr']`
- [x] **`src/app/app/integraciones/conexiones/nueva/page.tsx`** — agregados 3 proveedores en `multiKeyProviders` array (línea 209).
- [x] **`src/lib/services/integrationsService.ts`** — agregados 3 mapeos en `PROVIDER_TO_METHOD` (función `syncPaymentMethodFromConnection`):
  - `bancolombia: 'bancolombia_qr'`
  - `breb: 'breb_qr'`
  - `redeban: 'redeban_qr'`
- [x] **`src/components/finanzas/metodos-pago/PaymentMethodForm.tsx`** — agregadas 3 entradas en `PAYMENT_INTEGRATIONS`:
  - `bancolombia_qr` → providerId `4befaa82-...`
  - `breb_qr` → providerId `487d94de-...`
  - `redeban_qr` → providerId `a32ba5c2-...`

**Nota:** el guardado de credenciales para los 3 nuevos proveedores usa el flujo genérico del wizard (guarda como JSON en un solo registro de `integration_credentials`). No requiere crear servicios específicos como `bancolombiaService.saveCredentials()` porque el flujo genérico ya soporta multi-key providers.

#### 1B. Utilidades compartidas para QR ✅

- [x] **`src/lib/services/integrations/qrShared/emvco.ts`** (93 líneas) — builder/parser EMVCo:
  - `EmvcoTag` type, `EMVCO_TAGS` constant (11 IDs estándar 00-63)
  - `buildEmvcoPayload(tags)` — construye string QR con formato ID+length+value + CRC
  - `parseEmvcoPayload(payload)` — parsea string QR de vuelta a tags
- [x] **`src/lib/services/integrations/qrShared/qrSessionService.ts`** (236 líneas) — CRUD de `payment_qr_sessions`:
  - `createQrSession(data)`, `getQrSessionByReference(orgId, ref)`, `updateQrSessionStatus(id, status)`, `markQrSessionPaid(id, externalQrId, providerResponse)`, `markQrSessionExpired(id)`, `getExpiredQrSessions()`
  - Usa `getSupabaseAdmin()` de `@/lib/supabase/admin` (convención existente del proyecto)
- [x] **`src/lib/services/integrations/qrShared/qrPoller.ts`** (185 líneas) — polling client-side:
  - `class QrPoller` con `start()`, `stop()`, `isRunning`, `checkNow()`
  - Polling a `/api/integrations/qr/status` cada 3s, backoff exponencial tras 5 intentos (max 15s), detiene tras 100 intentos o estado terminal
  - Callbacks: `onStatusChange`, `onPaid`, `onExpired`, `onError`
- [x] **`src/lib/services/integrations/qrShared/paymentConfirmation.ts`** (209 líneas) — confirmación compartida:
  - `confirmQrPayment(input)` — función idempotente que:
    1. Busca `payment_qr_session` por id
    2. Si ya está `paid`, retorna success (idempotente)
    3. Actualiza `payment_qr_sessions.status` + `paid_at`
    4. Inserta/actualiza `payments` (status=completed, method=provider_code)
    5. Inserta en `bank_transactions` si hay `bankAccountId` (type=credit, status=unmatched)
    6. Retorna IDs creados
- [x] **`src/components/shared/QrPaymentDialog.tsx`** (335 líneas) — componente UI:
  - Muestra QR (imagen o texto), referencia, monto formateado COP, cuenta regresiva mm:ss
  - Integración con `QrPoller` para estado en tiempo real
  - Estados: pendiente (spinner), pagado (CheckCircle2), expirado (XCircle)
  - Botones "Ya pagué" (fuerza consulta) y "Cancelar"
  - Soporte dark mode con clases `dark:`
  - `'use client'`

#### 1C. Tabla `payment_qr_sessions` creada en Supabase ✅

La tabla no existía. Se creó con la siguiente estructura:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | `gen_random_uuid()` |
| `organization_id` | INTEGER NOT NULL | Organización |
| `branch_id` | INTEGER | Sucursal (opcional) |
| `payment_id` | UUID FK → `payments(id)` | Pago asociado |
| `provider_code` | TEXT NOT NULL | `bancolombia`, `breb`, `redeban` |
| `connector_code` | TEXT NOT NULL | `bancolombia_qr`, `breb_mono`, `redeban_qr` |
| `integration_connection_id` | UUID FK → `integration_connections(id)` | Conexión usada |
| `reference` | TEXT NOT NULL | Referencia única del pago |
| `external_qr_id` | TEXT | ID del QR en el proveedor |
| `qr_data` | TEXT | String EMVCo del QR |
| `qr_image_url` | TEXT | URL o base64 de la imagen |
| `amount` | NUMERIC(15,2) NOT NULL | Monto del pago |
| `currency` | CHAR(3) DEFAULT 'COP' | Moneda |
| `status` | TEXT DEFAULT 'pending' | `pending`, `paid`, `expired`, `rejected`, `cancelled` |
| `source` | TEXT | Módulo origen (pos, pms, mesas, parking, etc.) |
| `source_id` | TEXT | ID de la entidad origen |
| `customer_label` | TEXT | Etiqueta del cliente |
| `expires_at` | TIMESTAMPTZ | Fecha de expiración |
| `paid_at` | TIMESTAMPTZ | Fecha de pago |
| `provider_response` | JSONB | Respuesta completa del proveedor |
| `created_by` | UUID | Usuario que creó la sesión |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

**Constraints e índices:**
- CHECK constraint en `status` (5 valores permitidos)
- UNIQUE INDEX en `(organization_id, reference)` — idempotencia
- INDEX en `status` — consultas por estado
- INDEX en `expires_at WHERE status = 'pending'` — job de expiración
- INDEX en `payment_id WHERE payment_id IS NOT NULL` — búsqueda por pago
- INDEX en `(organization_id, branch_id)` — filtrado por sucursal
- RLS habilitado con policy `payment_qr_sessions_org_isolation`

#### Verificación ✅

- **ESLint:** 0 errores en los 5 archivos nuevos (`emvco.ts`, `qrSessionService.ts`, `qrPoller.ts`, `paymentConfirmation.ts`, `QrPaymentDialog.tsx`). Los errores en archivos editados son preexistentes (`any` en líneas no tocadas).
- **TypeScript:** 0 errores en los archivos nuevos o editados (verificado con `tsc --noEmit | Select-String "qrShared|QrPaymentDialog"` → Count: 0).

**Archivos creados (5):**
- `src/lib/services/integrations/qrShared/emvco.ts`
- `src/lib/services/integrations/qrShared/qrSessionService.ts`
- `src/lib/services/integrations/qrShared/qrPoller.ts`
- `src/lib/services/integrations/qrShared/paymentConfirmation.ts`
- `src/components/shared/QrPaymentDialog.tsx`

**Archivos modificados (4):**
- `src/components/integraciones/conexiones/nueva/StepCredentials.tsx`
- `src/app/app/integraciones/conexiones/nueva/page.tsx`
- `src/lib/services/integrationsService.ts`
- `src/components/finanzas/metodos-pago/PaymentMethodForm.tsx`

**Tabla creada en Supabase (1):**
- `payment_qr_sessions` (con RLS, constraints e índices)

### Fase 2 — Redeban + Onboarding paralelo de Mono (5-7 días) ✅ COMPLETADO

**Por qué primero:** Redeban expone API REST pública con Auth-Token, sin onboarding comercial complejo.

**Estado:** completado el 2026-08-14.

#### Onboarding paralelo de Mono (iniciar AHORA) ⏳

> **Importante:** el onboarding de Mono toma días/semanas. Iniciarlo en paralelo con la Fase 2 para que las credenciales sandbox estén listas cuando comience la Fase 3.

**Checklist de onboarding Mono (responsabilidad del cliente/admin):**

- [ ] **Día 1:** Ir a https://breb.app/ o https://mi.cuentamono.com
- [ ] **Día 1:** Crear cuenta con email corporativo
- [ ] **Día 1:** Verificar email y teléfono
- [ ] **Día 1-2:** En `mi.cuentamono.com` → API Keys → Crear API key de sandbox
- [ ] **Día 1-2:** Obtener `client_id` y `client_secret` de sandbox
- [ ] **Día 2-7:** Completar KYC empresarial:
  - [ ] Razón social
  - [ ] NIT
  - [ ] Cámara de comercio (certificado)
  - [ ] RUT
  - [ ] Certificado de existencia y representación legal
  - [ ] Verificación de representantes legales
  - [ ] Vincular cuenta bancaria del comercio (donde llegarán los fondos)
- [ ] **Día 3:** En `mi.cuentamono.com` → Webhooks → registrar URL del ERP (se obtiene al crear la conexión en el ERP)
- [ ] **Día 3:** Guardar secreto de firma HMAC-SHA256 en el ERP
- [ ] **Día 3-5:** Pruebas sandbox (después de Fase 3):
  - [ ] Crear collection desde el ERP
  - [ ] Simular pago con `simulate-payment`
  - [ ] Verificar webhook llega al ERP
  - [ ] Verificar `payment_qr_sessions` se actualiza
  - [ ] Verificar `payments` se actualiza
  - [ ] Verificar `bank_transactions` se inserta
- [ ] **Semanas 2-4:** Producción:
  - [ ] Completar KYC comercial con Mono
  - [ ] Firmar contrato de servicios
  - [ ] Obtener credenciales productivas
  - [ ] En ERP: editar conexión → ambiente "production" → actualizar credenciales
  - [ ] Pruebas con montos reales pequeños
  - [ ] Go-live

**URLs de referencia:**
- Landing Bre-B: https://breb.app/
- Dashboard: https://mi.cuentamono.com
- Docs: https://docs.mono.la/docs/guides/breb-participant
- API Reference: https://docs.mono.la/docs/api-reference/breb-participant
- Autenticación: https://docs.mono.la/docs/guides/breb-participant/authentication
- Sandbox API: https://sandbox.api.cuentamono.com
- Producción API: https://api.cuentamono.com

#### Implementación Redeban ✅

- [x] **`src/lib/services/integrations/redeban/redebanConfig.ts`** (27 líneas) — URLs base (sandbox: `noccapi-stg.redeban.com`, producción: `noccapi.redeban.com`), `getRedebanBaseUrl()`, constantes `REDEBAN_PROVIDER_CODE` y `REDEBAN_QR_CONNECTOR_CODE`.
- [x] **`src/lib/services/integrations/redeban/redebanTypes.ts`** (75 líneas) — interfaces: `RedebanCredentials`, `RedebanQrRequest`, `RedebanQrResponse`, `RedebanTransactionStatus`, `RedebanTransactionResponse`, `RedebanWebhookPayload`, `RedebanHealthCheckResult`.
- [x] **`src/lib/services/integrations/redeban/redebanService.ts`** (396 líneas) — clase `RedebanService` con 7 métodos:
  - `generateAuthToken(serverAppCode, serverAppKey)` — Base64(APP_CODE;TIMESTAMP;SHA256(APP_KEY+TIMESTAMP)) con `crypto` de Node
  - `getCredentials(connectionId)` — lee `integration_credentials` desde Supabase
  - `healthCheck(connectionId)` — GET a `/v2/qr/status/` con Auth-Token
  - `createQr(connectionId, params)` — POST a `/v2/qr/generate/`
  - `getTransactionStatus(connectionId, transactionId)` — GET a `/order/{transactionId}`
  - `verifyWebhookSignature(payload, signature, serverAppKey)` — HMAC-SHA256
  - `processWebhook(connectionId, payload)` — busca `payment_qr_sessions`, llama `confirmQrPayment` si es approved
  - Exporta singleton `redebanService`
- [x] **`src/lib/services/integrations/redeban/index.ts`** (3 líneas) — re-exports del servicio, config y types.
- [x] **`src/app/api/integrations/redeban/health-check/route.ts`** — POST con auth, verifica credenciales.
- [x] **`src/app/api/integrations/redeban/create-qr/route.ts`** — POST con auth, genera QR + crea `payment_qr_sessions`.
- [x] **`src/app/api/integrations/redeban/webhook/route.ts`** — POST sin auth (callback del proveedor), responde 200 siempre, llama `processWebhook`.
- [x] **`src/app/api/integrations/redeban/status/route.ts`** — GET con auth, consulta estado de `payment_qr_sessions` por referencia.

**Pendiente (Fase 6 — UI):**
- [ ] Integrar en `CheckoutDialog` del POS y PMS: al seleccionar `redeban_qr`, llamar a `/api/integrations/redeban/create-qr`, mostrar `QrPaymentDialog`, hacer polling a `/status`.
- [ ] Integrar en Parking y Transporte (mismo flujo).

#### Verificación ✅

- **ESLint:** 0 errores en los 8 archivos de Redeban.
- **TypeScript:** 0 errores en los archivos de Redeban (verificado con `tsc --noEmit | Select-String "redeban"` → Count: 0).

**Archivos creados (8):**
- `src/lib/services/integrations/redeban/redebanConfig.ts`
- `src/lib/services/integrations/redeban/redebanTypes.ts`
- `src/lib/services/integrations/redeban/redebanService.ts`
- `src/lib/services/integrations/redeban/index.ts`
- `src/app/api/integrations/redeban/health-check/route.ts`
- `src/app/api/integrations/redeban/create-qr/route.ts`
- `src/app/api/integrations/redeban/webhook/route.ts`
- `src/app/api/integrations/redeban/status/route.ts`

### Fase 3 — Bre-B vía Mono (5-7 días) ✅ COMPLETADO

**Estado:** completado el 2026-08-14.

#### Implementación Mono ✅

- [x] **`src/lib/services/integrations/breb/monoConfig.ts`** (36 líneas) — URLs base (sandbox: `sandbox.api.cuentamono.com`, producción: `api.cuentamono.com`), `getMonoBaseUrl()`, constantes `MONO_PROVIDER_CODE='breb'`, `MONO_CONNECTOR_CODE='breb_mono'`, `MONO_COLLECTION_EVENTS` (7 eventos).
- [x] **`src/lib/services/integrations/breb/monoTypes.ts`** (83 líneas) — interfaces: `MonoCredentials`, `MonoTokenResponse`, `MonoCollectionRequest` (con `key_type` union: PHONE/EMAIL/ID/ALPHA/BCODE), `MonoCollectionResponse`, `MonoSimulatePaymentRequest`, `MonoWebhookPayload`, `MonoHealthCheckResult`.
- [x] **`src/lib/services/integrations/breb/monoService.ts`** (430 líneas) — clase `MonoService` con 7 métodos:
  - `getAccessToken(clientId, clientSecret, environment)` — POST `/oauth/token` con `grant_type=client_credentials`, token fresco cada vez
  - `getCredentials(connectionId)` — lee `integration_credentials` desde Supabase
  - `healthCheck(connectionId)` — intenta `getAccessToken`, retorna `{ valid, message }`
  - `createCollection(connectionId, params)` — POST `/api/v1/collections` con Bearer token
  - `simulatePayment(connectionId, params)` — POST `/api/v1/sandbox/collections/simulate-payment` (solo sandbox)
  - `verifyWebhookSignature(payload, signature, webhookSecret)` — HMAC-SHA256 con `crypto` de Node
  - `processWebhook(connectionId, payload)` — extrae reference de `metadata.reference`, busca `payment_qr_session`, llama `confirmQrPayment` para `collection.paid`/`collection.minimum_paid`, marca `expired`/`cancelled` según evento
  - Exporta singleton `monoService`
- [x] **`src/lib/services/integrations/breb/index.ts`** (3 líneas) — re-exports del servicio, config y types.
- [x] **`src/app/api/integrations/breb/health-check/route.ts`** (41 líneas) — POST con auth, verifica credenciales de Mono.
- [x] **`src/app/api/integrations/breb/create-qr/route.ts`** (121 líneas) — POST con auth, crea collection + `payment_qr_sessions`, retorna QR.
- [x] **`src/app/api/integrations/breb/webhook/route.ts`** (50 líneas) — POST sin auth (callback de Mono), lee `X-Signature`, responde 200 siempre, llama `processWebhook`.
- [x] **`src/app/api/integrations/breb/status/route.ts`** (66 líneas) — GET con auth, consulta estado de `payment_qr_sessions` por referencia.

**Pendiente (Fase 6 — UI):**
- [ ] Integrar en `CheckoutDialog` del POS y PMS: al seleccionar `breb_qr`, llamar a `/api/integrations/breb/create-qr`, mostrar `QrPaymentDialog`, hacer polling a `/status`.
- [ ] Integrar en Parking y Transporte (mismo flujo).
- [ ] Pruebas en sandbox Mono con `simulate-payment`.

#### Verificación ✅

- **ESLint:** 0 errores en los 8 archivos de Mono.
- **TypeScript:** 0 errores en los archivos de Mono (verificado con `tsc --noEmit | Select-String "breb|mono"` → Count: 0).

**Archivos creados (8):**
- `src/lib/services/integrations/breb/monoConfig.ts`
- `src/lib/services/integrations/breb/monoTypes.ts`
- `src/lib/services/integrations/breb/monoService.ts`
- `src/lib/services/integrations/breb/index.ts`
- `src/app/api/integrations/breb/health-check/route.ts`
- `src/app/api/integrations/breb/create-qr/route.ts`
- `src/app/api/integrations/breb/webhook/route.ts`
- `src/app/api/integrations/breb/status/route.ts`

### Fase 4 — Bancolombia (ambas rutas: Wompi + API directa) (5-7 días) ✅ COMPLETADO

Se implementan **ambas rutas** en paralelo. El admin elige cuál usar al configurar la conexión.

**Estado:** completado el 2026-08-14.

#### Ruta A: Wompi BANCOLOMBIA_QR ✅ COMPLETADO

Wompi ya soporta `BANCOLOMBIA_QR`. Solo falta exponerlo en el checkout.

- [x] Verificado que `wompiService.createTransaction` con `payment_method.type: 'BANCOLOMBIA_QR'` funciona (líneas 201-239 de `wompiService.ts`).
- [x] Agregado tipo `WompiBancolombiaQrPaymentMethod` en `wompiTypes.ts` (líneas 124-128) con `type: 'BANCOLOMBIA_QR'`, `payment_description`, `sandbox_status?`.
- [x] Agregado al union type `WompiPaymentMethod` (línea 130).
- [x] Creada API route `src/app/api/integrations/bancolombia/wompi/create-qr/route.ts` (151 líneas) — crea transacción BANCOLOMBIA_QR en Wompi, extrae `qr_image` y `qr_id` de `payment_method.extra`, crea `payment_qr_sessions` con `providerCode: 'wompi'`, `connectorCode: 'bancolombia_qr_wompi'`.
- [x] Actualizado webhook de Wompi (`src/app/api/integrations/wompi/webhook/route.ts`) para que actualice `payment_qr_sessions` cuando el pago sea `APPROVED` y `payment_method_type === 'BANCOLOMBIA_QR'` (líneas 199-213).
- [x] No requiere: nuevo provider, nuevo conector, nuevas credenciales, ni onboarding con Bancolombia.

#### Ruta B: API directa Bancolombia ✅ COMPLETADO

El portal público `https://developer-portal-public-sbx.apps.ambientesbc.com` expone la documentación técnica completa de los productos:
- **Payments Button v4.0.1** — Botón Bancolombia (transferencias web)
  - API Base URL sandbox: `https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order`
  - Endpoints: `POST /transfer/action/registry`, `GET /transfer/{transferCode}/action/validate`, `POST` refund
  - Scopes: `Transfer-Intention:write:app`, `Transfer-Intention:read:app`, `Refund:write:app`
- **QR Code v3.0.1** — Administración de códigos QR
- **BancolombiaPay Wallet Payments v1.0.2** — Billetera digital con QR Transaction
- **Transactional Information v1.0.1** — Conciliación transaccional

- [x] **`src/lib/services/integrations/bancolombia/bancolombiaConfig.ts`** (28 líneas) — URLs base (sandbox: `gw-sandbox-qa.apps.ambientesbc.com`, producción: `gw.apps.ambientesbc.com`), `getBancolombiaBaseUrl()`, constantes `BANCOLOMBIA_PROVIDER_CODE`, `BANCOLOMBIA_QR_CONNECTOR_CODE`, `BANCOLOMBIA_SCOPES`, `BANCOLOMBIA_TRANSFER_STATUSES`.
- [x] **`src/lib/services/integrations/bancolombia/bancolombiaTypes.ts`** (83 líneas) — interfaces: `BancolombiaCredentials`, `BancolombiaTokenResponse`, `BancolombiaTransferRegistryRequest`, `BancolombiaTransferRegistryResponse`, `BancolombiaTransferValidateResponse`, `BancolombiaRefundRequest`, `BancolombiaRefundResponse`, `BancolombiaWebhookPayload`, `BancolombiaHealthCheckResult`.
- [x] **`src/lib/services/integrations/bancolombia/bancolombiaService.ts`** (483 líneas) — clase `BancolombiaService` con 8 métodos:
  - `getAccessToken(clientId, clientSecret, environment)` — OAuth 2.0 Client Credentials via form-urlencoded, token fresco cada vez
  - `getCredentials(connectionId)` — lee `integration_credentials` desde Supabase
  - `healthCheck(connectionId)` — intenta `getAccessToken`, retorna `{ valid, message }`
  - `registerTransferIntention(connectionId, params)` — POST `/transfer/action/registry` con Bearer token
  - `validateTransfer(connectionId, transferCode)` — GET `/transfer/{transferCode}/action/validate`
  - `refundTransfer(connectionId, params)` — POST `/refund` con Bearer token
  - `verifyJwtNotification(token, clientSecret)` — verifica firma JWT (HS256 sandbox con `crypto.createHmac` + `timingSafeEqual`)
  - `processWebhook(connectionId, payload)` — busca `payment_qr_sessions` por `transferReference`, llama `confirmQrPayment` si `approved`, marca `rejected` si corresponde
  - Exporta singleton `bancolombiaService`
- [x] **`src/lib/services/integrations/bancolombia/index.ts`** (3 líneas) — re-exports.
- [x] **`src/app/api/integrations/bancolombia/health-check/route.ts`** (41 líneas) — POST con auth, verifica credenciales.
- [x] **`src/app/api/integrations/bancolombia/create-qr/route.ts`** (128 líneas) — POST con auth, registra transfer intention + crea `payment_qr_sessions`, retorna QR.
- [x] **`src/app/api/integrations/bancolombia/webhook/route.ts`** (67 líneas) — POST sin auth (callback), detecta JWT o JSON, verifica firma, responde 200 siempre.
- [x] **`src/app/api/integrations/bancolombia/status/route.ts`** (94 líneas) — GET con auth, consulta estado de `payment_qr_sessions` + `validateTransfer` si está pending.

**Pendiente (onboarding comercial):**
- [ ] Onboarding sandbox: solicitar acceso en `https://developer-portal-public-sbx.apps.ambientesbc.com` → "Solicitar Ingreso".
- [ ] Descargar colecciones Postman y escenarios de prueba desde el portal.

#### Selector de ruta en el checkout

El `CheckoutDialog` mostrará las opciones disponibles según las conexiones activas:
- Si solo hay conexión Wompi → muestra "Bancolombia QR (vía Wompi)"
- Si solo hay conexión Bancolombia directa → muestra "Bancolombia QR"
- Si hay ambas → muestra "Bancolombia QR (Wompi)" y "Bancolombia QR (Directo)" — el admin/canjero elige

#### Verificación ✅

- **ESLint:** 0 errores en los 9 archivos de Bancolombia (4 servicio + 4 API routes directas + 1 API route Wompi) + cambios en `wompiTypes.ts` y `wompi/webhook/route.ts`.
- **TypeScript:** 0 errores en los archivos de Bancolombia (verificado con `tsc --noEmit | Select-String "bancolombia"` → Count: 0).

**Archivos creados (9):**
- `src/lib/services/integrations/bancolombia/bancolombiaConfig.ts`
- `src/lib/services/integrations/bancolombia/bancolombiaTypes.ts`
- `src/lib/services/integrations/bancolombia/bancolombiaService.ts`
- `src/lib/services/integrations/bancolombia/index.ts`
- `src/app/api/integrations/bancolombia/health-check/route.ts`
- `src/app/api/integrations/bancolombia/create-qr/route.ts`
- `src/app/api/integrations/bancolombia/webhook/route.ts`
- `src/app/api/integrations/bancolombia/status/route.ts`
- `src/app/api/integrations/bancolombia/wompi/create-qr/route.ts`

**Archivos modificados (2):**
- `src/lib/services/integrations/wompi/wompiTypes.ts` — agregado `WompiBancolombiaQrPaymentMethod` + union type
- `src/app/api/integrations/wompi/webhook/route.ts` — actualiza `payment_qr_sessions` cuando BANCOLOMBIA_QR APPROVED

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

### 13.2 Bre-B vía Mono (proveedor seleccionado)

1. Registro en https://breb.app/ o https://mi.cuentamono.com.
2. Agendar cita de onboarding (breb.app → "Agendar una cita").
3. Generar API key de sandbox desde el dashboard.
4. Obtener `client_id` / `client_secret` (OAuth 2.0).
5. Configurar URL de webhook en el dashboard.
6. Probar en sandbox (`https://sandbox.api.cuentamono.com`):
   - Crear collection con QR.
   - Simular pago con `POST /api/v1/sandbox/collections/simulate-payment`.
   - Verificar recepción de webhooks (HMAC-SHA256).
   - Probar simulación de errores (`tx_risk_control`, `tx_breb_timeout`, etc.).
7. Credenciales de producción (`https://api.cuentamono.com`) tras validación.
8. Elegir modelo: agregador (cuenta Mono) o directo (cuenta del comercio).

### 13.3 Bancolombia (ruta directa — opcional)

1. Solicitar acceso al portal público sandbox: https://developer-portal-public-sbx.apps.ambientesbc.com → "Solicitar Ingreso".
2. Recibir credenciales por correo electrónico.
3. Iniciar sesión en el portal → crear aplicación → genera `client_id` y `client_secret` (solo visible una vez).
4. Suscribir la app a los productos deseados:
   - **Payments Button v4.0.1** (Botón Bancolombia)
   - **QR Code v3.0.1** (QR Management)
   - **BancolombiaPay Wallet Payments v1.0.2** (QR Transaction)
   - **Transactional Information v1.0.1** (conciliación)
5. Descargar colecciones Postman y escenarios de prueba desde el portal.
6. Probar en sandbox con API Base URL: `https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order`.
7. Proceso comercial con ejecutivo para producción:
   - Cuenta activa con Bancolombia.
   - Firma del Reglamento de APIs.
   - Solicitud de credenciales productivas (TPS, timeout, horarios).
8. Producción.

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
# Portal sandbox: https://developer-portal-public-sbx.apps.ambientesbc.com
# API Base URL sandbox (Payments Button):
#   https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order
# Token URL: https://$(urlCatalog)/security/oauth-provider/oauth2/token
# Scopes Payments Button:
#   Transfer-Intention:write:app, Transfer-Intention:read:app, Refund:write:app

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

- **Portal de desarrolladores público (sandbox):** https://developer-portal-public-sbx.apps.ambientesbc.com
- **Portal documentación:** https://developer-portal-public-sbx.apps.ambientesbc.com/documentacion
- **API Base URL sandbox (Payments Button):** https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v4/operations/cross-product/payments/payment-order
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
- **Mono (proveedor seleccionado):**
  - Landing Bre-B: https://breb.app/
  - Docs Bre-B Participant: https://docs.mono.la/docs/guides/breb-participant
  - API Reference: https://docs.mono.la/docs/api-reference/breb-participant
  - Sandbox: https://sandbox.api.cuentamono.com
  - Dashboard: https://mi.cuentamono.com
  - Sandbox collections: https://docs.mono.la/docs/guides/breb-participant/sandbox/collections
  - QR collection flow: https://docs.mono.la/docs/guides/breb-participant/flows/qr-collection
  - Outgoing transfer flow: https://docs.mono.la/docs/guides/breb-participant/flows/outgoing-transfer
- **Passport PaaS (alternativo):**
  - Docs: https://docs.passportfintech.com/ES
  - Crear QR: https://docs.passportfintech.com/ES/create-qr-codes
  - Iniciar pago: https://docs.passportfintech.com/ES/initiate-a-payment
  - Postman: https://www.postman.com/passport-baas/bre-b-api-nodo-visionamos-passport-for-developers/overview
- **Cobre (alternativo):**
  - Docs Bre-B: https://docs.cobre.com/es/bre-b-1952108m0
  - Checkout: https://docs.cobre.com/es/checkout-1952114m0
  - Request to Pay: https://docs.cobre.com/request-to-pay-r2p-colombia-1867936m0
  - Cobre Keys: https://docs.cobre.com/cobre-keys-with-bre-b-1886558m0
- EBANX Bre-B: https://docs.ebanx.com/docs/pay-in/processing/payment-methods/country-specific/colombia/breb
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

## Apéndice D — Mono.la como BaaS completo (Banking-as-a-Service)

> **Fecha de análisis:** 2026-08-14
> **Fuente:** https://docs.mono.la/docs/guides
> **Estado:** Análisis técnico y planificación. Mono ya se menciona en este documento como proveedor BaaS para Bre-B (sección 2, línea 90). Este apéndice extiende el análisis a **toda la plataforma Mono**, no solo Bre-B.

### D.1 Qué es Mono.la

**Mono** es una fintech colombiana (Bogotá) que ofrece **Banking-as-a-Service (BaaS)**: infraestructura bancaria programable vía API REST para Colombia. Está respaldada por Y Combinator, Visa y Tiger Global, y opera bajo alianza con la Superintendencia Financiera de Colombia (SFC).

> ⚠️ **Importante:** NO confundir con `mono.co` (Mono Africa, otra empresa distinta que hace open banking en Nigeria/Ghana/Kenia/Sudáfrica). La que aplica al ERP es `mono.la`, enfocada 100% en Colombia.

- **Documentación:** https://docs.mono.la/docs/guides
- **API Reference:** https://docs.mono.la/docs/api-reference
- **Sitio web:** https://www.mono.la/
- **Dashboard:** https://mi.cuentamono.com
- **Soporte técnico:** tech-support@mono.la

### D.2 Productos y servicios de Mono

| Producto | Qué hace | Rieles / métodos |
|----------|----------|------------------|
| **Banking – Pay-ins** | Recaudar dinero desde cualquier cuenta bancaria CO | PSE (Pagos Seguros en Línea) |
| **Banking – Payouts** | Enviar dinero a cuentas bancarias CO | ACH, Transfiya, **Mono Turbo** (instantáneo) |
| **Banking – Collection links** | Enlaces de pago PSE reutilizables | PSE |
| **Banking – Cards** | Tarjetas Visa virtuales/físicas programables | Visa |
| **Core – Ledger** | Libro mayor de doble entrada auditable | Interno |
| **Core – Spending Controls** | Reglas y límites de gasto por tarjeta | Interno |
| **Bre-B Participant** | Enviar/recibir pagos instantáneos interbancarios | **Bre-B** (QR + transferencias) |

### D.3 Guías principales de la documentación

#### Guías generales (API Standards)
- **Who We Are** — Información sobre la empresa y su misión
- **Why Use Mono** — Casos de uso, criterios de ajuste y beneficios concretos
- **Technical Support** — Canales de soporte, tiempos de respuesta y escalación
- **API Standards** — Convenciones cross-product:
  - Authentication, Idempotency Keys, Errors and Retries, Data Formats, Pagination and Sorting, Webhooks

#### Servicio: Banking
- Concepts (cuentas, transferencias, collection links, tarjetas)
- API, Webhooks, Sandbox, Production, Dashboard
- Flows: PSE collection, Sending transfers
- Architecture: Bank transfer states
- Best Practices

#### Servicio: Core
- Concepts (ledger, tarjetas, controles de gastos, payouts)
- Flows: Integration example, Ledger accounting, Issuing cards, Payout disbursement
- Best Practices: Patrones de conciliación

#### Servicio: Bre-B Participant
- Overview, Authentication (OAuth2), Concepts (payment keys, targets, tenant accounts, collections)
- Flows: QR collection, Outgoing transfer
- Integration Example, Sandbox, State Machine, Rejection Reasons
- Webhooks (verificación HMAC-SHA256), Production Recommendations, Definitions

### D.4 Beneficios concretos para go-admin-erp

El ERP ya tiene un módulo finanzas completo (bancos, conciliación, transferencias, cuentas por pagar/cobrar, contabilidad) y varias pasarelas (Wompi, MercadoPago, PayU, Stripe, PayPal). Mono **no reemplaza** eso, lo **complementa** con capacidades que hoy no existen:

#### D.4.1 Payouts reales (desembolsos a cuentas bancarias)
Hoy `transferenciasService.ts` y la tabla `bank_transfers` manejan **transferencias entre cuentas propias** registradas manualmente. Con Mono:
- Pagar proveedores (`cuentas-por-pagar`) directamente a su banco desde la app.
- Pagar nómina (`hrm`) por lote vía ACH/Transfiya/Mono Turbo.
- Desembolsar préstamos o anticipos a empleados.
- **Beneficio:** dejar de registrar "transferencias" como asiento manual y pasar a ejecutarlas de verdad, con webhook de confirmación.

#### D.4.2 Bre-B nativo (pagos instantáneos QR)
Este documento ya identifica a Mono como proveedor BaaS recomendado para Bre-B (sección 2). Con Mono Participant API:
- Recaudo por **QR Bre-B** (EMVCo) sin depender de Redeban/Bancolombia directo.
- Transferencias salientes instantáneas 24/7.
- Verificación HMAC-SHA256 de webhooks.
- **Beneficio:** un único proveedor para QR Bre-B en lugar de integrar Bancolombia + Redeban por separado.

#### D.4.3 Conciliación bancaria automática real
Hoy `ConciliacionService.ts` hace match **manual** entre `bank_transactions` y `payments`. Con Mono:
- Los webhooks `bank_transfer_approved`, `account_credited`, `collection_intent_credited` alimentan `bank_transactions` automáticamente.
- El `matched_payment_id` se puede resolver automáticamente porque Mono devuelve `idempotency_key` y `reference` que el ERP genera.
- **Beneficio:** conciliación automática en vez de match manual.

#### D.4.4 Ledger de doble entrada (opcional, contabilidad avanzada)
Mono Core expone un ledger con `LedgerAccount`, `LedgerTransaction` (par débito-crédito balanceado) y `Balance`. Permite:
- Sincronizar saldos de clientes/proveedores con el ledger de Mono.
- Tener auditoría inmutable de movimientos.
- **Beneficio:** fuente de verdad financiera externa auditable, útil para reportes regulatorios.

#### D.4.5 Tarjetas Visa programables (caso de uso futuro)
Para gestión de gastos corporativos: emitir tarjetas por empleado con `SpendingControls` (límites por categoría, MCC, monto). Encaja con los módulos `comisiones` y `centro-costos`. Es **opcional** y más avanzado.

#### D.4.6 Unificación de rieles
Hoy el ERP tiene Wompi (Bancolombia QR), PayU (PSE, Nequi), MercadoPago. Mono unifica **PSE + ACH + Transfiya + Bre-B + tarjetas** bajo una sola API y un solo dashboard. Menos conectores que mantener.

### D.5 Autenticación

| Servicio | Método | Notas |
|----------|--------|-------|
| Banking | API Key Bearer | `Authorization: Bearer <key>`, rotar cada 90 días |
| Core | API Key Bearer | Igual que Banking |
| Bre-B Participant | OAuth2 Client Credentials | `/api/v1/oauth/token`, scopes `tenant_accounts`, `outgoing_transfers`, `collections`, etc. |
| Webhooks | HMAC-SHA256 | Verificar firma antes de procesar |

#### Scopes OAuth2 (Bre-B Participant)
- `tenant_accounts` / `tenant_accounts:readonly`
- `outgoing_transfers` / `outgoing_transfers:readonly`
- `target_resolutions` / `target_resolutions:readonly`
- `collections` / `collections:readonly`

Dos esquemas de seguridad: `oauth` (acceso completo) y `oauth_readonly` (solo lectura).

### D.6 Endpoints y entidades clave

#### Banking API
**Endpoints:** cuentas bancarias, transferencias (`POST /transfers`), collection links, collection intents, tarjetas.

**Entidades:** `BankAccount`, `BankTransfer`, `CollectionLink`, `CollectionIntent`, `BankingCard`.

**Webhooks Banking:**
- `bank_transfer_approved`, `bank_transfer_rejected`, `bank_transfer_fallback_routing`
- `account_credited`
- `batch_authorization_requested`, `batch_sent`, `batch_duplicated`
- `collection_intent_credited`, `collection_intent_confirmed`

#### Core API
**Endpoints Ledger:**
- `GET /v1/ledger/accounts` — Listar cuentas
- `POST /v1/ledger/accounts` — Crear cuenta
- `GET /v1/ledger/accounts/{account_id}/balances` — Saldos
- `POST /v1/ledger/accounts/{account_id}/balance` — Actualizar saldo
- `GET /v1/ledger/accounts/{account_id}/transactions` — Transacciones
- `POST /v1/ledger/transfers` — Transferencia entre cuentas ledger

**Entidades:** `AccountHolder`, `LedgerAccount`, `LedgerTransaction`, `Balance`, `Card`, `SpendingControl`, `Payout`.

#### Bre-B Participant API
**Endpoints:** `/api/v1/oauth/token`, outgoing transfers, target resolution, collections.

**Entidades:** `PaymentKey`, `Target`, `TenantAccount`, `Collection`, `OutgoingTransfer`, `OutgoingTransferBatch`.

### D.7 Casos de uso típicos documentados por Mono

| Caso de uso | Qué se construye | Productos Mono |
|-------------|------------------|----------------|
| Billetera de consumo | Cuenta, recargas, gastos con tarjeta, P2P | Banking (Tarjetas + PSE) + Core (Ledger) |
| Pagos a vendedores de marketplace | Saldos por vendedor, pagos programados | Banking (Transferencias) + Core (Ledger) |
| Checkout de e-commerce | Recaudo PSE, conciliación de settlement | Banking (Collection links) |
| Tarjetas corporativas / gestión de gastos | Tarjetas por empleado con reglas | Banking (Tarjetas) + Core (Spending Controls + Ledger) |
| Bre-B para banco o EDE | On-ramp programable a Bre-B | Bre-B Participant |
| Automatización de tesorería | Transferencias programáticas across cuentas | Banking (Transferencias) + Core (Ledger) |
| Desembolso de préstamos | Envío de fondos a cuentas bancarias | Banking (Transferencias) |
| Nómina | Pagos masivos a cuentas bancarias | Banking (Transferencias por lote) |

### D.8 Limitaciones, rate limits y sandbox

#### Rate limits
- Aún no se aplican uniformemente, pero `429 (TooManyRequests)` ya aparece.
- Header `Retry-After` indica cuánto esperar.
- Recomendaciones: exponential backoff con jitter, separar tráfico síncrono/asíncrono con diferentes API keys, espaciar jobs batch, cachear datos de referencia.

#### Sandbox
- Disponible para los tres servicios (Banking, Core, Bre-B).
- Bre-B Sandbox: simula pagos entrantes y transferencias salientes, responde `202 Accepted`, webhooks entregados en 2-5 s.

#### Limitaciones
- **Sin SDKs oficiales** → integración REST directa (igual que las otras pasarelas del ERP).
- **Sin facturación electrónica nativa** → seguir usando Factus/DIAN.
- **Solo Colombia** (coincide con el mercado del ERP).
- **Precios no públicos** → contactar comercial. Modelo usage-based/transactional.

### D.9 Cómo encaja con la infraestructura existente del ERP

El repo ya tiene la infraestructura lista para Mono. Faltaría implementar el servicio siguiendo el patrón de `mercadopago/`, `payu/`, `wompi/`:

```
src/lib/services/integrations/mono/        ← NUEVO
  monoConfig.ts        # URLs, scopes, env: MONO_API_KEY, MONO_CLIENT_ID, MONO_CLIENT_SECRET
  monoAuthService.ts   # OAuth2 client credentials (Bre-B) + API keys (Banking/Core)
  monoService.ts       # pay-ins, payouts, collection links, transfers Bre-B
  monoTypes.ts         # BankTransfer, CollectionIntent, Payout, LedgerAccount...
  monoWebhookService.ts# Verificación HMAC-SHA256 + reenvío a integration_events
  index.ts

src/app/api/integrations/mono/             ← NUEVO
  create-payout/route.ts
  create-collection/route.ts
  webhook/route.ts
  health-check/route.ts

src/components/integraciones/conexiones/nueva/StepCredentials.tsx
  ← ya tiene campos para "mono" (líneas 445-462)
```

#### Tablas existentes a reutilizar (no crear nuevas)
- `integration_providers` → registrar `mono`
- `integration_connections` + `integration_credentials` → credenciales por organización
- `integration_events` + `integration_webhooks` → logs y webhooks
- `bank_transactions` → movimientos entrantes/salientes de Mono
- `bank_reconciliation_items` → match automático
- `payments` → pagos recaudados vía PSE/QR Bre-B
- `bank_transfers` → desembolsos a proveedores/nómina

### D.10 Posicionamiento frente a proveedores actuales del ERP

| Proveedor | Rol en el ERP | ¿Lo reemplaza Mono? |
|-----------|---------------|---------------------|
| **Verifik / CoreSoft** | Verificación DIAN/RUES, KYB | No — complementario |
| **Factus** | Facturación electrónica DIAN | No — complementario |
| **Wompi** | PSE, Nequi, Bancolombia QR, tarjetas | Parcialmente (Mono cubre PSE + QR Bre-B) |
| **PayU** | PSE, Nequi, efectivo, tarjetas | Parcialmente (mismo solapamiento) |
| **MercadoPago** | Tarjetas, PSE, efectivo | Parcialmente |
| **Stripe / PayPal** | Internacionales | No — Mono es solo CO |
| **Redeban / Bancolombia QR directo** | QR EMVCo | Sí — Mono Bre-B Participant los unifica |

**Conclusión:** Mono no reemplaza las pasarelas internacionales ni la facturación electrónica. Su valor único en el stack del ERP es:
1. **Payouts reales** a bancos CO (proveedores, nómina).
2. **Bre-B instantáneo unificado** (QR + transferencias salientes).
3. **Conciliación automática** vía webhooks.
4. **Tarjetas programables** (opcional, gestión de gastos).

### D.11 Variables de entorno adicionales

```env
# Mono BaaS — Banking + Core (API Keys)
MONO_API_KEY=mk_test_xxxxxxxxxxxxxxxxxxxxxxxx
MONO_CORE_API_KEY=mk_core_test_xxxxxxxxxxxxxxxxxxxxxxxx
MONO_ENVIRONMENT=sandbox  # sandbox | production

# Mono BaaS — Bre-B Participant (OAuth2)
MONO_BREB_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MONO_BREB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MONO_BREB_TENANT_ACCOUNT_ID=ta_xxxxxxxxxxxxxxxxxxxxxxxx

# Mono BaaS — Webhooks
MONO_BREB_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

### D.12 Plan de implementación recomendado (fases)

Alineado con las fases de este documento y con el ROI más rápido primero:

| Fase | Objetivo | Productos Mono | Módulos ERP |
|------|----------|----------------|-------------|
| **1** | Payouts a proveedores | Banking (Payouts ACH/Transfiya/Turbo) | `finanzas/cuentas-por-pagar`, `finanzas/transferencias` |
| **2** | Bre-B QR recaudo | Bre-B Participant (QR collection) | `pos`, `pms`, `parking`, `transporte` |
| **3** | Conciliación automática | Banking + Bre-B webhooks | `finanzas/conciliacion-bancaria`, `finanzas/bancos` |
| **4 (opcional)** | Tarjetas corporativas | Core (Cards + Spending Controls) | `finanzas/comisiones`, `finanzas/centro-costos`, `hrm` |

> La **Fase 2** de este plan coincide con la **Fase 3** del checklist del Apéndice C (Mono: `create-qr` + `simulate-payment` → `payments` insertado).

### D.13 Stack recomendado para solución financiera completa en Colombia

Combinando proveedores ya integrados + Mono:

- **Mono.la** → infraestructura de pagos y movimiento de dinero (payouts, Bre-B, tarjetas).
- **Verifik** o **CoreSoft** → verificación de identidad y datos KYB/KYC (ya implementado en `dianLookupService.ts`).
- **Factus** → facturación electrónica DIAN (ya implementado en `factusService.ts`).
- **Wompi / PayU / MercadoPago** → pasarelas internacionales y métodos alternativos (Nequi, Daviplata, efectivo).
- **Stripe / PayPal** → pagos internacionales.

---

**Fin del documento.**

> Este documento es de planificación. Antes de aplicar el DDL de `payment_qr_sessions` o migrar datos existentes de `payment_methods`, confirmar con el equipo. La implementación se hace fase a fase, respetando las reglas de scope del proyecto (`code-style-guide.md`).
