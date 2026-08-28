-- Migración: agregar columnas `source` e `include_in_cash_register` a `sales`
-- Objetivo: distinguir el origen de cada venta (pos, web, invoice, crm, reservation)
-- y controlar cuáles entran en el arqueo de caja POS.
-- Fecha: 2026-08-27
-- Reversible: DROP COLUMN source, DROP COLUMN include_in_cash_register

-- ============================================================
-- 1. Agregar columnas (expand — compatible hacia atrás)
-- ============================================================
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pos';

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS include_in_cash_register BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- 2. Backfill source='web' (por join con web_orders.sale_id)
-- ============================================================
UPDATE sales s
  SET source = 'web',
      include_in_cash_register = false
  FROM web_orders wo
  WHERE wo.sale_id = s.id
  AND s.source = 'pos';

-- 3. Backfill source='web' (por notes — ventas web sin join aún)
UPDATE sales
  SET source = 'web',
      include_in_cash_register = false
  WHERE notes LIKE 'Pedido web:%'
  AND source = 'pos';

-- ============================================================
-- 4. Backfill source='invoice' (facturas de venta desde finanzas)
--    Las facturas de venta crean sales con status='pending' y
--    payment_status='pending' y NO tienen notes LIKE 'Pedido web:%'.
--    Se identifican por la relación invoice_sales.sale_id.
-- ============================================================
UPDATE sales s
  SET source = 'invoice'
  FROM invoice_sales inv
  WHERE inv.sale_id = s.id
  AND s.source = 'pos'
  AND s.notes NOT LIKE 'Pedido web:%';

-- ============================================================
-- 5. Backfill source='reservation' (checkouts de reserva)
--    La tabla reservations no tiene sale_id, pero checkoutService
--    crea sales con notes = 'Checkout reserva XXXX'.
-- ============================================================
UPDATE sales
  SET source = 'reservation',
      include_in_cash_register = false
  WHERE notes LIKE 'Checkout reserva%'
  AND source = 'pos';

-- ============================================================
-- 6. Fix sale_date de ventas web reconciliadas
--    Las 239 ventas web reconciliadas tienen sale_date = fecha de
--    reconciliación (hoy). Se corrigen con la fecha original del pedido
--    (created_at), ya que confirmed_at puede tener la fecha de la
--    reconciliación, no la del pedido original.
-- ============================================================
UPDATE sales s
  SET sale_date = wo.created_at
  FROM web_orders wo
  WHERE wo.sale_id = s.id;

-- ============================================================
-- 7. Índices para filtrado eficiente
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sales_source
  ON sales (organization_id, source);

CREATE INDEX IF NOT EXISTS idx_sales_cash_register
  ON sales (organization_id, include_in_cash_register);

-- ============================================================
-- 8. Documentación
-- ============================================================
COMMENT ON COLUMN sales.source IS
  'Origen de la venta: pos (caja POS) | web (pedido online) | invoice (factura de venta) | crm (oportunidad ganada) | reservation (checkout de reserva)';

COMMENT ON COLUMN sales.include_in_cash_register IS
  'Si true, la venta aparece en el arqueo de caja POS. pos=true, web=false, invoice=configurable, crm=false, reservation=false';

-- ============================================================
-- Rollback (ejecutar solo si se necesita revertir)
-- ============================================================
-- DROP INDEX IF EXISTS idx_sales_cash_register;
-- DROP INDEX IF EXISTS idx_sales_source;
-- ALTER TABLE sales DROP COLUMN IF EXISTS include_in_cash_register;
-- ALTER TABLE sales DROP COLUMN IF EXISTS source;
