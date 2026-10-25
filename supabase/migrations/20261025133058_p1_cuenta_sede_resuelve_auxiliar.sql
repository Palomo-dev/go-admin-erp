-- P1 (25-oct-2026): «La cuenta configurada 1435 (Inventario) no es de movimiento».
-- fn_cuenta_configurada_de_sede salía con el fallo de fn_resolver_cuenta_configurada
-- ANTES de aplicar el mapeo por sede (branch_account_mappings) y el auxiliar 1435.
-- Ahora: 1) mapeo por sede, 2) auxiliar 1435 de la sede (fn_asegurar_auxiliar_1435),
-- 3) si la cuenta de título tiene un único auxiliar de movimiento, ese auxiliar (no aplica a impuestos 24xx).
-- Solo devuelve fallo si al final no hay ninguna cuenta de movimiento.
-- Inventario nunca termina en 1405: 1405/1435/143501xx/143505 van al auxiliar 143501xx de la sede.
-- Rollback: supabase/rollbacks/20261025133058_p1_cuenta_sede_resuelve_auxiliar_rollback.sql

CREATE OR REPLACE FUNCTION public.fn_cuenta_configurada_de_sede(p_organization_id integer, p_branch_id integer, p_source text, p_lado text, p_codigo text, OUT cuenta text, OUT fallo text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sub text;
  v_fallo text;
  v_hijos text[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select r.cuenta, r.fallo into cuenta, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, p_lado, p_codigo
  ) r;

  if cuenta is null then
    fallo := v_fallo;
    return;
  end if;

  -- 1) Mapeo por sede (solo a una cuenta que reciba movimientos).
  if p_branch_id is not null then
    select m.sub_account_code into v_sub
    from public.branch_account_mappings m
    join public.chart_of_accounts c
      on c.organization_id = m.organization_id
     and c.account_code = m.sub_account_code
     and c.es_movimiento is distinct from false
    where m.organization_id = p_organization_id
      and m.branch_id = p_branch_id
      and m.base_account_code = cuenta
    limit 1;

    if v_sub is not null then
      cuenta := v_sub;
    end if;
  end if;

  -- 2) Inventario: siempre el auxiliar 143501xx de la sede (nunca 1405 ni 1435 sola).
  if cuenta in ('1405', '1435')
     or cuenta like '1405%'
     or cuenta ~ '^143501[0-9]{2}$'
     or cuenta ~ '^143505' then
    v_sub := case
      when p_branch_id is not null then public.fn_asegurar_auxiliar_1435(p_organization_id, p_branch_id)
      else public.fn_inventario_auxiliar_1435(p_organization_id, null)
    end;
    if v_sub is not null then
      cuenta := v_sub;
    end if;
  end if;

  -- 3) Sin fallo previo: comportamiento de siempre.
  if v_fallo is null then
    return;
  end if;

  -- 4) Venía con fallo (título / fuera del plan): ¿ya quedó en una cuenta de movimiento?
  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and c.account_code = cuenta
      and c.es_movimiento is distinct from false
  ) then
    fallo := null;
    return;
  end if;

  -- 5) Cuenta de título con un único auxiliar de movimiento: usarlo.
  --    Excepto impuestos (24xx): p. ej. 2408 tiene 240805 generado y 240810 descontable; no se adivina.
  if cuenta like '24%' then
    fallo := v_fallo;
    return;
  end if;
  select array_agg(c.account_code order by c.account_code) into v_hijos
  from public.chart_of_accounts c
  where c.organization_id = p_organization_id
    and c.account_code like cuenta || '_%'
    and c.es_movimiento is true
    and c.is_active is distinct from false;

  if coalesce(array_length(v_hijos, 1), 0) = 1 then
    cuenta := v_hijos[1];
    fallo := null;
    return;
  end if;

  fallo := v_fallo || case
    when coalesce(array_length(v_hijos, 1), 0) > 1
      then '. Tiene varios auxiliares (' || array_to_string(v_hijos[1:5], ', ') || '); elige uno en Configuración contable'
    else ''
  end;
end;
$function$;
