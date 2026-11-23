-- Reversión de 20261123200500: el cuadre vuelve a exigir solo pos.create.
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
    if not public.fn_caja_puede(p_org, 'pos.create') then
      raise exception 'SIN_PERMISO' using errcode = '42501';
    end if;
  end if;
end;
$function$;
