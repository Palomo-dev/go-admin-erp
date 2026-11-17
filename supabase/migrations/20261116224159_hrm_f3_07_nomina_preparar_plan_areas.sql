-- RR. HH., fase 3 (nómina): el plan se prepara para todas las áreas en uso, no solo las de hoy (C2).
-- El dry-run de 20261116223758_hrm_f3_05_nomina_cuentas_contador mostró que un empleado que estuvo en un centro
-- de ventas en un período anterior dejaba el asiento en rechazos (520572 no existía): la preparación solo miraba
-- el área de los empleados activos a la fecha de hoy. Ahora también suma el área de todo centro de costo que
-- tenga asignado un empleado, un área (departamento) o un cambio aprobado de centro de costo.
-- Reversión: supabase/rollbacks/<mismo timestamp>_hrm_f3_07_nomina_preparar_plan_areas_rollback.sql

create or replace function public.fn_hr_nomina_preparar_plan(p_org integer, p_aplicar boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_conceptos jsonb := public.fn_hr_nomina_conceptos(p_org);
  v_hoy date := public.fn_today_for(p_org, null);
  v_cuentas jsonb := '[]'::jsonb;
  v_terceros jsonb := '[]'::jsonb;
  r record;
  v_mov text;
  v_nombre text;
  v_creada text;
begin
  for r in
    with base as (
      select k.value->>'cuenta_debito' as cta from jsonb_each(v_conceptos) k
      union select k.value->>'cuenta_credito' from jsonb_each(v_conceptos) k
      union select unnest(array['136505', '136510', '136515', '136525'])
       where v_conceptos->'PRESTAMO'->>'cuenta_credito' = '136595'
      union select '2505'
    ), centros as (
      select e.cost_center_id as id from public.employments e where e.organization_id = p_org and e.cost_center_id is not null
      union select d.cost_center_id from public.departments d where d.organization_id = p_org and d.cost_center_id is not null
      union select (ev.new_value #>> '{}')::uuid from public.hr_employment_events ev
       where ev.organization_id = p_org and ev.field = 'centro_costo' and ev.status = 'aprobado'
         and (ev.new_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), areas as (
      select public.fn_hr_nomina_area(e.id, v_hoy) as area
        from public.employments e
       where e.organization_id = p_org and e.status = 'active'
      union
      select case when t.tipo = 'ventas' then 'ventas' when t.tipo in ('operacion', 'produccion') then 'operacion' else 'administracion' end
        from centros x
        join public.cost_centers c on c.id = x.id and c.organization_id = p_org
        left join public.cost_centers p on p.id = c.parent_id
       cross join lateral (select lower(btrim(coalesce(nullif(c.type, ''), p.type))) as tipo) t
    )
    select distinct y.cta
      from (select b.cta from base b
            union select public.fn_hr_nomina_cuenta_area(b.cta, a.area) from base b cross join areas a) y
     where nullif(btrim(coalesce(y.cta, '')), '') is not null
     order by 1
  loop
    v_mov := public.fn_hr_nomina_cuenta(p_org, r.cta);
    v_creada := null;
    if v_mov is null and p_aplicar then
      select k.nombre into v_nombre from public.puc_catalogo k where k.codigo = r.cta;
      if v_nombre is null and r.cta ~ '^(5205|7205)' then
        select k.nombre into v_nombre from public.puc_catalogo k where k.codigo = '5105' || substr(r.cta, 5);
      end if;
      v_creada := public.fn_puc_cuenta_para_asiento(p_org, r.cta, coalesce(v_nombre, 'Cuenta ' || r.cta));
      v_mov := public.fn_hr_nomina_cuenta(p_org, r.cta);
    end if;
    v_cuentas := v_cuentas || jsonb_build_object('cuenta', r.cta, 'movimiento', v_mov,
                                                 'estado', case when v_creada is not null and v_mov is not null then 'creada'
                                                                when v_mov is not null then 'lista' else 'falta' end);
  end loop;

  -- C3: terceros que harían rechazar el asiento (empleados activos).
  for r in
    select e.id, q.quien, t.nit, t.nombre
      from public.employments e
     cross join unnest(array['empleado', 'eps', 'afp', 'arl', 'ccf', 'cesantias']) q(quien)
     cross join lateral public.fn_hr_nomina_tercero(e.id, q.quien, v_hoy) t
     where e.organization_id = p_org and e.status = 'active'
       and t.nit is null
  loop
    v_terceros := v_terceros || jsonb_build_object('vinculo_id', r.id, 'tercero', r.quien,
                                                   'falta', case when r.nombre is null then 'entidad' else 'nit' end);
  end loop;

  return jsonb_build_object('cuentas', v_cuentas,
                            'faltan_cuentas', (select count(*) from jsonb_array_elements(v_cuentas) z where z->>'estado' = 'falta'),
                            'terceros_incompletos', v_terceros);
end;
$$;
revoke execute on function public.fn_hr_nomina_preparar_plan(integer, boolean) from public, anon, authenticated;
