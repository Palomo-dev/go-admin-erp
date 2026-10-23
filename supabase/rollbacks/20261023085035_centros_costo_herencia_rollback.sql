-- Revierte 20261023085035_centros_costo_herencia.
-- Quita la herencia al insertar la línea y las llaves del centro en compra,
-- líneas de compra y empleos. Las columnas se quitan con el rollback de
-- 20261023080217. No reescribe líneas ya contabilizadas.
-- Antes hay que revertir el reparto: si no, se borraría la versión que parte
-- la línea y el rollback del reparto no encontraría su fragmento.

do $orden$
begin
  if to_regprocedure('public.fn_journal_linea_heredar_centro()') is not null
     and position('fn_repartir_monto' in pg_get_functiondef('public.fn_journal_linea_heredar_centro()'::regprocedure)) > 0 then
    raise exception 'Revierte primero 20261023085352_centros_costo_reparto';
  end if;
end
$orden$;

drop trigger if exists trg_journal_linea_heredar_centro on public.journal_lines;
drop trigger if exists trg_invoice_purchase_centro_org on public.invoice_purchase;
drop trigger if exists trg_invoice_items_centro_org on public.invoice_items;
drop trigger if exists trg_employments_centro_org on public.employments;

alter table public.invoice_purchase drop constraint if exists invoice_purchase_cost_center_id_fkey;
alter table public.invoice_items drop constraint if exists invoice_items_cost_center_id_fkey;
alter table public.employments drop constraint if exists employments_cost_center_id_fkey;

drop function if exists public.fn_journal_linea_heredar_centro();
drop function if exists public.fn_centro_misma_org();
