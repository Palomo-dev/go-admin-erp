-- Rollback de 20261025133058_p1_cuenta_sede_resuelve_auxiliar: restaura la definición VIVA capturada el 25-oct-2026 con pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.fn_cuenta_configurada_de_sede(p_organization_id integer, p_branch_id integer, p_source text, p_lado text, p_codigo text, OUT cuenta text, OUT fallo text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sub text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select r.cuenta, r.fallo into cuenta, fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, p_lado, p_codigo
  ) r;

  if fallo is not null or cuenta is null or p_branch_id is null then
    return;
  end if;

  select m.sub_account_code into v_sub
  from public.branch_account_mappings m
  where m.organization_id = p_organization_id
    and m.branch_id = p_branch_id
    and m.base_account_code = cuenta
  limit 1;

  if v_sub is not null then
    cuenta := v_sub;
  end if;

  if cuenta is not null
     and p_branch_id is not null
     and cuenta !~ '^143501[0-9]{2}$'
     and (
       cuenta in ('1405', '1435')
       or cuenta like '1405%'
       or cuenta ~ '^143505'
     ) then
    v_sub := public.fn_asegurar_auxiliar_1435(p_organization_id, p_branch_id);
    if v_sub is not null then
      cuenta := v_sub;
    end if;
  end if;
end;
$function$
;

