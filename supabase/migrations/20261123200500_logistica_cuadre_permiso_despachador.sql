-- Logística: el cuadre del domiciliario lo recibe quien tiene caja (pos.create, como antes) o el
-- Despachador (logistica.manage, migración 20261123195500). Suma, no quita (2026-11-23).
-- La caja abierta sigue siendo obligatoria: el dinero entra a una sesión de caja de la sede.
create or replace function public.fn_logistica_cuadre_exigir(p_org integer, p_branch integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.fn_assert_acceso_org(p_org);
  if auth.uid() is not null then
    if p_branch is not null and not public.app_branch_access(p_branch) then
      raise exception 'SIN_ACCESO_SEDE' using errcode = '42501';
    end if;
    if not (public.fn_caja_puede(p_org, 'pos.create') or public.fn_caja_puede(p_org, 'logistica.manage')) then
      raise exception 'SIN_PERMISO' using errcode = '42501';
    end if;
  end if;
end;
$function$;
