# PLAN: Columna `source` en `sales` — Clasificar origen de ventas + fix sale_date

## Problemas

### Problema 1: No se puede distinguir el origen de las ventas
La tabla `sales` recibe ventas de **5 orígenes distintos** pero no tiene campo
que los distinga. Esto causa:

1. **Duplicación en reportes/dashboard**: se suma `sales` + `web_orders` por
   separado, pero las web orders ya tienen `sale_id` (existen en ambas tablas).
2. **Ventas web/facturas en Cajas POS**: `CajasService.getSessionSales` filtra
   `sales` por rango de fechas de la sesión, sin distinguir origen. Las ventas
   web y las facturas de venta aparecen en el arqueo de caja aunque nunca
   pasaron por una caja física.

### Problema 2: sale_date incorrecto en reconciliación web
`webOrderServerConfirmation.ts` setea `sale_date: now` (fecha de la
reconciliación) en vez de la fecha original del pedido (`confirmed_at` o
`created_at`). Las 239 ventas reconciliadas aparecen todas como "ventas de hoy"
($2.095.000), distorsionando las estadísticas diarias.

---

## Orígenes de `sales` (mapeo completo)

| Origen | Archivo | Línea | Descripción |
|--------|---------|-------|-------------|
| `pos` | `src/lib/services/posService.ts` | ~1097 | Checkout POS (caja) |
| `web` | `src/lib/services/webOrderServerConfirmation.ts` | ~225 | Pedido web (server-side, cron/auto-confirm) |
| `web` | `src/lib/services/webOrderConfirmationService.ts` | ~185 | Pedido web (browser, confirmación manual) |
| `invoice` | `src/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx` | ~666 | Factura de venta desde finanzas |
| `crm` | `src/components/crm/pipeline/WonCloseModal.tsx` | ~217 | Oportunidad ganada (CRM) |
| `reservation` | `src/lib/services/checkoutService.ts` | ~782 | Checkout de reserva (hotel/parking) |

---

## Solución

### Columna `source` con valores múltiples

```
source TEXT NOT NULL DEFAULT 'pos'
```

| Valor | Significado | ¿Entra en caja? |
|-------|-------------|-----------------|
| `pos` | Venta en caja POS | Sí (default) |
| `web` | Pedido online | No |
| `invoice` | Factura de venta (finanzas) | Configurable por usuario |
| `crm` | Oportunidad ganada CRM | No |
| `reservation` | Checkout de reserva | No |

### Switch de caja: `include_in_cash_register`

El usuario quiere poder decidir si las facturas de venta entran o no en caja.
En lugar de hardcodear qué `source` entra en caja, se agrega una columna
**booleana** `include_in_cash_register` que permite el control granular:

```sql
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS include_in_cash_register
  BOOLEAN NOT NULL DEFAULT true;
```

- `pos` → `true` (default, siempre entra en caja)
- `web` → `false` (nunca entra en caja)
- `invoice` → `true` por default, pero **editable** al crear la factura
  (checkbox "Incluir en caja" en `NuevaFacturaForm`)
- `crm` → `false`
- `reservation` → `false`

`CajasService` filtra `.eq('include_in_cash_register', true)` en vez de
filtrar por `source`. Esto da flexibilidad total.

---

## Fases

### Fase 1 — Base de datos (migración + backfill)

**Tabla**: `sales`
**Cambios**:
1. Agregar `source TEXT NOT NULL DEFAULT 'pos'`
2. Agregar `include_in_cash_register BOOLEAN NOT NULL DEFAULT true`
3. Backfill de `source` e `include_in_cash_register` para ventas existentes

**Archivo**: `supabase/migrations/XXXX_add_source_to_sales.sql` (NUEVO)

**SQL**:
```sql
-- 1. Agregar columnas
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pos';
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS include_in_cash_register BOOLEAN NOT NULL DEFAULT true;

-- 2. Backfill source='web' (por join con web_orders)
UPDATE sales s
  SET source = 'web',
      include_in_cash_register = false
  FROM web_orders wo
  WHERE wo.sale_id = s.id;

-- 3. Backfill source='web' (por notes, ventas sin join aún)
UPDATE sales
  SET source = 'web',
      include_in_cash_register = false
  WHERE notes LIKE 'Pedido web:%'
  AND source = 'pos';

-- 4. Backfill source='invoice' (facturas de venta creadas desde finanzas)
--    Las facturas de venta crean sales con status='pending' y payment_status='pending'
--    y NO tienen notes LIKE 'Pedido web:%'. Las identificamos por la relación
--    invoice_sales.sale_id donde la invoice no viene de POS ni web.
UPDATE sales s
  SET source = 'invoice'
  FROM invoice_sales inv
  WHERE inv.sale_id = s.id
  AND s.source = 'pos'
  AND s.notes NOT LIKE 'Pedido web:%';

-- 5. Backfill source='crm' (oportunidades ganadas)
--    Las ventas CRM tienen branch_id=1 (hardcodeado en WonCloseModal)
--    y notes con 'Oportunidad' o sin notes. Es difícil distinguirlas
--    automáticamente — se dejan como 'pos' (default) si no hay forma fiable.
--    NOTA: revisar manualmente si hay ventas CRM que necesiten reclasificación.

-- 6. Backfill source='reservation' (checkouts de reserva)
UPDATE sales s
  SET source = 'reservation',
      include_in_cash_register = false
  FROM reservations r
  WHERE r.sale_id = s.id
  AND s.source = 'pos';

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_sales_source
  ON sales (organization_id, source);
CREATE INDEX IF NOT EXISTS idx_sales_cash_register
  ON sales (organization_id, include_in_cash_register);

-- 8. Documentación
COMMENT ON COLUMN sales.source IS
  'Origen: pos | web | invoice | crm | reservation';
COMMENT ON COLUMN sales.include_in_cash_register IS
  'Si true, la venta aparece en el arqueo de caja POS';
```

**Verificación**:
```sql
SELECT source, include_in_cash_register, count(*)
  FROM sales GROUP BY source, include_in_cash_register;
```

---

### Fase 2 — Backend: marcar `source` y `include_in_cash_register` al crear ventas

#### 2.1 `src/lib/services/webOrderServerConfirmation.ts`
- **Línea ~225** (insert de `sales` en `confirmOrder`)
- **Cambios**:
  - Agregar `source: 'web'`
  - Agregar `include_in_cash_register: false`
  - **Fix sale_date**: cambiar `sale_date: now` → `sale_date: order.confirmed_at || order.created_at || now`
    (preserva la fecha original del pedido, no la fecha de la reconciliación)

#### 2.2 `src/lib/services/webOrderConfirmationService.ts`
- **Línea ~185** (insert de `sales` en `createSale`)
- **Cambios**:
  - Agregar `source: 'web'`
  - Agregar `include_in_cash_register: false`
  - **Fix sale_date**: usar `order.confirmed_at || order.created_at` en vez de `new Date().toISOString()`

#### 2.3 `src/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx`
- **Línea ~648** (insert de `sales`)
- **Cambios**:
  - Agregar `source: 'invoice'`
  - Agregar `include_in_cash_register: <valor del checkbox>` (ver Fase 3)
- **Contexto**: las facturas de venta desde finanzas. El usuario decide si
  entran en caja mediante un checkbox en el formulario.

#### 2.4 `src/components/crm/pipeline/WonCloseModal.tsx`
- **Línea ~217** (insert de `sales`)
- **Cambios**:
  - Agregar `source: 'crm'`
  - Agregar `include_in_cash_register: false`

#### 2.5 `src/lib/services/checkoutService.ts`
- **Línea ~782** (insert de `sales`)
- **Cambios**:
  - Agregar `source: 'reservation'`
  - Agregar `include_in_cash_register: false`

#### 2.6 `src/lib/services/posService.ts`
- **Línea ~1097** (insert de `sales` en checkout POS)
- **Sin cambio**: usa el default `source='pos'` e `include_in_cash_register=true`

---

### Fase 3 — UI: checkbox "Incluir en caja" en factura de venta

#### 3.1 `src/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx`
- **Agregar**: checkbox "Incluir en arqueo de caja" (default: checked)
- **Estado**: `const [includeInCashRegister, setIncludeInCashRegister] = useState(true)`
- **Ubicación**: en la sección de pago/configuración, cerca del método de pago
- **Binding**: pasar `include_in_cash_register: includeInCashRegister` al insert de sales

#### 3.2 `src/components/finanzas/facturas-venta/editar/EditarFacturaVenta.tsx`
- **Revisar**: si permite editar el campo al editar una factura existente
- **Si aplica**: agregar el mismo checkbox

---

### Fase 4 — Cajas POS: filtrar por `include_in_cash_register`

#### 4.1 `src/components/pos/cajas/CajasService.ts`

**Función `getSessionSales`** (línea ~979-1000):
- **Cambio**: agregar `.eq('include_in_cash_register', true)` al query de `sales`
- **Razón**: filtra por la bandera configurable en vez de hardcodear `source != 'web'`

**Función `getSessionPaymentsDetail`** (línea ~1006+):
- **Cambio**: tras obtener los `invoiceSaleIds`, excluir los que provienen de
  sales con `include_in_cash_register = false`.
- **Implementación**:
  ```ts
  // Obtener invoice_ids a excluir (los que vienen de sales fuera de caja)
  const { data: excludedInvoices } = await supabase
    .from('invoice_sales')
    .select('id')
    .in('id', invoiceSaleIds)
    .in('sale_id', (
      await supabase.from('sales')
        .select('id')
        .eq('include_in_cash_register', false)
    ).data?.map(s => s.id) || []);

  const excludedIds = new Set(excludedInvoices?.map(i => i.id) || []);
  const filteredPayments = payments.filter(p =>
    !(p.source === 'invoice_sales' && excludedIds.has(p.source_id))
  );
  ```

#### 4.2 `src/app/app/pos/cajas/detalle/CajaDetallePage.tsx`
- **Sin cambio directo**: usa `CajasService` que ya filtra tras el cambio 4.1.

---

### Fase 5 — Dashboard y reportes: eliminar duplicación

**Principio**: las consultas de `web_orders` agregan `.is('sale_id', null)` para
contar SOLO los pedidos que aún no se convirtieron en `sale`. Los que ya tienen
`sale_id` se cuentan en `sales` (con `source='web'`).

#### 5.1 `src/components/inicio/inicioService.ts` (Dashboard inicio)
- **Líneas 244-250** (web_orders período): agregar `.is('sale_id', null)`
- **Líneas 253-258** (web_orders 30 días): agregar `.is('sale_id', null)`
- **Líneas 370-376** (web_orders período anterior): agregar `.is('sale_id', null)`
- **Líneas 570-575** (getTendenciaVentas): agregar `.is('sale_id', null)`

#### 5.2 `src/lib/services/posDashboardService.ts` (Dashboard POS)
- **Líneas 117-122** (web_orders del mes): agregar `.is('sale_id', null)`

#### 5.3 `src/components/finanzas/dashboard/FinanzasDashboardService.ts` (Dashboard finanzas)
- **Líneas 133-139** (web_orders pagadas): agregar `.is('sale_id', null)`

#### 5.4 `src/components/pos/reportes/reportesService.ts` (Reportes POS)
- **Líneas 80, 154, 269, 328, 396** (consultas de web_orders): agregar `.is('sale_id', null)`

#### 5.5 `src/lib/services/reportes/modulos/ventasReports.ts` (Reportes de ventas)
- **Línea 551** (reporte "Pedidos Online"): **sin cambio** — lista web_orders
  como entidad informativa, no las suma con sales.

---

### Fase 6 — VentasService y página de ventas

#### 6.1 `src/components/pos/ventas/VentasService.ts`
- **Líneas 40-61** (getSales, ventas POS desde `sales`):
  - **Cambio**: agregar `.neq('source', 'web')` para que la lista "POS" no
    muestre ventas web (que ya aparecen en la lista "Web" separada)
- **Líneas 64-109** (getSales, ventas web desde `web_orders`): **sin cambio**

#### 6.2 `src/app/app/pos/ventas/page.tsx`
- **Sin cambio directo**: usa `VentasService.getSales` con filtro `source_type`

---

### Fase 7 — Fix sale_date de las 239 ventas ya reconciliadas

Las 239 ventas web reconciliadas tienen `sale_date = fecha de reconciliación`
(hoy). Hay que corregirlas con la fecha original del pedido.

**SQL** (incluido en la migración de Fase 1 o script separado):
```sql
UPDATE sales s
  SET sale_date = wo.confirmed_at
  FROM web_orders wo
  WHERE wo.sale_id = s.id
  AND wo.confirmed_at IS NOT NULL;

-- Para las que no tienen confirmed_at, usar created_at
UPDATE sales s
  SET sale_date = wo.created_at
  FROM web_orders wo
  WHERE wo.sale_id = s.id
  AND wo.confirmed_at IS NULL;
```

---

## Resumen de cambios por archivo

| # | Archivo | Fase | Cambio |
|---|---------|------|--------|
| 1 | `supabase/migrations/XXXX_add_source_to_sales.sql` | 1 | NUEVO: migración + backfill + fix sale_date |
| 2 | `src/lib/services/webOrderServerConfirmation.ts` | 2 | `source:'web'`, `include_in_cash_register:false`, fix `sale_date` |
| 3 | `src/lib/services/webOrderConfirmationService.ts` | 2 | `source:'web'`, `include_in_cash_register:false`, fix `sale_date` |
| 4 | `src/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx` | 2+3 | `source:'invoice'`, checkbox "Incluir en caja" |
| 5 | `src/components/crm/pipeline/WonCloseModal.tsx` | 2 | `source:'crm'`, `include_in_cash_register:false` |
| 6 | `src/lib/services/checkoutService.ts` | 2 | `source:'reservation'`, `include_in_cash_register:false` |
| 7 | `src/components/pos/cajas/CajasService.ts` | 4 | `getSessionSales`: `.eq('include_in_cash_register', true)` + `getSessionPaymentsDetail`: excluir invoices fuera de caja |
| 8 | `src/components/inicio/inicioService.ts` | 5 | 4 consultas web_orders: `.is('sale_id', null)` |
| 9 | `src/lib/services/posDashboardService.ts` | 5 | 1 consulta web_orders: `.is('sale_id', null)` |
| 10 | `src/components/finanzas/dashboard/FinanzasDashboardService.ts` | 5 | 1 consulta web_orders: `.is('sale_id', null)` |
| 11 | `src/components/pos/reportes/reportesService.ts` | 5 | 5 consultas web_orders: `.is('sale_id', null)` |
| 12 | `src/components/pos/ventas/VentasService.ts` | 6 | Consulta sales POS: `.neq('source', 'web')` |

**Total**: 1 archivo nuevo (migración) + 11 archivos modificados

---

## Orden de ejecución

1. **Fase 1** (BD) — migración + backfill + fix sale_date de las 239 ventas
2. **Fase 2** (backend) — marcar `source` e `include_in_cash_register` en los 5 orígenes
3. **Fase 3** (UI) — checkbox "Incluir en caja" en factura de venta
4. **Fase 4** (cajas) — filtrar por `include_in_cash_register`
5. **Fase 5** (dashboard/reportes) — eliminar duplicación
6. **Fase 6** (ventas) — lista POS excluye web
7. **Fase 7** — incluida en Fase 1 (fix sale_date via SQL)

---

## Verificación final

1. **BD**:
   ```sql
   SELECT source, include_in_cash_register, count(*)
     FROM sales GROUP BY source, include_in_cash_register;
   ```
   → pos+true (mayoría), web+false (239), invoice+true/false, crm+false, reservation+false

2. **sale_date**: verificar que las 239 ventas web tienen `sale_date` = fecha
   original del pedido, no la fecha de reconciliación
   ```sql
   SELECT s.sale_date, wo.created_at, wo.confirmed_at
     FROM sales s JOIN web_orders wo ON wo.sale_id = s.id
     ORDER BY s.sale_date DESC LIMIT 10;
   ```

3. **Caja**: abrir una caja, verificar que ventas web y facturas (si checkbox=off)
   no aparecen en el arqueo

4. **Dashboard**: ventas totales = sales (sin duplicar web_orders con sale_id)

5. **Página /pos/ventas**: filtro "POS" no muestra ventas web; filtro "Web" sí

6. **Nueva factura de venta**: checkbox "Incluir en caja" aparece y funciona

7. **Nueva venta web**: `sales.source='web'`, `include_in_cash_register=false`,
   `sale_date` = fecha del pedido

8. **Nueva venta POS**: `sales.source='pos'` (default), `include_in_cash_register=true`

---

## Notas

- Las 239 ventas web ya reconciliadas se marcan con `source='web'` y
  `include_in_cash_register=false` en el backfill (Fase 1).
- El `sale_date` de esas 239 ventas se corrige en la misma migración (Fase 7
  integrada en Fase 1).
- Las facturas con `bancolombia_transfer`/`bancolombia_collect` que fallaron
  durante la reconciliación necesitan una segunda pasada con el mapeo de Wompi
  ya arreglado (cambio aplicado en `webOrderServerConfirmation.ts`).
- El cron reconciliador `/api/cron/reconcile-web-orders` ya seteará
  `source='web'` e `include_in_cash_register=false` automáticamente tras Fase 2.
- El campo `include_in_cash_register` da flexibilidad: el usuario puede decidir
  caso por caso si una factura de venta entra o no en caja, sin hardcodear reglas.
