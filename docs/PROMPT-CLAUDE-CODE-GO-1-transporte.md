# Prompt para Claude Code — Épica GO-1: Integración de transportadoras externas (Go Admin ERP)

> Pega este documento como primer mensaje de la sesión, o guárdalo en `docs/` y arranca con:
> `Lee docs/PROMPT-CLAUDE-CODE-GO-1-transporte.md y entra en plan mode para la Fase 0.`

**Repos involucrados (los dos):**
- `go-admin-erp` — ERP, Next.js App Router. Módulos `transporte`, `pos`, `finanzas`.
- `goadmin-websites` — sitios públicos multi-tenant (e-commerce, restaurantes, hoteles, gym, parking). **Aquí nace el 99 % de los envíos reales.**

Proyecto Supabase compartido: **`jgmgphmzusbluqhuqihj`** (Postgres 15).
Board: https://imaginegallego.atlassian.net/jira/software/projects/GO/board · Sprint GO 1 · GO-1 … GO-24 · 39 pts.

---

## 0. Cómo trabajar en esta sesión

### 0.1 Flujo

1. **Empieza en plan mode.** No escribas código hasta tener aprobado el plan de la fase. Este documento trae la auditoría — úsala, pero verifica antes de asumir.
2. **Una fase por sesión.**
3. **Usa TodoWrite** para los pasos de la fase en curso.
4. **Usa subagentes** para barridos amplios. No para escribir código de producción sin revisión.
5. **Verifica al cerrar cada fase** — las compuertas son distintas por repo (§15, Calidad). `goadmin-websites` **no tiene tests ni framework de testing**: ahí la compuerta es `npx tsc --noEmit` + `next build` + los scripts de verificación. No reportes "npm test pasa" en un repo sin tests.
6. **No inventes.** Ver §16.
7. **Lee §2 antes que nada.** Hay 83 sitios en producción y 411 ventas reales: el contrato de no regresión gobierna todas las decisiones de este documento. §14 lista exactamente qué crear, qué cambiar y qué no tocar.

### 0.2 Reglas del repo (obligatorias)

1. **BD siempre vía MCP de Supabase** (`apply_migration`, `execute_sql`, `list_tables`, `get_advisors`). **No crees archivos `.sql`.** Regla de `.devin/rules/git-and-db.md`.
   - GO-25 ("el repo no refleja el esquema") está abierto: **no lo resuelvas aquí**.
2. **Git**: `git commit` local sólo si se pide. **`git push` y PRs requieren autorización explícita en esta conversación.**
3. **Dos repos**: si una fase toca ambos, haz **PRs separados** y declara la dependencia. Nunca dejes el sitio apuntando a algo no desplegado en el ERP.
4. **Stack**: Next.js App Router + TypeScript estricto + Tailwind + shadcn/ui + Supabase JS. Temas claro/oscuro, primario azul.
5. Commits: `feat(GO-<id>): <desc>`. PR: `GO-<id> – <título>`. Revisores: @santycano, @Palomo-dev.

### 0.3 Skills del repo

En `.agents/skills/` y `.devin/skills/`:

| Skill | Cuándo |
|---|---|
| `nextjs-supabase-postgres` | siempre — RLS, multi-tenancy, queries |
| `database-migrations` | Fase 0, Fase 1, GO-12, GO-19, GO-21, GO-23 |
| `security-review` | Fase 0 completa, GO-17 |
| `env-secrets-management` | Fase 0.3 (credenciales) |
| `api-design-rest` | GO-2, GO-17, GO-18, endpoints del sitio |
| `shadcn-tailwind-ui` | Fase 1, GO-13, GO-20, §13 |
| `accessibility-a11y` | toda la UI nueva |
| `testing-tdd` | adaptadores, mapeo de estados, test contable de GO-22 |
| `observability-logging` | GO-17, GO-18 |
| `go-admin-erp-e2e` | verificación de flujos completos |
| `code-review-checklist` | antes de cerrar cada fase |

### 0.4 Falta un `CLAUDE.md`

Ninguno de los dos repos lo tiene. **Primer entregable de la Fase 0**: propón (no crees sin aprobación) un `CLAUDE.md` por repo con reglas de git/BD, ID del proyecto Supabase, mapa de módulos, convención de servicios e índice de skills.

---

## 1. Contexto de negocio real (producción, verificado)

### 1.1 Quién genera pedidos web

| Organización | Tipo | Pedidos | Confirmados | Conversión |
|---|---|---|---|---|
| Org 113 | retail | 2.846 | 213 | **7,5 %** |
| Org 135 | retail | 1.596 | 198 | **12,4 %** |
| Org 112 (pruebas) | retail | 19 | 0 | — |
| Org 137 | retail | 3 | 0 | — |
| Org 120 | restaurante | 2 | 0 | — |
| **Total** | | **4.466** | **411** | **9,2 %** |

El volumen es **e-commerce retail**. 4.031 pedidos (90 %) mueren en `expired`/`cancelled` con pago fallido.

### 1.2 Qué pasa después del pago

- **409 shipments** desde `web_order` (211 org 113 + 198 org 135).
- **Todos en `status = 'pending'`. Ninguno avanza.** Cero `dispatched`, cero `in_transit`, cero `delivered`.
- **Ninguno tiene `carrier_id`.**
- El cliente paga y a partir de ahí **no hay operación logística registrada**. Ese es el hueco que llena GO-1.

### 1.3 Cómo se cobra el envío hoy

`website_settings.shipping_flat_rate = $10.000` y `free_shipping_threshold = $100.000`, iguales para **las cinco organizaciones**. Las tiendas no tienen **ninguna fila** en `shipping_rates`, así que el checkout siempre cae al flat rate.

Eso explica el flete promedio: **$6.168** (org 113) y **$8.368** (org 135) — la mezcla entre quienes pagan $10.000 y quienes superan los $100.000 y no pagan nada.

**Traducción: hoy se cobra $10.000 fijo para toda Colombia, sin importar si el destino es Medellín o Leticia, y sin saber cuánto cuesta realmente la guía.** Ese es el problema de negocio que resuelven la Fase 1 (estructurar tarifas) y GO-6 (margen real).

### 1.4 El restaurante sí opera, y funciona distinto

Org 120 tiene **46 shipments desde POS** con estados que **sí avanzan** (29 `assigned`, 10 `delivered`, 2 `out_for_delivery`, 1 `picked`) y **24 tarifas por barrio de Medellín** (Sabaneta $16.000, Laureles $5.000, Belén $6.000, Domicilio Cerca $3.000…), todas `calculation_method='flat'`, sin `carrier_id`.

| | Restaurante (org 120) | E-commerce retail (113, 135) |
|---|---|---|
| Entrega | domicilio propio, moto | envío nacional |
| `delivery_type` correcto | `delivery_own` | **`delivery_third_party`** (y `delivery_own` para local) |
| Tarifa | plana por barrio/zona | por peso y destino, de la transportadora |
| Tiempo | minutos | días de tránsito |
| Transportadora | ninguna | Coordinadora / Envía / Servientrega / Interrapidísimo |
| Guía y tracking | no aplica | imprescindible |
| ¿GO-1 aplica? | **No. No lo rompas.** | **Sí. Es el objetivo.** |

El ERP ya conoce la distinción: `webOrderServerConfirmation.ts` ramifica por `organizations.type_id` (`1` = restaurante → minutos; resto → días con `estimated_transit_days`). **Reusa ese criterio.**

---

## 2. Contrato de no regresión — REGLA QUE GOBIERNA TODO EL DOCUMENTO

**Hay 83 organizaciones con sitio web activo (81 con envío habilitado), 5 de ellas vendiendo, con 4.466 pedidos históricos y 411 ventas reales confirmadas.** Todo lo que funciona hoy debe seguir funcionando exactamente igual mientras no se active explícitamente lo nuevo, organización por organización.

**Esto no es una recomendación: es la restricción principal de la épica.** Si una decisión de diseño te obliga a elegir entre elegancia y no romper producción, elige no romper producción y anota la deuda.

### 2.1 Las cinco reglas

1. **Todo cambio de esquema es aditivo.** Columnas nuevas siempre `NULL`-ables o con `DEFAULT` que reproduce el comportamiento actual (por ejemplo `shipping_rates.delivery_kind DEFAULT 'own'`). **Cero `DROP COLUMN`, cero `DROP TABLE`, cero cambios de tipo** en esta épica.
2. **Ningún `CHECK` nuevo sobre columnas con datos existentes** hasta haber verificado que el 100 % de las filas lo cumple. En particular **no añadas `CHECK` a `web_orders.delivery_type`**: hoy no tiene y hay 4.466 filas.
3. **El motor nuevo se activa por organización con un flag**, nunca de golpe (§2.2).
4. **Rama por defecto = comportamiento actual.** Cualquier `if` nuevo debe tener como `else` el camino de hoy. Si la organización no tiene zonas, ni tarifas, ni transportadoras, el checkout debe comportarse **byte por byte** como hoy: `shipping_flat_rate` con `free_shipping_threshold`.
5. **Datos históricos intocables.** Los 409 shipments en `pending` y los 4.466 `web_orders` con `delivery_type='delivery_own'` no se migran en esta épica. Ver §2.5.

### 2.2 Flag de activación por organización

```sql
ALTER TABLE website_settings
  ADD COLUMN shipping_engine text NOT NULL DEFAULT 'legacy'
    CHECK (shipping_engine IN ('legacy','zones'));
```

- `'legacy'` (por defecto para las 83 organizaciones): comportamiento actual íntegro. `available_delivery_types` se sigue interpretando como hoy, el envío sale de `shipping_flat_rate`/`shipping_rates` sin resolución de zona, y `/api/orders` sigue derivando `delivery_own`.
- `'zones'`: motor nuevo — zonas, `delivery_kind`, opciones agrupadas, `delivery_third_party`, recálculo de importes en el servidor.

Reglas del flag:
- Cambiarlo **no requiere despliegue**. Es el kill switch: si algo sale mal en una tienda, vuelve a `'legacy'` y esa tienda queda como estaba.
- Una organización sólo pasa a `'zones'` cuando tiene **al menos una zona activa con cobertura y una tarifa asociada**. Valídalo en la UI antes de permitir el cambio.
- El flag vive en `website_settings`, así que lo lee tanto el sitio (`app/checkout/page.tsx` ya carga esa fila) como el ERP.

**Alternativa que puedes proponer**: derivar el motor automáticamente (`si la org tiene ≥1 zona activa → zones`). Menos configuración, pero se pierde el kill switch y no permite preparar zonas sin publicarlas. **Recomiendo el flag explícito**; si prefieres la otra, propónla y pregunta.

### 2.3 Orden de despliegue seguro

Cada paso es inocuo por sí solo y se puede desplegar y verificar antes del siguiente:

```
1. Migración aditiva          → tablas y columnas nuevas, vacías. Nadie las lee. Producción intacta.
2. Backend que las lee        → con guardas: si no hay zonas/tarifas/flag, camino legacy. Producción intacta.
3. UI del ERP                 → el comerciante puede crear zonas y tarifas. El sitio sigue en legacy.
4. Activar flag en org 112    → "Org 112": 19 pedidos, 0 confirmados. Banco de pruebas real.
5. Activar en una tienda real → Org 135 (135, menor volumen) antes que Org 113.
6. Resto de organizaciones    → a demanda.
```

**El paso 4 es un regalo**: ya existe una organización de pruebas (`Org 112`, de pruebas) con el mismo sitio y cero ventas confirmadas. Úsala antes de tocar una tienda con dinero real.

### 2.4 Qué debe seguir funcionando idéntico (checklist de regresión)

Ejecuta esta lista **antes y después** de cada fase, y compara. Si algo cambia sin que sea intencional, es un bug.

**Restaurante — Org 120**
- [ ] El checkout muestra Domicilio / Recoger igual que hoy.
- [ ] Las 24 tarifas de barrio se cobran igual (mientras esté en `legacy`).
- [ ] Los pedidos se guardan con `delivery_type='delivery_own'`.
- [ ] Los envíos desde POS siguen avanzando `assigned → picked → out_for_delivery → delivered`.
- [ ] Los tiempos estimados siguen en minutos (30 listo / 60 entrega).
- [ ] La asignación de conductor y la impresión de guía interna no cambian.

**E-commerce — Org 113 y Org 135, en `legacy`**
- [ ] Envío = $10.000, gratis sobre $100.000. Mismo número, mismo texto.
- [ ] El pedido se crea, se paga por la pasarela y se auto-confirma igual.
- [ ] Se siguen creando `sale`, `sale_items`, `invoice_sales`, `invoice_items`, `payments`, `accounts_receivable` y `shipment`.
- [ ] El correo de confirmación llega con el mismo contenido.
- [ ] El decremento de stock y la liberación de reserva funcionan igual.

**Transversal**
- [ ] Las 83 organizaciones con sitio siguen cargando el checkout sin error.
- [ ] `/api/orders`, `/api/checkout/init` y los webhooks de pasarela responden igual.
- [ ] El cron `reconcile-web-orders` sigue recuperando pedidos huérfanos.
- [ ] POS: una venta con `pickup` y otra con `delivery_own` se cierran igual que hoy.
- [ ] Módulo de transporte de **pasajeros** (viajes, boletos, rutas, paradas, tarifas de pasajeros, manifiestos): **no se toca en absoluto**.

### 2.5 Datos históricos

| Dato | Volumen | Qué hacer |
|---|---|---|
| `web_orders` con `delivery_type='delivery_own'` | 4.456 | **Nada.** Son correctos para el motor legacy |
| `shipments` en `pending` sin `carrier_id` | 409 | **Nada en esta épica.** Propón un backfill acotado y reversible, o déjalos y arranca limpio |
| 24 tarifas del restaurante con `destination_city=''` | 24 | Migrar a zonas **sólo** cuando esa organización pase a `zones`, y con el mapeo barrio→zona validado por el comerciante |
| `transport_carriers` de la org 2 (hotel) | 3 | **Nada.** Sin `api_provider`, quedan fuera del flujo nuevo |

**Ningún backfill masivo sin aprobación explícita.** Si propones uno, entrega también el script de reversión.

### 2.6 Excepción: los arreglos que sí van a todos

Tres cosas de la Fase 0 **no** van detrás del flag, porque hoy están rotas o son inseguras y arreglarlas no puede empeorar nada:

1. **Cerrar las políticas RLS públicas** (§5.1) — hoy filtran datos de todas las organizaciones. Verificar consumidores primero, pero el arreglo aplica global.
2. **Arreglar `/tracking`** (§5.2) — hoy devuelve "no encontrado" siempre; sólo puede mejorar.
3. **Rate limit en `/api/orders`** (§6.6) — con umbrales holgados para no afectar tráfico legítimo.

Todo lo demás va detrás del flag.

---

## 3. Resumen de la auditoría — 24 correcciones al plan

| # | Hallazgo | Repo | Impacto |
|---|---|---|---|
| **C1** | 4 políticas RLS `FOR SELECT TO public USING (true)` en `shipments`, `transport_carriers`, `delivery_attempts`, `proof_of_delivery` | BD | **Bloqueante de seguridad** |
| **C2** | `ApiCredentialsDialog` guarda `api_key` en `transport_carriers.metadata` en claro | erp | **Bloqueante de seguridad** |
| **C3** | `carrier_type` sólo acepta `own_fleet`/`third_party`; el plan dice `('external','partner')` | erp | GO-3/GO-13 devolverían 0 filas |
| **C4** | Dos rutas duplicadas crean el shipment de pedidos web | erp | GO-4/GO-16 arreglaría sólo una |
| **C5** | `shipping_labels` ya existe con `carrier_label_id`, `carrier_tracking`, `file_url` | BD | El plan inventa campos existentes |
| **C6** | Existe el backbone `integration_providers/connectors/connections/credentials/events` | erp | El plan reinventa las credenciales |
| **C7** | `products` no tiene peso ni dimensiones | BD | Bloquea la cotización real |
| **C8** | `posService.checkout` descarta `delivery_type` y `driver_id` | erp | GO-12 no basta |
| **C9** | Trigger `fn_recalc_invoice_totals` recalcula el total desde `invoice_items` | BD | GO-22 duplicaría el cobro |
| **C10** | `accounts_payable.supplier_id` NOT NULL FK a `suppliers`; carriers sin vínculo | BD | GO-23 no implementable |
| **C11** | `shipments.service_level` CHECK cerrado (5 valores) | BD | Códigos del proveedor no caben |
| **C12** | `api_provider`, `transport_events.source`/`actor_type` e índice de idempotencia **ya existen** | BD | Migraciones innecesarias |
| **C13** | `CheckoutDialog.tsx` 2.312 líneas | erp | Refactor previo obligatorio |
| **C14** | `/api/orders` fuerza todo envío a `delivery_own`; nunca emite `delivery_third_party` | **web** | **GO-4/15/16 no ejecutables** |
| **C15** | `/tracking` público roto: `getShipmentByTracking` pide 6 columnas inexistentes | **web** | "No encontrado" siempre |
| **C16** | `/api/orders` acepta `shipping`, `couponDiscount`, `promoDiscount` del cliente sin revalidar | **web** | El cliente decide cuánto paga |
| **C17** | Tres implementaciones del cálculo de envío que divergen | erp + web | Web y POS cotizan distinto |
| **C18** | Las tiendas de e-commerce no tienen ninguna tarifa ni transportadora | BD | No hay de dónde cotizar |
| **C19** | `lib/rateLimit.ts` existe y no se usa en ninguna ruta | **web** | `/api/orders` sin rate limit |
| **C20** | Los clientes Supabase del servidor del sitio caen a service role | **web** | RLS no se aplica ahí |
| **C21** | `OrderType` colapsa tres conceptos distintos en uno | **web** | Imposible expresar "domicilio por transportadora" |
| **C22** | El checkout **sí** tiene selector de tarifas, pero el `rateId` elegido **nunca se envía al servidor** | **web** | El backend no puede saber la transportadora |
| **C23** | `shipping_rates.destination_city` es un texto por fila, y en las 24 del restaurante está **vacío** | BD | Todas las tarifas aplican a todos los destinos |
| **C24** | `website_settings.available_delivery_types` ya trae `delivery_third_party` y el código lo ignora | **web** | La config existe; el bug es de cableado |

---

## 4. Estado real verificado

### 4.1 Constraints CHECK reales

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
web_orders.delivery_type          sin CHECK; valores usados: 'delivery_own', 'pickup'
```

### 4.2 Índices ya existentes

```
idx_shipments_carrier          (carrier_id)
idx_shipments_status           (organization_id, status)
idx_shipments_source           (source_type, source_id)
idx_shipments_tracking         (tracking_number)          ← NO es único
idx_transport_events_external_id  UNIQUE (reference_type, reference_id, external_event_id)
                                  WHERE external_event_id IS NOT NULL   ← idempotencia de webhooks, YA EXISTE
idx_transport_events_ref       (reference_type, reference_id, event_time DESC)
```

### 4.3 Catálogo geográfico — **ya existe, úsalo**

Tabla **`municipalities`**: `id, code, name, state_id, state_code, state_name, country_code` — **582 municipios colombianos en 33 departamentos**, con código DANE. Ya la consumen `/api/locations/cities` y `/api/locations/states` del sitio.

**Es la base para estructurar zonas de cobertura.** No inventes un catálogo nuevo ni sigas con texto libre.

### 4.4 Datos actuales

`transport_carriers`: 3 filas, todas de la org 2 (un hotel), todas con `api_provider = NULL`. **Las 4 transportadoras colombianas no existen** y **las orgs de e-commerce no tienen ninguna registrada**.

### 4.5 Archivos clave — `go-admin-erp`

```
src/lib/services/deliveryIntegrationService.ts      (30 KB)  createShipmentFromWebOrder, createShipmentFromPOSSale
src/lib/services/webOrderConfirmationService.ts     (26 KB)  confirmOrder → createShipment (ruta A)
src/lib/services/webOrderServerConfirmation.ts      (36 KB)  autoConfirmPaidOrder → insert inline (ruta B)
src/lib/services/posService.ts                     (109 KB)  checkout()
src/lib/services/shippingRatesService.ts            (13 KB)  simulateShipping()   ← cálculo canónico
src/lib/services/providerCredentials.server.ts       (9 KB)  ← patrón canónico de credenciales
src/lib/services/integrations/qrShared/webhookSecurity.ts    ← verifySignature/Timestamp, logWebhookEvent
src/components/pos/CheckoutDialog.tsx              (108 KB, 2312 líneas)
src/components/transporte/tarifas-envio/{ShippingRateDialog,ShippingRateCard,SimulatorDialog}.tsx
src/components/transporte/transportadoras/{CarrierDialog,ApiCredentialsDialog,CarriersList}.tsx
src/components/transporte/envios/{ShipmentDialog,ShipmentsList,shipmentLabelPrinter.ts}
src/app/app/transporte/{tarifas-envio,envios/[id]}/page.tsx
src/app/api/cron/reconcile-web-orders/route.ts               ← patrón de auth de cron
```
**No existe** `src/lib/services/integrations/carriers/` ni `src/app/api/transport/`.

### 4.6 Archivos clave — `goadmin-websites`

```
components/site/CheckoutWizard.tsx    (67 KB)  el checkout completo            ← C21, C22, C24
components/site/OrderTypeSelector.tsx  (2,4 KB) delivery | pickup | dine_in    ← C21
components/site/LocationCheckoutFields.tsx     país/departamento/ciudad (usa municipalities)
app/checkout/page.tsx                          carga website_settings y pasa checkoutSettings
app/api/orders/route.ts               (17 KB)  crea web_orders                 ← C14, C16, C19
app/api/checkout/init/route.ts        (31 KB)  inicia el pago
app/api/shipping/calculate/route.ts   (4,8 KB) cotiza envío en el sitio        ← C17
app/api/orders/[id]/tracking/route.ts (9,7 KB) ya usa service role y ya hace join a transport_carriers
app/tracking/page.tsx  →  lib/supabase/queries.ts::getShipmentByTracking       ← C15 (roto)
app/pedido/[id]/OrderTracker.tsx      (16 KB)
lib/supabase/server.ts                         createAdminClient / createPublicClient  ← C20
lib/rateLimit.ts                               existe, sin uso                 ← C19
```

---

## 5. FASE 0 — Bloqueante de seguridad

### 5.1 C1 — Políticas RLS abiertas al público

| tabla | política | cmd | roles | qual |
|---|---|---|---|---|
| `shipments` | `shipments_public_read` | SELECT | `{public}` | `true` |
| `transport_carriers` | `transport_carriers_public_read` | SELECT | `{public}` | `true` |
| `delivery_attempts` | `delivery_attempts_public_read` | SELECT | `{public}` | `true` |
| `proof_of_delivery` | `proof_of_delivery_public_read` | SELECT | `{public}` | `true` |

Con la anon key (pública, va en el bundle del sitio) cualquiera lee **todos los envíos de todas las organizaciones** —nombre, teléfono, dirección, coordenadas, valor declarado— y **todas las transportadoras**, incluidas `metadata` (donde hoy irían las API keys) y `api_credentials_ref`.

**Buena noticia: probablemente nadie las necesita.** Los dos consumidores públicos ya usan service role del lado servidor (`app/api/orders/[id]/tracking/route.ts` y `lib/supabase/queries.ts::getShipmentByTracking`).

**Pasos:**
1. Con un subagente, confirma que **nada** en `goadmin-websites` lee esas tablas con el **browser client** (`lib/supabase/client.ts`).
2. Si no hay consumidores anónimos → **elimina las 4 políticas**. Escenario esperado.
3. Si aparece alguno, reemplázalo antes por una `SECURITY DEFINER` acotada:
   ```
   fn_public_track_shipment(p_tracking_number text, p_contact_last4 text)
     → shipment_number, status, expected_delivery_date, carrier_name,
       external_tracking_url, eventos públicos (event_type, event_time, location_text)
   ```
4. Corre `get_advisors` (security) después.
5. **Aceptación**: con la anon key, `select * from shipments` → 0 filas; `select api_credentials_ref, metadata from transport_carriers` → 0 filas; `/tracking` y `/pedido/[id]` siguen funcionando.

### 5.2 C15 — La página pública `/tracking` está rota

`lib/supabase/queries.ts::getShipmentByTracking` selecciona columnas que **no existen**:

| Selecciona | Real |
|---|---|
| `sender_city`, `sender_department` | *(no existen)* |
| `receiver_city`, `receiver_department` | `delivery_city`, `delivery_department` |
| `total_weight_kg` | `weight_kg` |
| `total_packages` | `package_count` |

Y en `proof_of_delivery` pide `receiver_name`, `relationship`, `confirmed_at`; las reales son `recipient_name`, `recipient_relationship`, `delivered_at`.

El select falla → devuelve `null` → **"envío no encontrado" para cualquier guía**. Corrige y añade test. Además `.single()` sobre `tracking_number` (índice no único) → `.maybeSingle()` con `order('created_at', {ascending:false}).limit(1)`.

### 5.3 C2 + C6 — Credenciales: usa el backbone existente

`ApiCredentialsDialog.tsx` escribe `api_key`, `api_username`, `sandbox_mode`, `custom_config` en `carrier.metadata`. El diálogo dice "se almacenan de forma segura" — **es falso**.

El patrón canónico ya existe:
```
integration_providers → integration_connectors → integration_connections → integration_credentials
                                                                         → integration_events
```
- `integration_connections`: `organization_id`, `connector_id`, `branch_id`, `environment`, `country_code`, `status`, `settings`, salud (`last_health_check_at`, `last_error_at`, `error_count_24h`).
- `integration_credentials`: `connection_id`, `credential_type`, `purpose`, `secret_ref`, `key_prefix`, `status`, `expires_at`, `rotated_at`.
- Lectura sólo servidor: lee `src/lib/services/providerCredentials.server.ts` (`getServiceClient()` + `assertServerOnly()`) antes de escribir nada.

> **⚠️ Incidente abierto — leer antes de guardar cualquier credencial.**
> `integration_credentials` tiene hoy una política `Allow anon select … USING (true)` con rol `{public}`: **su columna `secret_ref` es legible con la anon key pública**. Ahí viven, en claro, 16 credenciales de Wompi de 4 organizaciones (3 en producción, nunca rotadas). Hay otras tres políticas iguales sobre `integration_connections`, `integration_connectors` y `organization_payment_methods`.
>
> **No guardes ni una llave de transportadora hasta cerrar esas políticas Y mover los secretos a Vault.** Guardarlas hoy en esa tabla es publicarlas.

#### Dónde va el secreto: Vault, no la tabla

El backbone `integration_*` es el sitio correcto para **indexar** la credencial (conexión, propósito, rotación, estado, búsqueda del secreto de webhook). Lo que está mal es que `secret_ref` —una columna cuyo nombre promete *referencia*— contenga el secreto literal.

**`supabase_vault` 0.3.1 ya está instalado** en este proyecto (schema `vault`), con `create_secret` y `update_secret`, y con los permisos correctos: sólo `service_role` tiene `SELECT`; `anon` y `authenticated` no tienen ninguno. Ya hay 3 secretos guardados ahí (`crm_cron_secret`, `crm_app_url`, `AI_INTERNAL_SECRET`), así que el patrón ya está adoptado en el proyecto — sólo falta extenderlo.

```
integration_credentials.secret_ref  →  uuid de vault.secrets.id   (la referencia que el nombre promete)
vault.secrets                       →  el valor, cifrado en reposo
integration_credentials.key_prefix  →  primeros caracteres, no secreto, para mostrarlo en la UI
```

Esto es exactamente lo que el propio código anticipa: la cabecera de `providerCredentials.server.ts` dice que si los secretos se mueven a Vault (`fn_get_provider_secret` / `fn_set_provider_secret`), **ese sería el único archivo a cambiar**. Impleméntalo tal cual.

**Pasos:**
1. **Cerrar el agujero primero** (§5.1): `DROP POLICY "Allow anon select integration_credentials"` + `REVOKE ALL ON integration_credentials FROM anon`. Sin esto, nada de lo demás importa.
2. Crear las dos funciones `SECURITY DEFINER` en `public`, con `SET search_path = ''`, `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` y `GRANT EXECUTE TO service_role`:
   - `fn_set_provider_secret(p_connection_id uuid, p_purpose text, p_value text) RETURNS uuid` — llama a `vault.create_secret`/`vault.update_secret`, escribe el uuid en `secret_ref`, actualiza `key_prefix` y `rotated_at`.
   - `fn_get_provider_secret(p_connection_id uuid, p_purpose text) RETURNS text` — resuelve el uuid y devuelve el valor desde `vault.decrypted_secrets`.
   Nombre del secreto en el vault, único y legible: `carrier_<org_id>_<provider>_<purpose>` (p. ej. `carrier_113_servientrega_api_key`).
3. Adaptar `providerCredentials.server.ts` para leer por esas funciones, y que `carrierIntegrationService` sea el único consumidor nuevo. Server-only en ambos casos.
4. Registrar vía MCP los 4 proveedores en `integration_providers` y sus connectors en `integration_connectors` (`capabilities = {"pull":true,"push":true,"webhooks":true,"quote":true,"label":true}`, `supported_countries = {CO}`).
5. `transport_carriers.api_credentials_ref` pasa a guardar el **uuid de `integration_connections.id`**. Documéntalo.
6. Reescribir `ApiCredentialsDialog` para que llame a `POST /api/transport/carriers/[id]/credentials` (service-role) y nunca toque `metadata`. El GET devuelve sólo `key_prefix`, `status`, `environment` — **nunca el secreto**.
7. Verificar con el MCP que no haya credenciales en `transport_carriers.metadata` en producción.
8. **Sólo entonces** guardar la primera llave de transportadora. Las 16 de Wompi se migran por el mismo camino, ya rotadas, como tarea aparte del incidente.

**Descartadas, y por qué:**
- **Variables de entorno (Vercel)**: las credenciales de transportadora son **por organización** —cada comercio tiene su propio contrato con Servientrega—, así que no caben en config de plataforma.
- **`integration_credentials` con el secreto en claro y la RLS cerrada**: es el mínimo aceptable si hay prisa, pero deja el secreto legible en dumps, backups y el panel de Supabase, y a una política mal puesta de repetir este incidente.
- **`provider_configs.credentials`**: su CHECK de `category` no admite logística, guarda el secreto en claro igual, y su RLS deja leerlo a **cualquier miembro autenticado de la organización** — un cajero incluido.

**Sé honesto sobre el alcance de Vault**: protege contra dumps, backups y errores de RLS. **No** protege contra alguien que tenga la `service_role` key. Esa sigue siendo el activo a cuidar.

### 5.4 Resto de la Fase 0

- **0.5** Seed de las 4 transportadoras para las orgs 113 y 135 (`carrier_type='third_party'`, `service_type='cargo'`, `api_provider`, `tracking_url_template`).
- **0.6** Consolidar las dos rutas duplicadas de creación de shipment web → §7.1.
- **0.7** Peso y dimensiones de producto (C7) → §8.2. **Pregunta antes de implementar.**

---

## 6. FASE 1 — Checkout web: envío propio + terceros, con tarifas bien estructuradas

> **Ésta es la fase con más impacto de negocio y la que habilita GO-4.** Es un PR propio en `goadmin-websites` más una migración de esquema.
>
> **Todo lo de esta fase va detrás del flag `website_settings.shipping_engine` (§2.2).** Con `'legacy'` —el valor por defecto de las 83 organizaciones— el checkout se comporta exactamente como hoy. Cada `if` nuevo lleva su `else` con el código actual sin tocar. Revisa la checklist de regresión de §2.4 antes y después.

### 6.1 El diagnóstico: no falta la funcionalidad, está a medio cablear

Cuatro piezas ya existen y no se comunican entre sí:

| Pieza | Estado |
|---|---|
| `website_settings.available_delivery_types` | ✅ existe. **Org 113 ya tiene `{delivery_own, delivery_third_party}`** |
| Selector de tarifas en el checkout | ✅ existe (`CheckoutWizard.tsx` líneas 1085-1110, radios con nombre, costo y `carrier_name`) |
| `/api/shipping/calculate` | ✅ existe y **ya hace join a `transport_carriers`**, devuelve `carrier_name` |
| `/api/orders` | ❌ **descarta todo eso** y guarda `delivery_own` siempre |

**El eslabón roto es concreto (C22):** el checkout guarda `selectedShippingRate` en estado local, pero el payload enviado a `/api/orders` sólo lleva `shipping` (el número). **El `rateId` y el `carrierId` nunca cruzan al servidor.** Por eso el backend no puede saber si el envío es propio o de un tercero, y cae al `delivery_own` por defecto.

**Y el modelo mental está colapsado (C21):**

```
OrderType = 'delivery' | 'pickup' | 'dine_in'     ← modo de pedido (heredado del restaurante)
web_orders.delivery_type = 'pickup' | 'delivery_own' | 'delivery_third_party'   ← método de entrega
shipping_rates                                    ← tarifa concreta
```

`CheckoutWizard` tiene **un solo** estado (`orderType`) para las tres cosas, y además `hasDelivery` colapsa `delivery_own || delivery_third_party` en un booleano — así que aunque la organización active los dos, el cliente ve una sola opción "Domicilio".

**Hay que separar los tres conceptos.**

### 6.2 Modelo de datos: estructurar las tarifas

#### El problema actual

- **`destination_city` es un texto por fila.** Para cubrir 24 barrios hacen falta 24 filas. Y para cubrir Colombia harían falta 582.
- **Peor: en las 24 filas del restaurante `destination_city` está vacío (`''`).** El filtro de `/api/shipping/calculate` hace `if (rate.destination_city)` → cadena vacía es falsy → **las 24 tarifas de barrio se muestran a todo el mundo, sin importar la dirección** (C23). El cliente de Envigado ve la tarifa de Belén.
- **No hay forma explícita de decir "esta tarifa es domicilio propio" vs "esta tarifa es transportadora"**, salvo inferirlo de `carrier_id`.
- `origin_zone` / `destination_zone` son texto libre sin catálogo.
- `estimated_transit_days` existe pero está NULL en todas.
- No hay nombre ni descripción para mostrar al cliente, ni orden de presentación.

#### La estructura propuesta

**Todo aditivo: no borres columnas.** Las existentes quedan en desuso, migradas y luego marcadas como deprecadas.

**a) Zonas de cobertura** (reemplazan `destination_city`/`destination_zone`)

```sql
CREATE TABLE shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL,
  name text NOT NULL,                 -- "Medellín y Área Metropolitana", "Nacional", "Costa Caribe"
  code text,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- Cobertura: una zona agrupa N ubicaciones, a cualquier nivel de granularidad
CREATE TABLE shipping_zone_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  country_code text NOT NULL DEFAULT 'COL',
  state_code text,                    -- departamento; NULL = todo el país
  municipality_code text,             -- código DANE; NULL = todo el departamento
  neighborhood text,                  -- barrio, sólo para domicilio propio urbano
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_shipping_zone_locations_lookup
  ON shipping_zone_locations(country_code, state_code, municipality_code);
```

`state_code` y `municipality_code` referencian **`municipalities`** (582 municipios, 33 departamentos, código DANE) — el catálogo que ya usa `/api/locations/cities`. Nada de texto libre.

Resolución de zona, de lo más específico a lo más general: barrio → municipio → departamento → país. La primera coincidencia gana.

**b) Columnas nuevas en `shipping_rates`**

```sql
ALTER TABLE shipping_rates
  ADD COLUMN delivery_kind text NOT NULL DEFAULT 'own'
    CHECK (delivery_kind IN ('own','carrier','pickup_point')),   -- explícito, no inferido de carrier_id
  ADD COLUMN zone_id uuid REFERENCES shipping_zones(id),
  ADD COLUMN public_name text,                 -- lo que ve el cliente: "Envío nacional 3-5 días"
  ADD COLUMN public_description text,          -- "Entrega por Servientrega con guía rastreable"
  ADD COLUMN sort_order integer DEFAULT 0,
  ADD COLUMN min_order_amount numeric,         -- tarifa disponible desde $X
  ADD COLUMN max_order_amount numeric,
  ADD COLUMN transit_days_min integer,         -- reemplaza el estimated_transit_days único
  ADD COLUMN transit_days_max integer,
  ADD COLUMN cutoff_time time,                 -- "pedidos antes de las 14:00 salen hoy"
  ADD COLUMN available_weekdays smallint[];    -- 1..7; NULL = todos
CREATE INDEX idx_shipping_rates_zone ON shipping_rates(zone_id);
CREATE INDEX idx_shipping_rates_org_active
  ON shipping_rates(organization_id, is_active) WHERE is_active;
```

Invariante: `delivery_kind='carrier'` ⟹ `carrier_id IS NOT NULL`. Valídalo con un CHECK o un trigger.

**c) Migración de los datos existentes**

- Las 24 tarifas del restaurante (org 120): crea una zona por cada barrio, o mejor **una zona "Medellín" con las ubicaciones de cada barrio** y deja las 24 tarifas apuntando a las zonas correctas. `delivery_kind = 'own'`. **Pregunta antes**: el mapeo barrio → zona lo tiene que validar el comerciante.
- `estimated_transit_days` → `transit_days_min`/`max`.
- `destination_city` no vacío → crea la zona correspondiente.

**d) Qué NO hacer**

- No borres `destination_city`, `destination_zone`, `origin_city`, `origin_zone` ni `estimated_transit_days` en esta fase. Márcalas como deprecadas en un comentario de columna y limpia en una migración posterior.
- No conviertas las 582 combinaciones en filas de `shipping_rates`. Las zonas existen justamente para eso.

### 6.3 UI de administración de tarifas (ERP)

`src/app/app/transporte/tarifas-envio/page.tsx` + `ShippingRateDialog.tsx` (21 KB) + `ShippingRateCard.tsx` + `SimulatorDialog.tsx`.

Cambios:
1. **Nueva pantalla de Zonas** (`transporte/zonas-envio`): CRUD de `shipping_zones` con selector de cobertura en cascada país → departamento → municipios (multi-select alimentado por `municipalities`), y campo libre de barrios para domicilio propio urbano. Muestra el conteo de municipios cubiertos.
2. **`ShippingRateDialog`**: primero se elige **tipo de entrega** (`domicilio propio` / `transportadora` / `punto de recogida`); si es transportadora, aparece el selector de `transport_carriers` (`carrier_type='third_party'`). Después zona, método de cálculo, importes, umbral de envío gratis, ventana de días y hora de corte, y el bloque "cómo lo ve el cliente" (`public_name`, `public_description`, `sort_order`) con **vista previa de la tarjeta tal como se verá en el checkout**.
3. **`SimulatorDialog`**: añade destino real (departamento + municipio del catálogo) y muestra qué zona resuelve y qué tarifas aplican. Hoy simula sin resolución de zona.
4. **Aviso de cobertura**: si una organización tiene `enable_shipping` y **cero tarifas**, muéstralo como advertencia con enlace a crear la primera. Es el estado actual de las dos tiendas y nadie se ha enterado.

### 6.4 Checkout web: separar los tres conceptos

**a) Estado**

```ts
type OrderMode = 'delivery' | 'pickup' | 'dine_in';        // modo de pedido (UI)
type DeliveryMethod = 'own' | 'carrier' | 'pickup_point';  // método de entrega

const [orderMode, setOrderMode] = useState<OrderMode>(...);
const [selectedRate, setSelectedRate] = useState<ShippingRateOption | null>(null);
// deliveryMethod se DERIVA de selectedRate.delivery_kind — no es un estado aparte
```

Deja de usar `hasDelivery = includes('delivery_own') || includes('delivery_third_party')`. `available_delivery_types` filtra **qué tarifas se ofrecen**, no si aparece el botón "Domicilio".

**b) Flujo en pantalla**

1. **Modo de pedido** — sólo si hay más de uno (comportamiento actual, correcto).
2. Si es domicilio: **dirección primero**, con `LocationCheckoutFields` (país → departamento → municipio del catálogo). Hoy la cotización se dispara con `customerData.city` como texto libre y sólo si tiene ≥ 3 caracteres; pásalo a `municipality_code`.
3. **Opciones de envío** — se cotizan al tener el destino, agrupadas y todas visibles:
   ```
   ENTREGA LOCAL
   ○ Domicilio Medellín · hoy antes de las 8 p.m. ............ $ 8.000
   ENVÍO NACIONAL
   ○ Servientrega Estándar · 3-5 días hábiles ............... $ 14.900
   ○ Coordinadora Express · 1-2 días hábiles ............... $ 23.400
   ○ Envía Económico · 5-8 días hábiles ..................... $ 11.200
   RECOGER EN TIENDA
   ○ Sede Laureles · listo en 2 horas ........................ Gratis
   ```
   Cada opción muestra `public_name`, días de tránsito, transportadora y precio. Badges "más económico" / "más rápido". Skeleton por tarjeta mientras cotiza. Una transportadora que falle muestra "no disponible" sin bloquear al resto.
4. **Sin cobertura**: mensaje explícito ("aún no llegamos a Leticia") con alternativa de recoger en tienda o contacto, en lugar de caer silenciosamente al flat rate de $10.000.
5. **Fallback**: si la organización no tiene zonas ni tarifas, se usa `shipping_flat_rate` como hoy, **pero con un aviso en el panel del ERP** de que está sin configurar.

**c) Payload — el arreglo de C22**

```ts
orderPayload.deliveryMode = orderMode;               // 'delivery' | 'pickup' | 'dine_in'
orderPayload.shippingRateId = selectedRate?.id;      // ← esto es lo que falta hoy
orderPayload.carrierId = selectedRate?.carrier_id;   // ← y esto
orderPayload.shipping = selectedRate?.cost;          // informativo; el servidor recalcula
```

**d) `/api/orders` — deriva el tipo de entrega del servidor**

```ts
// NO: delivery_type: deliveryType === 'delivery' ? 'delivery_own' : ...
// SÍ: resolver desde la tarifa elegida, releída de la BD
const rate = shippingRateId ? await getRate(shippingRateId, organizationId) : null;

const deliveryType =
  deliveryMode === 'pickup'          ? 'pickup' :
  rate?.delivery_kind === 'carrier'  ? 'delivery_third_party' :
                                       'delivery_own';

const deliveryFee   = rate ? recalcRateCost(rate, { subtotal, weight, municipalityCode }) : flatRate;
const deliveryPartner = rate?.carrier?.code ?? null;
```

Y guarda `carrier_id` explícito. **Propón añadir `web_orders.carrier_id uuid REFERENCES transport_carriers(id)`**: es más limpio que el matching por texto de GO-15, que quedaría sólo para pedidos antiguos y para orígenes externos. **Pregunta antes de añadir la columna.**

Verifica también que la tarifa pertenezca a la organización del pedido — es un id que viene del cliente.

### 6.5 C16 — Revalidar importes en el servidor

Hoy `subtotal` **sí** se recalcula desde `items` (bien), pero `shipping`, `couponDiscount` y `promoDiscount` entran tal cual desde el body al `calculatedTotal` y a `delivery_fee`. Un cliente puede enviar `shipping: 0`.

Con guías reales esto pasa de descuadre a **pérdida directa**: el costo de la guía es real y el ingreso es manipulable. En el mismo PR:
- recalcula el envío en el servidor desde `shippingRateId` (§6.4d);
- revalida cupones y promociones contra la BD;
- rechaza el pedido si el total del cliente difiere del recalculado más allá del redondeo.

### 6.6 C19 — Rate limit

`lib/rateLimit.ts` existe y **no se usa en ninguna ruta**. Aplícalo al menos a `/api/orders` y `/api/checkout/init`, por IP y por email. Con 4.031 pedidos fallidos, esas dos rutas están expuestas.

### 6.7 C17 — Un solo cálculo de envío

| Dónde | Considera | Le falta |
|---|---|---|
| `shippingRatesService.simulateShipping` (ERP) | peso volumétrico, `dimensional_factor`, `insurance_percent`, los 5 `calculation_method`, `min_charge`, `fuel_surcharge` | — (la más completa) |
| `/api/shipping/calculate` (web) | `base_rate`, `rate_per_kg`, `fuel_surcharge`, `min_charge`, `free_shipping_threshold` | **volumétrico, dimensional, volumen, percentage, seguro** |
| `CheckoutDialog` (POS) | llama a `simulateShipping` con `weight_kg: 1` fijo | dimensiones reales |

Para la misma tarifa dan números distintos. Además el `SERVICE_LEVEL_ORDER` de la ruta web incluye **`overnight`** (no existe en el CHECK) y **le falta `next_day`** (cae a prioridad 99).

**Acción**: una sola fuente. Extrae el cálculo a un módulo compartido, o expón `POST /api/transport/quote` en el ERP y que el sitio lo consuma. **Propón la opción y pregunta antes de mover código entre repos.**

### 6.8 C20 — Service role por defecto en el servidor del sitio

`createServerSupabaseClient`, `createPublicClient` y `createAuthClient` usan `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`. En producción, **todo el servidor del sitio ignora RLS**: el aislamiento depende de que cada query filtre por `organization_id`.

No lo refactorices en esta épica, pero: **(a)** anótalo como riesgo, **(b)** en el código nuevo filtra siempre por el `organization_id` del contexto (`lib/get-org-context.ts`), **nunca** del body, y **(c)** propón un issue aparte.

### 6.9 Criterios de aceptación de la Fase 1

- [ ] Una organización puede crear una zona "Medellín" con sus municipios y otra "Nacional", y asignar tarifas distintas a cada una.
- [ ] Un cliente de Envigado ve la tarifa de Envigado y **no** las de los demás barrios (hoy ve las 24).
- [ ] El checkout muestra a la vez opciones de **domicilio propio** y de **transportadora**, agrupadas y con días de entrega.
- [ ] Elegir una opción de transportadora produce `web_orders.delivery_type = 'delivery_third_party'` + `delivery_partner = <code>` (+ `carrier_id` si se aprueba la columna).
- [ ] Elegir domicilio propio sigue produciendo `delivery_own`. El restaurante no cambia en nada.
- [ ] Enviar `shipping: 0` manipulado desde el cliente **no** altera lo que se cobra.
- [ ] Un destino sin cobertura muestra un mensaje claro, no un flat rate silencioso.
- [ ] Una organización sin tarifas ve una advertencia en el ERP.
- [ ] `/api/orders` y `/api/checkout/init` responden 429 al superar el límite.
- [ ] La misma tarifa cotiza igual en el sitio, en el POS y en el simulador del ERP.

---

## 7. GO-4 — Pedidos web (5 pts) · depende de la Fase 1

### 7.1 C4 — Consolidar las dos rutas duplicadas (antes de GO-15/GO-16)

| | Ruta A | Ruta B |
|---|---|---|
| Archivo | `webOrderConfirmationService.ts:396` → `deliveryIntegrationService.createShipmentFromWebOrder` | `webOrderServerConfirmation.ts:769-830` (insert inline) |
| Tracking | `generateTrackingNumber(orgId)` | `` `TRK-${Date.now()}-${random}` `` |
| `carrier_id` | `null` | `null` |
| `shipment_items` | **no los crea** | **no los crea** |
| Campos extra | — | `delivery_department`, `postal_code`, lat/lng, país en metadata |
| Se dispara desde | confirmación manual | auto-confirmación por pago + cron `reconcile-web-orders` |

Unifica en **una** `createShipmentFromWebOrder(order, opts)` con el superconjunto de campos de B; `webOrderServerConfirmation.ts` la llama. Además:
- `getShipmentByWebOrderId`: `.single()` → `.maybeSingle()` con `order('created_at').limit(1)`.
- Crea `shipment_items` también en la ruta web.

### 7.2 GO-15 — Resolver la transportadora

Con la Fase 1 desplegada, los pedidos nuevos traen `carrier_id` (o `delivery_partner` = `code`), así que la resolución es directa. El matching por texto queda como respaldo para pedidos antiguos y orígenes externos:
1. `code` exacto (case-insensitive); 2. `name` normalizado (sin tildes/lowercase/sin `s.a.s`); 3. alias en `transport_carriers.metadata.aliases`.

Si no resuelve: `carrier_id = null`, `metadata.carrier_resolution = 'unresolved'`, notificar al operador, permitir asignación manual. **Nunca falles la confirmación del pedido.**

### 7.3 GO-16 — Guía automática

Asíncrona respecto a la confirmación, idempotente y reutilizable por el cron de GO-18 para reintentos. Registra el intento en `integration_events`.

### 7.4 Datos históricos

Los 409 shipments existentes están clasificados como `delivery_own` y llevan meses en `pending`. **No los migres en masa sin preguntar.** Propón un backfill acotado y reversible, o arranca limpio desde la fecha de despliegue.

---

## 8. GO-3 — Checkout POS (8 pts) · corregido

### 8.1 GO-12 — Migración de `sales`

```sql
ALTER TABLE sales ADD COLUMN delivery_type text
  CHECK (delivery_type IN ('pickup','delivery_own','delivery_third_party'));
ALTER TABLE sales ADD COLUMN carrier_id uuid REFERENCES transport_carriers(id);
CREATE INDEX idx_sales_carrier ON sales(carrier_id) WHERE carrier_id IS NOT NULL;
```

**C8 — la migración sola no sirve.** `posService.checkout()` recibe `delivery_type`, `delivery_info`, `driver_id` y `shipping_fee` desde `CheckoutDialog` (~882-892) pero **sólo persiste `delivery_fee`** (~1602-1655). Persiste también `delivery_type`, `carrier_id` y `driver_id`.

Fuente de verdad del vínculo venta↔envío: `shipments.source_type='sale' AND source_id = sale.id`. `sales.carrier_id` es denormalización para reportes.

### 8.2 GO-13 — Selector (filtro corregido)

```ts
supabase.from('transport_carriers')
  .select('id, name, code, api_provider, tracking_url_template, metadata')
  .eq('organization_id', orgId)
  .eq('carrier_type', 'third_party')      // NO 'external'/'partner'
  .in('service_type', ['cargo', 'both'])
  .eq('is_active', true)
  .not('api_provider', 'is', null);
```

Distingue **con integración** (cotiza y genera guía por API) de **sin integración** (fallback a `shipping_rates` con `show_on_pos = true`). Ambos deben funcionar: el restaurante depende del segundo.

**C7 — bloqueante.** `products` no tiene peso ni dimensiones; hoy se cotiza con `weight_kg: 1` hardcodeado.
- **Opción A (correcta)**: añadir `weight_kg`, `length_cm`, `width_cm`, `height_cm` a `products` + UI en inventario. Excede el scope → **pregunta y propón el issue**.
- **Opción B (puente)**: peso por defecto por organización, visible y **editable en el checkout**, con advertencia. No lo presentes como exacto.

**C13 — refactor previo.** Extrae `src/components/pos/checkout/DeliverySection.tsx` + `useDeliveryQuote.ts` **antes** de añadir el selector, en commit separado y sin regresión. Reusa el mismo modelo de tres conceptos de §6.4.

### 8.3 GO-14 — Shipment + guía

Extiende `createShipmentFromPOSSale()` con `carrierId`, `serviceLevel` (CHECK cerrado; el código crudo del proveedor va a `metadata`), `carrierServiceCode`, dimensiones, `declaredValue`, `codAmount`.

1. Cerrar la venta — **nunca debe fallar por la transportadora**.
2. Crear el shipment con `carrier_id` y dimensiones, `status='pending'`.
3. `POST /api/transport/shipments/[id]/guide` (server-side → `carrierIntegrationService.createGuide`).
4. Resultado: `shipments.external_tracking_url`; **la guía va a `shipping_labels`** (`carrier_id`, `carrier_label_id`, `carrier_tracking`, `file_url`, `format`, `barcode_value`, `label_number`) — **no inventes columnas en `shipments`**; `transport_events` con `event_type='guide_created'`, `source='api'`.
   - `shipments.tracking_number` sigue siendo el consecutivo interno; la guía vive en `shipping_labels.carrier_tracking`. Si necesitas búsqueda directa, añade `shipments.carrier_tracking_number` + índice, pero decide **una** fuente de verdad y documéntala.
5. Si la guía falla: venta y shipment quedan creados, `metadata.guide_error`, toast no bloqueante y **"Reintentar generación de guía"** en el detalle del envío.
6. Imprime con `shipmentLabelPrinter.ts` si hay impresora.

---

## 9. GO-2 — Servicio base + adaptadores (13 pts) · corregido

### 9.1 Estructura

```
src/lib/services/integrations/carriers/
  types.ts   carrierIntegrationService.ts   statusMapper.ts
  coordinadoraService.ts  enviaService.ts  servientregaService.ts  interrapidisimoService.ts
  __tests__/
```
Sigue la convención de `integrations/wompi/` y `integrations/bold/` — léelos antes.

### 9.2 Interfaz

```ts
export interface CarrierAdapter {
  readonly provider: CarrierProvider;
  quoteRate(input: QuoteInput): Promise<QuoteResult[]>;
  createGuide(input: CreateGuideInput): Promise<GuideResult>;
  trackShipment(trackingNumber: string): Promise<TrackResult>;
  cancelGuide(trackingNumber: string): Promise<CancelResult>;
  parseWebhook(req: NormalizedWebhookRequest): Promise<CarrierWebhookEvent[]>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
}

interface GuideResult {
  carrierTrackingNumber: string;
  carrierLabelId?: string;
  labelUrl?: string;
  labelFormat?: 'pdf' | 'png' | 'zpl';
  cost: number;
  currency: string;
  breakdown?: { shipping?: number; insurance?: number; fuel_surcharge?: number; cod_fee?: number };
  estimatedDeliveryDate?: string;
  rawResponse: unknown;
}
```

**Reglas:**
- **Server-only**: `import 'server-only'` + `assertServerOnly()`. UI y sitio lo consumen por route handlers.
- Credenciales sólo vía `integration_connections` (§5.3). Nunca `transport_carriers.metadata`.
- Sandbox/producción por `integration_connections.environment`.
- Errores tipados: `CarrierAuthError`, `CarrierValidationError`, `CarrierRateLimitError`, `CarrierUnavailableError`, `CarrierNotFoundError`.
- Reintentos sólo en `Unavailable`/`RateLimit`, backoff exponencial con jitter, máx. 3, timeout duro (10 s cotización / 20 s guía). **`createGuide` con clave de idempotencia por `shipment_id`.**
- Cada llamada saliente en `integration_events` (`direction='outbound'`, `correlation_id` = shipment).
- **Sin secretos en logs**: redacta `Authorization`, `api_key`, `password`.

### 9.3 GO-7 … GO-11

- **GO-7**: `types.ts` + factory `getCarrierAdapter(orgId, carrierId)` + `statusMapper.ts` + errores + tests.
- **GO-8/9/10/11**: **busca la documentación oficial vigente antes de escribir cada adaptador** y cítala en la cabecera (URL, fecha, versión). No inventes endpoints ni campos.
- Si un proveedor no tiene API pública o exige contrato inexistente: `throw new CarrierUnavailableError('...')` documentado. **No lo mockees.** Mejor 2 adaptadores reales que 4 aparentes.
- Tests con fixtures (éxito, auth, validación, rate limit, timeout). Nunca la API real en CI.

---

## 10. GO-5 — Tracking en tiempo real (8 pts) · corregido

### 10.1 GO-19 — `carrier_tracking_status`

Catálogo a nivel de **proveedor**, no de organización:

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
RLS: lectura `authenticated`, escritura service-role. Seed por proveedor con los códigos reales.

Código desconocido: **no lo descartes** — inserta el evento con texto crudo, no toques `shipments.status`, registra el faltante (`integration_events.status='unmapped'`).

### 10.2 GO-17 — Webhook entrante

`src/app/api/transport/carriers/[provider]/webhook/route.ts` (`POST`).

- **`middleware.ts` del ERP protege las rutas**: añade el path al matcher público y **verifícalo con una petición real**.
- Reusa `verifyWebhookSignature` + `verifyWebhookTimestamp` + `getWebhookSecret` (`integration_credentials`, `purpose='events_secret'`). Si el proveedor sólo da token, guárdalo ahí y compara con `timingSafeEqual`.
- **`organization_id` desde la conexión/guía, nunca desde el payload.**
- **Idempotencia**: `idx_transport_events_external_id` ya existe. Violación de unicidad = éxito (`200`).
- `transport_events` con `source='carrier_webhook'`, `actor_type='carrier_webhook'`, `reference_type='shipment'`, `payload` crudo.
- Actualiza `shipments.status` sólo si hay mapeo y **el estado avanza** (`event_time` + `sort_order`; no retrocedas desde `delivered`).
- Al marcar `delivered`: `delivered_at` y propagación a `web_orders.status/delivered_at` cuando `source_type='web_order'` — **esto es lo que hoy no ocurre nunca**.
- `200` en < 3 s; notificaciones en background reusando `lib/email/send-delivery-notification.ts` y `send-order-status-email.ts` del sitio.
- Todo en `integration_events` (`direction='inbound'`).

### 10.3 GO-18 — Cron de polling

`src/app/api/cron/sync-shipments/route.ts` (`GET`), patrón exacto de `reconcile-web-orders/route.ts`:
```ts
if (!process.env.CRON_SECRET) return 500;
if (request.headers.get('authorization')?.replace('Bearer ','') !== process.env.CRON_SECRET) return 401;
```
Query: `carrier_id IS NOT NULL` y `status IN ('assigned','ready','picked','dispatched','in_transit','out_for_delivery')`.

- `limit` por ejecución (default 50, máx 200).
- Backoff con `metadata.last_tracked_at`; corta tras estado terminal o X días sin movimiento y notifica.
- Agrupa por `carrier_id` para reusar credenciales y respetar rate limits.
- Extrae `applyCarrierEvent(shipmentId, event)` compartido con el webhook.
- `vercel.json`: `{ "path": "/api/cron/sync-shipments", "schedule": "*/15 * * * *" }`. **Ya hay 13 crons** — verifica el límite del plan y **pregunta antes de reorganizar los existentes**.

### 10.4 GO-20 — UI de tracking

**ERP**: tarjeta de transportadora con guía, enlace a `external_tracking_url`, descarga de etiqueta, última sincronización, badge del origen del evento, y acciones "reintentar guía" / "sincronizar ahora" / "anular guía".

**Sitio**: arregla `/tracking` (§5.2); `app/api/orders/[id]/tracking/route.ts` **ya hace join a `transport_carriers`** — extiéndelo con guía y `external_tracking_url` en vez de reescribirlo; en `OrderTracker.tsx` añade guía copiable y enlace externo. Copy diferenciado: restaurante → "llega en ~35 min"; e-commerce → "entrega estimada 3-5 días hábiles · guía 123456 · Servientrega".

---

## 11. GO-6 — Costo real y contabilidad (5 pts) · corregido

Contexto: hoy se cobra **$10.000 fijo para toda Colombia** sin conocer el costo real de la guía. Ese es el punto de esta historia.

### 11.1 GO-21 — `shipment_costs`

```sql
CREATE TABLE shipment_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL,          -- el plan lo omitía; necesario para RLS
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
RLS estándar por `organization_members`. **Sin política `public_read`.**

### 11.2 GO-22 — Línea de envío — **verifica antes (C9)**

El trigger `fn_recalc_invoice_totals` recalcula `invoice_sales.subtotal` y `.total` como `SUM(total_line)`. **Añadir una línea "Costo de envío" cambia el total de la factura.**

1. Determina cómo se refleja hoy `sales.delivery_fee` en `invoice_sales.total` — compara con el MCP una venta con `delivery_fee > 0` contra su factura.
2. Si ya está incluido, la línea **duplica el cobro**.
3. El envío cobrado es **ingreso** y probablemente requiere IVA (`tax_code`, `tax_rate`, `tribute_id`, `unit_measure_id`, `standard_code_id`). No lo pongas en 0 sin confirmarlo — **pregunta**.
4. Test: venta con envío → `invoice_sales.total == subtotal + impuestos + envío`, **una sola vez**.

### 11.3 GO-23 — Asiento y CxP — **no implementable tal cual (C10)**

`accounts_payable.supplier_id` es `integer NOT NULL` FK a `suppliers`; `transport_carriers` no tiene vínculo.

1. `ALTER TABLE transport_carriers ADD COLUMN supplier_id integer REFERENCES suppliers(id);`
2. UI en `CarrierDialog`: "Proveedor asociado" (o crearlo desde ahí). Sin él no hay CxP → avísalo en la ficha.
3. Asiento:
   - `journal_entries`: `organization_id`, **`branch_id` NOT NULL** (desde el shipment), `entry_date`, `memo`, `source='shipment_cost'`, `source_id = shipment_id::text`, `currency_code`, `exchange_rate`.
   - `journal_lines`: `journal_entry_id`, `account_code` (text), `debit`/`credit`, `debit_base`/`credit_base`, `organization_id` NOT NULL, `cost_center_id` opcional.
   - **No hardcodees `5195-XX`**: cuentas configurables por organización. Si no hay patrón en finanzas, **para y pregunta**.
   - **Valida que cuadre** (`SUM(debit) = SUM(credit)`) antes de insertar.
4. `accounts_payable`: por guía o consolidada por factura de la transportadora — decide y documenta.
5. Idempotencia: `shipment_costs.journal_entry_id` / `.accounts_payable_id` como candado.

### 11.4 GO-24 — Reportes

Añade a `reportesFinancierosService.ts`: **ingreso por envío** (`SUM(sales.delivery_fee)`), **costo de envío** (`SUM(shipment_costs.cost_amount)`), **margen** y **margen %**, por transportadora y sucursal, con **alerta cuando el margen sea negativo**. Con $10.000 de flete plano y tarifas nacionales reales, esa alerta se va a disparar — es el hallazgo que justifica la épica.

---

## 12. UI/UX — deuda transversal del ERP

| Problema | Dónde | Acción |
|---|---|---|
| Dos sistemas de toast: `sonner` en POS vs `useToast()` en transporte | `CheckoutDialog.tsx` vs `app/app/transporte/**` | Unificar dentro del scope tocado |
| Sin skeletons, sólo `isLoading` booleano | `transporte/envios/page.tsx` y hermanas | Skeletons con la forma del contenido |
| Filtros en estado local: sin deep-link ni botón atrás | `envios/page.tsx` (8 filtros en `useState`) | Sincronizar con `searchParams` |
| Errores tragados en `console.warn` | `deliveryIntegrationService`, páginas de transporte | Estados de error visibles con reintento |
| Monolitos | `CheckoutDialog.tsx` 2.312 líneas, `envios/[id]/page.tsx` 39 KB, `pedidos-online/page.tsx` 66 KB, `CheckoutWizard.tsx` 67 KB | Extraer antes de añadir |
| Sin feedback en operaciones largas | cotización, generación de guía | Estados `quoting`/`generating` con cancelación |

**Ficha de transportadora** (ERP): badge de conexión (conectada / sandbox / sin credenciales / con error) desde `integration_connections`; botón **"Probar conexión"** → `healthCheck()`; nunca mostrar secretos (sólo `key_prefix`, última rotación, "reemplazar"); selector de proveedor con las 8 opciones del CHECK; campo "proveedor asociado" (§11.3).

**Accesibilidad** (carga `accessibility-a11y`): selector de tarifas navegable por teclado con `role="radiogroup"` + `aria-checked` (son tarjetas); carga con `aria-live="polite"`, errores con `aria-live="assertive"`; contraste AA en los badges de estado; nunca comunicar estado sólo por color; foco atrapado y devuelto en los diálogos nuevos.

---

## 13. Orden de ejecución — una fase por sesión

```
FASE 0  Seguridad (bloqueante)
  0.0  Proponer CLAUDE.md por repo                                                  [§0.4]
  0.1  Cerrar RLS pública (verificar consumidores anónimos primero)                 [§5.1]
  0.2  Arreglar /tracking del sitio: columnas inexistentes                          [§5.2]
  0.3  Credenciales → integration_connections + reescribir ApiCredentialsDialog     [§5.3]
  0.4  Seed de proveedores/connectors + transportadoras para orgs 113 y 135         [§5.4]
  0.5  Consolidar las 2 rutas de creación de shipment web                           [§7.1]
  0.6  Peso/dimensiones de producto — PREGUNTAR antes                               [§8.2]

FASE 1  Checkout web y tarifas estructuradas   (migración + PR en goadmin-websites + UI en ERP)
  1.1  Migración: shipping_zones, shipping_zone_locations, columnas de shipping_rates [§6.2]
  1.2  ERP: pantalla de Zonas + rediseño de ShippingRateDialog + simulador con destino[§6.3]
  1.3  Web: separar OrderMode / DeliveryMethod / tarifa; enviar shippingRateId       [§6.4]
  1.4  Web: /api/orders deriva delivery_type de la tarifa y recalcula importes       [§6.4d, §6.5]
  1.5  Web: rate limit en /api/orders y /api/checkout/init                           [§6.6]
  1.6  Unificar el cálculo de envío — PROPONER opción                                [§6.7]

GO-2   Servicio base + adaptadores  (GO-7 → GO-8/9/10/11)
GO-3   POS   (GO-12 → refactor DeliverySection → GO-13 → GO-14)
GO-4   Web   (GO-15 → GO-16)          ← requiere FASE 1 desplegada
GO-5   Tracking  (GO-19 → GO-17 → GO-18 → GO-20)
GO-6   Finanzas  (GO-21 → verificar fn_recalc_invoice_totals → GO-22 → supplier_id → GO-23 → GO-24)
```

---

## 14. Inventario de cambios — crear, cambiar, no tocar

Lista completa y verificada de lo que hay que tocar. **Nada fuera de esta lista sin preguntar.** La columna "Riesgo" indica el impacto sobre producción si sale mal.

### 14.1 Base de datos — CREAR (tablas nuevas)

| Tabla | Para qué | Fase | Riesgo |
|---|---|---|---|
| `shipping_zones` | Zonas de cobertura por organización | 1 | **Nulo** — tabla vacía, nadie la lee hasta activar el flag |
| `shipping_zone_locations` | Cobertura de cada zona (país/departamento/municipio/barrio) contra `municipalities` | 1 | Nulo |
| `carrier_tracking_status` | Mapeo estado externo → interno por proveedor | GO-19 | Nulo |
| `shipment_costs` | Costo real pagado a la transportadora | GO-21 | Nulo |

Las cuatro con RLS por `organization_id` vía `organization_members` (salvo `carrier_tracking_status`, que es catálogo: lectura `authenticated`, escritura service-role). **Ninguna con política `public_read`.**

**Filas nuevas (datos, no esquema):** `integration_providers` e `integration_connectors` para coordinadora / envia / servientrega / interrapidisimo; `transport_carriers` para las orgs que vayan a usarlas.

### 14.2 Base de datos — CAMBIAR (todo aditivo)

| Tabla | Columnas nuevas | Fase | Riesgo |
|---|---|---|---|
| `website_settings` | `shipping_engine text NOT NULL DEFAULT 'legacy'` | 1 | **Nulo** — el default preserva el comportamiento de las 83 orgs |
| `shipping_rates` | `delivery_kind` (DEFAULT `'own'`), `zone_id`, `public_name`, `public_description`, `sort_order`, `min_order_amount`, `max_order_amount`, `transit_days_min`, `transit_days_max`, `cutoff_time`, `available_weekdays` | 1 | **Bajo** — todas nullable; `delivery_kind='own'` describe correctamente las 24 filas existentes |
| `sales` | `delivery_type`, `carrier_id` | GO-12 | Bajo — nullable; las ventas históricas quedan en `NULL` |
| `transport_carriers` | `supplier_id integer REFERENCES suppliers(id)` | GO-23 | Nulo |
| `web_orders` | `carrier_id uuid REFERENCES transport_carriers(id)` | 1 | Nulo — **PREGUNTAR antes** (§6.4d) |
| `shipments` | `carrier_tracking_number text` + índice | GO-14 | Nulo — **sólo si se decide** que la guía necesita búsqueda directa (§8.3) |

**Índices nuevos:** `idx_sales_carrier`, `idx_shipping_rates_zone`, `idx_shipping_rates_org_active`, `idx_shipping_zone_locations_lookup`, `idx_shipment_costs_shipment`, `idx_shipment_costs_org`, `idx_shipment_costs_carrier`. Todos `CREATE INDEX` sobre tablas pequeñas o nuevas; sin bloqueo relevante. Si alguna tabla creciera, usa `CREATE INDEX CONCURRENTLY`.

### 14.3 Base de datos — CAMBIAR (políticas RLS)

| Acción | Objeto | Fase | Riesgo |
|---|---|---|---|
| **DROP** | `shipments_public_read` | 0 | **Medio** — verificar consumidores anónimos primero (§5.1) |
| **DROP** | `transport_carriers_public_read` | 0 | Medio — misma verificación |
| **DROP** | `delivery_attempts_public_read` | 0 | Bajo |
| **DROP** | `proof_of_delivery_public_read` | 0 | Bajo |
| **CREATE** | RLS de las 4 tablas nuevas | 1 / GO-19 / GO-21 | Nulo |
| **CREATE** (sólo si hace falta) | `fn_public_track_shipment` SECURITY DEFINER | 0 | Bajo |

### 14.4 Base de datos — NO TOCAR

- **Ningún `DROP COLUMN`.** `destination_city`, `destination_zone`, `origin_city`, `origin_zone` y `estimated_transit_days` quedan en desuso pero presentes. Márcalas con `COMMENT ON COLUMN ... IS 'deprecado: usar zone_id / transit_days_min|max'`.
- **Ningún `CHECK` nuevo sobre `web_orders.delivery_type`** (4.466 filas sin restricción hoy).
- **Ningún cambio a los `CHECK` existentes.** `shipments.service_level`, `transport_carriers.api_provider`, `transport_events.source`/`actor_type` ya cubren lo que hace falta (C12).
- **Módulo de pasajeros intacto**: `transport_fares`, `transport_routes`, `transport_stops`, `route_schedules`, `route_stops`, `vehicle_seats`, `vehicles`, `driver_credentials`, `manifest_shipments`, `transport_incidents`.
- **No toques** `invoice_sales`, `payments`, `accounts_receivable` ni el trigger `fn_recalc_invoice_totals` sin la verificación de §11.2.

### 14.5 Backend `go-admin-erp` — CREAR

| Archivo | Para qué | Fase |
|---|---|---|
| `src/lib/services/integrations/carriers/types.ts` | Interfaz `CarrierAdapter`, DTOs, errores tipados | GO-7 |
| `src/lib/services/integrations/carriers/carrierIntegrationService.ts` | Factory por `api_provider` + fachada (server-only) | GO-7 |
| `src/lib/services/integrations/carriers/statusMapper.ts` | Estado externo → interno | GO-7 |
| `.../carriers/{coordinadora,envia,servientrega,interrapidisimo}Service.ts` | Un adaptador por proveedor | GO-8..11 |
| `src/lib/services/shippingZonesService.ts` | CRUD de zonas + resolución destino → zona | 1 |
| `src/lib/services/shipmentCostService.ts` | Costo real, asiento y CxP | GO-21 |
| `src/lib/services/transport/applyCarrierEvent.ts` | Escritura compartida entre webhook y polling | GO-17 |
| `src/app/api/transport/carriers/[id]/credentials/route.ts` | Guardar credenciales con service-role | 0 |
| `src/app/api/transport/carriers/[provider]/webhook/route.ts` | Webhook entrante | GO-17 |
| `src/app/api/transport/shipments/[id]/guide/route.ts` | Generar / reintentar guía | GO-14 |
| `src/app/api/cron/sync-shipments/route.ts` | Polling cada 15 min | GO-18 |
| `src/app/api/transport/quote/route.ts` | Cotización única compartida con el sitio | 1 — **opcional, §6.7** |

### 14.6 Backend `go-admin-erp` — CAMBIAR

| Archivo | Cambio | Fase | Riesgo |
|---|---|---|---|
| `deliveryIntegrationService.ts` | Unificar `createShipmentFromWebOrder` (superconjunto de campos); `createShipmentFromPOSSale` acepta `carrierId`/dimensiones; `getShipmentByWebOrderId` → `.maybeSingle()`; crear `shipment_items` en la ruta web | 0.5 / GO-14 | **Medio** — toca el camino de creación de envíos en producción |
| `webOrderServerConfirmation.ts` | Borrar el insert inline (l. 769-830) y llamar a la función unificada | 0.5 | **Medio** — es el camino de auto-confirmación por pago |
| `webOrderConfirmationService.ts` | Usar la función unificada; asignar carrier y guía | 0.5 / GO-16 | Bajo |
| `posService.ts` | Persistir `delivery_type`, `carrier_id`, `driver_id` en el insert de `sales` | GO-12 | Bajo — sólo añade campos |
| `shippingRatesService.ts` | Resolución por zona, `delivery_kind`, `transit_days_min/max`; **mantener la rama legacy** | 1 | **Medio** — lo consume el POS |
| `trackingService.ts` | Mostrar eventos con `source='carrier_webhook'` | GO-20 | Bajo |
| `transportService.ts` | `supplier_id` en el CRUD de carriers | GO-23 | Bajo |
| `reportesFinancierosService.ts` | Ingreso, costo y margen de envío | GO-24 | Bajo — sólo suma métricas |
| `middleware.ts` | Añadir el path del webhook al matcher público | GO-17 | **Medio** — es el middleware de todo el ERP; verifica con petición real |
| `vercel.json` | Un cron nuevo | GO-18 | Bajo — **verifica el límite del plan (ya hay 13)** |

### 14.7 Backend `goadmin-websites` — CAMBIAR

| Archivo | Cambio | Fase | Riesgo |
|---|---|---|---|
| `lib/supabase/queries.ts` (`getShipmentByTracking`) | Corregir 6 nombres de columna + `.maybeSingle()` | 0 | **Nulo** — hoy está roto, sólo puede mejorar |
| `app/api/orders/route.ts` | Derivar `delivery_type` de la tarifa; recalcular envío y descuentos en servidor; aplicar rate limit; guardar `delivery_partner`/`carrier_id` | 1 | **Alto** — es la creación de pedidos. Detrás del flag; `else` = comportamiento actual |
| `app/api/shipping/calculate/route.ts` | Resolución por zona, `delivery_kind`, arreglar `SERVICE_LEVEL_ORDER` (`overnight` no existe, falta `next_day`); **mantener rama legacy** | 1 | **Alto** — alimenta el checkout de 83 sitios |
| `app/api/orders/[id]/tracking/route.ts` | Añadir guía y `external_tracking_url` al timeline existente | GO-20 | Bajo — ya hace join a `transport_carriers` |
| `app/api/checkout/init/route.ts` | Verificar que no pise `delivery_type`; propagar carrier si aplica | 1 | Medio |
| `lib/rateLimit.ts` | Empezar a usarlo (hoy es código muerto) | 1 | Bajo |

### 14.8 UI `go-admin-erp` — CREAR

| Componente / ruta | Para qué | Fase |
|---|---|---|
| `src/app/app/transporte/zonas-envio/page.tsx` + `src/components/transporte/zonas-envio/*` | CRUD de zonas con cobertura en cascada país → departamento → municipios (desde `municipalities`) | 1 |
| `src/components/pos/checkout/DeliverySection.tsx` | Sección de entrega extraída de `CheckoutDialog` | GO-13 |
| `src/components/pos/checkout/useDeliveryQuote.ts` | Cotización con debounce y `AbortController` | GO-13 |
| `src/components/transporte/envios/id/CarrierCard.tsx` | Transportadora, guía, tracking externo, costo vs cobrado, acciones | GO-20 |

### 14.9 UI `go-admin-erp` — CAMBIAR

| Componente | Cambio | Fase | Riesgo |
|---|---|---|---|
| `transportadoras/ApiCredentialsDialog.tsx` | **Reescritura**: deja de escribir en `metadata`, llama al route handler, nunca muestra secretos | 0 | Bajo — hoy no hay credenciales guardadas |
| `transportadoras/CarrierDialog.tsx` | Selector de `api_provider` con las 8 opciones del CHECK; campo "proveedor asociado" | 0 / GO-23 | Bajo |
| `transportadoras/CarriersList.tsx` | Badge de estado de conexión + "Probar conexión" | GO-2 | Bajo |
| `tarifas-envio/ShippingRateDialog.tsx` | Tipo de entrega primero, zona, campos públicos, ventana de días y hora de corte, vista previa | 1 | **Medio** — es la UI con la que el restaurante mantiene sus 24 tarifas |
| `tarifas-envio/ShippingRateCard.tsx` | Mostrar zona, tipo de entrega y días de tránsito | 1 | Bajo |
| `tarifas-envio/SimulatorDialog.tsx` | Destino real (departamento + municipio) y qué zona resuelve | 1 | Bajo |
| `app/app/transporte/tarifas-envio/page.tsx` | Aviso "sin tarifas configuradas"; agrupación por zona | 1 | Bajo |
| `pos/CheckoutDialog.tsx` | **Extraer `DeliverySection` primero** (commit aparte, sin regresión), luego añadir selector de transportadora | GO-13 | **Alto** — 2.312 líneas, es el cobro del POS |
| `app/app/transporte/envios/[id]/page.tsx` + `ShipmentTimeline.tsx` | Tarjeta de transportadora y origen del evento | GO-20 | Bajo |
| `pos/pedidos-online/DeliveryTrackingCard.tsx` | Mismo timeline para pedidos web | GO-20 | Bajo |

### 14.10 UI `goadmin-websites` — CREAR / CAMBIAR

| Componente | Acción | Fase | Riesgo |
|---|---|---|---|
| `components/site/ShippingOptions.tsx` | **CREAR** — opciones agrupadas (local / nacional / recoger) con precio, días y transportadora | 1 | Bajo — componente nuevo |
| `components/site/CheckoutWizard.tsx` | **CAMBIAR** — separar `OrderMode` / método de entrega / tarifa; enviar `shippingRateId` y `carrierId`; usar `ShippingOptions`; **rama legacy intacta** | 1 | **Alto** — 67 KB, es el checkout de 83 sitios |
| `components/site/OrderTypeSelector.tsx` | **NO TOCAR** — sigue siendo el modo de pedido (delivery / pickup / dine_in) | — | — |
| `components/site/LocationCheckoutFields.tsx` | **CAMBIAR** — devolver `municipality_code` además del nombre de ciudad | 1 | Medio |
| `app/tracking/page.tsx` | **CAMBIAR** — consumir la query corregida | 0 | Nulo |
| `app/pedido/[id]/OrderTracker.tsx` | **CAMBIAR** — guía copiable y enlace externo | GO-20 | Bajo |

### 14.11 Los tres archivos de alto riesgo

Sólo tres cosas pueden tumbar producción. Trátalas con cuidado especial: commit aislado, checklist de regresión de §2.4 antes y después, y despliegue separado del resto de la fase.

1. **`CheckoutWizard.tsx`** (web, 67 KB) — el checkout de 83 sitios. La rama `shipping_engine='legacy'` debe quedar **idéntica**; lo nuevo va en un camino separado. Refactor de extracción primero, funcionalidad después.
2. **`app/api/orders/route.ts`** (web) — creación de pedidos. Mismo criterio: `if (engine === 'zones') { … } else { /* código actual sin tocar */ }`.
3. **`CheckoutDialog.tsx`** (ERP, 2.312 líneas) — el cobro del POS. Extrae `DeliverySection` en un commit que **no cambie comportamiento**, verifica, y sólo entonces añade el selector.

Un cuarto de riesgo medio-alto: **`deliveryIntegrationService.ts` + `webOrderServerConfirmation.ts`** (§7.1). Consolidar dos rutas en una toca el camino por el que se crean todos los envíos de pedidos web. Hazlo con la ruta B como referencia (tiene más campos) y verifica que ambos disparadores —confirmación manual y auto-confirmación por pago— producen el mismo shipment.

---

## 15. Criterios de aceptación de la épica

**Seguridad**
- [ ] Con la anon key: `select count(*) from shipments` = 0 y `select count(*) from transport_carriers` = 0.
- [ ] Ninguna credencial legible desde el cliente ni en `transport_carriers.metadata`.
- [ ] `get_advisors` (security) sin hallazgos nuevos.
- [ ] `/api/orders` rechaza un pedido con `shipping` manipulado; responde 429 al superar el límite.
- [ ] Sin API keys ni tokens en logs (revisa Sentry).

**Tarifas y checkout web** (Fase 1)
- [ ] Zonas configurables con municipios del catálogo; un cliente sólo ve las tarifas de su zona.
- [ ] El checkout ofrece domicilio propio **y** transportadora a la vez, con días de entrega.
- [ ] Elegir transportadora → `delivery_type = 'delivery_third_party'` + `delivery_partner`.
- [ ] El restaurante sigue igual: `delivery_own`, tarifas por barrio, tiempos en minutos.
- [ ] Destino sin cobertura → mensaje claro, no flat rate silencioso.
- [ ] Organización sin tarifas → advertencia en el ERP.
- [ ] La misma tarifa cotiza igual en sitio, POS y simulador.

**Funcional**
- [ ] `/tracking` del sitio devuelve un envío real por número de guía (hoy falla siempre).
- [ ] Pedido web confirmado → shipment con `carrier_id`, guía en `shipping_labels`, `external_tracking_url` navegable — **por las dos rutas**.
- [ ] `delivery_partner` desconocido → no falla, queda `unresolved`, el operador asigna manualmente.
- [ ] Venta POS con `delivery_third_party` → `sales.delivery_type`/`carrier_id` persistidos, guía generada e imprimible.
- [ ] Webhook: reenviar el mismo evento no duplica eventos ni cambia el estado dos veces.
- [ ] Webhook: un payload con `organization_id` ajeno no afecta a otra organización.
- [ ] Un evento fuera de orden no retrocede un envío entregado.
- [ ] Un envío `delivered` propaga a `web_orders.status` y dispara el correo al cliente.
- [ ] Cron sin `Authorization: Bearer $CRON_SECRET` → 401.
- [ ] Caída total de la API de una transportadora → la venta se cierra y el envío queda reintentable.

**Contable**
- [ ] Venta con envío: `invoice_sales.total` cuadra **sin duplicar** el cobro (test automatizado).
- [ ] Guía generada → `shipment_costs` con costo real, asiento cuadrado y CxP a la transportadora.
- [ ] Reprocesar el mismo shipment no duplica asientos ni CxP.
- [ ] El reporte muestra ingreso, costo y margen de envío por transportadora y sucursal.

**Calidad**

`goadmin-websites` no tiene jest/vitest/playwright, ni script `test`, ni un solo archivo de prueba (el repo aún se llama `my-v0-project`). Su `tsconfig` sí tiene `strict: true` y `next.config.js` **no** desactiva el chequeo de tipos, así que el compilador es una compuerta real. Las compuertas por repo:

| Repo | Compuerta |
|---|---|
| `go-admin-erp` | `npm run lint` · `next build` · `npm test` (jest ya configurado) |
| `goadmin-websites` | `npm run lint` · `npx tsc --noEmit` · `next build` · `npm run verify:tracking` |

- [ ] Las compuertas de arriba pasan en los repos tocados.
- [ ] `types/database.ts` de `goadmin-websites` incluye `shipments`, `transport_events` y `proof_of_delivery` con sus columnas reales, de modo que un nombre de columna inexistente **no compile**. Es la verificación de fondo del arreglo de §5.2: hoy ese `Database` está escrito a mano y no incluye ninguna tabla de transporte, que es por lo que el bug llegó a producción.
- [ ] En las funciones que toques de `queries.ts`, quitados los `as any` (hay 72 en el archivo; no los quites todos, sólo los de tu alcance).
- [ ] `scripts/verify-tracking.mjs` existe y pasa: llama a `getShipmentByTracking` con una guía real y afirma que devuelve un envío con sus eventos. Sin dependencias nuevas, se corre con `node --env-file=.env.local`.
- [ ] Introducir vitest en `goadmin-websites` **no** es parte de esta épica: propónlo como issue aparte.
- [ ] Tests por adaptador con fixtures (éxito, auth, validación, rate limit, timeout).
- [ ] Test del mapeo estado externo → interno por proveedor.
- [ ] Ningún componente nuevo supera ~400 líneas.
- [ ] Tema claro y oscuro verificados en toda la UI nueva.

---

## 16. Cuándo parar y preguntar

- La documentación oficial de una API de transportadora no está clara o exige contrato comercial. **No inventes** endpoints, campos ni códigos de estado.
- El mapeo de los 24 barrios del restaurante a zonas (§6.2c): lo tiene que validar el comerciante.
- Crear las zonas y tarifas iniciales de las tiendas (§6.2): es una decisión comercial.
- Añadir `web_orders.carrier_id` (§6.4d).
- Migrar los 409 shipments históricos mal clasificados (§7.4).
- No existe un patrón para configurar las cuentas del PUC (§11.3).
- GO-22 exige cambiar cómo se calcula hoy el total de la factura (§11.2).
- Peso/dimensiones implica migrar `products` y tocar inventario (§8.2).
- Unificar el cálculo de envío implica mover código entre repos (§6.7).
- Reorganizar los crons de `vercel.json` por límite de plan (§10.3).
- Una migración sería destructiva (DROP COLUMN, DROP TABLE, cambio de tipo con pérdida): hay datos reales multi-tenant.
- Un hallazgo nuevo invalida parte de este documento.

**Nunca** mockees una integración para que "pase" un criterio de aceptación. Un adaptador que lanza `CarrierUnavailableError` documentado es un resultado válido; uno que devuelve datos falsos no.
