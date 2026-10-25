-- Comisiones, 25-oct-2026. NO aplicada. Paso 3 de 3: las comisiones NO se generan desde facturas de compra
-- (origen del bug de la org 113: comisiones 21677585 / bd9629cc, $41.300, asientos 1573/1574).
--   1. Se elimina el trigger trg_create_commission_on_invoice_purchase (invoice_purchase AFTER UPDATE OF status).
--   2. fn_create_commission_on_invoice_purchase queda como no-op (por si algo la invoca directo).
--   3. CHECK NOT VALID en commissions: ninguna comisión puede tener source_type 'invoice_purchase' salvo en estado
--      'cancelled' (QA ALTO#2: un NOT VALID se valida en cada UPDATE; así la anulación de las 2 filas de la org 113,
--      134140, no falla). Su reversa (asientos 1573/1574) es 134140 y espera OK de Juan.
--   4. Defensa en profundidad en fn_auto_journal_commission (134095): no contabiliza invoice_purchase.
-- Idempotente. Rollback: supabase/rollbacks/20261025134100_comisiones_bloqueo_factura_compra_rollback.sql

drop trigger if exists trg_create_commission_on_invoice_purchase on public.invoice_purchase;

create or replace function public.fn_create_commission_on_invoice_purchase()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Las comisiones de vendedor no salen de facturas de compra (25-oct-2026, bug org 113).
  return new;
end;
$function$;

alter table public.commissions drop constraint if exists commissions_no_factura_compra;
alter table public.commissions add constraint commissions_no_factura_compra
  check (source_type is distinct from 'invoice_purchase' or status = 'cancelled') not valid;

-- AJUSTE: fila propia en schema_migrations (los rollbacks cruzados de 134115/134140 la consultan).
insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134100', 'comisiones_bloqueo_factura_compra', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
