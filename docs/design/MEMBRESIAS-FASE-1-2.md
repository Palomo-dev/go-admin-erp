# Membresías — Fases 1 y 2 (propuesta)

Fecha: 2026-09-28 · Estado: **en Figma para aprobación del dueño; nada en código ni en la base**.
Figma: archivo `EAvjINVRnlzFM70GVoWXgl`, página `13 Membresías`, sección
«Membresías — Fases 1 y 2 (propuesta)» (`978:605770`). Capturas: `docs/design/figma/70-membresias-*.png`.

Decisión del dueño (aprobada): el módulo «Gimnasio» (`gym`, `/app/gym/*`) se generaliza como
**Membresías** (gimnasios, academias, clubes, coworking, spa…). En pantalla: «Membresías» ·
en «Memberships» · fr «Adhésions» · pt «Assinaturas». Rutas `/app/membresias/*` con redirección desde
`/app/gym/*`. Código de módulo `memberships` en lugar de `gym`, con compatibilidad temporal.

Modelo:

| Concepto | Qué es | Dónde vive |
|---|---|---|
| **Producto** | Lo que se vende | `products` con `product_type='service'` + **nuevo** `service_type` (`standard` · `membership` · `session_pack` · `class` · `course` · `appointment`). Precio **solo** en `product_prices` |
| **Plan** | Configuración operativa del producto membresía | `membership_plans`, **1:1** con el producto por `product_id` (nuevo). `membership_plans.price` queda por compatibilidad y se retira |
| **Membresía** | Lo que el cliente obtiene **al pagar** | `memberships`, creada dentro de las funciones transaccionales de venta y pago |

---

## 1. Análisis del estado actual

### 1.1 Uso real (BD, 2026-09-28, solo conteos)

- `modules.gym` («Gimnasio», icono `dumbbell`, rank 10). `organization_modules` con `gym`: 45 filas, **43 activas**.
- `membership_plans`: **4** planes, todos de **1** organización, todos `monthly/30 d`, `access_rules` vacío.
- `memberships`: **1** (activa, sin `sale_id`). `membership_payments`: 0. `membership_freezes`: 0.
  `membership_events`: 1. `gym_classes`: 0. `class_reservations`: 0. `member_checkins`: 0. `gym_access_devices`: 1.
- `products`: 70 306 `product` y **3** `service`. `payments.source` nunca vale `membership` (0 pagos de membresía).
- `organization_module_pages` con `gym`: 15 filas (8 páginas: ajustes, checkin, clases, horarios, instructores,
  membresias, planes, reservaciones). `job_position_module_access`/`job_position_page_access` con `gym`: 0.
- `plans.module_config` lista `gym` en 2 planes de suscripción (Enterprise y Ultimate).
- `accounting_rules` con `source_type='membership'`: 94 filas en 89 organizaciones (eventos `created`,
  `created_credit`, `paid`, `renewed`, `renewed_credit`, `cancelled`).
- `permissions`: **ningún** código de gym/membresías (119 permisos; módulos admin…users).

Conclusión: la migración de datos es trivial (4 planes, 1 membresía). El costo está en el código y en
engancharse bien a las funciones de venta.

### 1.2 Tablas (verificadas con el MCP)

| Tabla | Columnas clave | Restricciones | Quién escribe hoy |
|---|---|---|---|
| `membership_plans` | `id int`, `organization_id`, `name`, `duration_days` NN, `price` NN, `access_rules jsonb`, `description`, `is_active`, `frequency` | `frequency ∈ daily/weekly/monthly/quarterly/biannual/annual`; FK org CASCADE | `gymService.ts:299-381` desde el navegador (duplicar falla: `planes/page.tsx:85-89` pone `id: 0`) |
| `memberships` | `id int`, `organization_id`, `customer_id` NN, `membership_plan_id` NN, `start_date timestamptz`, `end_date timestamptz` NN, `status`, `sale_id uuid`, `freeze_history jsonb`, `access_code`, `notes` | **`status ∈ active/frozen/expired`**; **dos FK a `sales` sobre `sale_id`** (`fk_memberships_sale` CASCADE y `memberships_sale_id_fkey` RESTRICT); plan RESTRICT | `gymService.ts:460-682` (alta **sin cobro**); `cancelMembership` escribe `'cancelled'` → la CHECK lo rechaza (`gymService.ts:627`). goadmin-websites inserta `'pending_payment'` (`app/api/memberships/purchase/route.ts:105`) → también rechazado |
| `membership_payments` | `membership_id`, `payment_id uuid` | sin `organization_id` | nadie en el ERP; goadmin-websites `lib/memberships/payment-handler.ts:131` |
| `membership_freezes` | `membership_id`, `start_date date`, `end_date date`, `reason`, `approved_by`, `status`, `days_frozen`, `branch_id` | `status ∈ active/ended/cancelled` | `gymService.ts:541-600`; websites escribe `'pending'` (rechazado) |
| `membership_events` | `membership_id`, `event_type`, `old_value`, `new_value`, `performed_by`, `metadata`, `organization_id`, `correlation_id` | `event_type ∈ created, activated, renewed, frozen, unfrozen, cancelled, expired, payment_received, payment_failed, access_granted, access_denied, plan_changed, notes_updated` | `gymService.ts:963-983` y `gymCheckinService.ts:549` **sin `organization_id`** |
| `gym_classes` | `branch_id` NN, `title`, `instructor_id` (auth.users), `capacity`, `start_at`, `end_at`, `status` | `status ∈ active/cancelled/completed` | `gymService.ts:1109-1279` escribe `'scheduled'` → rechazado |
| `class_reservations` | `gym_class_id`, `customer_id`, `status`, `membership_id`, `branch_id` | `status ∈ booked/checked_in/cancelled/no_show`; `source ∈ app/web/staff/kiosk`; UNIQUE(clase, cliente) | `gymService.ts:1424` escribe `'attended'` → rechazado |
| `member_checkins` | `customer_id`, `branch_id`, `method`, `membership_id`, `denied_reason` | `method ∈ qr/manual/rfid/fingerprint/facial` | `CheckInDialog.tsx:37,169` escribe `card/biometric/nfc` → rechazado |
| `gym_access_devices` | `branch_id` NN, `device_type`, `current_qr_token` | sin `organization_id` | `gymDevicesService.ts` (token con `Math.random`, `:221-228`) |

RLS vigente (consultada en `pg_policies`, **más nueva que el baseline**): todas las tablas filtran por
pertenencia a la organización (`membership_freezes_miembros`, `membership_events_*_miembros`,
`gym_access_devices_miembros` ya no son `USING (true)` como dice el baseline). `class_reservations` además
lleva la restrictiva `app_branch_access`. `registrar_pago_membresia` y `obtener_pagos_membresia` son
`SECURITY DEFINER` sin anon, pero **no validan organización** y nadie las llama.

Triggers: `trg_auto_journal_membership` (AFTER INSERT/UPDATE OF status en `memberships`,
`fn_auto_journal_membership`) contabiliza con `membership_plans.price` cuando no hay `sale_id`, y **une
`member_branches.organization_member_id = NEW.id`** (id de la membresía: error; siempre cae a sucursal 0).
`trg_auto_journal_membership_payment` sobre `payments.source='membership'`. Con el modelo nuevo toda
membresía nace con `sale_id`, así que el asiento lo hace la venta y estos dos triggers quedan inertes (ver §8 R4).

### 1.3 Código del módulo (84 archivos: 11 páginas, 73 componentes)

Transversal a todas las páginas: ninguna usa el `PageHeader` del kit (usan `components/gym/shared/PageHeader.tsx`
con la miga «Gimnasio» escrita en `:54`); cero `useTranslations` (solo existen `nav.gym`, `nav.paginas.gym_*`,
`home.modules.gym` en `messages/*.json`); muchas clases `dark:` y `gray-*`; **ninguna comprobación de permisos**;
todo desde el navegador contra Supabase (no hay rutas `src/app/api/**` de gym).

| Página | Qué muestra | Problemas principales |
|---|---|---|
| `/app/gym` | `ModuleRootRedirect` (`page.tsx:9-11`) | — |
| `/app/gym/membresias` | stats, «por vencer», filtros, tarjetas en 2 columnas, diálogos nueva/QR/congelar | alta sin cobro; búsqueda doble (`gymService.ts:427` y `page.tsx:135-144`); sin paginación; capa «Procesando…» a pantalla completa; `$` fijo (`MembershipDialog.tsx:182,193`); error solo en toast; `CustomerSelectorGym` es un cuarto selector de cliente que no filtra organización (`:80-84`) e inserta clientes con municipio cableado |
| `/app/gym/membresias/[id]` | cabecera a mano (`:270-300`), resumen, pestañas historial/check-ins/pagos/congelamientos | `?action=renew` no hace nada (`:127-129`); cancelar falla por la CHECK; pagos solo si hay `sale_id` (nunca); sin estado de error |
| `/app/gym/planes` | 4 stats a mano, lista de planes activos/inactivos | duplicar falla; promedio de precio desde `membership_plans.price`; importación sin transacción |
| `/app/gym/clases` | 6 stats a mano, lista/calendario, diálogos | `toISOString().split('T')[0]` (`:182`); `duplicateClass` corre un día; borrado físico; crear falla por `'scheduled'` |
| `/app/gym/horarios` | calendario semanal | tipos de clase cableados (`:250-263`); duración calculada y descartada |
| `/app/gym/reservaciones` | lista, filtros, check-in | «Hoy» filtra por `booked_at`; `branch_id || 1` (`CheckInDialog.tsx:81`); no valida cupo ni membresía |
| `/app/gym/instructores` | tarjetas desde HRM | asistencia fija 75 %; `getInstructors` sin filtro de organización y N+1 (`gymService.ts:1479-1550`) |
| `/app/gym/checkin` | búsqueda, validación, historial en vivo | **búsqueda rota**: pide `customers.document_number` (la columna es `identification_number`; `gymCheckinService.ts:227,242,247`); lee `membership.access_rules` que no existe (`:352`); zona del navegador; emojis |
| `/app/gym/dispositivos` | tabla de dispositivos | fuera del menú; primera sede por defecto; QR nunca validado |
| `/app/gym/reportes` | ingresos por plan, horas pico | fuera del menú; ingresos = activas × `membership_plans.price`; consultas en bucle |
| `/gym-display/[deviceId]` | kiosco | exige sesión; registra `qr` aunque sea texto |

Enlaces rotos: `QuickActions.tsx:56` → `/app/gym/ajustes` (404). `organization_module_pages` tiene `/app/gym/ajustes`.

### 1.4 Referencias a `gym` fuera del módulo

- Menú: `src/lib/navigation/catalog.ts:275-290` (7 páginas, sección `ventas`; faltan reportes y dispositivos).
- Middleware: `src/middleware.ts:430` (`'/app/gym': 'gym'`), `checkModuleAccess` `:619-677` (no revisa acceso por página).
- `moduleRedirect.ts:25`; inicio `DashboardModulos.tsx:51,69,143-145` y `sections/GymSection.tsx`.
- Configuración: `configModulesRegistry.ts:128-133`, `ConfiguracionPanelRenderer.tsx:31,114`, `GymConfigPanel` + `gymSettingsService` (`settings.gym_settings`, nadie más lo lee).
- Iconos por código: `organizacion/modulos/page.tsx:62,76`, `organization/PlanTab.tsx:52,66` (`gym`, `pos_gym`).
- Buscador global: `GlobalSearch/types.ts:57`, `GlobalSearch.tsx:23,222-225`, `searchService.ts:64,79`.
- Calendario `CalendarView.tsx:182`; reportes `reportesCatalogo.ts:41`, `modulos/gymReports.ts` (MRR suma el precio del plan sin mirar la duración; `split('T')[0]` en `:50,93`); notificaciones `commNotificationService.ts:88-91`; timeline `timelineService.ts:74,115`; clientes `clientesListadoService.ts:332-333`; asistente `ai/assistant/undoService.ts:133` y `ai/agent/tools/navegacion.ts` (lee el catálogo).
- Web/branding: `websiteSettingsService.ts:223,245-248`, `websitePageBuilderService.ts`, `sectionsByBranchType.ts:84`, `BrandingFeaturesTab.tsx:24`.
- Pruebas: `goAssistantF6.test.ts:121-474`, `goAssistantF0.contract.test.ts:32`, `timezone/vigenciasQueCortanServicio.test.ts:10-96`.
- SQL: `fn_create_default_org_structure` (departamento GYM, cargos INST-*), `create_default_website_settings` (caso `gym`).
- Otros repos: goadmin-websites (compra, congelar, reservas, 6 webhooks → `handleMembershipPayment`); go-admin-super (reset/borrado de datos de gym); go-admin-sellers: nada.
- **Permisos**: no existe ningún código `gym.*`; `permissions.ts:300-346` no tiene `gym`. El módulo solo lo protege el código de módulo en el middleware y el RLS por organización.

### 1.5 Formulario de producto (dónde va lo nuevo)

`ProductoForm.tsx:82` (páginas `nuevo`, `[id]/editar`, `[id]/duplicar`), estado en `useProductoForm.ts` +
`logica/formularioProducto.ts` (sin zod; `validarFormulario` `:517-607`), guardado
`guardarProducto.ts:97` → `construirPayload` (`:678-802`) → `productoService.guardar` (`:540-552`) → RPC
**`fn_producto_guardar`** (`20260924110000_producto_formulario_transaccional.sql:119`, que hoy rechaza
`product_type` distinto de product/service en `:176`). Selector Producto/Servicio en
`SeccionInformacion.tsx:178-195` (servicio ⇒ oculta Inventario, `mapaSecciones.ts:37-39`).

- «¿Qué tipo de servicio es?»: `SeccionInformacion.tsx` tras `:195`, visible si `product_type==='service'`;
  campo en `formularioProducto.ts:199/321/386/696`.
- «Configuración de membresía»: nueva `SeccionFormulario 'membresia'` entre `impuestos` e `inventario`
  (`formularioProducto.ts:18-41`), visible si `service_type==='membership'`; `case` en `ProductoForm.tsx:384-407`;
  móvil en `paso-inventario` (`ProductoForm.tsx:475`); i18n `productoForm.secciones.membresia.*`;
  `payload.membresia` y bloque en `fn_producto_guardar` después de precio/costo (`…110000.sql:~281`).

### 1.6 Puntos de enganche en venta, pago y reversos

| Camino | Función (versión vigente) | Dónde se engancha | Idempotencia existente |
|---|---|---|---|
| POS | `pos_checkout_v1(p_envelope)` base `20260925140000…:242` + parches `…140100`, `…140200` (modos `debt`/`settle`), `…140300` (mesa) | Antes de «13. Resultado» (en la BD, línea 717 de la definición viva): venta, `sale_items` (`:412`), factura y pagos ya existen. Añadir las membresías al `jsonb_build_object` del resultado | candado por `sale_id` + `pos_cobros.payment_key` en `settle` |
| Factura manual | `fn_factura_venta_guardar` (crea venta y `sale_items`, `20260924104430…:213-289`) + `fn_factura_venta_emitir` (`:344`, pasa a `issued` en `:412-416`) | tras emitir: si la factura queda pagada (contado) → activar; si es a crédito y el plan lo permite → activar como `active` con `billing_mode='on_credit'`; si no → `pending` | emite solo desde borrador |
| Pago único | `fn_registrar_pago` (`20260924072939…:158`; aplica a `invoice_sales`/`account_receivable`) | al final («Saldos finales», línea 358 viva), por cada factura con `balance=0` → activar sus líneas pendientes | `p_clave_idempotencia` + candado |
| Cotización → factura | `cotizacionesService.ts:408-516` (navegador; inserta factura `issued` sin `sales` ni `sale_items`) | **no se engancha**: primero migrar a `fn_factura_venta_guardar` + `emitir` (ver §8 R2) | ninguna |
| Tienda web | `fn_confirmar_pedido_web` (`20260923175006…:46`) solo crea `sales`; `sale_items` desde TS (`webOrderServerConfirmation.ts:445-470`, `webOrderConfirmationService.ts:238-278`) | después del insert de `sale_items` cuando `creada=true`, llamando la RPC de activación (el pago del pedido ya está aprobado) | índice `uq_sales_web_order_viva` |
| Anular venta | `pos_anular_venta_v1` (`20260925140200…:471` + parche `…140250`) | antes de `update sales set status='void'` (línea 204 viva) | sale temprano si ya es `void` |
| Devolución | `procesar_devolucion` (`20260925130300…:261`) | dentro del bucle por línea, junto al insert de `return_lines` (tiene `sale_item_id` y cantidad) | clave + índice único |
| Nota crédito | `fn_nota_credito_emitir` (`20260924093524…:452`) | después de insertar las líneas; `credited_item_id` es línea de factura → mapear a `sale_item` por `sale_id`+`product_id` | clave + candado |

UI del POS: `decidirAccionProducto` (`lib/pos/venta/catalogo.ts:81-88`) → `handleProductSelect`
(`app/pos/page.tsx:404-420`) → `POSService.addItemToCart` (`posService.ts:960-1010`). Cliente:
`CustomerSelector` → `CustomerPicker` del kit, F2 (`PanelCarrito.tsx:90-97`). Hoy solo la deuda exige
cliente (`requisitosCarrito.ts:58-69`, regla L33 de POS-PLAN); `estadoBotonCobrar` (`:29-37`) no mira el
cliente. Post-venta: `PostVenta.tsx:80-109` pinta `ResultadoOperacion`; `posService.ts:1736` devuelve solo
la venta.

---

## 2. Rutas: viejas → nuevas

Código de páginas nuevo en `src/app/app/membresias/**`. Redirección **permanente** (308) en
`next.config` `redirects()` —no en el middleware— para que el marcador viejo siga funcionando.

| Antes | Después | Nota |
|---|---|---|
| `/app/gym` | `/app/membresias` | ahora es **Resumen** (no redirige) |
| — | `/app/membresias/miembros` | nuevo: clientes con membresía (lista de personas, no de contratos) |
| `/app/gym/membresias` | `/app/membresias/membresias` | |
| `/app/gym/membresias/[id]` | `/app/membresias/membresias/[id]` | |
| `/app/gym/planes` | `/app/membresias/planes` (+ `/planes/[id]`) | detalle nuevo |
| `/app/gym/clases` + `/app/gym/horarios` | `/app/membresias/clases` (vista Lista · Calendario) | se funden |
| `/app/gym/reservaciones` | `/app/membresias/reservas` | |
| `/app/gym/checkin` | `/app/membresias/check-in` | |
| `/app/gym/instructores` | `/app/membresias/instructores` | |
| `/app/gym/dispositivos` | `/app/membresias/control-de-acceso` | entra al menú |
| — | `/app/membresias/pagos` | ventas y facturas con líneas membresía |
| `/app/gym/reportes` | `/app/membresias` (Resumen) + Reportes generales | |
| `/app/gym/ajustes` (404) | `/app/configuracion?tab=membresias` | |
| `/gym-display/[deviceId]` | `/membresias-kiosco/[deviceId]` + redirección | |

Menú (`catalog.ts`, sin cablear visibilidad: sigue `organization_modules` + `organization_module_pages`):
**Resumen, Miembros, Membresías, Planes, Clases, Reservas, Check-in, Instructores, Control de acceso, Pagos.**
«Academias» solo si se activa (no se diseña en esta fase).

---

## 3. Migraciones propuestas (no aplicadas)

Todas aditivas, idempotentes, con su `supabase/rollbacks/<ts>_<nombre>_rollback.sql` en el mismo commit
(`docs/POLITICA-MIGRACIONES.md`). Toda función `SECURITY DEFINER` con `REVOKE … FROM anon, public` y guarda de
pertenencia en la misma migración.

### M1 · `service_type` en productos

```sql
alter table public.products add column if not exists service_type text;
alter table public.products drop constraint if exists products_service_type_check;
alter table public.products add constraint products_service_type_check check (
  service_type is null or (product_type = 'service' and service_type in
  ('standard','membership','session_pack','class','course','appointment')));
update public.products set service_type = 'standard' where product_type = 'service' and service_type is null; -- 3 filas
create index if not exists products_org_service_type_idx on public.products (organization_id, service_type)
  where service_type is not null;
```
Rollback: `drop index`, `drop constraint`, `drop column service_type` (advierte: pierde el tipo).
Además `fn_producto_guardar` y `fn_producto_para_formulario` leen/escriben `service_type` y `membresia`
(nueva versión con `create or replace`; el rollback reinstala la actual).

### M2 · Plan ligado al producto y campos del plan

```sql
alter table public.membership_plans
  add column if not exists product_id integer references public.products(id) on delete restrict,
  add column if not exists duration_unit text not null default 'day',      -- day|week|month|year
  add column if not exists duration_value integer,                          -- 1 mes = (1,'month')
  add column if not exists renewal_mode text not null default 'manual',     -- manual|automatic (automatic: fase posterior)
  add column if not exists billing_mode text not null default 'prepaid',    -- prepaid|on_credit
  add column if not exists grace_days integer not null default 0,
  add column if not exists requires_activation boolean not null default false,
  add column if not exists activation_window_days integer,                  -- se activa sola si no entra
  add column if not exists freeze_allowed boolean not null default false,
  add column if not exists freeze_max_times integer,
  add column if not exists freeze_max_days integer,
  add column if not exists allowed_branch_ids integer[],                    -- null = todas
  add column if not exists access_schedule jsonb,                           -- {dias:[1..7], desde:'05:00', hasta:'10:00'}
  add column if not exists daily_checkin_limit integer;
create unique index if not exists membership_plans_product_uq on public.membership_plans (product_id) where product_id is not null;
alter table public.membership_plans alter column price drop not null;   -- deja de ser la fuente del precio
comment on column public.membership_plans.price is 'Obsoleto: el precio es el del producto (product_prices). Se retira en la fase 3.';
```
CHECKs para `duration_unit`, `renewal_mode`, `billing_mode` y `grace_days >= 0`. `duration_days` se conserva y
se calcula para compatibilidad. `access_rules` se migra a las columnas nuevas (hoy vacío en los 4 planes).
Guardia de coherencia (trigger `BEFORE INSERT/UPDATE`): `product_id` debe ser de la misma organización y con
`service_type='membership'`.

### M3 · Estados, vínculo con la línea de venta y reglas copiadas

```sql
alter table public.memberships
  add column if not exists product_id integer references public.products(id),
  add column if not exists sale_item_id uuid references public.sale_items(id) on delete restrict,
  add column if not exists invoice_id uuid references public.invoice_sales(id),
  add column if not exists branch_id integer references public.branches(id),
  add column if not exists plan_snapshot jsonb,           -- reglas del plan al venderse
  add column if not exists activated_at timestamptz,
  add column if not exists grace_until timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists source text;                   -- pos|invoice|web|manual_legacy
alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships add constraint memberships_status_check
  check (status in ('pending','active','frozen','past_due','expired','cancelled'));
create unique index if not exists memberships_sale_item_uq on public.memberships (sale_item_id) where sale_item_id is not null;
alter table public.memberships drop constraint if exists fk_memberships_sale; -- FK duplicada con CASCADE; queda la RESTRICT
alter table public.membership_events drop constraint if exists membership_events_event_type_check;
alter table public.membership_events add constraint membership_events_event_type_check check (event_type in
  (/* los 13 actuales */ 'created','activated','renewed','frozen','unfrozen','cancelled','expired','payment_received',
   'payment_failed','access_granted','access_denied','plan_changed','notes_updated',
   /* nuevos */ 'trimmed','grace_started','reactivated'));
```
La CHECK de estados es un **cambio de restricción, no de tipo**: amplía valores, no invalida filas (1 fila
`active`). El rollback restaura la CHECK vieja **solo si no hay filas en estados nuevos** (lo verifica y aborta si
las hay). La FK duplicada `fk_memberships_sale` (ON DELETE CASCADE) se quita porque borrar una venta no debe
borrar membresías en silencio; el rollback la recrea.

`membership_freezes.status` gana `'scheduled'` (congelamiento con fecha futura). `class_reservations` y
`member_checkins`: se **corrige el código** a los valores que la base acepta (no se amplían CHECKs).

### M4 · Código de módulo `memberships`

`organization_modules.module_code` tiene FK a `modules(code)` **ON DELETE CASCADE**: borrar `gym` borraría las
43 activaciones. Por eso:

```sql
insert into public.modules (code, name, description, is_core, icon, rank, is_active)
select 'memberships','Membresías','Gimnasios, academias, clubes, coworking y spa', false, 'user-check', rank, true
from public.modules where code='gym' on conflict (code) do nothing;
insert into public.organization_modules (organization_id, module_code, is_active, enabled_at, activated_at)
select organization_id, 'memberships', is_active, enabled_at, activated_at from public.organization_modules where module_code='gym'
on conflict (organization_id, module_code) do nothing;
-- lo mismo para organization_module_pages (page_href reescrito a /app/membresias/...) y job_position_*_access
update public.plans set module_config = replace(module_config::text,'"gym"','"memberships"')::jsonb
 where module_config::text like '%"gym"%';   -- 2 planes de suscripción
update public.modules set is_active = false where code='gym';   -- NO se borra
```
Compatibilidad: durante la transición el middleware acepta `gym` **o** `memberships`
(`moduleManagementService` resuelve un alias `gym → memberships`), y `activateModule('gym')` activa
`memberships`. Se retira el alias cuando go-admin-super y goadmin-websites ya no usen `gym`.
Rollback: borra las filas `memberships` de las tablas hijas y el módulo, reactiva `gym` (las filas `gym`
nunca se tocaron).

### M5 · Un producto para cada plan existente

Para los 4 planes (1 organización): crear `products` (`product_type='service'`, `service_type='membership'`,
`sku='MEM-'||id`, `status` según `is_active`, categoría «Membresías» creada con su `slug` si no existe —
`categories.slug` es NOT NULL sin default), su `product_prices` con `price` del plan y `effective_from=now()`,
y `membership_plans.product_id`. `duration_unit/value` desde `frequency` (`monthly` → 1 mes). La membresía
existente queda con `source='manual_legacy'` y `product_id` del plan. Rollback: borra esos productos, precios y
la categoría solo si fueron creados por la migración (marcados en `products.description`/tabla auxiliar).

### M6 · Funciones nuevas

| Función | Qué hace |
|---|---|
| `fn_membresias_activar_venta(p_sale_id uuid, p_invoice_id uuid default null)` | Por cada `sale_item` cuyo producto es membresía: si no existe `memberships.sale_item_id` → crea (`pending` o `active`); si existe `pending` y ya está pagado → `active`. Renovación: si el cliente tiene una membresía viva del **mismo plan**, extiende su `end_date` (nuevo período desde `max(end_date, hoy)`) y registra `renewed` apuntando a la línea nueva (la línea queda ligada por `membership_events.metadata.sale_item_id` + fila en `membership_payments`). Cantidad N ⇒ N períodos. Devuelve la lista de membresías tocadas |
| `fn_membresias_revertir_linea(p_sale_item_id uuid, p_cantidad numeric, p_motivo text, p_documento jsonb)` | Total → `cancelled` (+ `cancelled_at`, evento). Parcial → recorta `end_date` en `períodos × cantidad devuelta`; si queda en el pasado → `cancelled`. Idempotente por documento (`metadata.documento_id`) |
| `fn_membresias_vencer(p_organization_id)` | Tarea diaria (pg_cron o la de facturación): `active` con `end_date < ahora` → `past_due` con `grace_until`; `past_due` vencido → `expired`; `frozen` con congelamiento terminado → `active`. Usa la zona de la organización |
| `fn_membresia_congelar / _descongelar / _cancelar` | Acciones del detalle, con topes del `plan_snapshot`, permiso y evento; cancelar exige motivo |

Todas `SECURITY DEFINER`, `set search_path = public`, guarda `organization_id` = organización de la sesión
(o la del documento cuando las llama otra función ya validada), `revoke all … from anon, public`,
`grant execute … to authenticated` solo a las de acciones de pantalla; las de activación/reverso **solo** las
llaman las funciones de venta (sin grant a `authenticated`).

---

## 4. Contrato de activación (fase 2)

**Regla única:** una membresía se crea/activa **dentro de la transacción** de la función que deja la línea de
venta pagada. Nunca desde el navegador, nunca en una segunda llamada.

| Momento | Función que llama | Qué pasa |
|---|---|---|
| Cobro en el POS (modo `sale`, saldo 0) | `pos_checkout_v1` → `fn_membresias_activar_venta(sale_id)` antes de «13. Resultado» | `active` desde hoy (o `pending` si `requires_activation`, que pasa a `active` en el primer check-in o al vencer la ventana). El resultado lleva `membresias:[{id, plan, desde, hasta, codigo}]` → `posService.checkout` las devuelve → `PostVenta` las muestra (frame D2) |
| POS modo `debt` | igual | `pending` («Pendiente de pago») |
| POS modo `settle` (paga la deuda o la mesa) | igual, tras el bloque `settle` | `pending` → `active` cuando `balance=0` |
| Factura manual emitida | `fn_factura_venta_emitir` | contado pagado → `active`; crédito con `billing_mode='on_credit'` → `active` (si vence la factura sin pago → `past_due`); crédito con `prepaid` → `pending` |
| Pago de factura/cartera | `fn_registrar_pago` (al final) | factura con `balance=0` → sus `pending` pasan a `active` |
| Cotización convertida | (tras migrar a `fn_factura_venta_guardar`+`emitir`) | igual que factura |
| Tienda web | tras insertar `sale_items` del pedido confirmado (`creada=true`) → RPC `fn_membresias_activar_venta` | `active` (el pago ya fue aprobado por la pasarela). goadmin-websites deja de insertar en `memberships` directamente |
| Anular venta | `pos_anular_venta_v1` antes del `void` → `fn_membresias_revertir_linea` para cada línea | `cancelled`, evento `cancelled` con la venta |
| Devolución | `procesar_devolucion`, por línea | total → `cancelled`; parcial → `trimmed` |
| Nota crédito | `fn_nota_credito_emitir`, por línea acreditada (mapeo línea de factura → `sale_item`) | idem; una NC por valor sin líneas **no** toca la membresía (se avisa en el diálogo de la NC) |
| Renovación manual | nueva venta del mismo producto | extiende `end_date` desde el vencimiento vigente; si estaba `past_due`/`expired` reactiva (`reactivated`) |

**Idempotencia:** índice único `memberships(sale_item_id)`; los reversos por `(sale_item_id, documento_id)` en
`membership_events`; todas las funciones de venta ya se reproducen con candado, así que llamar dos veces no crea
dos membresías ni recorta dos veces.

**Cliente obligatorio:** `pos_checkout_v1`, `fn_factura_venta_guardar` y la confirmación web rechazan una línea
membresía sin `customer_id` (`membresia_sin_cliente`). En el POS: al agregar el producto sin cliente se abre el
`CustomerPicker` (frame D1); `estadoBotonCobrar` gana el estado `sin-cliente` con motivo. Esto amplía la regla
L33 de POS-PLAN («cliente obligatorio solo para deuda») — decisión del dueño (§9 P1).

**Estados:** `pending` (vendida, sin pagar o sin activar) · `active` · `frozen` · `past_due` (vencida y dentro del
período de gracia o factura a crédito vencida; aún entra si hay gracia) · `expired` · `cancelled`.
Badges (SISTEMA-BADGES §4): Pendiente de pago = advertencia·suave; Activa = éxito·suave; **Congelada =
información·suave (nuevo en la tabla)**; En gracia N d = advertencia·suave; Vencida = peligro·suave; Cancelada =
neutro·suave.

**Fechas:** `start_date/end_date` son `timestamptz`; los días se calculan con `getOrganizationTimezone`
(1 mes pagado el 28 sep → vence el 27 oct a las 23:59:59 de la organización). En pantalla, `formatDateInTz`.

**Contabilidad:** el ingreso lo contabiliza la venta/factura (como hoy); `fn_auto_journal_membership` ya no hace
nada porque toda membresía nueva trae `sale_id` (se corrige su join erróneo o se retira en la fase 3).

---

## 5. Permisos (nuevos, en `permissions` con `module='memberships'`)

| Código | Para |
|---|---|
| `memberships.view` | ver Resumen, Miembros, Membresías, Planes, Pagos |
| `memberships.plans.manage` | configuración de membresía en el producto y detalle del plan (además de `inventory.products.edit`) |
| `memberships.freeze` | congelar/descongelar |
| `memberships.cancel` | cancelar (con motivo) |
| `memberships.checkin` | registrar entradas |
| `memberships.classes.manage` | clases, horarios, reservas, instructores |
| `memberships.devices.manage` | control de acceso |

Se resuelven en el servidor (`get_user_permission_codes`), nunca por nombre de rol. Las RPC de acciones validan
el permiso además del RLS. Sin `memberships.view` la página muestra «sin permiso» (frame F5).

---

## 6. Figma

Página `13 Membresías`, sección `978:605770` («Membresías — Fases 1 y 2 (propuesta)»). Hecho con el kit
(`PageHeader`, `StatCard`, `SearchBar`, `FilterButton`, `ViewToggle`, `TableCell`, `Pagination`, `ListCard`,
`FormSection`, `FormField`, `NumberInput`, `SegmentedControl`, `MultiSelect`, `Chip`, `Switch`, `Tarjeta`,
`FilaDato`, `EslabonDocumento`, `TabItem`, `RelatedLinkCard`, `AtencionItem`, `BarraDesglose`, `EmptyState`,
`Skeleton`, `CustomerPicker`, `FlujoNodo`), tokens de color y estilos de texto del manual; «Nuevo» marca lo que
no existe.

| Frame | Id | Enlace | Captura |
|---|---|---|---|
| A1 · Escritorio / Nuevo producto — Servicio › Membresía | `978:605773` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=978-605773 | `70-membresias-a1-producto-escritorio.png` |
| A2 · Móvil / Nuevo producto — paso 2 › Tipo y membresía | `980:1146` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=980-1146 | `70-membresias-a2-producto-movil.png` |
| B1 · Escritorio / Planes — listo | `981:611296` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=981-611296 | `70-membresias-b1-planes-listado.png` |
| B2 · Escritorio / Plan — detalle ligado a su producto | `981:612094` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=981-612094 | `70-membresias-b2-plan-detalle.png` |
| B3 · Móvil / Planes — listo | `981:612770` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=981-612770 | `70-membresias-b3-planes-movil.png` |
| C1 · Escritorio / Membresías — listo | `984:611196` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=984-611196 | `70-membresias-c1-membresias-listado.png` |
| C2 · Escritorio / Membresía — detalle del miembro | `984:611992` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=984-611992 | `70-membresias-c2-membresia-detalle.png` |
| C3 · Diálogo / Congelar membresía | `985:617462` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=985-617462 | `70-membresias-c3-dialogo-congelar.png` |
| C4 · DialogoMotivo / Cancelar membresía | `985:617547` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=985-617547 | `70-membresias-c4-dialogo-cancelar.png` |
| C5 · Diálogo / Renovar membresía | `985:617646` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=985-617646 | `70-membresias-c5-dialogo-renovar.png` |
| C6 · Móvil / Membresías — listo | `985:617686` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=985-617686 | `70-membresias-c6-membresias-movil.png` |
| C7 · Móvil / Membresía — detalle | `985:618292` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=985-618292 | `70-membresias-c7-membresia-detalle-movil.png` |
| D1 · Escritorio / POS — membresía pide el cliente | `986:616652` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=986-616652 | `70-membresias-d1-pos-pide-cliente.png` |
| D2 · Escritorio / POS — post-venta con membresía activada | `986:615576` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=986-615576 | `70-membresias-d2-pos-postventa-membresia.png` |
| E1 · Escritorio / Membresías — Resumen | `987:7301` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=987-7301 | `70-membresias-e1-resumen-escritorio.png` |
| E2 · Móvil / Membresías — Resumen | `987:8102` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=987-8102 | `70-membresias-e2-resumen-movil.png` |
| F1–F5 · Escritorio / Membresías — cargando, vacío, sin resultados, error, sin permiso | `988:8005`, `988:8588`, `988:9120`, `988:9697`, `988:10220` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=988-8005 (y `988-8588`, `988-9120`, `988-9697`, `988-10220`) | `70-membresias-f1…f5-*.png` |
| F6–F7 · Móvil / Membresías — cargando, vacío | `988:10739`, `988:10941` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=988-10739 (y `988-10941`) | `70-membresias-f6/f7-*.png` |
| G1 · Cómo funciona — de la venta a la membresía | `988:629432` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=988-629432 | `70-membresias-g1-como-funciona.png` |

Vista completa: `70-membresias-00-seccion-completa.png`.

Chequeo por script (2026-09-28): 24 frames, 0 nodos fuera de la sección, 0 solapes, 0 instancias rotas, 0 textos
recortados por su contenedor (los únicos truncados son las elipsis intencionales de `ListCard` y `TableCell`).
El menú lateral reusa el ítem «Reportes» del `Sidebar` renombrado a «Membresías» con icono `UserCheck` (el
componente no tiene ítem propio; ver §9 P7).

Frames D1/D2 son clones del post-venta aprobado del POS (`247:74846`). Los estados de Planes siguen la misma
receta que F1–F7 y no se dibujaron aparte.

---

## 7. Plan de implementación (tras aprobar)

**Fase 1:** M1–M5; `service_type` + sección «Configuración de membresía» en el formulario (`fn_producto_guardar`
ampliada, una sola operación); módulo `memberships` con alias `gym`; rutas nuevas + redirecciones; Planes
(listado y detalle) y Membresías (listado y detalle) con el kit, i18n (namespace `membresias`, 4 idiomas),
permisos; se retira el alta de membresía sin cobro; corrección de los valores de estado rechazados por la base
(clases, reservas, check-in) y de la búsqueda del check-in (`identification_number`).

**Fase 2:** M6 y parches (patrón `pg_get_functiondef` + `replace` verificando una sola aparición) de
`pos_checkout_v1`, `fn_factura_venta_emitir`, `fn_registrar_pago`, `pos_anular_venta_v1`,
`procesar_devolucion`, `fn_nota_credito_emitir`; confirmación web; cliente obligatorio en POS; post-venta con
membresías; congelar/cancelar/renovar; tarea diaria de vencimiento; Resumen del módulo. Pruebas: SQL con
`begin … rollback` para cada camino (venta, deuda+settle, factura contado/crédito, pago, anulación, devolución
parcial, NC por líneas, reproducción idempotente) y jest para la lógica de vigencias con `TZ=UTC` y
`TZ=America/Bogota`.

---

## 8. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Borrar `modules.gym` borra en cascada las 43 activaciones | nunca se borra: se desactiva; alias hasta retirar `gym` de los otros repos |
| R2 | La cotización convierte a factura desde el navegador, sin `sale_items` ni idempotencia | migrar ese camino a `fn_factura_venta_guardar`+`emitir` antes de activar membresías por cotización; mientras, bloquear convertir cotizaciones con líneas membresía |
| R3 | `pos_checkout_v1` vive en cuatro migraciones (base + 3 parches de texto) | el parche nuevo sigue el mismo patrón y verifica el fragmento; prueba de reproducción |
| R4 | Contabilidad doble si queda activo `fn_auto_journal_membership` con precio del plan | toda membresía nueva lleva `sale_id` (el trigger sale antes); corregir el join o retirar el trigger |
| R5 | goadmin-websites escribe `memberships`/`payments` por su lado con estados inválidos | pasar su flujo a la RPC `fn_membresias_activar_venta` desde la venta web; hasta entonces, sus inserts fallan igual que hoy |
| R6 | Cambiar reglas del plan afecta a quien ya pagó | `plan_snapshot` en cada membresía; el check-in valida contra la copia |
| R7 | Recorte parcial por devolución o NC mal calculado | se recorta por períodos completos por unidad devuelta; NC por valor sin líneas no recorta (aviso) |
| R8 | Fechas corridas por zona horaria | vigencias con la zona de la organización; tests `test:tz-all` |
| R9 | Cliente obligatorio frena ventas rápidas en el POS | solo aplica a líneas membresía; el `CustomerPicker` permite crear cliente en el mismo diálogo |

---

## 9. Preguntas al dueño (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| P1 | ¿Se amplía la regla L33 del POS («cliente obligatorio solo para deuda») a líneas membresía? | **Sí**: una membresía sin titular no se puede usar ni validar en el check-in |
| P2 | Venta a crédito de una membresía: ¿se activa al emitir o al pagar? | configurable por plan (`billing_mode`), **por defecto «Por adelantado · se activa al pagar»** |
| P3 | Renovar antes del vencimiento: ¿suma desde el vencimiento o desde hoy? | **desde el vencimiento** (no se pierden días) |
| P4 | Vender dos unidades del mismo producto en una línea | **N períodos seguidos** para el mismo cliente; para dos personas, dos líneas |
| P5 | ¿El período de gracia deja entrar? | **sí**, con aviso en el check-in («En gracia 2 d») |
| P6 | Devolución parcial de una membresía ya usada | recorte proporcional por períodos; reembolso lo decide el cajero en la devolución, no la membresía |
| P7 | Icono del módulo y del menú lateral | `UserCheck` (sirve para gimnasio, club y coworking; `Dumbbell` era solo gimnasio); agregar ítem propio al `Sidebar` del kit |
| P8 | «Miembros» y «Membresías» como dos páginas | **sí**: Miembros = personas (con su historial y check-ins); Membresías = contratos |
| P9 | ¿Se retira `membership_plans.price` en la fase 3? | **sí**, tras un release con lecturas solo de `product_prices` |
| P10 | ¿Clases y horarios en una sola página (Lista · Calendario)? | **sí** |

---

## 10. Estado de la implementación (2026-09-29) — fases 1 y 2

Encargo del dueño (2026-09-28): «Aplica en código, BD y backend todo el flujo completo de la 13
Membresía». Decisiones P1–P10 del §9 aplicadas con la recomendación.

### 10.1 Base de datos (aplicada por MCP, cada migración con su rollback)

| Migración | Qué hace |
|---|---|
| `20260929000100_membresias_m1_m3_esquema` | M1 `products.service_type` (+CHECK, índice, 3 servicios → `standard`); M2 columnas del plan, `product_id` 1:1, `price` NULL-able y marcado obsoleto, guarda de coherencia; M3 estados `pending/past_due/cancelled`, `sale_item_id` único, `plan_snapshot`, `source`, eventos nuevos (`trimmed`, `grace_started`, `reactivated`), congelamiento `scheduled`; se quita la FK duplicada con CASCADE |
| `20260929000200_membresias_m4_modulo_y_permisos` | Módulo `memberships` (copia de las 45 filas de `gym`, 43 activas; 12 páginas de las orgs 125 y 133 con rutas nuevas; 2 planes de suscripción). `gym` queda inactivo en el catálogo, NO se borra. Trigger `trg_org_modules_alias_gym` replica lo que otro repo haga con `gym`. `validate_module_activation`: no cuenta dos veces el alias (33 de 43 orgs ya estaban en el tope de su plan). 7 permisos `memberships.*` sembrados de forma aditiva (roles 1, 2, 5: todos; rol 4: ver, check-in, clases; cargos con `pos_access`: ver y check-in). `fn_membresias_int_exigir` |
| `20260929000300_membresias_m5_productos_planes` | Org 106: planes 1–4 → productos 96917–96920 (`MEM-1`…`MEM-4`, categoría 1630 «Membresías»), precio en `product_prices`, duración 1 mes. La membresía 1 queda `source='manual_legacy'` con su producto y la copia de reglas |
| `20260929000400_membresias_producto_guardar` | `fn_producto_guardar` (sobre la versión viva con recetas) guarda `service_type` y `membresia` en la misma operación; `fn_producto_para_formulario` devuelve `membresia` |
| `20260929000410_membresias_plan_coherencia_al_ligar` | La guarda del plan solo al ligarlo a un producto (permitía desactivar el plan de un producto que deja de ser membresía) |
| `20260929001000_membresias_m6_funciones` | `fn_membresias_activar_venta`, `fn_membresias_revertir_linea` / `_producto`, `fn_membresias_vencer` / `_todas`, `fn_membresia_congelar` / `_descongelar` / `_cancelar`, `fn_membresia_registrar_checkin`; utilidades internas. R4: `fn_auto_journal_membership` ya no contabiliza membresías con `source` o `sale_item_id` |
| `20260929001100_membresias_enganche_venta` | Enganche (definición viva + reemplazo verificado) en `pos_checkout_v1`, `fn_factura_venta_emitir`, `fn_registrar_pago`, `pos_anular_venta_v1`, `procesar_devolucion`, `fn_nota_credito_emitir`. Marca en el código: «Membresías (20260929001100)» |
| `20260929001200_membresias_cron_vencimiento` | pg_cron `membresias-vencer`, cada hora en el minuto 7 (cada organización cruza su medianoche a una hora distinta; idempotente) |
| `20260929001300_membresias_revoke_internas` | `fn_membresias_int_exigir` sin EXECUTE para `authenticated`; `registrar_pago_membresia` / `obtener_pagos_membresia` (viejas, sin guarda de organización, sin uso) solo para `service_role` |

Guardarraíl: `src/__tests__/membresias/enganchesVentaGuardrail.test.ts` falla si una migración posterior
redefine una de las seis funciones de venta sin su llamada a membresías.

### 10.2 Pruebas en seco del flujo (MCP, `DO … RAISE`: todo se revierte)

Org 106, sucursal 79, zona America/Bogota; sesión simulada del dueño.

| Camino | Resultado |
|---|---|
| POS contado, 1 unidad | `active`, 28 sep 20:25 → 27 oct 23:59:59 (Bogotá); el resultado del cobro trae `membresias` |
| Reproducción idempotente del mismo sobre | `replayed=true`, la MISMA membresía (id y código) |
| POS sin cliente con línea membresía | `membresia_sin_cliente`, no se guarda nada |
| POS deuda, 2 unidades | `pending` con vigencia de 2 periodos |
| Settle de la deuda | la misma membresía pasa a `active` (27 nov) |
| Devolución parcial de 1 unidad | `trimmed`, vence 27 oct; reintento con la misma clave: `repetida`, sin segundo recorte |
| Venta nueva del mismo plan (renovación, P3) | extiende la misma membresía desde el vencimiento (27 nov), evento `renewed` |
| POS contado + anulación (caja abierta) | `active` → `cancelled` (`membresias_canceladas=1`) |
| Factura de contado (plan por adelantado): emitir | `pending` |
| Pago de esa factura (`fn_registrar_pago`) | se aplica como renovación de la membresía legada del mismo plan (`reactivated`, vence 27 oct); la fila pendiente queda `cancelled` con `renovacion_aplicada` |
| Factura a crédito con plan `on_credit`: emitir | `active` |
| Factura de contado por 2 meses: emitir → pagar → NC por líneas de 1 unidad | `pending` → `active` hasta 27 nov → `trimmed` hasta 27 oct; la misma NC repetida no recorta otra vez |
| NC por líneas sobre la factura cuya línea se aplicó como renovación | recorta la membresía renovada (el vínculo va en el evento) |
| Nota crédito por valor | no toca la membresía |
| Tarea de vencimiento (sin sesión, como pg_cron) | la membresía legada (vencida en julio, aún `active`) → `expired` |
| Check-in: legada vencida / activa / congelada / en gracia | `vencida` / permitido / `congelada` / permitido con aviso `en_gracia` (1 d) |
| Congelar 10 días hoy / 2.º congelamiento / descongelar el mismo día | `frozen` +10 d / rechazado / `active` y devuelve los 10 días |
| Cancelar sin motivo / con motivo / usuario de otra organización | `motivo_requerido` / `cancelled` / `42501 Acceso denegado` |
| `fn_producto_guardar` membresía 3 meses a crédito, cambio a producto, tipo inválido | plan creado (90 d); al dejar de ser servicio el plan se desactiva; `tipo_servicio_invalido` |
| Rollback de `…001100` en transacción | las seis funciones quedan sin el enganche (y se revirtió la prueba) |

### 10.3 Backend y pantallas

- API `src/app/api/membresias/**` (todas con `withOrg`, organización de la sesión, permisos con
  `get_user_permission_codes` en el servidor; otra organización → 404, organización ajena en query o
  body → 403): `resumen`, `permisos`, `membresias` (+ `[id]`, `congelar`, `descongelar`, `cancelar`),
  `miembros`, `planes` (+ `[id]`; el precio sale de `product_prices`, P9), `pagos`, `checkin`.
  Servicio: `src/lib/services/membresias/membresias.server.ts`; contrato `tipos.ts`; cliente
  `clienteMembresias.ts`; vigencias puras `vigencia.ts` (espejo de las funciones SQL, solo para
  vista previa y badges).
- Pedidos web: la confirmación automática (servidor) y la manual de «Pedidos online»
  (`POST /api/web-orders/[id]/membresias`) activan con `fn_membresias_activar_venta` y service role.
- Menú «Membresías» (`UserCheck`): Resumen, Miembros, Membresías, Planes, Clases, Reservas, Check-in,
  Instructores, Control de acceso, Pagos. `/app/gym/*` y `/gym-display/*` redirigen con 308
  (`next.config.js`); las páginas viejas y el alta sin cobro se retiraron.
- Alias `gym → memberships`: `src/lib/config/moduleAliases.ts` (servicio de módulos, reportes),
  middleware con `/app/membresias`, inicio y configuración con el código nuevo.
- Formulario de producto: «¿Qué tipo de servicio es?» y «Configuración de membresía» (A1/A2);
  `?tipo=servicio&servicio=membresia` preselecciona.
- POS: cliente obligatorio para líneas membresía (estado `sin-cliente` del botón cobrar), selector
  del titular al agregar (D1), tarjetas de membresías en el post-venta (D2), enlace de renovación
  `/app/pos?cliente=<uuid>&producto=<id>`. El catálogo sin conexión replica `service_type`.
- Pantallas con el kit, estados F1–F7, móvil y es/en/fr/pt: Resumen (E1/E2), Miembros, Membresías
  (C1/C6), detalle (C2/C7) con Congelar (C3), Cancelar con `DialogoMotivo` (C4) y Renovar (C5: POS
  o factura de venta), Planes (B1/B3), detalle del plan (B2), Pagos, Clases (Lista · Calendario),
  Reservas, Check-in, Instructores, Control de acceso y kiosco `/membresias-kiosco/[deviceId]`.

### 10.4 Pruebas automáticas

`src/__tests__/timezone/membresiasVigencia.test.ts` (corre en `test:tz` con UTC, Bogotá, México,
Madrid, Santiago y Katmandú), `src/__tests__/membresias/*` (permisos 401/403/404 de las rutas,
permisos en el servidor, guardarraíl del enganche en las funciones de venta, lógica de pantallas,
formulario de membresía, planes, operación y valores que acepta la base) y
`src/__tests__/pos/venta/requisitosMembresia.test.ts`.

### 10.5 Fase 3 (pendiente)

- Retirar `membership_plans.price` (P9) tras un release leyendo solo `product_prices`; retirar el
  alias `gym` cuando go-admin-super y goadmin-websites usen `memberships`, y entonces `modules.gym`
  y `trg_org_modules_alias_gym`.
- goadmin-websites sigue insertando `memberships`/`membership_freezes` con estados que la base
  rechaza (`pending_payment`, `pending`, R5): debe pasar a la venta web + `fn_membresias_activar_venta`.
- `fn_auto_journal_membership` y `trg_auto_journal_membership_payment`: retirar o corregir el join
  por `member_branches` (R4; hoy inertes para el modelo nuevo).
- Renovación automática (`renewal_mode='automatic'`), enlace de pago (C5, fase posterior),
  exportar listados, «última entrada» y sede en el listado de membresías.
- Check-in desde una reserva: pasar `class_reservation_id` a `fn_membresia_registrar_checkin`.
- Importación CSV de clases y reservas (no se migró), ocurrencias de clases recurrentes, validar
  en el servidor el QR de los dispositivos.
- Aviso en el diálogo de nota crédito por VALOR de que no recorta la membresía (el diálogo es de la
  sesión de facturas de venta).
- Reporte `gymReports` (MRR suma el precio del plan sin mirar la duración).

### 10.6 Riesgos vigentes

- Las seis funciones de venta llevan el enganche por parche sobre la definición viva: quien las
  redefina entera debe conservarlo (el guardarraíl lo exige para migraciones nuevas del repo).
- La membresía legada (org 106) venció en julio: la tarea horaria la marca `expired` en su primera
  pasada. Si esa persona compra de nuevo el mismo plan, la venta la reactiva (evento `reactivated`).
- La activación de pedidos web confirmados a mano no bloquea la confirmación: si falla (p. ej. sin
  cliente) queda en el log y se puede reintentar (la base es idempotente).
