# Prompt para Devin — Épica GO-1: Integración de transportadoras externas (Go Admin ERP)

> Repos: `go-admin-erp` (ERP, Next.js App Router) y `goadmin-websites` (sitios públicos).
> Proyecto Supabase: **`jgmgphmzusbluqhuqihj`** ("Go Admin ERP", Postgres 15).
> Board: https://imaginegallego.atlassian.net/jira/software/projects/GO/board
> Sprint: GO Sprint 1 · Issues GO-1 … GO-24 · 39 story points.

---

## 0. Cómo trabajar en este repo (reglas obligatorias)

1. **Base de datos: SIEMPRE vía MCP de Supabase** (`apply_migration`, `execute_sql`, `list_tables`) sobre el proyecto `jgmgphmzusbluqhuqihj`. **No crees archivos `.sql` en el repo** (`supabase/migrations/`, `db/`, scripts sueltos). Es la regla de `.devin/rules/git-and-db.md`.
   - Nota: existe GO-25 abierto ("el repo no refleja el esquema: migraciones aplicadas por MCP sin archivo local"). No intentes resolverlo dentro de esta épica; no generes migraciones locales "para compensar".
2. **Git**: `git commit` local sólo si se te pide. **`git push` y crear PRs requieren autorización explícita** en la conversación actual.
3. **Antes de escribir código, consulta el esquema real con el MCP.** Este documento ya contiene la auditoría, pero verifica cualquier cosa que vayas a asumir.
4. **Scope de archivos**: módulo `transporte` → `/app/transporte`; POS → `/app/pos`. Si necesitas tocar algo fuera del scope (p. ej. `middleware.ts`, `vercel.json`), hazlo pero decláralo explícitamente en el PR.
5. **Stack y estilo**: Next.js App Router + TypeScript estricto + Tailwind + shadcn/ui (`@/components/ui`) + Supabase JS. ESLint/Prettier. Temas claro/oscuro obligatorios, color primario azul.
6. **Antes de cada PR**: `npm run lint`, `next build`, `npm test`.
7. Commits: `feat(GO-<id>): <descripción>`. PR title: `GO-<id> – <título>`. Revisores: @santycano, @Palomo-dev.

---

## 1. Resumen de la auditoría — el plan original tiene 13 errores/omisiones que hay que corregir

Auditamos BD (esquema, RLS, constraints, índices, triggers), backend (servicios, API routes, crons) y UI. **El plan original GO-1…GO-24 es direccionalmente correcto pero contiene supuestos falsos que romperían la implementación.** Estas son las correcciones, en orden de criticidad. Están desarrolladas en las secciones siguientes.

| # | Hallazgo | Impacto |
|---|---|---|
| **C1** | 4 políticas RLS `FOR SELECT TO public USING (true)` en `shipments`, `transport_carriers`, `delivery_attempts`, `proof_of_delivery` | **Bloqueante de seguridad.** Fuga multi-tenant + fuga de credenciales API |
| **C2** | `ApiCredentialsDialog` guarda `api_key` en `transport_carriers.metadata` (jsonb en claro), y esa tabla es legible por `anon` | **Bloqueante de seguridad** |
| **C3** | `carrier_type` sólo acepta `own_fleet` / `third_party`. El plan dice `IN ('external','partner')` | GO-3/GO-13 devolverían 0 filas |
| **C4** | Existen **dos** rutas duplicadas que crean el shipment de pedidos web | GO-4/GO-16 arreglaría sólo una |
| **C5** | `shipping_labels` ya existe con `carrier_label_id`, `carrier_tracking`, `file_url` | El plan inventa campos que ya existen |
| **C6** | Existe todo el backbone `integration_providers/connectors/connections/credentials/events` + `providerCredentials.server.ts` | El plan reinventa el manejo de credenciales |
| **C7** | `products` **no tiene** peso ni dimensiones | Bloquea la cotización real (GO-3) |
| **C8** | `posService.checkout` descarta `delivery_type` y `driver_id`; sólo persiste `delivery_fee` | GO-12 (migración) no basta |
| **C9** | Trigger `fn_recalc_invoice_totals` recalcula el total de la factura desde `invoice_items` | GO-22 duplicaría el cobro de envío |
| **C10** | `accounts_payable.supplier_id` es `NOT NULL` FK a `suppliers`; `transport_carriers` no tiene vínculo a proveedor | GO-23 no se puede implementar tal cual |
| **C11** | `shipments.service_level` tiene CHECK cerrado (5 valores) | Los códigos de servicio de las transportadoras no caben |
| **C12** | `api_provider` ya acepta los 4 proveedores + tcc/deprisa/shippo/other; `transport_events.source`/`actor_type` ya aceptan `carrier_webhook`; ya existe índice único de idempotencia | Migraciones innecesarias en el plan |
| **C13** | `CheckoutDialog.tsx` tiene 2.312 líneas / 108 KB | Añadir el selector sin refactor lo vuelve inmantenible |

---

## 2. Estado real verificado (no lo re-descubras, verifícalo)

### 2.1 Tablas existentes del módulo

`transport_carriers`, `shipments` (46 cols), `shipment_items`, `shipping_rates` (31 cols), `shipping_labels` (26 cols), `transport_events`, `delivery_attempts`, `proof_of_delivery`, `manifest_shipments`, `transport_routes`, `transport_stops`, `transport_incidents`, `transport_fares`, `vehicles`, `driver_credentials`, `route_schedules`, `route_stops`.

### 2.2 Constraints CHECK reales (verificados en la BD)

```
transport_carriers.carrier_type  ∈ {third_party, own_fleet}                 ← NO existe 'external' ni 'partner'
transport_carriers.service_type  ∈ {cargo, passenger, both}
transport_carriers.api_provider  ∈ {coordinadora, envia, servientrega, tcc,
                                    interrapidisimo, deprisa, shippo, other} ← ya cubre los 4
shipments.status                 ∈ {draft,pending,assigned,ready,picked,dispatched,
                                    in_transit,out_for_delivery,delivered,failed,
                                    returned,cancelled}
shipments.source_type            ∈ {sale, invoice_sale, manual, return, transfer, web_order}
shipments.service_level          ∈ {economy, standard, express, same_day, next_day}
shipping_rates.service_level     ∈ {economy, standard, express, same_day, next_day}
shipping_rates.calculation_method∈ {weight, volume, dimensional, flat, percentage}
transport_events.reference_type  ∈ {trip, shipment, manifest}
transport_events.actor_type      ∈ {system, driver, user, carrier_webhook, customer, api}
transport_events.source          ∈ {internal, carrier_webhook, driver_app, customer_app, api, system}
```

### 2.3 Índices relevantes ya existentes

```
idx_shipments_carrier          (carrier_id)
idx_shipments_status           (organization_id, status)
idx_shipments_source           (source_type, source_id)
idx_shipments_tracking         (tracking_number)
idx_transport_events_external_id  UNIQUE (reference_type, reference_id, external_event_id)
                                  WHERE external_event_id IS NOT NULL      ← idempotencia de webhooks, YA EXISTE
idx_transport_events_ref       (reference_type, reference_id, event_time DESC)
idx_transport_events_correlation_id (correlation_id) WHERE NOT NULL
```

### 2.4 Datos actuales

`transport_carriers` sólo tiene 3 filas (organization_id = 2), todas con `api_provider = NULL`, `api_credentials_ref = NULL`, `metadata = {}`. **Las 4 transportadoras colombianas no existen todavía** → hace falta un seed.

### 2.5 Archivos clave (rutas verificadas)

```
src/lib/services/deliveryIntegrationService.ts      (30 KB)  createShipmentFromWebOrder, createShipmentFromPOSSale
src/lib/services/webOrderConfirmationService.ts     (26 KB)  confirmOrder → createShipment (ruta A)
src/lib/services/webOrderServerConfirmation.ts      (36 KB)  autoConfirmPaidOrder → insert inline (ruta B)
src/lib/services/posService.ts                     (109 KB)  checkout()
src/lib/services/shipmentsService.ts                (36 KB)
src/lib/services/shippingRatesService.ts            (13 KB)  simulateShipping()
src/lib/services/trackingService.ts                 (12 KB)
src/lib/services/transportService.ts                (28 KB)  getCarriers/createCarrier/updateCarrier
src/lib/services/providerCredentials.server.ts       (9 KB)  ← patrón canónico de credenciales
src/lib/services/providerRegistry.ts                (10 KB)
src/lib/services/integrations/qrShared/webhookSecurity.ts (8 KB) ← verifyWebhookSignature/Timestamp, logWebhookEvent
src/components/pos/CheckoutDialog.tsx              (108 KB, 2312 líneas)
src/components/transporte/transportadoras/{CarrierDialog,ApiCredentialsDialog,CarriersList}.tsx
src/components/transporte/envios/{ShipmentDialog,ShipmentsList,shipmentLabelPrinter.ts}
src/components/transporte/envios/id/ShipmentTimeline.tsx
src/app/app/transporte/envios/[id]/page.tsx         (39 KB)
src/app/api/cron/reconcile-web-orders/route.ts               ← patrón de auth de cron
goadmin-websites/app/tracking/page.tsx                       ← tracking público
goadmin-websites/app/api/orders/[id]/tracking/route.ts
goadmin-websites/app/pedido/[id]/OrderTracker.tsx
```

**No existe** `src/lib/services/integrations/carriers/` ni `src/app/api/transport/`.

---

## 3. FASE 0 — Bloqueante de seguridad (hazlo ANTES que GO-2)

> Esta fase no está en el plan original y **debe ejecutarse primero**. No guardes ninguna credencial real de transportadora hasta cerrarla.

### 3.1 C1 — Políticas RLS abiertas al público

Verificado en `pg_policies`:

| tabla | política | cmd | roles | qual |
|---|---|---|---|---|
| `shipments` | `shipments_public_read` | SELECT | `{public}` | `true` |
| `transport_carriers` | `transport_carriers_public_read` | SELECT | `{public}` | `true` |
| `delivery_attempts` | `delivery_attempts_public_read` | SELECT | `{public}` | `true` |
| `proof_of_delivery` | `proof_of_delivery_public_read` | SELECT | `{public}` | `true` |

Con la **anon key** (que es pública, va en el bundle de `goadmin-websites`) cualquiera puede leer **todos los envíos de todas las organizaciones**: nombre del destinatario, teléfono, dirección, coordenadas, valor declarado. Y **todas las transportadoras**, incluida `metadata` (donde hoy se guardan las API keys) y `api_credentials_ref`.

**Qué hacer:**

1. Averigua qué consume esas políticas. Punto de partida: `goadmin-websites/app/tracking/page.tsx`, `goadmin-websites/app/api/orders/[id]/tracking/route.ts`, `goadmin-websites/app/pedido/[id]/OrderTracker.tsx`, `goadmin-websites/app/api/orders/lookup/route.ts`.
2. Sustituye la lectura anónima directa por **una función `SECURITY DEFINER`** que devuelva sólo lo necesario y esté acotada por secreto:
   ```
   fn_public_track_shipment(p_tracking_number text, p_contact_last4 text)
     → shipment_number, status, expected_delivery_date, carrier_name,
       external_tracking_url, eventos públicos (event_type, event_time, location_text)
   ```
   Sin datos personales completos. Requiere conocer el número de guía **y** un dato de verificación (últimos 4 del teléfono del destinatario, o el `order_number`).
3. Aplica `REVOKE`/`GRANT EXECUTE ... TO anon` explícito sobre esa función y **elimina las 4 políticas `*_public_read`**.
4. Si `goadmin-websites` necesita más, que pase por su propio route handler con service-role (patrón ya usado en `api/orders/[id]/tracking/route.ts`), nunca por anon directo a `shipments`.
5. **Criterio de aceptación**: con la anon key, `select * from shipments` devuelve 0 filas; `select api_credentials_ref, metadata from transport_carriers` devuelve 0 filas; el tracking público de `goadmin-websites` sigue funcionando con guía + verificación.

### 3.2 C2 — Credenciales en claro

`src/components/transporte/transportadoras/ApiCredentialsDialog.tsx` hoy lee y escribe `api_key`, `api_username`, `sandbox_mode`, `custom_config` en `carrier.metadata`. El diálogo muestra el texto "las credenciales sensibles se almacenan de forma segura" — **es falso**. Corrígelo junto con 3.3.

**Además**: purga las credenciales que ya estén guardadas en `transport_carriers.metadata` en producción (hoy todas están vacías, pero verifica antes de asumirlo) y rota cualquier clave que haya estado expuesta.

### 3.3 C6 — Usa el backbone de integraciones que ya existe (no reinventes)

El ERP ya tiene el patrón canónico para credenciales de terceros:

```
integration_providers  →  integration_connectors  →  integration_connections  →  integration_credentials
                                                                              →  integration_events
```

- `integration_connections`: `organization_id`, `connector_id`, `branch_id`, `environment` (sandbox/prod), `country_code`, `status`, `settings`, health-check (`last_health_check_at`, `last_error_at`, `error_count_24h`).
- `integration_credentials`: `connection_id`, `credential_type`, `purpose`, `secret_ref`, `key_prefix`, `status`, `expires_at`, `rotated_at`.
- `integration_events`: `connection_id`, `direction`, `event_type`, `external_event_id`, `payload`, `status`, `correlation_id`, `organization_id`.
- Lectura **sólo servidor** con service-role: mira `src/lib/services/providerCredentials.server.ts` (usa `getServiceClient()` + `assertServerOnly()`).
- Verificación de webhooks ya resuelta: `verifyWebhookSignature`, `verifyWebhookTimestamp`, `getWebhookSecret`, `logWebhookEvent` en `src/lib/services/integrations/qrShared/webhookSecurity.ts`.

**Qué hacer:**

1. Registra vía MCP los 4 proveedores en `integration_providers` (`coordinadora`, `envia`, `servientrega`, `interrapidisimo`) y sus connectors en `integration_connectors` con `capabilities = {"pull":true,"push":true,"webhooks":true,"quote":true,"label":true}` y `supported_countries = {CO}`.
2. `transport_carriers.api_credentials_ref` (text, ya existe) pasa a guardar el **uuid de `integration_connections.id`**. Documenta esto en el código.
3. Reescribe `ApiCredentialsDialog` para que **no** escriba nunca en `metadata`: debe llamar a un route handler `POST /api/transport/carriers/[id]/credentials` que corre con service-role, crea/actualiza `integration_connections` + `integration_credentials`, y devuelve sólo `key_prefix` + `status` + `environment`. El GET nunca devuelve secretos.
4. **No uses `provider_configs`**: su CHECK de `category` sólo admite `{voice,stt,tts,llm,email,whatsapp,sms,analysis,esign,calendar,video,enrichment}` — la logística no encaja y el backbone de `integration_*` es el correcto para conectores con webhooks.

---

## 4. GO-2 — Servicio base + adaptadores (13 pts) · corregido

### 4.1 Estructura de archivos

```
src/lib/services/integrations/carriers/
  types.ts                       tipos compartidos (CarrierAdapter, DTOs, errores)
  carrierIntegrationService.ts   factory por api_provider + fachada pública (SERVER ONLY)
  statusMapper.ts                mapeo estado externo → interno (lee carrier_tracking_status)
  coordinadoraService.ts
  enviaService.ts
  servientregaService.ts
  interrapidisimoService.ts
  __tests__/                     tests por adaptador con fixtures de respuesta
```

Sigue la convención de los adaptadores existentes: mira `integrations/wompi/`, `integrations/bold/` (`*Config.ts`, `*Service.ts`, `*Types.ts`, `index.ts`).

### 4.2 Interfaz base

```ts
export interface CarrierAdapter {
  readonly provider: CarrierProvider;      // 'coordinadora' | 'envia' | 'servientrega' | 'interrapidisimo'

  quoteRate(input: QuoteInput): Promise<QuoteResult[]>;
  createGuide(input: CreateGuideInput): Promise<GuideResult>;
  trackShipment(trackingNumber: string): Promise<TrackResult>;
  cancelGuide(trackingNumber: string): Promise<CancelResult>;

  /** Verifica firma/token de un webhook entrante y normaliza el payload. */
  parseWebhook(req: NormalizedWebhookRequest): Promise<CarrierWebhookEvent[]>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
}
```

```ts
interface GuideResult {
  carrierTrackingNumber: string;   // número de guía de la transportadora
  carrierLabelId?: string;         // id de la etiqueta en el proveedor
  labelUrl?: string;               // PDF/PNG de la guía
  labelFormat?: 'pdf' | 'png' | 'zpl';
  cost: number;                    // costo real cobrado por la transportadora
  currency: string;                // 'COP'
  breakdown?: { shipping?: number; insurance?: number; fuel_surcharge?: number; cod_fee?: number };
  estimatedDeliveryDate?: string;  // ISO date
  rawResponse: unknown;            // guardar en metadata para auditoría
}
```

**Reglas obligatorias del servicio base:**

- `carrierIntegrationService` es **server-only**: `import 'server-only'` + `assertServerOnly()`. Nunca se importa desde un componente cliente. La UI lo consume a través de route handlers.
- Credenciales sólo vía `integration_connections` (§3.3), resueltas por `organization_id` + `carrier_id`. Nunca leas `transport_carriers.metadata`.
- Modo **sandbox vs producción** por `integration_connections.environment`.
- Errores tipados: `CarrierAuthError`, `CarrierValidationError`, `CarrierRateLimitError`, `CarrierUnavailableError`, `CarrierNotFoundError`. Nunca lances el error crudo del proveedor a la UI.
- **Reintentos**: sólo en `CarrierUnavailableError` / `CarrierRateLimitError`, backoff exponencial con jitter, máx. 3 intentos, timeout duro por request (10 s cotización, 20 s creación de guía). `createGuide` **no** debe reintentarse ciegamente: usa una clave de idempotencia por `shipment_id` para no generar dos guías.
- Registra cada llamada saliente en `integration_events` con `direction='outbound'`, `correlation_id` = id del shipment.
- **Sin secretos en logs.** Redacta `Authorization`, `api_key`, `password`.

### 4.3 Subtareas GO-7 … GO-11

- **GO-7** — `types.ts` + `carrierIntegrationService.ts` (factory `getCarrierAdapter(orgId, carrierId)` que resuelve `api_provider` y credenciales) + `statusMapper.ts` + errores + tests del factory.
- **GO-8/9/10/11** — un adaptador por proveedor. **Antes de escribir cada adaptador, consulta la documentación oficial vigente de la API** (Coordinadora, Envía, Servientrega, Interrapidísimo) y déjala citada en un comentario de cabecera con la fecha de consulta y la versión de la API. No inventes endpoints ni nombres de campos.
- Si algún proveedor no ofrece API pública o requiere contrato comercial que aún no existe: implementa el adaptador con `throw new CarrierUnavailableError('...')` documentado, **no lo mockees en silencio**, y deja el issue anotado en Jira. Es preferible que 2 adaptadores funcionen de verdad a que 4 parezcan funcionar.
- Cada adaptador necesita tests con fixtures de respuestas reales (éxito, error de auth, error de validación, rate limit) — no llames a la API real en CI.

---

## 5. GO-3 — Selección de transportadora y guía en checkout POS (8 pts) · corregido

### 5.1 GO-12 — Migración de `sales` (corregida)

Verificado: `sales` **no tiene** `delivery_type` ni `carrier_id`. Sí tiene `driver_id`, `delivery_fee`, `source`, `include_in_cash_register`.

```sql
ALTER TABLE sales ADD COLUMN delivery_type text
  CHECK (delivery_type IN ('pickup','delivery_own','delivery_third_party'));
ALTER TABLE sales ADD COLUMN carrier_id uuid REFERENCES transport_carriers(id);
CREATE INDEX idx_sales_carrier ON sales(carrier_id) WHERE carrier_id IS NOT NULL;
```
(Aplícalo con `apply_migration`, no como archivo.)

**C8 — la migración sola no sirve.** `posService.checkout()` recibe `delivery_type`, `delivery_info`, `driver_id` y `shipping_fee` desde `CheckoutDialog` (líneas ~882-892) pero **sólo persiste `delivery_fee`** (posService.ts ~1602-1655). Hay que:
- persistir `delivery_type`, `carrier_id` y `driver_id` en el insert de `sales`;
- **no** duplicar la fuente de verdad: el vínculo venta↔envío sigue siendo `shipments.source_type='sale' AND source_id = sale.id` (ya indexado por `idx_shipments_source`). `sales.carrier_id` es denormalización para reportes.

### 5.2 GO-13 — Selector de transportadora (corregido)

**El filtro del plan es incorrecto.** Usa:

```ts
supabase.from('transport_carriers')
  .select('id, name, code, api_provider, tracking_url_template, metadata')
  .eq('organization_id', orgId)
  .eq('carrier_type', 'third_party')          // NO 'external'/'partner' — el CHECK sólo admite third_party|own_fleet
  .in('service_type', ['cargo', 'both'])
  .eq('is_active', true)
  .not('api_provider', 'is', null);
```

Distingue en la UI entre transportadora **con integración** (`api_provider != null` y con `integration_connections` activa → cotiza y genera guía por API) y **sin integración** (fallback a `shipping_rates` con `show_on_pos = true`, guía manual). Ambos casos deben funcionar.

**C7 — bloqueante de cotización.** `products` **no tiene** columnas de peso ni dimensiones (verificado). Hoy `CheckoutDialog` llama a `simulateShipping` con `weight_kg: 1` hardcodeado y sin dimensiones (líneas ~356-362). Ninguna API de transportadora cotiza bien así.

Opciones, en orden de preferencia:
1. Añadir a `products`: `weight_kg numeric`, `length_cm numeric`, `width_cm numeric`, `height_cm numeric` (nullable) + UI en inventario para cargarlas. **Es lo correcto**, pero excede el scope de GO-3 → **crea un issue nuevo bloqueante y avisa antes de continuar**.
2. Mientras tanto: peso por defecto configurable a nivel de organización (`organizations.metadata.default_item_weight_kg`), con el valor visible y **editable en el checkout** antes de cotizar, y advertencia clara de que el costo puede ajustarse.

No implementes la opción 2 en silencio como si fuera exacta: el costo real de la transportadora llegará distinto y contaminará GO-6.

**C13 — refactor previo obligatorio.** `CheckoutDialog.tsx` son 2.312 líneas. **Antes** de añadir el selector, extrae la sección de entrega a `src/components/pos/checkout/DeliverySection.tsx` (+ `useDeliveryQuote.ts` para la lógica de cotización). No añadas 300 líneas más al monolito.

### 5.3 GO-14 — Crear shipment + generar guía

Extiende `deliveryIntegrationService.createShipmentFromPOSSale()` (hoy no acepta transportadora) con:

```ts
carrierId?: string;
serviceLevel?: 'economy'|'standard'|'express'|'same_day'|'next_day';  // C11: CHECK cerrado
carrierServiceCode?: string;   // código crudo del proveedor → va a metadata, NO a service_level
weightKg?: number; lengthCm?: number; widthCm?: number; heightCm?: number;
declaredValue?: number; codAmount?: number;
```

Flujo en `handleCheckout`:

1. Crear la venta (`POSService.checkout`) — **la venta nunca debe fallar por la transportadora**.
2. Crear el shipment con `carrier_id`, `service_level`, dimensiones, `status='pending'`.
3. Llamar a `POST /api/transport/shipments/[id]/guide` (route handler server-side que usa `carrierIntegrationService.createGuide`).
4. Con el resultado:
   - `shipments.external_tracking_url` = URL construida con `tracking_url_template` o la del proveedor;
   - **C5 — la guía va a `shipping_labels`, que ya existe**: `carrier_id`, `carrier_label_id`, `carrier_tracking`, `file_url`, `format`, `barcode_value`, `label_number`. **No inventes columnas nuevas en `shipments`.**
   - `shipments.tracking_number` sigue siendo el consecutivo **interno** (`generateTrackingNumber`). El número de guía de la transportadora vive en `shipping_labels.carrier_tracking`. Si necesitas búsqueda directa por guía, añade `shipments.carrier_tracking_number text` + índice — pero decide una sola fuente de verdad y documéntala.
   - registra `transport_events` con `event_type='guide_created'`, `source='api'`, `actor_type='api'`.
5. Si la generación de guía falla: la venta y el shipment quedan creados, el shipment queda en `pending` con `metadata.guide_error`, se muestra un toast no bloqueante y **el detalle del envío ofrece "Reintentar generación de guía"**. Nunca dejes al cajero atrapado.
6. Imprime la guía con el flujo ya existente (`shipmentLabelPrinter.ts`, `printShipmentGuideWithCut`) si hay impresora configurada.

---

## 6. GO-4 — Pedidos web (5 pts) · corregido

### 6.1 C4 — Primero consolida las dos rutas duplicadas (bloqueante)

Hoy existen **dos** implementaciones distintas que crean el shipment de un pedido web:

| | Ruta A | Ruta B |
|---|---|---|
| Archivo | `webOrderConfirmationService.ts:396` → `deliveryIntegrationService.createShipmentFromWebOrder` | `webOrderServerConfirmation.ts:769-830` (insert inline) |
| Tracking | `generateTrackingNumber(orgId)` (consecutivo) | `` `TRK-${Date.now()}-${random}` `` |
| `carrier_id` | `null` | `null` |
| `shipment_items` | **no los crea** | **no los crea** |
| Campos extra | — | `delivery_department`, `postal_code`, lat/lng, país en metadata |
| Se dispara desde | confirmación manual del operador | auto-confirmación por pago + cron `reconcile-web-orders` |

**Consecuencia**: dos formatos de tracking incompatibles, y arreglar una ruta deja la otra rota.

**Qué hacer antes de GO-15/GO-16**: unificar en **una sola función** `deliveryIntegrationService.createShipmentFromWebOrder(order, opts)` que cubra el superconjunto de campos de la ruta B, y que `webOrderServerConfirmation.ts` la llame en vez de hacer el insert inline. Además:
- `getShipmentByWebOrderId` usa `.single()` → revienta si hubiera duplicados. Cámbialo a `.maybeSingle()` con `order('created_at').limit(1)`.
- Crea los `shipment_items` también en la ruta web (hoy sólo el POS los crea).

### 6.2 GO-15 — Vincular `delivery_partner` → `transport_carriers`

`web_orders.delivery_partner` es `text` libre. Estrategia de resolución, en este orden:
1. match exacto por `transport_carriers.code` (case-insensitive);
2. match exacto por `name` normalizado (sin tildes, lowercase, sin `s.a.s`/`s.a.`);
3. tabla de alias en `transport_carriers.metadata.aliases` (array de strings) para "servientrega", "SERVIENTREGA S.A.", "Inter Rapidísimo", "interrapidisimo", "Envia", "TCC"…

Si no resuelve: `carrier_id = null`, `shipments.metadata.carrier_resolution = 'unresolved'`, se crea una notificación al operador y el detalle del pedido muestra un selector "Asignar transportadora" con reintento manual. **No falles la confirmación del pedido por esto.**

Además: donde el sitio web escribe `delivery_partner`, haz que envíe el `code` del carrier (`goadmin-websites/app/api/orders/route.ts`, `app/api/checkout/init/route.ts`) para que los pedidos nuevos resuelvan siempre.

### 6.3 GO-16 — Guía automática

Mismo flujo que §5.3, pero asíncrono respecto a la confirmación: la confirmación del pedido **no** debe esperar a la transportadora. Genera la guía en un paso posterior idempotente (reusable por el cron de GO-18 para reintentos), guardando el intento en `integration_events`.

---

## 7. GO-5 — Tracking en tiempo real (8 pts) · corregido

### 7.1 GO-19 — Tabla `carrier_tracking_status`

Es un mapeo a nivel de **proveedor**, no de organización. Propuesta:

```sql
CREATE TABLE carrier_tracking_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_provider text NOT NULL
    CHECK (api_provider IN ('coordinadora','envia','servientrega','tcc',
                            'interrapidisimo','deprisa','shippo','other')),
  external_code text NOT NULL,
  external_description text,
  internal_status text NOT NULL
    CHECK (internal_status IN ('draft','pending','assigned','ready','picked','dispatched',
                               'in_transit','out_for_delivery','delivered','failed',
                               'returned','cancelled')),
  is_terminal boolean NOT NULL DEFAULT false,
  is_exception boolean NOT NULL DEFAULT false,
  sort_order integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE (api_provider, external_code)
);
```
RLS: lectura para `authenticated` (es catálogo, no hay datos de tenant), escritura sólo service-role. Seed por proveedor con los códigos reales de su documentación.

Comportamiento ante un código desconocido: **no lo descartes** — inserta el `transport_event` con el texto crudo, deja `shipments.status` sin tocar, y registra el código faltante (log + `integration_events.status='unmapped'`) para poder ampliarlo.

### 7.2 GO-17 — Webhook entrante

Ruta: `src/app/api/transport/carriers/[provider]/webhook/route.ts` (`POST`).

- **`middleware.ts` (30 KB) protege las rutas** — añade explícitamente este path al matcher público, o el webhook devolverá 401/redirect. Verifícalo con una petición real.
- Verificación: reusa `verifyWebhookSignature` + `verifyWebhookTimestamp` de `integrations/qrShared/webhookSecurity.ts` y el secreto desde `integration_credentials` (`purpose='events_secret'`) vía `getWebhookSecret`. Si un proveedor sólo ofrece token en URL/header, guárdalo igual en `integration_credentials` y compáralo con `timingSafeEqual`.
- **La `organization_id` se resuelve desde la conexión/guía, nunca desde el payload.** Un payload no puede elegir su tenant.
- **Idempotencia**: ya existe `idx_transport_events_external_id` UNIQUE `(reference_type, reference_id, external_event_id) WHERE external_event_id IS NOT NULL`. Inserta con `external_event_id` del proveedor y trata la violación de unicidad como éxito (`200`).
- Inserta en `transport_events` con `source='carrier_webhook'`, `actor_type='carrier_webhook'`, `reference_type='shipment'`, `payload` = crudo.
- Actualiza `shipments.status` sólo si el mapeo existe y **el nuevo estado avanza** (no retrocedas de `delivered` a `in_transit` por un evento fuera de orden — usa `event_time` y `sort_order`).
- Al marcar `delivered`: setea `delivered_at`, y propaga a `web_orders.status/delivered_at` cuando `source_type='web_order'`.
- Responde `200` rápido (< 3 s). Lo pesado (notificaciones al cliente) va en background.
- Registra todo en `integration_events` (`direction='inbound'`).

### 7.3 GO-18 — Cron de polling

Ruta: `src/app/api/cron/sync-shipments/route.ts` (`GET`), siguiendo **exactamente** el patrón de `src/app/api/cron/reconcile-web-orders/route.ts`:
```ts
const authHeader = request.headers.get('authorization');
if (!process.env.CRON_SECRET) return 500;
if (authHeader?.replace('Bearer ','') !== process.env.CRON_SECRET) return 401;
```
Query: `shipments` con `carrier_id IS NOT NULL` y `status IN ('assigned','ready','picked','dispatched','in_transit','out_for_delivery')`.

- `limit` por ejecución (default 50, máx 200) para no exceder el timeout de Vercel.
- Backoff: no consultes el mismo envío más de una vez cada N minutos; guarda `metadata.last_tracked_at` y salta los recientes.
- Deja de consultar tras un estado terminal o tras X días sin movimiento (`metadata.tracking_stale = true`) y notifica al operador.
- Agrupa por `carrier_id` para reusar credenciales y respetar rate limits del proveedor.
- Reusa el mismo camino de escritura del webhook (extrae `applyCarrierEvent(shipmentId, event)` a un módulo compartido) para que webhook y polling no divergan.
- Registra en `vercel.json`:
  ```json
  { "path": "/api/cron/sync-shipments", "schedule": "*/15 * * * *" }
  ```
  **Verifica el límite de crons del plan de Vercel**: `vercel.json` ya tiene 13 entradas. Si el plan no admite una más, considera consolidar en un cron despachador.

### 7.4 GO-20 — UI de tracking

- `src/app/app/transporte/envios/[id]/page.tsx` + `ShipmentTimeline.tsx`: sección "Transportadora" con logo/nombre, número de guía, botón a `external_tracking_url`, botón de descarga de la guía (`shipping_labels.file_url`), última sincronización, y badge del origen del evento (`interno` / `transportadora` / `conductor`).
- `src/components/pos/pedidos-online/DeliveryTrackingCard.tsx`: mismo timeline para pedidos web.
- `goadmin-websites/app/tracking/page.tsx` y `app/pedido/[id]/OrderTracker.tsx`: mostrar el tracking de la transportadora **a través de la RPC segura de §3.1**, no leyendo `shipments` con anon.
- Estados vacíos explícitos: "sin eventos aún", "transportadora sin integración", "guía pendiente de generar (reintentar)".

---

## 8. GO-6 — Costo real y contabilidad (5 pts) · corregido

### 8.1 GO-21 — Tabla `shipment_costs`

```sql
CREATE TABLE shipment_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL,          -- necesario para RLS; el plan lo omitía
  branch_id integer,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  carrier_id uuid REFERENCES transport_carriers(id),
  cost_type text NOT NULL
    CHECK (cost_type IN ('shipping','insurance','fuel_surcharge','cod_fee','return','other')),
  cost_amount numeric NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'COP',
  source text NOT NULL DEFAULT 'api'
    CHECK (source IN ('api','manual','carrier_invoice')),
  invoiced_by_carrier boolean NOT NULL DEFAULT false,
  paid_to_carrier boolean NOT NULL DEFAULT false,
  carrier_invoice_number text,
  accounts_payable_id uuid REFERENCES accounts_payable(id),
  journal_entry_id integer REFERENCES journal_entries(id),   -- integer, NO uuid
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_shipment_costs_shipment ON shipment_costs(shipment_id);
CREATE INDEX idx_shipment_costs_org ON shipment_costs(organization_id, created_at DESC);
CREATE INDEX idx_shipment_costs_carrier ON shipment_costs(carrier_id);
```
RLS igual al resto: `organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())`. **Sin política `public_read`.**

Ojo con los tipos: `journal_entries.id` es `integer` (serial), `accounts_payable.id` es `uuid`. El plan asumía `asiento_contable_id` genérico.

### 8.2 GO-22 — Línea de envío en `invoice_items` — **verifica antes de implementar (C9)**

Existe el trigger **`fn_recalc_invoice_totals`** (`SECURITY DEFINER`) sobre `invoice_items` que recalcula `invoice_sales.subtotal` y `.total` como `SUM(total_line)` de sus ítems.

Por tanto, **añadir una línea "Costo de envío" cambia el total de la factura**. Antes de tocar nada:

1. Determina cómo se refleja hoy `sales.delivery_fee` en `invoice_sales.total` (¿ya está sumado? ¿se pierde?). Compara una venta POS con `delivery_fee > 0` contra su `invoice_sales`.
2. Si ya está incluido → añadir la línea **duplica el cobro**. En ese caso la línea sustituye al mecanismo actual, no lo suma.
3. Decide con criterio contable/DIAN: el envío cobrado al cliente es **ingreso** y normalmente debe ir como línea facturable con su tratamiento de IVA (`tax_code`, `tax_rate`, `tribute_id`, `unit_measure_id`, `standard_code_id`). No lo metas con `tax_rate = 0` sin confirmarlo.
4. Escribe un test que verifique: venta con envío → `invoice_sales.total == subtotal + impuestos + envío`, **una sola vez**.

Campos de `invoice_items` a usar: `invoice_sales_id`, `invoice_type='sale'`, `product_id = null`, `description='Costo de envío'`, `qty=1`, `unit_price`, `tax_rate`, `total_line`, `code_reference`.

### 8.3 GO-23 — Asiento y cuenta por pagar — **el plan no es implementable tal cual (C10)**

Verificado: `accounts_payable` exige `supplier_id integer NOT NULL` (FK a `suppliers`) e `invoice_id uuid`. **`transport_carriers` no tiene ningún vínculo con `suppliers`.**

Pasos:
1. Migración: `ALTER TABLE transport_carriers ADD COLUMN supplier_id integer REFERENCES suppliers(id);`
2. UI en `CarrierDialog`: selector "Proveedor asociado" (o botón "crear proveedor a partir de esta transportadora"). Sin proveedor asociado no se puede generar CxP → muestra el aviso en la ficha de la transportadora.
3. Asiento (`journal_entries` + `journal_lines`):
   - `journal_entries`: `organization_id`, **`branch_id` (NOT NULL — resuélvelo desde el shipment)**, `entry_date`, `memo`, `source='shipment_cost'`, `source_id = shipment_id::text` (ambos son `text`), `currency_code`, `exchange_rate`.
   - `journal_lines`: `journal_entry_id`, `account_code` (text), `debit`/`credit`, `debit_base`/`credit_base`, `organization_id` (NOT NULL), `cost_center_id` opcional.
   - Débito: cuenta de gasto de transporte/fletes del PUC. **No hardcodees `5195-XX`**: haz configurable el par de cuentas (gasto / CxP transportadora) por organización, siguiendo el patrón que ya use finanzas para otras cuentas. Si no existe ese patrón, pregunta antes de inventar cuentas.
   - **Valida que el asiento cuadre** (`SUM(debit) = SUM(credit)`) antes de insertar.
4. `accounts_payable`: una fila por guía (o consolidada por factura de la transportadora, que es lo habitual — decide y documenta), con `supplier_id`, `amount`, `balance`, `due_date`, `status`, `branch_id`.
5. Idempotencia: reprocesar un shipment no debe duplicar asientos ni CxP. Usa `shipment_costs.journal_entry_id` / `.accounts_payable_id` como candado.

### 8.4 GO-24 — Reportes

`src/lib/services/reportesFinancierosService.ts` hoy expone `getPnLReport`, `getCashFlowReport`, `getCarteraReport`, `getTaxReport`, `getCashReport`, `getBankReport`, `getReportSummary`, leyendo de `invoice_sales`, `invoice_purchase`, `cash_movements`, `bank_transactions`, `accounts_receivable`, `accounts_payable`.

Añade:
- **Ingreso por envío** = `SUM(sales.delivery_fee)` en el período.
- **Costo de envío** = `SUM(shipment_costs.cost_amount)`.
- **Margen de envío** = ingreso − costo, y **margen %**.
- Desglose por transportadora y por sucursal.
- Alerta cuando el margen sea negativo (se está cobrando menos de lo que cuesta) — ese es el valor de negocio real de GO-6.

---

## 9. UI/UX — plan de mejora (transporte + puntos de contacto)

### 9.1 Deuda transversal detectada

| Problema | Dónde | Acción |
|---|---|---|
| Dos sistemas de toast conviviendo: `sonner` (`import { toast }`) en POS y `useToast()` de shadcn en transporte | `CheckoutDialog.tsx` vs `app/app/transporte/**` | Unificar en uno solo (recomendado: el de shadcn ya usado en transporte) al menos dentro del scope tocado |
| Sin skeletons: sólo `isLoading` booleano y pantallas en blanco | `transporte/envios/page.tsx` y hermanas | Skeletons con la forma del contenido en listas, stats y timeline |
| Filtros sólo en estado local: no hay deep-link ni botón atrás | `envios/page.tsx` (8 filtros en `useState`) | Sincronizar filtros con `searchParams` |
| Sin `error boundary` por sección; los fallos se tragan en `console.warn` | `deliveryIntegrationService`, páginas de transporte | Estados de error visibles con acción de reintento |
| Componentes monolito | `CheckoutDialog.tsx` 2.312 líneas, `envios/[id]/page.tsx` 39 KB, `pedidos-online/page.tsx` 66 KB | Extraer secciones antes de añadir funcionalidad |
| Sin feedback de operaciones largas | generación de guía, cotización | Estados `quoting` / `generating` con progreso y cancelación |

### 9.2 UX específica de la integración

**Checkout POS — `delivery_third_party` hoy es un callejón sin salida**: el usuario elige la opción y no pasa nada logístico. Nuevo flujo:

1. Selección del tipo de entrega (ya existe) → si es tercero, aparece `DeliverySection`.
2. Dirección de destino (autocompletar desde el cliente, ya implementado para `delivery_own` — extiéndelo a tercero).
3. Peso/dimensiones editables con el valor por defecto visible (§5.2).
4. **Cotización en paralelo de todas las transportadoras integradas**, con skeleton por tarjeta. Cada tarjeta: logo, nombre, servicio, **precio**, **días estimados**, badge "más económico" / "más rápido". Las que fallen muestran "no disponible" sin bloquear al resto.
5. Fallback siempre disponible: tarifas manuales de `shipping_rates` (`show_on_pos = true`) — el flujo actual, que debe seguir funcionando.
6. Al cobrar: la venta se cierra primero; la guía se genera con indicador propio. Éxito → vista previa + botón imprimir + número de guía copiable. Error → mensaje accionable + "reintentar" desde el detalle del envío.
7. Debounce de la cotización (≥ 500 ms) y cancelación de la petición anterior al cambiar ciudad/peso — hoy el `useEffect` de tarifas se dispara con cada cambio de `deliveryCity` sin debounce ni `AbortController`.

**Ficha de transportadora** (`transportadoras/page.tsx`, `CarrierDialog`, `ApiCredentialsDialog`):
- Badge de estado de conexión (conectada / sandbox / sin credenciales / con error), alimentado por `integration_connections.status` + `last_error_at` + `error_count_24h`.
- Botón **"Probar conexión"** → `healthCheck()` del adaptador, con resultado inline.
- Nunca mostrar secretos: sólo `key_prefix` (`sk_live_ab••••`), fecha de última rotación y botón "reemplazar".
- Selector de proveedor con las 8 opciones reales del CHECK, no texto libre.
- Campo "proveedor asociado" (§8.3).

**Detalle de envío** (`envios/[id]/page.tsx`): tarjeta de transportadora con guía, enlace de tracking externo, descarga de etiqueta, costo real vs cobrado (margen), última sincronización, y acciones "reintentar guía" / "sincronizar ahora" / "anular guía".

### 9.3 Accesibilidad (aplica a todo lo nuevo)

Sigue la skill `.devin/skills/accessibility-a11y`. Mínimos no negociables en el código nuevo:
- Selector de transportadora navegable por teclado, con `role="radiogroup"` y `aria-checked` (son tarjetas, no botones sueltos).
- Estados de carga anunciados con `aria-live="polite"`; errores con `aria-live="assertive"`.
- Contraste AA en badges de estado (los badges de estado actuales usan combinaciones amarillo/verde claro que hay que verificar en tema claro).
- No comuniques estado **sólo** por color: los estados de envío necesitan icono o texto.
- Foco atrapado y devuelto correctamente en todos los diálogos nuevos.

---

## 10. Orden de ejecución (corregido)

```
FASE 0  (bloqueante, no está en el plan original)
  0.1  Cerrar RLS pública: shipments, transport_carriers, delivery_attempts, proof_of_delivery  [§3.1]
  0.2  Migrar credenciales a integration_connections/credentials + reescribir ApiCredentialsDialog [§3.2-3.3]
  0.3  Seed de los 4 proveedores/connectors + seed de transport_carriers por organización
  0.4  Consolidar las 2 rutas duplicadas de creación de shipment web                            [§6.1]
  0.5  Decidir peso/dimensiones de producto (issue nuevo si va la opción 1)                     [§5.2]

GO-2   Servicio base + adaptadores  (GO-7 → GO-8/9/10/11 en paralelo)
GO-3   POS   (GO-12 → refactor DeliverySection → GO-13 → GO-14)   ─┐ en paralelo
GO-4   Web   (GO-15 → GO-16)                                      ─┘
GO-5   Tracking  (GO-19 → GO-17 → GO-18 → GO-20)
GO-6   Finanzas  (GO-21 → verificar fn_recalc_invoice_totals → GO-22 → supplier_id → GO-23 → GO-24)
```

---

## 11. Criterios de aceptación de la épica

**Seguridad (Fase 0)**
- [ ] Con la anon key: `select count(*) from shipments` = 0 y `select count(*) from transport_carriers` = 0.
- [ ] Ninguna credencial de transportadora es legible desde el cliente ni aparece en `transport_carriers.metadata`.
- [ ] El tracking público de `goadmin-websites` funciona sólo con guía + dato de verificación.
- [ ] Los logs no contienen API keys ni tokens (revisa Sentry).

**Funcional**
- [ ] Venta POS con `delivery_third_party` y transportadora integrada → `sales.delivery_type`/`carrier_id` persistidos, shipment con `carrier_id`, guía en `shipping_labels`, `external_tracking_url` navegable, etiqueta imprimible.
- [ ] Pedido web con `delivery_partner` conocido → carrier resuelto y guía generada **por las dos rutas** (confirmación manual y auto-confirmación por pago).
- [ ] Pedido web con `delivery_partner` desconocido → no falla, queda `unresolved` y el operador puede asignar manualmente.
- [ ] Webhook: reenviar el mismo evento dos veces no duplica `transport_events` ni cambia el estado dos veces.
- [ ] Webhook: un payload con `organization_id` ajeno no afecta a otra organización.
- [ ] Un evento fuera de orden no retrocede el estado de un envío entregado.
- [ ] Cron `/api/cron/sync-shipments` sin `Authorization: Bearer $CRON_SECRET` → 401.
- [ ] Transportadora sin integración → el flujo manual con `shipping_rates` sigue funcionando igual que hoy (no regresión).
- [ ] Caída total de la API de una transportadora → la venta se cierra igualmente y el envío queda reintentables.

**Contable**
- [ ] Venta con envío: `invoice_sales.total` cuadra **sin duplicar** el cobro de envío (test automatizado).
- [ ] Guía generada → `shipment_costs` con el costo real, asiento cuadrado (`SUM(debit)=SUM(credit)`) y CxP a la transportadora.
- [ ] Reprocesar el mismo shipment no duplica asientos ni CxP.
- [ ] Reporte financiero muestra ingreso, costo y margen de envío por transportadora y sucursal.

**Calidad**
- [ ] `npm run lint`, `next build`, `npm test` pasan.
- [ ] Tests unitarios por adaptador con fixtures (éxito, auth, validación, rate limit, timeout).
- [ ] Test de integración del mapeo estado externo → interno por proveedor.
- [ ] Ningún componente nuevo supera ~400 líneas.
- [ ] Tema claro y oscuro verificados en toda la UI nueva.

---

## 12. Qué hacer si algo no encaja

- **No inventes** endpoints, nombres de campos de API, códigos de estado de transportadora ni cuentas del PUC. Si la documentación oficial no lo aclara, **para y pregunta**.
- **No mockees** una integración para que "pase" el criterio de aceptación. Un adaptador que lanza `CarrierUnavailableError` documentado es un resultado válido; uno que devuelve datos falsos no.
- **No apliques migraciones destructivas** (DROP COLUMN, DROP TABLE, cambios de tipo con pérdida) sin confirmación explícita: hay datos reales de clientes multi-tenant.
- Si un hallazgo nuevo invalida parte de este documento, **anótalo en el issue de Jira correspondiente** y avisa antes de seguir.
