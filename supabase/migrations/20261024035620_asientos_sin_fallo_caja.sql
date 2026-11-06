-- Los fallos contables se resuelven solos.
-- Parte 1 de 4. El archivo del repositorio es la migración completa;
-- esta parte crea la búsqueda de caja y la vista previa.

create or replace function public.fn_cuenta_movimiento_o_detalle(
  p_organization_id integer,
  p_branch_id integer,
  p_cuenta text
) returns text
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v text := nullif(btrim(p_cuenta), '');
  v_det text;
  v_base text;
begin
  if v is null then
    return null;
  end if;
  if public.fn_validar_cuenta_movimiento(p_organization_id, v) is null
     and not public.fn_es_cuenta_de_titulo(p_organization_id, v) then
    return v;
  end if;

  v_base := public.fn_puc_codigo_normalizado(v);
  if v_base is null and v ~ '^1405' then
    v_base := '1405';
  end if;

  if v_base = '1405' or v like '1405%' then
    v_det := public.fn_inventario_auxiliar_1435(p_organization_id, p_branch_id);
    if v_det is null
       or public.fn_validar_cuenta_movimiento(p_organization_id, v_det) is not null
       or public.fn_es_cuenta_de_titulo(p_organization_id, v_det) then
      v_det := public.fn_puc_cuenta_para_asiento(
        p_organization_id, '1435', 'Mercancías no fabricadas por la empresa'
      );
    end if;
    if v_det is not null
       and public.fn_validar_cuenta_movimiento(p_organization_id, v_det) is null
       and not public.fn_es_cuenta_de_titulo(p_organization_id, v_det) then
      return v_det;
    end if;
  end if;

  if v_base is not null then
    select c.account_code into v_det
      from public.chart_of_accounts c
     where c.organization_id = p_organization_id
       and c.account_code like v_base || '%'
       and c.account_code <> v_base
       and coalesce(c.is_active, true)
       and c.es_movimiento is distinct from false
       and not public.fn_es_cuenta_de_titulo(p_organization_id, c.account_code)
     order by length(c.account_code), c.account_code
     limit 1;
    if v_det is not null then
      return v_det;
    end if;
    v_det := public.fn_puc_cuenta_para_asiento(p_organization_id, v_base, v_base);
    if v_det is not null
       and public.fn_validar_cuenta_movimiento(p_organization_id, v_det) is null
       and not public.fn_es_cuenta_de_titulo(p_organization_id, v_det) then
      return v_det;
    end if;
  end if;

  return v;
end;
$fn$;

revoke all on function public.fn_cuenta_movimiento_o_detalle(integer, integer, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_movimiento_o_detalle(integer, integer, text) to service_role;

create or replace function public.fn_cuenta_caja_existente(
  p_organization_id integer,
  p_branch_id integer,
  p_preferida text
) returns text
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v text;
begin
  v := nullif(btrim(p_preferida), '');
  if v is not null
     and public.fn_validar_cuenta_movimiento(p_organization_id, v) is null
     and not public.fn_es_cuenta_de_titulo(p_organization_id, v) then
    return v;
  end if;

  if p_branch_id is not null then
    select m.sub_account_code into v
      from public.branch_account_mappings m
     where m.organization_id = p_organization_id
       and m.branch_id = p_branch_id
       and m.base_account_code = '1105'
     limit 1;
    if v is not null
       and public.fn_validar_cuenta_movimiento(p_organization_id, v) is null
       and not public.fn_es_cuenta_de_titulo(p_organization_id, v) then
      return v;
    end if;
  end if;

  v := public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'caja');
  if v is not null
     and public.fn_validar_cuenta_movimiento(p_organization_id, v) is null
     and not public.fn_es_cuenta_de_titulo(p_organization_id, v) then
    return v;
  end if;

  select c.account_code into v
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id
     and c.account_code like '1105%'
     and c.account_code <> '1105'
     and coalesce(c.is_active, true)
     and c.es_movimiento is distinct from false
     and not public.fn_es_cuenta_de_titulo(p_organization_id, c.account_code)
   order by length(c.account_code), c.account_code
   limit 1;
  if v is not null then
    return v;
  end if;

  select c.account_code into v
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id
     and c.account_code like '1110%'
     and c.account_code <> '1110'
     and coalesce(c.is_active, true)
     and c.es_movimiento is distinct from false
     and not public.fn_es_cuenta_de_titulo(p_organization_id, c.account_code)
   order by length(c.account_code), c.account_code
   limit 1;
  return v;
end;
$fn$;

create or replace function public.fn_cuenta_caja(
  p_organization_id integer,
  p_branch_id integer,
  p_preferida text
) returns text
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v text;
  v_sede text;
  v_nombre text;
  v_n integer;
  v_codigo text;
begin
  v := public.fn_cuenta_caja_existente(p_organization_id, p_branch_id, p_preferida);
  if v is not null then
    return v;
  end if;

  perform public.fn_puc_asegurar_cuenta(p_organization_id, '1105', 'Caja', false);
  perform public.fn_puc_asegurar_cuenta(p_organization_id, '110505', 'Caja general', false);

  select coalesce(max(substring(c.account_code from 7)::integer), 0) + 1
    into v_n
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id
     and c.account_code ~ '^110505[0-9]{2}$';
  if v_n is null or v_n < 1 then
    v_n := 1;
  end if;
  if v_n > 99 then
    return null;
  end if;
  v_codigo := '110505' || lpad(v_n::text, 2, '0');

  select nullif(btrim(b.name), '') into v_sede
    from public.branches b
   where b.id = p_branch_id
     and b.organization_id = p_organization_id;
  v_nombre := case
    when v_sede is null then 'Caja general'
    else 'Caja general - ' || v_sede
  end;

  v := public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo, v_nombre, true);
  if v is null then
    return null;
  end if;

  if p_branch_id is not null then
    insert into public.branch_account_mappings (
      organization_id, branch_id, base_account_code, sub_account_code
    ) values (
      p_organization_id, p_branch_id, '1105', v
    )
    on conflict (organization_id, branch_id, base_account_code) do update
      set sub_account_code = excluded.sub_account_code
    where public.fn_validar_cuenta_movimiento(
            branch_account_mappings.organization_id,
            branch_account_mappings.sub_account_code
          ) is not null
       or public.fn_es_cuenta_de_titulo(
            branch_account_mappings.organization_id,
            branch_account_mappings.sub_account_code
          );
  end if;

  return v;
end;
$fn$;

revoke all on function public.fn_cuenta_caja_existente(integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_cuenta_caja(integer, integer, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_caja_existente(integer, integer, text) to service_role;
grant execute on function public.fn_cuenta_caja(integer, integer, text) to service_role;

select public.fn_cuenta_caja_existente(140, 115, null) as caja_140;