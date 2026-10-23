-- Devuelve parent_code al valor guardado antes del backfill.
-- Candado exclusivo solo mientras corre este update.
-- La reversión completa del conjunto está en
-- 20261023120100_puc_consolidacion_prefijo_movimiento_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '25s';

do $rb$
begin
  if to_regclass('public.puc_consolidacion_cuentas') is null then
    return;
  end if;
  execute 'alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta';
  update public.chart_of_accounts c
    set parent_code = b.parent_code
  from public.puc_consolidacion_cuentas b
  where c.organization_id = b.organization_id
    and c.account_code = b.account_code
    and c.parent_code is distinct from b.parent_code;
  execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
exception when others then
  execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
  raise;
end
$rb$;
