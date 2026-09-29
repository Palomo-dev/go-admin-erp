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

---

## 11. Fase 3 — limpieza (2026-09-29): precio del plan, asiento viejo y MRR

Cierra tres pendientes del §10.5: P9 (precio del plan), R4 (asiento contable viejo) y el reporte
`gymReports`. Base: producción (`jgmgphmzusbluqhuqihj`); master sigue con el código viejo, así que
nada de esto borra columnas ni rompe lo que master lee.

### 11.1 Precio del plan (P9)

**Quién leía o escribía `membership_plans.price`** (búsqueda en `src/**` y en `pg_proc`):

| Dónde | Qué hacía | Ahora |
|---|---|---|
| `gymService.ts` | 4 selects embebidos `membership_plans (id, name, duration_days, price)`, `membership_plans (*)`, `getPlans`/`getPlanById` con `select('*')`; `createPlan`/`updatePlan`/`togglePlanStatus` (sin llamadores) escribían el plan desde el navegador | columnas explícitas sin `price` (`COLUMNAS_PLAN`); las tres funciones de escritura se retiraron (el plan se guarda con el producto, `fn_producto_guardar`) |
| `membresias/membresias.server.ts` | `planesConDatos` y `detalleMembresia` con `select('*')`; `precio` caía a `membership_plans.price` si el plan no tenía producto | `COLUMNAS_PLAN` sin `price`; el precio es **solo** `product_prices` vigente (plan sin producto → sin precio; hoy 0 planes sin producto). `preciosVigentes` usa la función pura `preciosVigentesPorProducto` (`mrr.ts`) |
| `reportes/modulos/gymReports.ts` | `membership_plans(name, price)` para el MRR | ver §11.3 |
| `fn_auto_journal_membership` (SQL) | `SELECT name, price … FROM membership_plans` | precio vigente del producto (`fn_membresias_int_precio_vigente`); ver §11.2 |
| `fn_producto_guardar` (SQL) | sus dos `insert into membership_plans (…, price, …) values (…, null, …)` | ya no nombra la columna |

Ninguna otra función viva lee la columna (`fn_membresias_activar_venta`, `_revertir_linea`,
`_int_snapshot`, `fn_producto_para_formulario` solo usan otras columnas del plan).

**Por qué la columna se queda (y sincronizada).** Además de master, **goadmin-websites** en su rama
de producción (`main`) la lee para cobrar y mostrar: `app/api/checkout/init/route.ts:587` (total del
pago = `plan.price`), `app/api/memberships/purchase/route.ts` (subtotal) y
`lib/memberships/payment-handler.ts` (correo). Su rama `claude/vercel-image-optimization-jpkpyn`
(commit `5484245`, sin desplegar) ya pasa a `product_prices`; hasta que se despliegue, la columna
sigue alimentando al sitio. Un plan creado desde el producto
nacía con `price = NULL` y un cambio de precio en el producto no llegaba al plan: el sitio habría
mostrado 0 o un precio viejo. Por eso la columna pasa a ser una **copia de solo lectura** del precio
vigente del producto, mantenida por la base:

| Migración | Qué hace |
|---|---|
| `20260929235000_membresias_f3_precio_plan_legado` | `fn_membresias_int_precio_vigente(product_id)` (misma regla que el POS); `fn_membresias_sincronizar_precio_legado(product_id\|null)`; `trg_membresias_precio_legado` (AFTER INSERT/UPDATE/DELETE en `product_prices`: copia al plan ligado); `trg_membership_plans_precio_legado` (BEFORE en `membership_plans`: un plan con producto siempre lleva el precio del producto, aunque master escriba otro); pg_cron `membresias-precio-legado` (minuto 17 de cada hora: un precio programado entra en vigencia sin que nadie escriba); `fn_producto_guardar` sin `price` (definición viva + reemplazo verificado: 2 apariciones exactas); comentario de la columna actualizado. Todas las funciones `SECURITY DEFINER` con `revoke … from public, anon, authenticated` (el disparador no necesita EXECUTE del usuario: probado como `authenticated`) |

Datos: 4 planes (org 106), los 4 con producto y con `price` igual al vigente → la copia inicial cambió
0 filas.

Prueba en seco (`DO … RAISE`, revertida), sesión simulada del dueño de la org 106:

| Caso | Resultado |
|---|---|
| Precio nuevo vigente del producto del plan 1 (138 000 → 150 000) | plan 1 = 150 000 |
| Precio programado para mañana del plan 2 | plan 2 sigue en 295 000; al entrar en vigencia (simulado) → 999 999 |
| Master escribe `update membership_plans set price = 1` (plan 3) | la fila se actualiza pero `price` queda en 416 000 |
| Borrar el precio vigente nuevo del plan 1 | vuelve a 138 000 |
| `fn_producto_guardar` crea una membresía trimestral de 270 000 | plan nuevo con `duration_unit='month'`, `duration_value=3`, `price=270 000` (antes: `NULL`) |
| Rollback de la migración en transacción | `fn_producto_guardar` vuelve a nombrar `price` (2 veces), 0 disparadores, 0 tareas |

Guardarraíl: `src/__tests__/membresias/precioPlanGuardrail.test.ts` falla si código de `src/` (fuera
de pruebas) vuelve a pedir `price` o `*` en un select embebido `membership_plans(...)`, selecciona `*`,
`price` o nada en `.from('membership_plans')`, escribe `price` en ese `insert/update/upsert`, o si un
archivo del dominio membresías lee `.price` de un plan. Incluye una autoprueba con las formas viejas.

**Propuesta de retiro (NO aplicada).** Va en una migración posterior, cuando se cumplan las tres
condiciones: (1) main desplegado en master; (2) goadmin-websites desplegado leyendo el precio del
producto (`membership_plans.product_id` → `product_prices` vigente) en las rutas citadas (commit
`5484245` o posterior, en su propio PR);
(3) `go-admin-super` sin lecturas de la columna. Antes de aplicarla, comprobar por MCP que ninguna
función viva la nombra (`pg_get_functiondef … ilike '%membership_plans%'` con `price`) y que ninguna
vista depende de ella (`pg_depend`). Es un `DROP` sobre una tabla con datos de clientes: requiere
aprobación del dueño (la columna es una copia derivable de `product_prices`, así que el rollback sí
reconstruye los valores).

```sql
-- <ts>_membresias_retirar_precio_plan.sql (PROPUESTA)
do $$ begin
  if exists (select 1 from cron.job where jobname = 'membresias-precio-legado') then
    perform cron.unschedule('membresias-precio-legado');
  end if;
end $$;
drop trigger if exists trg_membership_plans_precio_legado on public.membership_plans;
drop trigger if exists trg_membresias_precio_legado on public.product_prices;
drop function if exists public.fn_membresias_tg_plan_precio_legado();
drop function if exists public.fn_membresias_tg_precio_producto();
drop function if exists public.fn_membresias_sincronizar_precio_legado(integer);
-- Asiento viejo (desactivado en §11.2): se retira con la columna.
drop trigger if exists trg_auto_journal_membership on public.memberships;
drop trigger if exists trg_auto_journal_membership_payment on public.payments;
drop function if exists public.fn_auto_journal_membership();
drop function if exists public.fn_auto_journal_membership_payment();
alter table public.membership_plans drop column if exists price;
-- Rollback: add column price numeric; recrear las funciones y disparadores de 20260929235000 y
-- 20260929235100 (sus archivos); select public.fn_membresias_sincronizar_precio_legado();
```

### 11.2 Asiento contable viejo (R4)

**Qué hacían.** `trg_auto_journal_membership` (AFTER INSERT/UPDATE OF status en `memberships`) creaba
un asiento `source='membership'` con el precio del plan en el alta (`created`), la renovación
(`renewed`, de `expired/cancelled` a `active`) y la cancelación (`cancelled`), si la membresía no
traía `sale_id`; desde `20260929001000` además salía si traía `source` o `sale_item_id`. Unía
`member_branches.organization_member_id = NEW.id` (id de la membresía: siempre sucursal 0).
`trg_auto_journal_membership_payment` (AFTER INSERT en `payments` con `source='membership'`) creaba un
asiento `membership_payment` con la regla `paid` si el pago estaba `completed`, sin venta ni factura.

**Evidencia (conteos, 2026-09-29):**

| Dato | Valor |
|---|---|
| `memberships` | 1 (`source='manual_legacy'`, `expired`); sin `source` ni `sale_item_id`: **0** |
| `payments` con `source='membership'` (historia completa) | **0** |
| `membership_payments` | 0 |
| `journal_entries` con `source` `membership` o `membership_payment` (historia completa) | **0** |
| `accounting_rules` `source_type='membership'` | 94 en 89 organizaciones; `created` de 88 debita **1105 Caja** / acredita 4250 |
| goadmin-websites | su alta usa `status='pending_payment'` (la CHECK la rechaza) y sus pagos entran con `status='paid'` (el disparador de pagos solo mira `completed`): no dispara ninguno |

**¿El modelo nuevo ya queda contabilizado?** Sí, por la venta: `trg_auto_journal_sale_pos` (`sales`,
venta POS), `trg_auto_journal_sale` (`invoice_sales`, factura emitida por `fn_factura_venta_emitir`) y
`trg_auto_journal_payment` (`payments` con `source` `invoice_sales`/`sale`, cobros de
`fn_registrar_pago`); todos activos. Las membresías del modelo nuevo siempre llevan `source` y
`sale_item_id`, así que el disparador viejo no las tocaba (no había duplicado).

**Decisión: desactivar ambos.** Lo único que aún podían contabilizar era un alta **sin cobro** del
módulo gym de master: un asiento Caja/ingreso sin dinero en ningún turno de caja, y doble ingreso si
esa membresía también se cobraba por el POS. No hay pagos ni membresías legadas que los necesiten.
Desactivar no lanza errores en master (sus insert siguen funcionando, solo sin ese asiento).

| Migración | Qué hace |
|---|---|
| `20260929235100_membresias_f3_asiento_legado` | `ALTER TABLE … DISABLE TRIGGER` de `trg_auto_journal_membership` y `trg_auto_journal_membership_payment` (reversible); `fn_auto_journal_membership` redefinida sobre la versión viva: precio vigente del producto (no `membership_plans.price`) y sucursal `memberships.branch_id` (no el join erróneo), para que reactivarla no reintroduzca los errores; comentarios en funciones y disparadores. El rollback reactiva ambos y reinstala la función anterior |

Prueba en seco (revertida): alta legada sin `source` (como master) → 0 asientos; pago
`source='membership'` `completed` → 0 asientos `membership_payment`; con el disparador reactivado solo
dentro de la prueba, el alta legada genera 138 000 débito / 138 000 crédito en la **sucursal 79** (antes
habría sido la 0) con el precio del producto; rollback en transacción → ambos `O` (activos),
`proconfig` y comentarios como estaban.

### 11.3 Reporte de membresías y MRR (`gymReports`)

Antes: `MRR = Σ membership_plans.price` de las membresías con `status='active'` (un plan anual sumaba
el año entero como si fuera un mes; una `active` ya vencida seguía sumando), sin filtro de sucursal, y
días con `split('T')[0]` (día UTC).

Ahora (`src/lib/services/reportes/modulos/gymReports.ts`, informe `gym-membresias`):

- Precio = **precio vigente del producto** del plan en `product_prices` (una consulta con `in`), nunca
  `membership_plans.price`.
- Normalizado a mes con `duration_unit`/`duration_value` del plan (respaldo `duration_days`):
  mes → `precio / valor`; año → `precio / (12·valor)`; día → `precio · (365/12) / valor`;
  semana → `precio · (365/12) / (7·valor)`. Mes promedio de 30,42 días para que 12 cuotas sumen el año.
- Suman solo las membresías **activas o en gracia** (`estadoVisual` de `vigencia.ts`, la misma regla
  que los badges y el check-in: una `active` vencida sin gracia ya no suma aunque la tarea horaria no
  haya pasado). Pendientes, congeladas, vencidas y canceladas no.
- Por organización (`organization_id`) y, si el informe filtra sucursal, por `memberships.branch_id`
  (las legadas sin sucursal quedan fuera de ese filtro).
- Fechas en la zona de la organización (`getOrganizationTimezone` + `toPlainDate`): «Nuevas» por día
  de inicio; la columna «Cuota mensual» es la cuota normalizada. En el mismo archivo, «Actividad de
  membresías» usa `getOrgDateRange` (antes límites UTC `T00:00:00Z`) y agrupa por día de la
  organización, y «Retención» compara el día de vencimiento en esa zona.

La normalización vive en funciones puras en `src/lib/services/membresias/mrr.ts`
(`duracionDelPlan`, `periodosPorMes`, `cuotaMensual`, `preciosVigentesPorProducto`, `sumaAlMrr`,
`cuotaMensualDeMembresia`, `calcularMrr`), con pruebas en `src/__tests__/membresias/mrr.test.ts`:
planes de 1 mes (138 000 → 138 000), 3 meses (270 000 → 90 000), 1 año (1 200 000 → 100 000),
15 días (50 000 → 101 388,89) y 1 semana (20 000 → 86 904,76); los cinco juntos dan 516 293,65
(el cálculo viejo daba 1 678 000); en gracia suma y vencida/congelada/pendiente/cancelada no; sin
precio vigente no suma; vence a las 23:59:59 de Bogotá.

### 11.4 Archivos y verificación

- Migraciones (aplicadas por MCP, con rollback): `20260929235000_membresias_f3_precio_plan_legado`,
  `20260929235100_membresias_f3_asiento_legado`.
- Código: `src/lib/services/gymService.ts`, `src/lib/services/membresias/membresias.server.ts`,
  `src/lib/services/membresias/mrr.ts` (nuevo), `src/lib/services/reportes/modulos/gymReports.ts`.
- Pruebas: `src/__tests__/membresias/mrr.test.ts` y `precioPlanGuardrail.test.ts` (nuevas).
- `npx jest src/__tests__/membresias src/__tests__/guardrails.test.ts`: 18 suites, 430 pruebas en
  verde (incluye suites que otras sesiones añadieron en paralelo); `mrr.test.ts` también con `TZ=UTC` y `TZ=America/Bogota`. `tsc --noEmit` sin errores en
  los archivos tocados; `eslint` limpio en ellos.

Del §10.5 quedan cerrados: P9 en el código de main (falta el DROP, propuesto arriba), R4 y el MRR de
`gymReports`. Siguen abiertos el alias `gym` y la migración de goadmin-websites (R5), que además es
condición del DROP de la columna.

---

## 13. Check-in desde reserva e importación CSV (fase 3, 2026-09-29)

Cierra dos puntos del §10.5: «check-in desde una reserva» e «importación CSV de clases y reservas».
Los otros dos del mismo renglón (ocurrencias de clases recurrentes y QR de los dispositivos) quedan
documentados en §13.4 y **no** se hicieron.

### 13.1 Base de datos (aplicada por MCP, cada migración con su rollback)

| Migración | Qué hace |
|---|---|
| `20260929235200_membresias_checkin_desde_reserva` | `fn_membresia_registrar_checkin` gana `p_class_reservation_id integer default null` sobre la definición **viva** (md5 `9e57bfed…`): las llamadas de 5 argumentos (check-in normal, kiosco) no cambian. Se quita la firma de 5 argumentos en la misma transacción (si quedaran las dos, una llamada de 5 sería ambigua). Índice único parcial `member_checkins_reserva_permitida_uq (class_reservation_id) where denied_reason is null`. La columna `member_checkins.class_reservation_id` (FK a `class_reservations`, `ON DELETE SET NULL`) ya existía y estaba vacía |
| `20260929235300_membresias_importar_clases_reservas` | `fn_membresias_importar_clases` y `fn_membresias_importar_reservas (p_organization_id, p_filas jsonb, p_solo_validar boolean default false)`: `SECURITY DEFINER`, `fn_membresias_int_exigir` (pertenencia + `memberships.classes.manage`), `revoke … from public, anon` |

Los archivos se renombraron de `…235000`/`…235100` a `…235200`/`…235300` después de aplicarlos para no
chocar de versión con §11; los marcadores «20260929235000» dentro del cuerpo de la función son los
del texto aplicado.

Con reserva, la función:
- busca la reserva **con la organización del parámetro** y la bloquea (`for update`): otra
  organización o id inexistente → `reserva_no_encontrada`; de otro cliente → `reserva_de_otro_miembro`;
  la sede debe ser la de la clase (`sucursal_invalida`); reserva o clase canceladas → `reserva_cancelada`
  / `clase_cancelada`, sin registrar nada;
- aplica **las mismas reglas** del check-in (vencida, congelada, pendiente, gracia con aviso, sede del
  plan, horario, tope diario). La reserva **no elige** la membresía: se usa la que mejor da acceso
  (una reserva ligada a una membresía vieja no debe dejar fuera a quien renovó);
- permitida: inserta la entrada con `class_reservation_id` y deja la reserva `checked_in`
  (`checkin_time`, y `membership_id` si no tenía). Rechazada: registra el rechazo con la reserva y la
  reserva queda como estaba (`booked`);
- **idempotente**: si ya hay una entrada permitida con esa reserva devuelve la misma (`repetida: true`,
  mismo `checkin_id`) sin insertar otra; el candado serializa dos clics simultáneos y el índice único
  lo garantiza en la tabla. Una reserva marcada «asistió» a mano (sin entrada) sí registra la entrada;
- una reserva `no_show` admite la entrada (llegó tarde).

Consecuencia documentada: la entrada a una clase **cuenta** para `daily_checkin_limit` como cualquier
otra entrada. Con un plan de «1 entrada al día», quien entró por la puerta ya no puede registrar la
clase ese día (`limite_diario`). Si el dueño quiere que la clase no consuma el tope, es un cambio de
regla en la función, no en la pantalla.

Importación — decisión: **todo o nada**. La RPC valida todas las filas; si alguna tiene un error no
escribe nada y devuelve el reporte por fila (`filas: [{fila, errores[], inicio, miembro, clase}]`).
Con `p_solo_validar` solo valida: es la vista previa del diálogo, y al importar se valida otra vez
(si algo cambió entre la vista previa y el clic —p. ej. otra persona tomó el último cupo— no se
guarda nada y el diálogo muestra los errores nuevos). Motivo: un archivo a medias obliga a saber qué
filas entraron para no duplicarlas al reintentar; con todo o nada se corrige el archivo y se sube
entero. Máximo **500 filas** por archivo (también en la ruta y en el navegador).

| Validación en la base | Clases | Reservas |
|---|---|---|
| Organización y permiso | `fn_membresias_int_exigir(org, memberships.classes.manage)` | igual |
| Sede | id, nombre o código; opcional si la organización tiene una sola sede activa | opcional (desempata clases iguales en dos sedes); debe pasar `app_branch_access` (la política restrictiva de `class_reservations`) |
| Personas | instructor = correo de un miembro **activo** de la organización (`instructor_id` es NOT NULL) | miembro por `identification_number` (exacto por el índice único; si no, normalizado: «1.020.304» = «1020304») o correo (exacto; si no, sin mayúsculas). Los mapas normalizados se arman una vez por llamada, no por fila. Documento y correo de personas distintas → `miembro_no_coincide` |
| Fecha y hora | de pared, en la zona de la sede (`fn_timezone_for`) | clase por título (sin mayúsculas) + `start_at` = fecha y hora en la zona de SU sede |
| Valores | duración 5–480 min (60 por defecto), capacidad 1–1000 (10), nivel y estado (`active`/`completed`) de las CHECK | estado (`booked` por defecto, `checked_in`, `no_show`, `cancelled`) y origen (`staff` por defecto) de las CHECK |
| Duplicadas | en el archivo y en la base (misma sede, título e inicio, no canceladas) | en el archivo y en la base (UNIQUE clase-cliente) |
| Otras | — | clase cancelada; `booked` en clase no programada; cupo (reservas no canceladas de la base + las del archivo) |

Reservas importadas como `checked_in` son **histórico**: no crean filas en `member_checkins` ni validan
membresía (la entrada con reglas es la de arriba). `checkin_time` = inicio de la clase.

Pruebas en seco (MCP, `DO … RAISE`, todo revertido; org 106, sede 79, America/Bogota, sesión simulada
del dueño con `request.jwt.claims` + `set local role authenticated`):

| Caso | Resultado |
|---|---|
| Entrada desde reserva con membresía activa | permitida, reserva `checked_in`, `membership_id` completado |
| Segundo clic sobre la misma reserva | `repetida=true`, mismo `checkin_id`, **1** fila en `member_checkins` |
| Reserva del cliente con membresía vencida | rechazada `vencida`, la reserva sigue `booked`, rechazo registrado con la reserva |
| Reserva de otro miembro / cancelada / inexistente | `reserva_de_otro_miembro` / `reserva_cancelada` / `reserva_no_encontrada` |
| Llamada de 5 argumentos (posicional y con nombres) | igual que antes |
| Clases: vista previa con 4 filas | fila buena sin errores; duplicada en el archivo; título, instructor y fecha (30 feb) inválidos; sede inexistente, hora «7:00» sin normalizar, duración, nivel y estado inválidos |
| Clases: importar la fila buena | 1 clase; «2026-10-05 07:00» Bogotá = `12:00Z`; reimportar → `clase_ya_existe` |
| Reservas: vista previa (clase con cupo 2) | documento normalizado y correo en mayúsculas encuentran al miembro; duplicada en el archivo; `clase_sin_cupo` en la 3.ª; miembro y clase inexistentes, estado inválido; documento y correo de personas distintas; sin miembro y fecha DD/MM sin normalizar |
| Reservas: importar | 2 reservas (`booked/staff` y `checked_in/web` con `checkin_time`); reintento → `clase_sin_cupo` y `reserva_ya_existe`, nada guardado |
| 0 filas / 501 filas / usuario de otra organización | `importacion_sin_filas` / `importacion_demasiadas_filas` / `42501 Acceso denegado a la organización` |

### 13.2 Backend y pantallas

- Rutas (todas `withOrg`, organización de la sesión, `readOrgBody` → organización ajena en body o
  query = 403, permisos en el servidor con `exigir`):
  - `POST /api/membresias/reservas/[id]/entrada` (`memberships.checkin`): lee la reserva con la
    organización de la sesión y el cliente de la sesión (RLS + `app_branch_access`; si no la ve: 404)
    y llama la función con el miembro, la sede de la clase y `p_class_reservation_id`.
  - `POST /api/membresias/importar/clases` y `/reservas` (`memberships.classes.manage`):
    `{ filas, soloValidar }`, esquema `zod` estricto (`esquemasImportacion.ts`, sin campos de más).
- Servicio `src/lib/services/membresias/operacionClases.server.ts`; lógica pura
  `checkinReserva.ts` (cuándo ofrecer el botón, respuesta → contrato, tipo de aviso, errores → HTTP:
  `reserva_no_encontrada` 404, reglas 422, permiso 403) e `importacionCsv.ts` (columnas con alias
  es/en/fr/pt, fechas `AAAA-MM-DD` o `DD/MM/AAAA` sin pasar por la zona del navegador, horas 24 h,
  am/pm y «19h30», niveles/estados/orígenes a los valores de las CHECK, duplicadas en el archivo,
  tope de filas, reporte combinado navegador + base, plantilla). El archivo se lee con el lector del
  importador de productos (`lib/inventario/importacion/lector.ts`: UTF-8 o Windows-1252, «,» «;» o
  tabulador) y la plantilla con `lib/utils/csv.ts` (BOM, «;», celdas protegidas contra fórmulas): no
  se añadió ninguna dependencia.
- Reservas (y la lista de asistentes de una clase, `?clase=<id>`): «Registrar entrada» llama la ruta
  nueva; toasts de permitida, en gracia, rechazada con motivo y «ya estaba registrada». Se ofrece para
  reservas `booked` y `no_show` de clases no canceladas. Ya no se escribe la asistencia desde el
  navegador después del check-in (lo hace la función en la misma transacción).
- Clases y Reservas: botón «Importar CSV» (solo con `memberships.classes.manage`) →
  `DialogoImportarCsv` (kit: `PanelAdaptable`, `DataTable` con tarjeta móvil, `StatusBadge`):
  plantilla descargable, archivo (.csv, 2 MB), vista previa por fila con errores en español (y en/fr/pt,
  `membresias.importar.*`), inicio en la zona de la organización y «Importar N filas» solo sin
  errores.

### 13.3 Pruebas automáticas

- `src/__tests__/membresias/importacionCsv.test.ts`: normalizadores (fechas reales e inválidas, horas,
  alias → CHECK), cabecera con alias y columnas faltantes, filas buenas/malas de clases y reservas,
  duplicadas (documento escrito distinto), tope de 500, instantes en la zona (Bogotá/Madrid, 23:30 que
  no se corre de día), reporte combinado, plantilla que se relee sin errores y CSV Windows-1252 con «;».
- `src/__tests__/membresias/checkinReserva.test.ts`: cuándo ofrecer el botón, respuesta de la base
  (permitida, repetida, rechazada, gracia, sin membresía, respuesta vacía ≠ permitida), errores → HTTP.
- `src/__tests__/membresias/rutasOperacionClasesPermisos.test.ts`: 401 sin sesión, 403 sin permiso
  (aplicación y 42501 de la base), 404 reserva de otra organización e id no numérico, 403 organización
  ajena en body y query, argumentos de las RPC con la organización de la sesión, 400 por cuerpo inválido.

### 13.4 No hecho (y por qué)

- **Ocurrencias de clases recurrentes.** `gym_classes.recurrence` guarda `{type, days, until}` desde el
  diálogo pero ninguna fila la usa (0 clases con recurrencia). Materializar ocurrencias exige decidir
  cómo se identifica la serie (no hay `series_id`), qué pasa al editar o cancelar «esta y las
  siguientes», el horizonte (¿hasta `until` o N semanas?) y quién las genera (al guardar o una tarea
  como `membresias-vencer`). No es barato ni está claro: queda para una decisión del dueño. Mientras,
  la importación CSV sirve para cargar un calendario de varias semanas.
- **Validar en el servidor el QR de los dispositivos.** El QR del dispositivo
  (`gym-checkin:<deviceId>:<token>`, `current_qr_token` + `qr_token_expires_at`) no lo lee nada en este
  repo: la validación depende de quién lo escanea (¿la app del miembro? ¿goadmin-websites?) y de cómo
  se identifica al miembro en esa petición (hoy no hay sesión de cliente final en el ERP).
  `gym_access_devices` además no tiene `organization_id` (se llega por `branch_id`). Hace falta
  definir el consumidor antes de escribir la RPC (`fn_membresia_checkin_qr(device_id, token, …)` con
  comparación en tiempo constante, caducidad y organización desde la sede, nunca del payload).

### 13.5 Archivos

`supabase/migrations/20260929235200_membresias_checkin_desde_reserva.sql`,
`supabase/migrations/20260929235300_membresias_importar_clases_reservas.sql` (+ sus rollbacks en
`supabase/rollbacks/`), `src/lib/services/membresias/{checkinReserva.ts, importacionCsv.ts,
esquemasImportacion.ts, operacionClases.server.ts}`, `tipos.ts` y `clienteMembresias.ts` (añadidos),
`src/app/api/membresias/reservas/[id]/entrada/route.ts`, `src/app/api/membresias/importar/{clases,reservas}/route.ts`,
`src/components/membresias/operacion/importar/DialogoImportarCsv.tsx`, páginas
`src/app/app/membresias/{clases,reservas}/page.tsx`, `messages/{es,en,fr,pt}.json`
(`membresias.importar`, `membresias.errores`, `membresias.reservas.toasts.entradaRepetida`).

---

## 12. Renovación automática, enlace de pago y exportar (fase 3, 2026-09-29)

Cierra del §10.5 el renglón «renovación automática (`renewal_mode='automatic'`), enlace de pago (C5),
exportar listados, “última entrada” y sede en el listado de membresías». (Va después del §13 porque
este documento solo se amplía; la numeración es la del encargo.)

### 12.1 Renovación automática: qué hace y qué NO hace

Regla del encargo: **nunca mover dinero sin intervención ni emitir factura electrónica sola**. Con esa
regla, «automática» significa **aviso y cobro asistido**, no cobro recurrente:

| Momento | Qué pasa | Dónde |
|---|---|---|
| Faltan **7 días** o menos para `end_date` (plan con `renewal_mode='automatic'` y producto) | Se deja una **renovación pendiente**: evento `renewal_due` en `membership_events` con `periodo_hasta`, `periodo_hasta_epoch`, `vence_dia` (zona de la organización), `plan_id`, `product_id`, `precio` vigente de `product_prices` y `dias_aviso` | `fn_membresias_generar_renovaciones(org)`, llamada por la tarea horaria existente (`membresias-vencer` → `fn_membresias_vencer_todas`), antes de vencer |
| Alguien la cobra | Renovar = vender el producto del plan (POS, factura o enlace de pago cuando exista); la base extiende la **misma** membresía desde el vencimiento (P3) dentro de la venta o del pago (`fn_membresias_activar_venta`, sin lógica nueva) | camino de siempre (§4) |
| Vence sin pago | `fn_membresias_vencer` la pasa a `past_due` con gracia (si el plan tiene `grace_days`) o a `expired`, igual que a una manual. La pendiente sigue visible: cobrarla la reactiva (`reactivated`) | sin cambios |
| Ya renovada | `end_date` cambió, así que la pendiente del periodo anterior deja de aplicar sola (la interfaz compara la clave con el `end_date` actual) | `renovacion.ts` |

- **Idempotente:** índice único parcial `membership_events_renewal_due_uq (membership_id,
  (metadata->>'periodo_hasta_epoch')) where event_type='renewal_due'`; la tarea corre cada hora y deja
  **un** evento por periodo. `fn_membresias_vencer_todas` genera y vence en bloques separados: un fallo
  de la generación se reporta (`error_renovaciones`) y no frena el vencimiento.
- **Qué membresías:** `active`, o `past_due` con gracia vigente; no congeladas (su vencimiento se mueve
  al descongelar), ni pendientes, ni la fila cancelada con `renovacion_aplicada`; plan con producto
  (sin producto no hay qué vender). `renewal_mode` se lee del **plan vivo** (si el dueño apaga la
  automática, dejan de generarse), no de la copia `plan_snapshot`.
- **Por qué 7 días fijos:** es la ventana de «Vencen en 7 días» del listado y del Resumen. Está en un
  solo sitio en la base y su espejo `DIAS_AVISO_RENOVACION` (`renovacion.ts`); la prueba
  `renovacionAutomatica.test.ts` falla si divergen. Hacerla configurable por plan es la decisión D2.
- **Seguridad:** `SECURITY DEFINER`, `fn_assert_acceso_org`, `revoke all … from public, anon,
  authenticated` (solo la tarea programada / service role). No inserta en `sales`, `sale_items`,
  `invoice_*`, `payments` ni `accounts_receivable`, no llama pasarelas ni la DIAN (lo verifica la prueba
  sobre el texto de la migración).
- **Formulario del producto:** la opción «Renovación automática» (que decía «cobro recurrente a la
  tarjeta… más adelante» y estaba bloqueada) queda habilitada con el texto real: «7 días antes del
  vencimiento la renovación queda pendiente de cobro… Nunca se cobra ni se factura sola».
  `fn_producto_guardar` ya guardaba `renewal_mode`; el formulario mandaba siempre `manual`. El detalle
  del plan (B2) dice «renovación automática».
- **Pantallas:** detalle de la membresía con el aviso «Renovación pendiente de cobro» (fecha y precio
  vigente) y «Cobrar renovación» → diálogo Renovar (C5); filtro «Renovación pendiente» en el listado;
  el evento aparece en el historial y en la actividad del Resumen.

Hoy (2026-09-29) los 4 planes existentes (org 106) son `manual`: la migración no cambia nada para nadie
hasta que el dueño de un plan elija «automática».

#### Por qué NO se genera un borrador de factura / cuenta por cobrar automático

Era la propuesta inicial. Evidencia en la base:
1. `fn_factura_venta_guardar` exige `auth.uid()` (`no_autenticado`): la tarea programada no tiene
   usuario. Hacerlo exigiría un «usuario sistema» o una segunda implementación de la factura
   (regla 7).
2. Aun en borrador, el alta inserta `sales` (`pending`) y `sale_items`: el borrador ya cuenta en
   reportes de ventas y en «Ingresos del mes» del Resumen, y los disparadores de `sale_items` corren.
   Un borrador por cada renovación automática inflaría las ventas de organizaciones que no lo pidieron.
3. Un borrador **emitido** es una factura (y electrónica si la organización factura a la DIAN):
   emitirla es siempre un clic de una persona.

### 12.2 Enlace de pago (C5)

Encargo: «Renovar» y la renovación pendiente ofrecen un enlace para que el cliente pague en línea,
**reutilizando** la infraestructura existente; al pagarse, la membresía se activa por el camino de
siempre. Hallazgo: **ningún enlace de pago existente termina en ese camino.**

| Infraestructura | Qué hace al cobrar | ¿Activa la membresía? |
|---|---|---|
| ERP · Stripe Payment Link (`stripePaymentLinkService`, `/api/crm/payments/link`) | Solo para cotizaciones del CRM (`quotation_id` obligatorio en la metadata); el webhook registra con `registerCrmPayment` → `fn_register_crm_payment` | **No**: `fn_register_crm_payment` no llama `fn_membresias_activar_venta` (verificado en la definición viva) |
| ERP · Bold link / QR (`cobroQrServidor`, `/api/integrations/bold/create-link`) | Solo POS y folio; `confirmQrPayment` inserta un `payments` suelto (sin factura) y la venta del POS la crea el navegador después | **No** |
| Sitio web · «Pagar factura» (`/api/checkout/init` con `source=invoice`, `mi-cuenta/facturas/[id]`) | El webhook (`handleInvoicePayment`) actualiza `invoice_sales` y `accounts_receivable` a mano, sin `fn_registrar_pago` | **No**, y además busca la factura por número **sin filtrar la organización** (ver D5) |

Por eso se implementó la parte inequívoca:
- `GET /api/membresias/membresias/[id]/enlace-pago` → `{ disponible, motivo, pasarelas }`
  (`memberships.view`; otra organización → 404; conexiones `connected` de la organización leídas con
  RLS, solo el código del conector, nunca credenciales).
- En el diálogo Renovar, «Enviar enlace de pago» se muestra **deshabilitada con su motivo**:
  «sin pasarela» (la organización no tiene Wompi, Stripe, Bold link, Mercado Pago, PayU ni PayPal
  conectados; hoy 5 conexiones Wompi y 2 Stripe en toda la base) o «tu pasarela todavía no registra el
  pago de la factura por el camino que activa la membresía».
- Cuando exista el riel (D4), basta con `RIEL_ENLACE_QUE_ACTIVA_MEMBRESIA` en `enlacePago.ts` y la
  creación del enlace en el servidor sobre la factura de la renovación.

### 12.3 Exportar listados

- `GET /api/membresias/exportar?tipo=membresias|miembros|pagos&idioma=…&<filtros>`: CSV generado en
  el servidor con la organización de la sesión y `memberships.view`, con los **mismos filtros** que la
  pantalla (membresías: búsqueda, estado —incluida «renovación pendiente»—, plan, cliente; miembros:
  búsqueda y vigencia; pagos: rango de días) porque reutiliza `listarMembresias`, `listarMiembros` y
  `listarPagos` (con `soloFilas`: sin conteos ni total del periodo en cada página). Tope 5 000 filas
  (`X-Exportacion-Truncado` + aviso).
- Formato: la utilidad única de CSV del repo (`filasACsv` de `lib/utils/csv.ts`: BOM, «;», fórmulas
  neutralizadas — los nombres son datos de terceros). Fechas en la zona de la organización;
  importes con los separadores de su moneda y sin símbolo (`formatNumeroMoneda`, «1.250.000»), como
  Finanzas; estados y columnas en el idioma de la pantalla (`membresias.exportar.*`, estados del kit).
  **Excel (.xlsx): no** — el repo no tiene utilidad de exportación a Excel (solo `XLSX` suelto en dos
  servicios); el CSV con BOM y «;» abre directo en Excel en español.
- Botón «Exportar CSV» en Membresías (menú de la cabecera), Miembros y Pagos.

### 12.4 «Última entrada» y sede en el listado de membresías

`listarMembresias` completa, para la página visible, `sucursal` (nombre de `memberships.branch_id`,
donde se vendió) y `ultimaEntrada` (última entrada **permitida** con esa membresía en
`member_checkins`): dos consultas por página, sin N+1. Columnas «Sede» (≥ xl) y «Última entrada»
(≥ lg), y en el CSV.

### 12.5 Base de datos (aplicada por MCP)

| Migración | Qué hace |
|---|---|
| `20260929235400_membresias_renovacion_automatica` (versión aplicada `20260929211718`) | CHECK de `membership_events.event_type` + `renewal_due` (amplía, no invalida filas); índice único parcial de idempotencia; `fn_membresias_generar_renovaciones`; `fn_membresias_vencer_todas` genera antes de vencer. Rollback en `supabase/rollbacks/` (restaura la función anterior; **borra** los eventos `renewal_due`, que son avisos sin dinero ni documentos) |

Pruebas en seco (MCP, `DO … RAISE`, todo revertido; org 106, plan 2 pasado a automático y la
membresía 1 puesta activa en la prueba):

| Caso | Resultado |
|---|---|
| Vence en 3 días: generar dos veces | 1 evento, luego 0 (idempotente); metadata con precio 295 000 y `vence_dia` en Bogotá |
| Tarea horaria completa después | sin cambios (`[]`) |
| Renovada (vencimiento a 5 días, periodo nuevo) | 1 evento nuevo |
| Vencimiento a 20 días | 0 |
| Vence en esta hora sin pago (gracia 0) | la tarea genera la pendiente del periodo **y** la vence: `expired` |
| Usuario autenticado llama `fn_membresias_generar_renovaciones` o `fn_membresias_vencer_todas` | `42501 permission denied` |
| Rollback en transacción | función e índice fuera |

### 12.6 Pruebas automáticas

- `src/__tests__/membresias/renovacionAutomatica.test.ts`: cuándo se genera (ventana, plan manual, sin
  producto, estados, gracia, `renovacion_aplicada`), idempotencia simulada (dos pasadas, cada hora
  durante 7 días, periodo nuevo), clave igual a la de la base (microsegundos), pendiente vigente,
  formulario del producto (ida y vuelta de `automatic`) y contrato con la migración (7 días, índice,
  sin dinero ni documentos, sin grant).
- `src/__tests__/membresias/exportarCsv.test.ts`: columnas en 4 idiomas, fechas en la zona (23:30 de
  Bogotá), importes «1.250.000» sin símbolo, comillas y «;», inyección de fórmulas, celdas vacías,
  nombre del archivo.
- `src/__tests__/membresias/rutasFase3Permisos.test.ts`: exportar y enlace de pago — 401 sin sesión,
  403 sin permiso, 403 organización ajena en la query, 404 membresía de otra organización e id no
  numérico, filtros y páginas con la organización de la sesión, pasarela de otra organización no
  cuenta.
- `src/__tests__/membresias/enlacePago.test.ts`: motivos del enlace.

### 12.7 Decisiones pendientes del dueño

| # | Decisión | Recomendación |
|---|---|---|
| D1 | ¿La renovación automática debe crear además un documento (borrador de factura o cuenta por cobrar)? | **No por ahora**: el borrador ya cuenta como venta pendiente (§12.1). Si se quiere, crearlo **al hacer clic** en «Cobrar renovación» (con el usuario), no en la tarea |
| D2 | ¿Ventana de aviso configurable por plan? | 7 días fijos mientras nadie lo pida; si sí: columna `membership_plans.renewal_notice_days` (nullable, default 7) |
| D3 | ¿Avisar al cliente final (correo / WhatsApp) cuando queda pendiente? | Sí, pero con la plantilla y el consentimiento de comunicaciones del CRM; no se hizo aquí |
| D4 | Riel del enlace de pago | Generalizar el Payment Link del ERP a facturas (hoy solo cotizaciones) **y** que `fn_register_crm_payment` active membresías como `fn_registrar_pago` (mismo enganche del §10.1); o migrar el «Pagar factura» del sitio a `fn_registrar_pago`. Cualquiera toca el camino del dinero: PR propio |
| D5 | goadmin-websites `handleInvoicePayment` busca la factura por número **sin organización** y actualiza saldos a mano | Corregir antes de usarlo para membresías (tarea sugerida aparte) |
| D6 | Cobro recurrente real (tarjeta guardada) | Solo con una pasarela que tokenice tarjetas y consentimiento explícito del cliente; sería otro `renewal_mode` |

### 12.8 Archivos

`supabase/migrations/20260929235400_membresias_renovacion_automatica.sql` (+ rollback),
`src/lib/services/membresias/{renovacion.ts, enlacePago.ts, enlacePago.server.ts, exportarCsv.ts,
exportar.server.ts}` (nuevos), `membresias.server.ts`, `tipos.ts`, `clienteMembresias.ts` (añadidos),
`src/app/api/membresias/exportar/route.ts`, `src/app/api/membresias/membresias/[id]/enlace-pago/route.ts`
(nuevas), `src/app/api/membresias/membresias/route.ts` (filtro nuevo),
`src/components/membresias/{listado/ListadoMembresias.tsx, miembros/ListadoMiembros.tsx,
pagos/PagosMembresias.tsx, detalle/DetalleMembresia.tsx, dialogos/DialogoRenovar.tsx,
planes/DetallePlan.tsx, logica.ts, comun/useExportarMembresias.ts}`, formulario del producto
(`SeccionMembresia.tsx`, `logica/membresiaProducto.ts`, tipo en `productoService.ts`),
`messages/{es,en,fr,pt}.json` (`membresias.exportar`, `membresias.renovar.enlace`,
`membresias.detalle.renovacionPendiente`, columnas, filtro y evento nuevos, textos de la renovación
automática).
