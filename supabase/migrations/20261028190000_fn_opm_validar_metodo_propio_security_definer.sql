-- Seguridad (QA 28-oct): el trigger de 20261028181000 corría como el invocador y, con la RLS
-- payment_methods_select_policy_v3, la org B no ve el método personalizado de A: v_duena salía
-- NULL y el INSERT directo en organization_payment_methods pasaba. Como SECURITY DEFINER lee el
-- catálogo completo. search_path fijo (public, pg_temp) y lock_timeout para no quedar colgado.
create or replace function public.fn_opm_validar_metodo_propio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare v_duena integer;
begin
  select pm.organization_id into v_duena from public.payment_methods pm where pm.code = new.payment_method_code;
  if v_duena is not null and v_duena <> new.organization_id then
    raise exception 'El método de pago % es personalizado de otra organización', new.payment_method_code
      using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.fn_opm_validar_metodo_propio() from public, anon, authenticated;
