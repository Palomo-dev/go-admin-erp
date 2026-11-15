-- HRM fase 1 · Estructura, segunda parte (Figma 20.1 corregido, `95-hrm-01-12` y `01-18`).
--   1. fn_hr_cargo_eliminar: «Eliminar cargo» del menú de la fila. Solo sin
--      personas activas ni plazas aprobadas. No borra la fila (Roles, el CRM y
--      el historial la referencian): la deja inactiva, como ya hacía la app.
--   2. fn_hr_escala_impacto: cuántas personas del cargo quedarían por debajo
--      del mínimo o por encima del máximo con la escala propuesta, por sede.
--      Lee salarios (grupo salario_pago): exige el permiso y deja registro.

create or replace function public.fn_hr_cargo_eliminar(p_actor uuid, p_org integer, p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.positions.delete');
  if not exists (select 1 from public.job_positions j where j.id = p_id and j.organization_id = p_org and coalesce(j.is_active, true)) then
    raise exception 'hr: el cargo no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.fn_hr_ocupacion(p_org, v_hoy) o where o.position_id = p_id) then
    raise exception 'cargo_con_personas' using errcode = '55000';
  end if;
  if exists (select 1 from public.fn_hr_presupuesto(p_org, v_hoy) p where p.position_id = p_id) then
    raise exception 'cargo_con_plazas' using errcode = '55000';
  end if;
  update public.job_positions set is_active = false, updated_at = now() where id = p_id;
end;
$$;

create or replace function public.fn_hr_escala_impacto(
  p_actor uuid, p_org integer, p_id uuid, p_filas jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_res jsonb;
begin
  if not exists (select 1 from public.job_positions j where j.id = p_id and j.organization_id = p_org) then
    raise exception 'hr: el cargo no existe' using errcode = 'P0002';
  end if;
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view') then
    perform public.fn_hr_registrar_intento(p_actor, p_org, null, null, 'salario_pago', p_ip, p_ua, p_ruta,
      jsonb_build_object('vista', 'impacto_escala', 'cargo', p_id));
    raise exception 'sin_permiso: hr.data.salario_pago.view' using errcode = '42501';
  end if;
  with propuestas as (
    select nullif(f->>'sede_id', '')::integer sede, nullif(f->>'minimo', '')::numeric minimo, nullif(f->>'maximo', '')::numeric maximo
      from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) f
  ), personas as (
    select e.branch_id, public.fn_hr_salario_en(e.id, v_hoy) sal
      from public.employments e
     where e.organization_id = p_org and e.position_id = p_id and e.status = 'active'
       and (e.termination_date is null or e.termination_date >= v_hoy)
  ), cruce as (
    select pe.branch_id, pe.sal,
           coalesce(pp.minimo, pt.minimo) minimo, coalesce(pp.maximo, pt.maximo) maximo,
           case when pp.sede is not null then pp.sede end sede
      from personas pe
      left join propuestas pp on pp.sede = pe.branch_id
      left join propuestas pt on pt.sede is null
     where pe.sal is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('sede_id', x.sede, 'debajo', x.debajo, 'encima', x.encima)), '[]'::jsonb)
    into v_res
    from (select sede, count(*) filter (where sal < minimo)::integer debajo, count(*) filter (where sal > maximo)::integer encima
            from cruce where minimo is not null and maximo is not null
           group by sede) x
   where x.debajo + x.encima > 0;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'salario_pago', 'ver', p_ip, p_ua, p_ruta,
    jsonb_build_object('vista', 'impacto_escala', 'cargo', p_id));
  return v_res;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.fn_hr_cargo_eliminar(uuid, integer, uuid)',
    'public.fn_hr_escala_impacto(uuid, integer, uuid, jsonb, text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;