# Ficha del cliente — Registrar pago, Estado de cuenta, Unificar, Inactivar y Eliminar

Análisis para las acciones del menú «⋯» y la cabecera de la ficha del cliente en Figma:
Editar cliente · **Registrar pago** · Nueva venta · Nueva oportunidad · **Estado de cuenta (PDF)** ·
**Exportar ficha** · **Marcar como inactivo** · **Unificar con otro cliente** · **Eliminar cliente**.

- Fecha: 2026-09-23. Solo análisis: no se tocó código, ni esquema, ni se hicieron commits.
- Base de datos: solo `SELECT` por el MCP (proyecto `jgmgphmzusbluqhuqihj`), agregados sin datos
  personales. Las organizaciones se citan por id.
- Documentos relacionados que este toma como punto de partida:
  `docs/design/DOCUMENTOS-PDF.md` (motor único de documentos, diseñado y **no implementado**),
  `docs/design/AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md`, `docs/design/AUDITORIA-CONTROLES-CLIENTES-CRM.md`.

---

## 0. Resumen en diez líneas

1. **La ficha del cliente hoy no tiene menú «⋯».** La cabecera solo trae «Volver» y «Editar»
   (`src/components/clientes/id/ClienteHeader.tsx:268`, `:279`). Ninguna de las otras ocho acciones existe ahí.
2. **Hay al menos 9 caminos que registran un pago**, todos desde el navegador (`@/lib/supabase/config`),
   con 5 criterios distintos de fecha, 4 de moneda y 3 de validación del saldo. Solo uno es
   transaccional: la RPC **`fn_register_crm_payment`**, que es la base recomendada.
3. La base **ya recalcula factura y cartera por disparador** al insertar en `payments`. Dos caminos
   (factura de venta y la RPC de CRM) **además** escriben el saldo a mano.
4. **La caja no se mueve con `cash_movements`**: el cierre de caja suma `payments` con `method='cash'`
   por sucursal y `created_at` (`src/components/pos/cajas/CajasService.ts:720-735`). Hay 5 filas en
   `cash_movements` en toda la base; son solo ingresos y egresos manuales.
5. **Estado de cuenta del cliente: no existe.** Lo que hay son dos exportaciones `.txt` de **una sola
   cuenta** (CxC y CxP), que violan las reglas de fechas. No hay PDF de negocio en el sistema.
6. **Unificar clientes: existe una fusión, pero no funciona.** `IdentidadesService.mergeCustomers`
   (`src/components/crm/identidades/IdentidadesService.ts:244-306`) mueve 5 de las 43 relaciones,
   ignora todos los errores, escribe una columna que no existe (`is_active`) y **siempre** responde
   «fusionados correctamente».
7. **`customers` no tiene columna de estado.** «Desactivar» en la tabla de clientes es un
   `onClick` vacío (`src/components/clientes/ClientesTable.tsx:379`).
8. **Eliminar cliente es un `DELETE` duro desde el navegador** sin comprobar permisos ni
   dependencias (`src/app/app/clientes/page.tsx:671-674`); la base lo frena solo si hay factura,
   cotización, reserva, pase de parqueadero, tarea o pedido web. Si no, **borra en cascada** membresías,
   conversaciones y saldos a favor, y **deja huérfanas** ventas y cartera.
9. Duplicados hoy: **179 grupos por documento** (todos en org 120, por espacios dentro del número),
   **4 por correo** (mayúsculas), **303 por teléfono**, **202 por nombre + teléfono**.
10. Se proponen **tres piezas únicas**: `RegistrarPagoDialog` + RPC `fn_registrar_pago`,
    documento `statement` del motor de `DOCUMENTOS-PDF.md`, y RPC `fn_unificar_clientes` con columnas
    aditivas `customers.status` / `merged_into_id`.

---

## A. «Registrar pago»

### A.1 Qué hace la base de datos al insertar en `payments` (verificado)

`payments` (columnas reales): `id uuid, organization_id, branch_id, source text, source_id text,
method text, amount numeric, currency char NOT NULL (sin default), reference, processor_response jsonb,
status, created_by uuid, created_at, updated_at, payment_date timestamptz default now(),
discount_amount numeric NOT NULL default 0, change_amount numeric NOT NULL default 0, bank_account_id int`.
**No tiene `customer_id` ni `supplier_id`**: el tercero se deduce del documento (`source`, `source_id`).

Disparadores sobre `payments` (orden de ejecución alfabético entre los `AFTER`):

| Disparador | Evento | Efecto |
|---|---|---|
| `trg_normalize_payment_status` (BEFORE) | INSERT, UPDATE | `paid` → `completed` |
| `trg_branch_default` (BEFORE) | INSERT | rellena `branch_id` |
| `tr_update_accounts_payable_on_payment` | INSERT, UPDATE, DELETE | **recalcula** `accounts_payable.balance/status` desde la suma de pagos `completed` (`invoice_purchase` y `account_payable`) |
| `tr_update_accounts_receivable_on_payment` | **solo INSERT** | `invoice_sales` → copia el saldo de la factura a la cartera; `account_receivable` → **resta** el abono a la cartera y escribe el mismo saldo en la factura |
| `trg_recalc_invoice_balance_from_payments` | INSERT, UPDATE, DELETE | **recalcula** `invoice_sales` (fuentes `invoice_sales` y `sale`) e `invoice_purchase` desde la suma de pagos; `GREATEST(total - pagado, 0)` |
| `trg_auto_journal_*` (payment, folio, membership, parking, parking_reversal) | INSERT (y UPDATE) | asiento contable |
| `trg_notify_payment_registered`, `audit_payments_trigger` | INSERT / todos | notificación y `finance_audit_log` |

Y sobre `invoice_sales`: `tr_create_account_receivable` / `tr_update_account_receivable` llaman a
`create_account_receivable(id)`, que **crea o sincroniza** la fila de `accounts_receivable` con el
saldo de la factura. Resultado: **nunca hay que escribir `accounts_receivable` a mano**, y hoy
`accounts_receivable.balance` coincide con `invoice_sales.balance` en el 100 % de las facturas vigentes
(0 descuadres).

Sin disparador ni función que inserte en `cash_movements` (verificado en `pg_proc`).

Fuentes en uso (`payments.source`, pagos `completed`): `invoice_sales` 2.489 · `web_order` 175 ·
`sale` 64 · `account_receivable` 60 · `pms` 15 · `account_payable` 5 · `invoice_purchase` 4 ·
`credit_note` 2 · `folio` 2 · `parking_session` 1. **Ningún pago `membership`**: la RPC que lo haría
está rota (ver E-6) y ningún código lo escribe.

### A.2 Inventario de diálogos y servicios que registran un pago

| # | Pantalla / componente | Escribe (archivo:línea) | `source` | Moneda | Fecha | Saldo | Autor | Caja (efectivo) |
|---|---|---|---|---|---|---|---|---|
| 1 | Factura de venta — `RegistrarPagoDialog` `src/components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx` | `payments.insert` `:188-200`; **además** `invoice_sales.update` a mano `:210-225` y `rpc('create_account_receivable')` `:239` | `invoice_sales` | de la factura, `'COP'` si falta | `useFormatDate().getToday` + `instantForDayInTz` (bien) | aviso y botón deshabilitado `:141`, `:419`; valida fecha ≥ emisión `:160` | **no guarda `created_by`** | implícita |
| 2 | Cuentas por cobrar (lista y POS) — `AplicarAbonoModal` → `CuentasPorCobrarService.aplicarAbono` `src/components/finanzas/cuentas-por-cobrar/service.ts:268-325` | `payments.insert` `:299-316` | `account_receivable` | **`'COP'` cableado** `:307` | `instantForDayInTz` con zona de la sucursal (bien) | en el modal `:208` | sí | implícita |
| 3 | Detalle de cuenta por cobrar — `CuentaPorCobrarDetailService.aplicarPago` `src/components/finanzas/cuentas-por-cobrar/id/service.ts:231-270` | `payments.insert` `:244-259` | `account_receivable` | **`'COP'`** `:255` | bien, con `new Date()` si falta | **ninguna en servicio** | sí | implícita |
| 3b | Cuota de CxC — `pagarCuota` misma clase `:398-450` | `ar_installments.update` `:433` **y luego** `aplicarPago` (dos llamadas, sin transacción) | `account_receivable` | `'COP'` | bien | contra la cuota `:422` | sí | implícita |
| 4 | Cuentas por pagar (lista) — `RegistrarPagoModal` → `CuentasPorPagarService.registrarPago` `src/components/finanzas/cuentas-por-pagar/CuentasPorPagarService.ts:440-500` | `payments.insert` `:482` | `account_payable` | **`'COP'`** `:475` | **se descarta**: el modal manda `payment_date` (`RegistrarPagoModal.tsx:64`) y el servicio no lo inserta → `now()` | en servicio `:461` | sí | implícita (resta como egreso, `CajasService.ts:752`) |
| 4b | Programar pago (CxP) — mismo servicio `:395-430` | `payments.insert` `status='pending'` | `account_payable` | `'COP'` | sin fecha | ninguna | sí | — |
| 5 | Detalle de cuenta por pagar — `CuentaPorPagarDetailService.registrarPago` `src/components/finanzas/cuentas-por-pagar/id/service.ts:303-352` | `payments.insert` `:338` (+ `bank_account_id`) | `account_payable` | **`'COP'`** `:329` | **hora del navegador**: `new Date(fecha + 'T' + new Date().toTimeString())` `:330` | **ninguna** | sí | implícita |
| 5b | Cuota de CxP — `pagarCuota` `:355-395` | `ap_installments.update` **sin revisar el error** `:372-381`, luego `registrarPago` | `account_payable` | `'COP'` | navegador | **ninguna** | sí | implícita |
| 6 | Factura de compra — `RegistrarPagoModal` → `FacturasCompraService.registrarPago` `src/components/finanzas/facturas-compra/FacturasCompraService.ts:825-875` | `payments.insert` `:846-860` | `invoice_purchase` | de la factura | `instantForDayInTz` (bien) | en servicio `:836` | **no guarda `created_by`** (4 de 4 pagos en la base sin autor) | implícita |
| 7 | PMS — `FolioPaymentDialog` `src/components/pms/FolioPaymentDialog.tsx:170-230` | `foliosService.payFolioItems` + `payments.insert` `:212-224` | `pms` / `folio` | **`'USD'` cableado** `:220` | `now()` | exige pagar el total `:175` | sí | **único que exige caja abierta** `:133`, `:174` |
| 8 | Parqueadero — tres caminos: `PaymentFormDialog` → `parkingPaymentService.createPayment` `src/lib/services/parkingPaymentService.ts:279-305`; inserción directa en `src/app/app/parking/operacion/page.tsx:490-500`; y en `src/components/parking/mapa/SpaceDetailDialog.tsx:307-316` | `payments.insert` | `parking_session` / `parking_pass` | `'COP'` | `now()` | — | — | implícita |
| 9 | Pedido online — `useWebOrderDetail` `src/app/app/pos/pedidos-online/[id]/hooks/useWebOrderDetail.ts:334-347` | `payments.insert` por el saldo completo | `invoice_sales` | de la factura | `now()` | toma el saldo tal cual | sí | implícita |
| 10 | CRM / Stripe — `registerCrmPayment` `src/lib/services/crm/paymentService.ts:167-300` → **RPC `fn_register_crm_payment`** | una transacción | `invoice_sales` | valida ISO y que coincida con la factura | parámetro, `now()` por defecto | **`FOR UPDATE` + `amount_exceeds_balance`** | parámetro | — |
| 11 | Saldo a favor — `saldosAFavorService` `src/components/finanzas/saldos-a-favor/saldosAFavorService.ts:122`, `:139` → `fn_create_customer_credit`, `fn_apply_customer_credit` | `credit_notes`, `credit_note_applications`, asiento | — | — | `now()` | valida contra saldo | parámetro | no |

Otros escritores de `payments` fuera de diálogos (POS `posService.ts:1979`, `checkoutService.ts:885`,
`pedidosService.ts:966`, `devolucionesService.ts:720`, `checkinService.ts:583`, `reservationsService.ts:307`,
`webOrderServerConfirmation.ts:182`, integraciones QR, Wompi, Stripe, open finance) cobran **ventas
nuevas**, no abonos: quedan fuera del componente único, pero deben respetar la misma convención (A.5).

Métodos de pago: los cinco diálogos de Finanzas leen `organization_payment_methods` unido a
`payment_methods` (bien). PMS cae a una lista cableada si falla (`FolioPaymentDialog.tsx:121-124`);
mesas usa `method: 'pos'`, que **no es un método** del catálogo (`src/app/app/pos/mesas/[id]/page.tsx:402`).
El catálogo global tiene códigos repetidos por mayúsculas (`qr` y `QR`) y códigos DIAN mezclados
(`001`, `002`); 7 pagos reales usan `002` y 16 usan `QR`.

**Ficha del cliente:** no registra pagos. `CuentasTab` muestra la cartera sin acciones
(`AUDITORIA-CONTROLES-CLIENTES-CRM.md:409`). `CustomerFoliosSection` abre el `FolioPaymentDialog` del PMS.

**Gimnasio:** no registra pagos. `gymService.ts:937-948` suma `source='membership'`, que nadie escribe
(ingresos del día y de la semana siempre en 0), y además esas dos consultas **no filtran
`organization_id`**.

### A.3 En qué difieren, en una tabla

| Criterio | Variantes encontradas |
|---|---|
| Quién calcula el saldo | disparador (2, 3, 4, 5, 6) · disparador **y** a mano (1, 10) |
| Moneda | de la factura (1, 6, 9, 10) · `'COP'` cableado (2, 3, 4, 5, 8) · `'USD'` cableado (7) |
| Fecha | día en zona de la sucursal (1, 2, 3, 6) · hora del navegador (5) · descartada (4) · `now()` (7, 8, 9) |
| Monto > saldo | bloquea en servidor (10) · en servicio de navegador (3b, 4, 6) · solo en UI (1, 2) · nada (3, 5, 5b) |
| Transacción | una (10, 11) · varias llamadas sueltas (1, 3b, 5b, 7) |
| Varios métodos en un pago | solo PMS lo pide en UI, y **lo reduce al primero** `FolioPaymentDialog.tsx:181` |
| Varias facturas / anticipo | ninguno. El anticipo existe aparte como «saldo a favor» (11) |
| Caja abierta si es efectivo | solo PMS (7) |

### A.4 Propuesta: un componente y una RPC

#### `RegistrarPagoDialog` — `src/components/shared/pagos/RegistrarPagoDialog.tsx`

```ts
type Direccion = 'cobro' | 'pago';           // cliente → nosotros | nosotros → proveedor

type Destino =
  | { tipo: 'factura';  documento: 'invoice_sales' | 'invoice_purchase'; id: string }
  | { tipo: 'cuenta';   documento: 'account_receivable' | 'account_payable'; id: string;
      cuotaId?: string }                     // ar_installments / ap_installments
  | { tipo: 'tercero';  customerId?: string; supplierId?: number };  // varias facturas + anticipo

interface RegistrarPagoDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  direccion: Direccion;
  destino: Destino;
  prellenado?: { monto?: number; metodo?: string; referencia?: string; fecha?: string /* YYYY-MM-DD */ };
  origen: 'ficha_cliente' | 'ficha_proveedor' | 'factura_venta' | 'factura_compra'
        | 'cxc' | 'cxp' | 'pos_cxc';         // solo para analítica y textos; no cambia reglas
  onRegistrado(resultado: ResultadoPago): void;
}
```

Comportamiento:

- **Destino `tercero`** (lo que pide la ficha): lista las facturas abiertas del cliente
  (`accounts_receivable` con `balance > 0`, por `due_date` ascendente) con casilla y monto por fila.
  Botón «Aplicar a las más antiguas» reparte el monto. **El excedente se ofrece como anticipo**
  (saldo a favor, `credit_notes` vía `fn_create_customer_credit`), nunca se aplica en silencio.
- **Destino `factura` / `cuenta`**: una sola fila, monto por defecto = saldo.
- Campos: monto, método (de `organization_payment_methods` activos; `requires_reference` exige
  referencia), fecha (`todayInTz(tz)` por defecto; `tz` de la **sucursal** del documento, ADR-003),
  referencia, cuenta bancaria si el método no es efectivo, notas. Si el método es efectivo: «Recibido»
  y «Cambio» calculado.
- Moneda: la del documento; si hay varias facturas, todas deben compartir moneda o el diálogo lo impide.
  Formato siempre `formatCurrency(x, moneda)` con el segundo argumento.
- Estados: sin caja abierta y método efectivo → aviso con enlace «Abrir caja» (no bloquea si la
  organización no usa caja: decisión del dueño, P-3). Error de la RPC → mensaje por código, no el texto crudo.
- **El diálogo no escribe nada**: llama a `POST /api/pagos` (route handler con `getServerOrgContext()`
  y `getServerUserClient()`), que llama a la RPC. Permiso resuelto en el servidor (`finance.create`).

#### RPC `fn_registrar_pago` (propuesta, **no aplicada**)

```
fn_registrar_pago(
  p_direccion        text,        -- 'cobro' | 'pago'
  p_aplicaciones     jsonb,       -- [{documento, id, cuota_id?, monto}]  1..n
  p_metodo           text,
  p_moneda           text,
  p_fecha            date,        -- día calendario; la RPC lo convierte con la zona de la sucursal
  p_referencia       text,
  p_cuenta_bancaria  integer,     -- NULL si efectivo
  p_recibido         numeric,     -- efectivo entregado; NULL si no aplica
  p_anticipo         numeric,     -- excedente que va a saldo a favor (solo cobro)
  p_clave_idempotencia text
) RETURNS jsonb  -- {pagos:[{payment_id, documento, id, saldo_nuevo, estado}], credito_id, cambio}
SECURITY INVOKER
```

Pasos, en una transacción:

1. Organización y autor salen de `auth.uid()` + `organization_members` (nunca de un parámetro).
   El route handler además compara la organización de la sesión con la del documento (403).
2. Idempotencia: si existe un pago de la organización con `reference = p_clave_idempotencia`, devuelve
   el resultado anterior (mismo patrón que `fn_register_crm_payment` y su índice parcial).
3. Bloquea **todos** los documentos con `SELECT … FOR UPDATE` en orden de id (evita interbloqueos).
   Valida: misma organización, mismo tercero, estado no `draft`/`void`, `monto > 0`,
   `monto ≤ saldo` por fila, moneda ISO y igual a la del documento, suma de filas + anticipo =
   total cobrado, y si `p_metodo = 'cash'` que haya `cash_sessions` abierta en la sucursal (P-3).
4. Inserta **un `payments` por aplicación** (el `source` es único por fila), todas con la misma
   `reference` de grupo; `amount` = monto **aplicado**, `change_amount` = cambio solo en la primera
   fila. `payment_date` = `p_fecha` + hora de pared en la zona de la sucursal. `created_by = auth.uid()`.
5. Cuotas: actualiza `ar_installments` / `ap_installments` en la misma transacción.
6. **No escribe saldos de factura ni de cartera**: los recalculan los disparadores de A.1.
   Relee y devuelve los saldos finales.
7. Anticipo: `fn_create_customer_credit` dentro de la misma transacción.

Columna aditiva sugerida (P-4): `payments.payment_group_id uuid NULL` para agrupar las filas de un mismo
recibo sin depender de `reference`.

#### Por qué `fn_register_crm_payment` es la base

Es la única que ya hace, en servidor y en una transacción: bloqueo `FOR UPDATE` por id y organización,
validación de monto finito y > 0, moneda ISO igual a la de la factura, `amount_exceeds_balance`, e
idempotencia con carrera cubierta por `uq_payments_org_stripe_reference`. Sus errores salen con
`ERRCODE P0001`, mensaje estable y `DETAIL` en JSON, y `paymentService.ts:125-153` ya los traduce.

Qué hay que corregir al generalizarla:

- **Quitar la escritura manual del saldo** (`IF v_new_balance IS NOT DISTINCT FROM v_invoice.balance THEN UPDATE invoice_sales …`):
  si el disparador no cambió el saldo, restar a mano esconde el fallo en vez de detectarlo.
- `p_created_by` llega del cliente: debe salir de `auth.uid()` (o del service role con el autor
  validado en el route handler, como hace `fn_apply_customer_credit`).
- Solo conoce `invoice_sales`: añadir `account_receivable`, `invoice_purchase`, `account_payable` y cuotas.
- La comisión se devenga después, en Node (`paymentService.ts:245-300`), fuera de la transacción.
  Ya hay disparadores de comisión en `invoice_sales`; conviene unificar esa regla.

### A.5 Qué corregir en los caminos existentes (al migrarlos al componente)

- Todos: moneda del documento, nunca `'COP'`/`'USD'` cableados; `created_by` siempre.
- `RegistrarPagoDialog.tsx:210-225`: quitar el `update` manual de la factura y la llamada a
  `create_account_receivable`: los disparadores ya lo hacen, y el `update` con el saldo leído al abrir
  el diálogo **pisa** un pago concurrente y puede dejar saldo negativo (no hay `GREATEST`).
- `cuentas-por-pagar/CuentasPorPagarService.ts:465-478`: insertar `payment_date`.
- `cuentas-por-pagar/id/service.ts:330` y `:378`: la hora del navegador; usar `instantForDayInTz`.
- Cuotas (3b, 5b): mover a la RPC; hoy si falla el segundo paso la cuota queda pagada sin pago.
- PMS: pagos mixtos colapsados al primer método; moneda `USD` fija.
- Mesas: `method: 'pos'` no es un método.
- Dos implementaciones de «abono a CxC» (2 y 3) y dos de «pago a CxP» (4 y 5): una sola.

---

## B. «Estado de cuenta (PDF)» y «Exportar ficha»

### B.1 Qué existe hoy

- **Estado de cuenta por cliente o por proveedor: no existe.** Ni ruta, ni servicio, ni plantilla.
- Existen dos «estado de cuenta» de **una sola cuenta**, en texto plano:
  - CxC: `src/components/finanzas/cuentas-por-cobrar/id/CuentaPorCobrarDetailPage.tsx:73-111` → `.txt`.
    Usa `parseLocalDate` (deprecada), `toLocaleDateString` sin zona, y
    `new Date().toISOString().split('T')[0]` en el nombre del archivo (prohibido por CLAUDE.md); el nombre
    del archivo lleva el nombre del cliente.
  - CxP: `CuentaPorPagarDetailService.generarEstadoCuenta` `src/components/finanzas/cuentas-por-pagar/id/service.ts:500-540`,
    lanzado desde `AccountActionsCard.tsx:171`. Fechas con `formatDateInTz` (bien), moneda `COP` cableada `:508`.
- Motores de PDF instalados (`package.json`): `jspdf` 4.2 + `jspdf-autotable` 5.0, `puppeteer` 24,
  `html2canvas`. Generadores reales (ver `AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md:43-57`):
  - `POST /api/facturas-venta/[id]/pdf` (`src/app/api/facturas-venta/[id]/pdf/route.ts`): **puppeteer en
    servidor**, con `getServerOrgContext` `:47` y datos de la organización `:60-61`
    (`name, legal_name, nit, tax_id, address, phone, email, logo_url, primary_color`). Es el único PDF de
    negocio y tiene 0,16 % de cobertura en Storage.
  - `pdfExportService` (`src/lib/services/reportes/pdfExportService.ts`): **jsPDF en cliente**, reportes
    con encabezado de organización y logo (`:422-490`), fechas con `formatPlainDate`/`formatDateInTz`.
- El **motor único de documentos** (`documents/` con `DocumentKind`, `PageSpec`, 14 bloques,
  `buildDocumentHTML`, `resolve.ts` en servidor) está **diseñado** en `DOCUMENTOS-PDF.md §5` y **no
  implementado**; la base de impresión real es `print-agent/src/printing/` (tickets 58/80 mm).

### B.2 Dónde construirlo

Como **un `DocumentKind` más** del motor de `DOCUMENTOS-PDF.md §5`: `'statement'`, con
`PageSpec` carta por defecto. Mientras el motor no exista, la ruta puede reutilizar el patrón de
`/api/facturas-venta/[id]/pdf` (HTML en servidor + puppeteer), **no** jsPDF en cliente: las tres reglas de
`DOCUMENTOS-PDF.md §5.2` (payload armado en servidor, un solo formateador de fechas y moneda, nada del
cuerpo de la petición) aplican igual.

Ruta: `GET /api/clientes/[id]/estado-cuenta?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&formato=pdf|html`
(`getServerOrgContext`, `getServerUserClient`, permiso `crm.customers.view` + `finance.view`).
El cálculo va en una RPC `fn_estado_cuenta_cliente(p_customer_id, p_desde date, p_hasta date)` que
devuelve el JSON completo (saldo inicial, movimientos con saldo corrido, antigüedad, abiertas).

### B.3 Estructura del documento y de dónde sale cada bloque (tablas verificadas)

| # | Bloque | Contenido | Origen |
|---|---|---|---|
| 1 | Encabezado de marca | logo, razón social, nombre comercial, NIT-DV, dirección, ciudad, teléfono, correo, color primario | `organizations.logo_url, legal_name, name, nit, dv, tax_id, address, city, state, phone, email, primary_color` (bloques 1-2 del motor) |
| 2 | Título | «Estado de cuenta», periodo `desde – hasta`, fecha de corte, fecha de generación | parámetros; fechas con `formatPlainDate` (son `date`) y `formatDateInTz` para la generación |
| 3 | Cliente | nombre o razón social, tipo y número de documento + DV, dirección, ciudad, correo, teléfono | `customers.full_name` / `company_name`, `identification_type`, `identification_number`, `dv`, `address`, `city`, `email`, `phone`; si hay facturación a otra dirección, `customer_addresses` |
| 4 | Resumen | saldo inicial · facturado · notas crédito · pagos · saldo final · saldo a favor disponible | derivado de 5 y de `credit_notes.balance` (`status='active'`) |
| 5 | Movimientos con saldo corrido | una fila por evento, ordenadas por fecha: **factura** (`invoice_sales` `document_type` `invoice` o NULL, estado ≠ `draft`/`void`, `issue_date`, `number`, `total` → cargo) · **nota crédito** (`invoice_sales.document_type='credit_note'`, `related_invoice_id` → abono) · **pago** (`payments` `completed` con `source` en `invoice_sales` / `sale` / `account_receivable` resuelto a la factura del cliente, `payment_date` → abono) · **anticipo** (`credit_notes` creado → abono; `credit_note_applications` → cruce, informativo) | ver columna. El saldo inicial es la misma suma con fecha `< desde` |
| 6 | Antigüedad de cartera | corriente · 1-30 · 31-60 · 61-90 · > 90, calculado **a la fecha de corte** con `due_date` en la zona de la organización | `accounts_receivable` (`balance > 0`, `status` ≠ `paid`/`cancelled`), **no** la columna `days_overdue` (ver E-8) |
| 7 | Facturas abiertas | número, emisión, vencimiento, días vencidos, total, pagado, saldo | `invoice_sales` + `accounts_receivable` por `invoice_id`; cuotas de `ar_installments` si existen |
| 8 | Totales | totales de 5, 6 y 7; en la moneda base | `organization_currencies.is_base` |
| 9 | Pie | medios de pago de la organización y cuentas bancarias para consignar; texto legal («Este documento no es una factura…», plazo para objeciones); paginación | `organization_payment_methods` activos + `payment_methods.name`; `bank_accounts` activas (`bank_name`, `account_type`, `account_number` enmascarado); texto legal configurable (P-7) |

Reglas:

- Fechas: `issue_date`, `due_date` y `payment_date` son `timestamptz` → `formatDateInTz(v, tz)`;
  `ar_installments.due_date` es `date` → `formatPlainDate`. `tz` = `getOrganizationTimezone(orgId)`.
- Moneda: la base de la organización. Si alguna factura del cliente está en otra moneda, se agrupa por
  moneda (no se suman peras con manzanas); hoy todos los pagos a facturas de venta son COP.
- Fuente del «pagado» por factura: **`fn_invoice_sales_paid`**, la misma que usa el disparador.
- `payments.amount` en el POS guarda el **efectivo recibido** y el cambio va en `change_amount`
  (249 facturas cuadran solo restando el cambio): el estado de cuenta debe mostrar
  `amount - change_amount`, o saldrá un cliente con saldo a favor falso.
- Proveedor, por simetría: `invoice_purchase` (`number_ext`, `issue_date`, `due_date`, `total`,
  `balance`), `accounts_payable`, `ap_installments`, `payments` (`invoice_purchase`, `account_payable`),
  `suppliers` como contraparte, y `fn_reporte_cxp_aging` corregida igual que la de CxC.

### B.4 «Exportar ficha»

Hoy solo existe exportar la **lista** de clientes a CSV (`ClientesActions.tsx:574`) e importar con `xlsx`.
No hay exportación de una ficha.

Propuesta corta: mismo motor, `DocumentKind 'customer_profile'`, PDF de 1-2 páginas: datos del cliente
(bloque 3), contactos (`customer_company_links`), direcciones (`customer_addresses`), consentimientos
(`contact_consents`), resumen comercial (`get_customer_sales_summary`), cartera (bloque 6 resumido),
oportunidades abiertas, últimas 10 actividades y notas (`activities` / `notes` con
`related_type='customer'`). Y una variante JSON/CSV para la **solicitud de datos personales**
(Ley 1581): todo lo del cliente, sin datos de otros. La exportación queda en `ops_audit_log`.

---

## C. «Unificar con otro cliente»

### C.1 Qué existe

1. **CRM → Identidades → «Ver duplicados» → «Unificar»**: `DuplicadosPanel.tsx:87-255` +
   `IdentidadesPage.tsx:173-190` + `IdentidadesService.mergeCustomers`
   (`src/components/crm/identidades/IdentidadesService.ts:244-306`). Agrupa por correo y teléfono de
   `customer_channel_identities`, deja elegir el principal y promete «las conversaciones, oportunidades y
   actividades serán transferidas». Lo que hace de verdad:
   - Mueve `conversations`, `opportunities`, `campaign_contacts`, `activities` (`related_type='customer'`)
     y `customer_channel_identities`. **Nada más**: ni ventas, facturas, cartera, reservas, membresías,
     tareas, notas, direcciones, contactos ni saldos a favor.
   - **Nunca revisa `error`** de ninguna llamada: responde «fusionado correctamente» aunque todo falle.
   - Escribe `customers.is_active`, **columna que no existe**: el `update` falla, el absorbido queda
     igual y el `metadata` con `merged_into` **nunca se guarda**. (Si la columna existiera, el `update`
     reemplazaría todo el `metadata`.)
   - `campaign_contacts` choca con `unique_campaign_customer` si ambos estaban en la misma campaña, y ese
     `update` además no filtra organización.
   - Cliente del navegador, sin transacción, sin permiso ni auditoría propia.
2. **Lista de clientes → «Unificar»**: diálogo con el texto «en desarrollo» y botón deshabilitado
   (`ClientesActions.tsx:686-719`, ver `AUDITORIA-CONTROLES-CLIENTES-CRM.md:94-103`).
3. **Alta de cliente → `MergeModal`** (`src/components/clientes/new/MergeModal.tsx`): si el documento o el
   correo ya existen, ofrece «Usar existente», «Actualizar existente» (copia campos) o «Crear como nuevo»,
   que siempre falla por los índices únicos (`AUDITORIA-CONTROLES-CLIENTES-CRM.md:589-604`).

En la base: sin RPC de fusión, sin tabla de fusiones, sin columna `merged_into` en `customers`.

### C.2 Duplicados hoy (solo conteos)

Total: 35.225 clientes en 21 organizaciones. Índices únicos: `(organization_id, identification_number)`
y `(organization_id, email)`, ambos **sensibles al formato**.

| Criterio (normalizado) | Grupos | Clientes en grupos | Absorbibles | Organizaciones | Mayor grupo |
|---|---|---|---|---|---|
| Documento (solo alfanuméricos) | **179** | 359 | 180 | **1 (org 120)** | 3 |
| Correo (minúsculas, sin espacios) | **4** | 8 | 4 | 2 | 2 |
| Teléfono (últimos 10 dígitos) | 303 | 617 | 314 | 8 | 5 |
| Nombre + teléfono | 202 | — | — | — | — |
| Nombre exacto (≥ 2 palabras, grupos ≤ 20) | 365 | — | 592 | 8 | — |

- Los 179 de documento vienen de **espacios dentro del número** (formas `9 9` contra `9`), típico de una
  importación; ninguno de esos 359 clientes tiene ventas, facturas, cartera, reservas, membresías ni
  conversaciones: se pueden unificar sin mover nada financiero.
- Los 4 de correo solo difieren en mayúsculas: el índice único no los atrapa.
- Por nombre «exacto» sin filtro salen grupos de 18.054: son nombres genéricos de prospectos web sin
  documento. **El nombre no puede ser criterio de detección por sí solo.**
- 24.151 clientes no tienen documento y 11.329 no tienen correo.

### C.3 Todo lo que apunta a `customers` (verificado en `pg_constraint`)

`ON DELETE`: **C** cascada · **N** pone NULL · **R** restrict · **A** no action (bloquea).

| Tabla.columna | ON DELETE | En la fusión | Choque de único |
|---|---|---|---|
| `accounts_receivable.customer_id` | N | mover | — |
| `invoice_sales.customer_id` | **R** | mover | — |
| `sales.customer_id` | N | mover | — |
| `credit_notes.customer_id` (saldos a favor) | **C** | mover | — |
| `quotations.customer_id` | **R** | mover | — |
| `opportunities.customer_id` | N | mover | — |
| `calls.customer_id` | N | mover | — |
| `tasks.customer_id` | **A** | mover | — |
| `calendar_events.customer_id` | N | mover | — |
| `conversations.customer_id` | **C** | mover | — |
| `messages.sender_customer_id` | N | mover | — |
| `customer_channel_identities.customer_id` | **C** | mover; si ya existe `(customer, channel, value)` borrar la del absorbido | `idx_customer_channel_identities_unique` |
| `customer_addresses.customer_id` | **C** | mover; quitar `is_default` del absorbido | — |
| `customer_company_links.person_id` / `.company_id` | **C** | mover; deduplicar | `(person_id, company_id)` |
| `customers.parent_customer_id` | N | reapuntar hijos | — |
| `contact_consents.customer_id` | **C** | fusionar por canal: **gana la restricción** (si uno dijo «no», queda «no») | `(organization_id, customer_id, channel)` |
| `campaign_contacts.customer_id` | **C** | mover; deduplicar | `(campaign_id, customer_id)` |
| `sequence_enrollments.customer_id` | N | mover; cerrar el duplicado activo | parcial `(sequence_id, customer_id)` activos |
| `reservations.customer_id` | **A** | mover | — |
| `reservation_customers.customer_id` | **A** | mover; deduplicar | `(reservation_id, customer_id)` |
| `memberships.customer_id` | **C** | mover | — |
| `class_reservations.customer_id` | **C** | mover; deduplicar | `(gym_class_id, customer_id)` |
| `member_checkins.customer_id` | **C** | mover | — |
| `customer_biometrics.customer_id` | **C** | **no mover** (huella de otra persona si no son la misma); pedir confirmación | `(customer, type, finger)` |
| `parking_passes.customer_id` | **A** | mover | — |
| `parking_vehicles.customer_id` | N | mover | — |
| `web_orders.customer_id` | **A** | mover | — |
| `shipments.customer_id` | N | mover | — |
| `trip_tickets.customer_id` | N | mover | — |
| `coupons.customer_id`, `coupon_redemptions.customer_id` | N | mover | — |
| `referrals.referrer_customer_id` / `.referred_customer_id` | N | mover; descartar autorreferido | — |
| `product_reviews`, `testimonials`, `warranty_claims` | N | mover | — |
| `serial_numbers.sold_to_customer_id`, `serial_tracking_events.customer_id` | N | mover | — |
| `onboarding_instances.customer_id` | N | mover | — |
| `voice_agent_calls`, `voice_agent_call_attempts` | N | mover | parcial «una viva por cliente» |
| `widget_sessions.customer_id` | N | mover | — |

**Sin FK** (hay que moverlas a mano): `health_score_snapshots.customer_id`,
`email_messages.to_customer_id`, `mobile_call_bridges.customer_id`, `restaurant_reservations.customer_id`.

**Polimórficas** (`related_type` + `related_id`): `activities` (`customer`: 7), `notes` (`customer`: 2),
`tasks.related_to_type` (**dos valores para lo mismo**: `cliente` 13 y `customer` 2), `documents`,
`document_folders`, `email_messages`, `crm_events`/`ai_agent_actions` (`entity_type`). Auditoría
(`ops_audit_log`, `finance_audit_log`) **no se reescribe**: es historia.

**No existen** tablas de puntos de fidelidad ni de anticipos distintos de `credit_notes`: «puntos» no
se mueve porque no hay dónde.

`payments` no se toca: cuelga de la factura, que sí se mueve.

### C.4 Flujo propuesto

1. **Entrada**: menú «⋯» → «Unificar con otro cliente» en la ficha (el que se está viendo es el
   candidato a **sobrevivir**), y el panel de duplicados de Identidades.
2. **Buscar el otro**: buscador por nombre, documento, correo o teléfono, con sugerencias de duplicados
   ordenadas por fuerza: documento normalizado (exacto) > correo en minúsculas > teléfono (10 dígitos) >
   nombre + teléfono. Nunca solo nombre. Detección en una RPC `fn_clientes_duplicados(p_customer_id)`.
3. **Elegir quién sobrevive**, con sugerencia: el que tiene facturas; si ambos, el más antiguo; nunca
   uno ya absorbido.
4. **Comparar campo por campo** (dos columnas + elección por fila): nombre, apellido, razón social,
   documento + tipo + DV, correo, teléfono, dirección, ciudad, municipio fiscal, responsabilidades
   fiscales, tipo de cliente, etapa (`lifecycle_stage`: gana la más avanzada), etiquetas (unión), roles
   (unión), notas (concatenar), `do_not_call` (gana `true`), `metadata`/`preferences` (unión, gana el
   sobreviviente en conflicto). **Documento y correo**: si el absorbido tiene el valor y el sobreviviente
   no, se copia **después** de liberar el índice único en el absorbido.
5. **Resumen de lo que se mueve** con conteos por tabla (C.3) y avisos: dos saldos a favor, dos
   membresías activas, huellas biométricas, cartera en monedas distintas.
6. **Confirmar** escribiendo el nombre del absorbido (acción de alto impacto).
7. **Resultado**: el absorbido **no se borra**: `status = 'merged'`, `merged_into_id` = sobreviviente,
   `merged_at`, `merged_by`; su documento y correo se liberan (se guardan en `metadata.merge.snapshot`).
   Buscadores y selectores lo ocultan; abrir su URL redirige al sobreviviente con un aviso.
8. **Reversión**: posible mientras no se haya emitido una factura nueva al sobreviviente con datos
   copiados. Usa el registro de la fusión (C.5) para devolver cada fila a su dueño anterior.

Permiso: nuevo `crm.customers.merge` (hoy existen `crm.customers.view/create/edit/delete`), resuelto en el
servidor; si hay facturas o cartera en juego, además `finance.approve`.

### C.5 RPC transaccional (propuesta, **no aplicada**)

Migración aditiva previa:

- `customers.status text NOT NULL DEFAULT 'active'` con `CHECK (status IN ('active','inactive','merged'))`,
  `customers.merged_into_id uuid NULL REFERENCES customers(id)`, `merged_at timestamptz NULL`,
  `inactivated_at timestamptz NULL`.
- Tabla `customer_merges (id, organization_id, survivor_id, absorbed_id, performed_by, performed_at,
  field_choices jsonb, moved jsonb /* {tabla: [ids]} */, reverted_at, reverted_by)` con RLS por pertenencia.
- Índices únicos de documento y correo **normalizados** (P-5), una vez limpiados los 179 + 4 grupos.

```
fn_unificar_clientes(p_survivor uuid, p_absorbed uuid, p_campos jsonb) RETURNS jsonb
SECURITY DEFINER, search_path fijo, REVOKE de anon/public
```

1. Guarda de pertenencia (`auth.uid()` activo en la organización de **ambos**) y permiso
   `crm.customers.merge`; `p_survivor <> p_absorbed`; ninguno `merged`.
2. `SELECT … FOR UPDATE` de ambos clientes (orden por id).
3. Por cada tabla de C.3: primero borrar del absorbido las filas que chocarían con un único del
   sobreviviente (guardándolas en `moved`), luego `UPDATE … SET customer_id = p_survivor WHERE customer_id = p_absorbed`
   filtrando organización, y registrar los ids movidos.
4. Aplicar `p_campos` al sobreviviente; liberar documento/correo del absorbido; marcarlo `merged`.
5. Insertar en `customer_merges`; el disparador `audit_customers_trigger` deja además la traza en `ops_audit_log`.
6. Devolver conteos por tabla.

`fn_revertir_fusion(p_merge_id)` hace el camino inverso con `moved`.

---

## D. «Marcar como inactivo» y «Eliminar cliente»

**Inactivo, hoy:** `customers` **no tiene** estado activo/inactivo (verificado: ni columna, ni clave en
`metadata`, ni etiqueta). `lifecycle_stage` admite `lead`, `opportunity`, `customer`, `churned` (hoy: 34.237
`lead`, 974 `customer`, 14 `opportunity`, 0 `churned`). La lista pinta un badge «Inactivo» que nunca puede
salir y el menú «Desactivar» es un `onClick` vacío (`ClientesTable.tsx:377-382`); el tipo del front declara
`is_active?: boolean` sin respaldo (`page.tsx:61`).
Propuesta: `customers.status = 'inactive'` (C.5). Inactivo = no aparece en selectores de POS, facturación,
reservas ni campañas; su historia y su cartera siguen visibles; se puede cobrar su saldo. No confundir con
`churned`, que es una etapa comercial.

**Eliminar, hoy:** `src/app/app/clientes/page.tsx:671-674`, borrado **duro**, masivo, desde el navegador,
sin revisar `crm.customers.delete` ni dependencias; el error de FK se muestra crudo en un toast. La política
RLS `Organization members can manage customers` (ALL) deja borrar a **cualquier miembro**.
Qué hace la base:

- **Bloquea** (R/A): `invoice_sales`, `quotations`, `reservations`, `reservation_customers`, `parking_passes`,
  `tasks`, `web_orders`.
- **Borra en cascada**: `credit_notes` (**saldos a favor: dinero que se le debe al cliente**),
  `memberships`, `member_checkins`, `class_reservations`, `conversations`, `customer_addresses`,
  `customer_channel_identities`, `customer_company_links`, `contact_consents` (**se pierde la prueba de
  la autorización o del rechazo**), `campaign_contacts`, `customer_biometrics`.
- **Deja huérfanas** (SET NULL): `sales`, `accounts_receivable` (cartera sin tercero), `opportunities`,
  `calls`, `coupons`, `referrals`, `shipments`, `trip_tickets`, `serial_numbers` y el resto de C.3.

Propuesta: «Eliminar» solo para clientes **sin ninguna** relación de C.3 (prospectos creados por error),
por una RPC que lo comprueba y responde con la lista de lo que impide borrar; en cualquier otro caso el
diálogo ofrece «Marcar como inactivo» o «Unificar». Permiso `crm.customers.delete` en el servidor.

---

## E. Errores encontrados (de más a menos grave)

1. **La fusión de clientes miente**: siempre dice «fusionados correctamente», nunca marca al absorbido
   (columna `is_active` inexistente) y deja ventas, facturas y cartera en el cliente viejo.
   `src/components/crm/identidades/IdentidadesService.ts:244-306`.
2. **Eliminar cliente borra saldos a favor y consentimientos en cascada y deja cartera y ventas sin
   tercero**, sin comprobar permiso: `src/app/app/clientes/page.tsx:671-674` + FKs de C.3.
3. **Anular o borrar un abono hecho desde cartera no devuelve el saldo.** `update_accounts_receivable_on_payment`
   solo corre en `INSERT`, y `fn_recalc_invoice_balance_from_payments` ignora `source='account_receivable'`.
   Además ese camino **resta** (`balance - abono`) en vez de recalcular: no es idempotente. 60 pagos reales
   usan esa fuente.
4. **Aplicar un saldo a favor se pierde en el siguiente pago**: `fn_apply_customer_credit` baja
   `invoice_sales.balance` a mano, pero `fn_invoice_sales_paid` solo suma `payments`; cualquier pago posterior
   recalcula y **vuelve a subir** el saldo. Hoy hay 0 aplicaciones, por eso no se ha visto.
5. **El diálogo de pago de factura de venta pisa el saldo** con el valor leído al abrir el diálogo, después
   de que el disparador ya lo recalculó; con dos cajeros a la vez, se pierde un pago y puede quedar saldo
   negativo. `src/components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx:210-225`.
6. **`registrar_pago_membresia` y `registrar_pago_estacionamiento` están rotas y abiertas**: `SECURITY
   DEFINER`, ejecutables por `authenticated`, **sin guarda de organización**, y declaran `v_payment_id INTEGER`
   para un `uuid` (siempre fallan en el `RETURNING`). Nadie las llama: candidatas a borrar o a revocar.
7. **Antigüedad de cartera errada**: `fn_reporte_cxc_aging` usa la columna `days_overdue`, que solo se
   actualiza en un `UPDATE` de la fila: 464 de 805 cuentas abiertas tienen los días desactualizados,
   232 vencidas figuran con 0 días y 204 dicen `current` estando vencidas. Además ignora `p_as_of` para el
   tramo y excluye de los tramos lo que vence en más de 90 días pero sí lo suma al total.
8. **Moneda cableada**: `'COP'` en 5 caminos de Finanzas y **`'USD'` en el cobro de folios del PMS**
   (`FolioPaymentDialog.tsx:220`); ya hay pagos `pms` en USD en una organización colombiana.
9. **CxP descarta la fecha de pago** elegida (`CuentasPorPagarService.ts:465-478`) y el detalle de CxP usa la
   hora del navegador (`cuentas-por-pagar/id/service.ts:330`, `:378`).
10. **Pagos sin autor**: 385 pagos a facturas de venta y 4 de 4 a facturas de compra sin `created_by`
    (`RegistrarPagoDialog.tsx:188-200`, `FacturasCompraService.ts:846-860`). El cierre de caja por cajero
    (`CajasService.ts:1086`, `:1352`) filtra por `created_by`: esos pagos no caen en la caja de nadie.
11. **Cuotas sin transacción**: CxC y CxP marcan la cuota pagada y luego insertan el pago en otra llamada;
    en CxP el error del primer paso ni se revisa (`cuentas-por-pagar/id/service.ts:372-381`).
12. **PMS reduce un pago mixto al primer método** (`FolioPaymentDialog.tsx:181`): el cierre de caja cuadra mal.
13. **Gimnasio**: ingresos del día y de la semana siempre en 0 y sin filtro de organización
    (`src/lib/services/gymService.ts:937-948`).
14. **Estados de cuenta `.txt`** con fechas fuera de la zona de la organización y `toISOString().split`
    (`CuentaPorCobrarDetailPage.tsx:73-104`).
15. **Catálogo de métodos** con `qr`/`QR` y códigos DIAN como métodos; mesas escribe `method: 'pos'`.
16. **Índices únicos de `customers` sensibles al formato**: dejaron pasar 179 grupos por documento y 4 por
    correo.
17. `tasks.related_to_type` usa `cliente` y `customer` para lo mismo.

Observación (no error): en el POS `payments.amount` guarda el efectivo recibido y el cambio va en
`change_amount`; 351 facturas vigentes suman pagos por encima del total (249 se explican por el cambio,
102 no). `GREATEST(total - pagado, 0)` lo esconde en el saldo, pero cualquier reporte que sume `amount`
sin restar el cambio infla los cobros. El componente nuevo debe fijar la convención (A.4, paso 4) y
verificarla contra la fórmula de `CajasService.ts:720-790` antes de implementarse.

---

## F. Preguntas para el dueño

1. **¿El pago desde la ficha aplica a varias facturas a la vez?** Propuesta: sí, «a las más antiguas»
   por defecto, editable por fila, y el sobrante como saldo a favor. ¿O solo una factura por pago?
2. **Anticipo a proveedores**: hoy no existe (solo saldo a favor de clientes). ¿Se crea el equivalente
   para proveedores o el diálogo de pago a proveedor no admite excedente?
3. **Efectivo sin caja abierta**: ¿se bloquea (como el PMS) o solo se avisa? Para organizaciones que no
   usan caja, ¿se permite?
4. **¿Se acepta la columna `payments.payment_group_id`** para agrupar un recibo que paga varias facturas,
   o basta con la referencia compartida?
5. **Índices únicos normalizados** de documento (sin espacios ni puntos) y correo (minúsculas): exigen
   unificar antes los 179 + 4 grupos. ¿Se hace una limpieza guiada para la org 120?
6. **Inactivo**: ¿`customers.status` nuevo (propuesto) o se reutiliza `lifecycle_stage='churned'`?
7. **Texto legal del estado de cuenta** (plazo para objetar, mención de que no es factura, habeas data):
   ¿fijo, o configurable por organización?
8. **Reversión de una fusión**: ¿hasta cuándo? Propuesta: 30 días y solo si no hubo documentos nuevos.
9. **Huellas biométricas del gimnasio al unificar**: ¿se mueven, se descartan o se pide confirmación?
10. **Eliminar**: ¿se permite solo a prospectos sin ninguna relación (propuesto), o se retira la acción y
    queda solo «Inactivar»?
11. **`registrar_pago_membresia` / `registrar_pago_estacionamiento`**: ¿se borran (propuesto) o se
    reparan para que el gimnasio registre sus cobros por ahí?

---

## Anexo — consultas de verificación (solo lectura)

- Columnas de `payments`, `accounts_receivable`, `accounts_payable`, `cash_movements`, `customers`,
  `invoice_sales`, `invoice_purchase`, `credit_notes`, `organizations`, `organization_currencies`:
  `information_schema.columns`.
- Disparadores: `information_schema.triggers`; cuerpos: `pg_get_functiondef` de
  `fn_recalc_invoice_balance_from_payments`, `update_accounts_receivable_on_payment`,
  `fn_recalc_accounts_payable_from_payments`, `create_account_receivable`, `fn_invoice_sales_paid`,
  `fn_register_crm_payment`, `fn_apply_customer_credit`, `fn_create_customer_credit`,
  `fn_reporte_cxc_aging`, `registrar_pago_membresia`.
- FKs hacia `customers`: `pg_constraint` con `confrelid = 'public.customers'::regclass` (43 columnas en
  41 tablas, contando la autorreferencia `customers.parent_customer_id`); únicos de esas tablas: `pg_index`.
- Duplicados: agrupaciones por organización con normalización en SQL; solo conteos.
- Coherencia: saldo de factura contra suma de pagos (1 descuadre en 3.335 facturas vigentes), cartera
  contra factura (0), `days_overdue` contra `due_date` (464 desactualizados).

## Decisiones del dueño (2026-09-23: «apruebo lo que tú me recomiendas, todo»)

1. El pago registrado desde la ficha se reparte entre las facturas abiertas, de la más antigua a la más nueva; lo que sobra queda como saldo a favor.
2. Un pago en efectivo sin caja abierta se bloquea, para que el arqueo siempre cuadre.
3. Se limpian los 179 duplicados por documento de la org 120 (sin ventas ni cartera) y se crean índices únicos que ignoran espacios, puntos y mayúsculas.
4. Cliente inactivo: se agrega la columna `customers.status`; no se reutiliza `lifecycle_stage='churned'`, que en el CRM significa otra cosa.
5. «Eliminar» queda solo para prospectos sin ninguna relación. Todo lo demás se inactiva o se unifica.
6. El texto legal del estado de cuenta es configurable por organización, con un texto por defecto.
