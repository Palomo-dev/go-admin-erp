-- Rollback de 20260928180000_tasas_comision_por_rpc.
-- Quita las funciones y devuelve los privilegios anteriores (anon y
-- authenticated con todo, frenados solo por la política
-- vendor_commission_rates_org_member_all). No borra tasas guardadas.

drop function if exists public.fn_tasa_comision_eliminar(integer, uuid);
drop function if exists public.fn_tasa_comision_guardar(integer, uuid, numeric, date, date, uuid);
drop function if exists public.fn_tasa_comision_exigir_gestion(integer);
drop function if exists public.fn_tasa_comision_vigente(integer, uuid, boolean);

grant select, insert, update, delete, truncate, references, trigger on table public.vendor_commission_rates to anon, authenticated;
