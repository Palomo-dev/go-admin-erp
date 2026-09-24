-- Rollback de 20260926140000_pos_ventas_listado_y_cobrado_rango.sql
-- Solo funciones de lectura e índices: no hay datos que restaurar.
-- Antes de revertir, el listado de /app/pos/ventas y los KPI deben volver a la
-- lectura anterior (VentasService.getSales desde el navegador).

drop function if exists public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer);
drop function if exists public.pos_ventas_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text, text, integer, integer);

drop index if exists public.idx_payments_org_payment_date;
drop index if exists public.idx_invoice_sales_sale_id;
drop index if exists public.idx_sales_org_sale_date;
