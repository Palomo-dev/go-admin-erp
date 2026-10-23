-- Revierte 20261023085326_centros_costo_distribucion.
-- Borra las distribuciones y sus líneas. No se pueden recuperar desde aquí.
-- Antes hay que revertir 20261023085352_centros_costo_reparto: si el disparador
-- de la línea todavía llama a fn_repartir_monto, el siguiente asiento fallaría.
-- Las columnas distribucion_id de compra, caja y banco se quitan en
-- 20261023080217_centros_costo_defecto_rollback.

do $orden$
begin
  if to_regprocedure('public.fn_journal_linea_heredar_centro()') is not null
     and position('fn_repartir_monto' in pg_get_functiondef('public.fn_journal_linea_heredar_centro()'::regprocedure)) > 0 then
    raise exception 'Revierte primero 20261023085352_centros_costo_reparto';
  end if;
  if to_regprocedure('public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)') is not null
     and position('fn_repartir_monto' in pg_get_functiondef('public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure)) > 0 then
    raise exception 'Revierte primero 20261023085352_centros_costo_reparto';
  end if;
end
$orden$;

alter table public.invoice_purchase drop constraint if exists invoice_purchase_distribucion_id_fkey;
alter table public.cash_movements drop constraint if exists cash_movements_distribucion_id_fkey;
alter table public.bank_transactions drop constraint if exists bank_transactions_distribucion_id_fkey;

drop trigger if exists trg_distribucion_suma_100 on public.cost_center_distribution_lines;
drop trigger if exists trg_distribucion_linea_org on public.cost_center_distribution_lines;
drop function if exists public.fn_repartir_monto(integer, integer, text, uuid, uuid, numeric, numeric, numeric, numeric);
drop function if exists public.fn_distribucion_suma_100();
drop function if exists public.fn_distribucion_linea_org();
drop table if exists public.cost_center_distribution_lines;
drop table if exists public.cost_center_distributions;
