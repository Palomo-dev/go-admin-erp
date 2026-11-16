-- Reversión de 20261115210000_hrm_zona_horaria_delega_en_fn_timezone_for:
-- vuelve al cuerpo de 20261115042303_hrm_f0_10_marcacion_zona_horaria.

create or replace function public.fn_hr_zona_horaria(p_org integer, p_branch integer)
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_prueba timestamp;
begin
  select nullif(btrim(b.timezone), '') into v_tz
    from public.branches b where b.id = p_branch and b.organization_id = p_org;
  if v_tz is null then
    select nullif(btrim(o.timezone), '') into v_tz from public.organizations o where o.id = p_org;
  end if;
  if v_tz is null then
    return 'America/Bogota';
  end if;
  begin
    v_prueba := now() at time zone v_tz;
  exception when others then
    return 'America/Bogota';
  end;
  return v_tz;
end;
$$;

revoke execute on function public.fn_hr_zona_horaria(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_zona_horaria(integer, integer) to service_role;
