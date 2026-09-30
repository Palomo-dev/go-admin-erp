-- Rollback de 20260930190002_hora_servidor_trigger.sql
--
-- Quita los triggers de hora oficial. DATOS: las filas escritas mientras estuvieron
-- activos conservan la hora del servidor (no se restaura la que mandó el navegador,
-- que en sales queda en device_created_at y en cash_sessions en device_opened_at).

drop trigger if exists trg_00_hora_oficial on public.sales;
drop trigger if exists trg_00_hora_oficial on public.sale_items;
drop trigger if exists trg_00_hora_oficial on public.payments;
drop trigger if exists trg_00_hora_oficial on public.cash_movements;
drop trigger if exists trg_00_hora_oficial on public.table_sessions;
drop trigger if exists trg_00_hora_oficial on public.returns;
drop trigger if exists trg_00_hora_oficial on public.stock_movements;
drop trigger if exists trg_00_hora_oficial on public.invoice_sales;
drop trigger if exists trg_00_hora_oficial on public.invoice_purchase;
drop trigger if exists trg_00_hora_oficial on public.credit_notes;
drop trigger if exists trg_00_hora_oficial on public.cash_sessions;

drop function if exists public.fn_trg_caja_hora_oficial();
drop function if exists public.fn_trg_hora_oficial();
