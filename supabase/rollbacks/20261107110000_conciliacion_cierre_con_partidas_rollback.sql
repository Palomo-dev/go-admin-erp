-- Reversión de 20261107110000_conciliacion_cierre_con_partidas.
-- Advertencia: borra la tabla de partidas y la columna close_reason, con sus datos.
-- Antes de ejecutarla, exporta conciliacion_partidas y los motivos de cierre.
-- closing_balance conserva el último valor calculado.

drop trigger if exists trg_conciliacion_items_saldo on public.bank_reconciliation_items;
drop trigger if exists trg_conciliacion_items_guarda on public.bank_reconciliation_items;
drop trigger if exists trg_conciliacion_guarda on public.bank_reconciliations;

drop function if exists public.fn_conciliacion_partidas(integer, uuid);
drop function if exists public.fn_conciliacion_nombre(uuid);
drop function if exists public.fn_conciliacion_partida_resolver(integer, uuid, uuid, integer);
drop function if exists public.fn_conciliacion_cerrar(integer, uuid, text);
drop function if exists public.fn_conciliacion_traidas(uuid);
drop function if exists public.fn_conciliacion_items_saldo();
drop function if exists public.fn_conciliacion_items_guarda();
drop function if exists public.fn_conciliacion_guarda();
drop function if exists public.fn_conciliacion_conciliado(uuid);

drop table if exists public.conciliacion_partidas;

alter table public.bank_reconciliations
  drop column if exists close_reason;
