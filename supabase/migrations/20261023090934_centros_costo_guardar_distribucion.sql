-- Guarda una distribución con todas sus líneas en una sola transacción: el disparador
-- diferido rechaza la suma si cada línea se inserta en una petición distinta.
-- La caja recibe la distribución en el INSERT del movimiento. No hay UPDATE
-- posterior del centro en el asiento.

create or replace function public.fn_distribucion_guardar(
  p_organization_id integer,
  p_nombre text,
  p_lineas jsonb,
  p_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_total integer;
  v_distintos integer;
  v_suma numeric;
  v_nombre text := nullif(btrim(p_nombre), '');
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_nombre is null then
    raise exception 'NOMBRE_REQUERIDO' using errcode = '22023';
  end if;

  select count(*),
         coalesce(sum((l->>'porcentaje')::numeric), 0),
         count(distinct l->>'cost_center_id')
    into v_total, v_suma, v_distintos
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l;

  if v_total < 2 or abs(v_suma - 100) > 0.001 then
    raise exception 'DISTRIBUCION_SUMA' using errcode = '22023';
  end if;
  if v_distintos <> v_total then
    raise exception 'CENTRO_REPETIDO' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_lineas) l
      left join public.cost_centers c
        on c.id = nullif(l->>'cost_center_id', '')::uuid
       and c.organization_id = p_organization_id
       and c.is_active
     where c.id is null
        or nullif(l->>'porcentaje', '') is null
        or (l->>'porcentaje')::numeric <= 0
        or (l->>'porcentaje')::numeric > 100
  ) then
    raise exception 'CENTRO_INVALIDO' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.cost_center_distributions d
     where d.organization_id = p_organization_id
       and d.nombre = v_nombre
       and d.id is distinct from p_id
  ) then
    raise exception 'NOMBRE_REPETIDO' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.cost_center_distributions (organization_id, nombre, activo)
    values (p_organization_id, v_nombre, true)
    returning id into v_id;
  else
    update public.cost_center_distributions
       set nombre = v_nombre,
           activo = true
     where id = p_id
       and organization_id = p_organization_id
    returning id into v_id;
    if v_id is null then
      raise exception 'DISTRIBUCION_INVALIDA' using errcode = '22023';
    end if;
    delete from public.cost_center_distribution_lines where distribution_id = v_id;
  end if;

  insert into public.cost_center_distribution_lines (distribution_id, cost_center_id, porcentaje)
  select v_id, (l->>'cost_center_id')::uuid, (l->>'porcentaje')::numeric
    from jsonb_array_elements(p_lineas) l;

  return v_id;
end;
$fn$;

revoke all on function public.fn_distribucion_guardar(integer, text, jsonb, uuid) from public, anon;
grant execute on function public.fn_distribucion_guardar(integer, text, jsonb, uuid) to authenticated, service_role;

do $caja$
declare
  v_vieja text := 'public.pos_caja_registrar_movimiento(integer,text,numeric,text,text,text,text,uuid,timestamptz,bigint,text,uuid,text,text,text,text,text,text)';
  v_nueva text := 'public.pos_caja_registrar_movimiento(integer,text,numeric,text,text,text,text,uuid,timestamptz,bigint,text,uuid,text,text,text,text,text,text,uuid)';
  v_def text;
  v_firma text := 'p_tercero_dv text DEFAULT NULL::text)';
  v_cols text := 'tercero_tipo, tercero_id, tercero_dv';
  v_val text := 'nullif(btrim(p_tercero_dv), '''')';
begin
  if to_regprocedure(v_nueva) is not null
     and position('p_distribucion_id' in pg_get_functiondef(v_nueva::regprocedure)) > 0 then
    return;
  end if;
  v_def := pg_get_functiondef(v_vieja::regprocedure);
  if (length(v_def) - length(replace(v_def, v_firma, ''))) / length(v_firma) <> 1
     or (length(v_def) - length(replace(v_def, v_cols, ''))) / length(v_cols) <> 1
     or (length(v_def) - length(replace(v_def, v_val, ''))) / length(v_val) <> 1 then
    raise exception 'el movimiento de caja no tiene un único punto para la distribución';
  end if;
  v_def := replace(v_def, v_firma, 'p_tercero_dv text DEFAULT NULL::text, p_distribucion_id uuid DEFAULT NULL::uuid)');
  v_def := replace(v_def, v_cols, 'tercero_tipo, tercero_id, tercero_dv, distribucion_id');
  v_def := replace(v_def, v_val, 'nullif(btrim(p_tercero_dv), ''''), p_distribucion_id');
  execute v_def;
  if position('p_distribucion_id' in pg_get_functiondef(v_nueva::regprocedure)) = 0
     or position('distribucion_id' in pg_get_functiondef(v_nueva::regprocedure)) = 0 then
    raise exception 'la caja no recibió la distribución';
  end if;
  execute format('revoke all on function %s from public, anon', v_nueva::regprocedure);
  execute format('grant execute on function %s to authenticated, service_role', v_nueva::regprocedure);
  execute format('grant execute on function %s to %I, postgres', v_nueva::regprocedure, current_user);
  execute format('drop function %s', v_vieja::regprocedure);
end
$caja$;

do $prueba$
declare
  v_a uuid;
  v_b uuid;
  v_id uuid;
  v_n integer;
begin
  select c.id into v_a from public.cost_centers c where c.organization_id = 140 and c.code = '100';
  select c.id into v_b
    from public.cost_centers c
   where c.organization_id = 140 and c.code <> '100' and c.is_active
   order by c.code
   limit 1;
  if v_a is null or v_b is null then
    raise exception 'la org 140 no tiene dos centros para guardar la distribución';
  end if;
  v_id := public.fn_distribucion_guardar(
    140,
    'prueba-guardar-reparto',
    jsonb_build_array(
      jsonb_build_object('cost_center_id', v_a, 'porcentaje', 60),
      jsonb_build_object('cost_center_id', v_b, 'porcentaje', 40)
    ),
    null
  );
  select count(*) into v_n
    from public.cost_center_distribution_lines l
   where l.distribution_id = v_id;
  if v_n <> 2 then
    raise exception 'la distribución de prueba no guardó dos líneas';
  end if;
  delete from public.cost_center_distributions where id = v_id and nombre = 'prueba-guardar-reparto';
end
$prueba$;
