-- Reversión de 20261116073811_hrm_f3_02_nomina_motor.
-- ADVERTENCIA: no borra datos. Las colillas que ya calculó el motor quedan, pero sin el trigger de
-- inmutabilidad. Revertir antes 20261116074847_hrm_f3_03_nomina_cierre_pago, que usa estas funciones.

drop trigger if exists trg_hr_nomina_inmutable on public.payroll_items;
drop trigger if exists trg_hr_nomina_inmutable on public.payroll_runs;
drop trigger if exists trg_hr_nomina_inmutable on public.payroll_slips;
drop function if exists public.fn_hr_nomina_inmutable();
drop function if exists public.fn_hr_nomina_periodo_leer(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_nomina_novedad_anular(uuid, integer, uuid);
drop function if exists public.fn_hr_nomina_novedad_registrar(uuid, integer, jsonb);
drop function if exists public.fn_hr_nomina_embargo_guardar(uuid, integer, jsonb, text, text, text);
drop function if exists public.fn_hr_nomina_ajustes_guardar(uuid, integer, uuid, jsonb, text, text, text);
drop function if exists public.fn_hr_nomina_periodo_crear(uuid, integer, jsonb);
drop function if exists public.fn_hr_nomina_guardar(uuid, integer, uuid, jsonb);
drop function if exists public.fn_hr_nomina_insumos(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_nomina_variables(uuid, date, date);
drop function if exists public.fn_hr_nomina_salario_tramos(uuid, date, date);

-- fn_hr_jornada_para_nomina vuelve a su versión de 20261116025305_hrm_f2_05_ausencias (sin «horas_dia»).
create or replace function public.fn_hr_jornada_para_nomina(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_umbral numeric;
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido: el rango va de 1 a 63 días' using errcode = '22023';
  end if;
  v_umbral := public.fn_hr_parametro(p_org, 'dominical_habitual_umbral_dias', p_hasta);

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    -- Horas de días «lista para nómina»; la extra, limitada a lo aprobado.
    'horas', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', h.employment_id, 'categoria', h.category, 'recargo', h.surcharge,
                                          'divisor', h.hour_divisor, 'minutos', h.minutos) order by h.employment_id, h.category, h.surcharge)
        from (
          select l.employment_id, l.category, l.surcharge, l.hour_divisor,
                 sum(case when l.category like 'extra%'
                          then round(l.minutes * least(1, coalesce(ap.aprobadas, 0)::numeric / nullif(ex.extra, 0)))
                          else l.minutes end)::integer as minutos
            from public.hr_timesheet_lines l
            join public.timesheets t on t.id = l.timesheet_id and t.status in ('approved', 'locked')
            left join (select n.timesheet_id, sum(n.minutes) as aprobadas from public.hr_attendance_novelties n
                        where n.organization_id = p_org and n.kind = 'horas_extra' and n.status = 'aprobada'
                        group by n.timesheet_id) ap on ap.timesheet_id = t.id
            left join (select x.timesheet_id, sum(x.minutes) as extra from public.hr_timesheet_lines x
                        where x.organization_id = p_org and x.category like 'extra%'
                        group by x.timesheet_id) ex on ex.timesheet_id = t.id
           where l.organization_id = p_org and l.local_date between p_desde and p_hasta
           group by 1, 2, 3, 4
        ) h where h.minutos > 0), '[]'::jsonb),
    -- Tardanzas, salidas tempranas y ausencias sin justificar (rechazadas): se descuentan.
    'descuentos', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', n.employment_id, 'tipo', n.kind, 'fecha', n.work_date, 'minutos', n.minutes)
                       order by n.employment_id, n.work_date)
        from public.hr_attendance_novelties n
       where n.organization_id = p_org and n.kind in ('tardanza', 'salida_temprana', 'ausencia') and n.status = 'rechazada'
         and n.work_date between p_desde and p_hasta), '[]'::jsonb),
    -- Ausencias aprobadas con su tramo de pago (incapacidades por días de la cadena).
    'ausencias', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'employment_id', l.employment_id, 'tipo', lt.code, 'clase', lt.legal_class,
                                          'pagada', lt.paid, 'desde', l.start_date, 'hasta', l.end_date,
                                          'desde_en_periodo', greatest(l.start_date, p_desde), 'hasta_en_periodo', least(l.end_date, p_hasta),
                                          'dias_habiles', l.business_days, 'dias_calendario', l.total_days,
                                          'tramos', public.fn_hr_ausencia_tramos_pago(p_org, l.id))
                       order by l.employment_id, l.start_date)
        from public.leave_requests l join public.leave_types lt on lt.id = l.leave_type_id
       where l.organization_id = p_org and l.status in ('approved', 'taken')
         and l.start_date <= p_hasta and l.end_date >= p_desde), '[]'::jsonb),
    -- Días de descanso obligatorio trabajados por mes (ocasional u habitual, CST 179).
    'dominicales', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', d.employment_id, 'mes', d.mes, 'dias', d.dias,
                                          'habitual', d.dias >= v_umbral))
        from (select l.employment_id, to_char(l.local_date, 'YYYY-MM') as mes, count(distinct l.local_date) as dias
                from public.hr_timesheet_lines l
                join public.timesheets t on t.id = l.timesheet_id and t.status in ('approved', 'locked')
               where l.organization_id = p_org and l.local_date between date_trunc('month', p_desde)::date and p_hasta
                 and (l.category like 'dom%' or l.category like 'extra_dom%')
               group by 1, 2) d), '[]'::jsonb),
    -- Días del período que todavía no están listos: la nómina no debe cerrar sin ellos.
    'dias_no_listos', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', t.employment_id, 'fecha', t.work_date, 'estado', t.status)
                       order by t.employment_id, t.work_date)
        from public.timesheets t
       where t.organization_id = p_org and t.work_date between p_desde and p_hasta
         and t.status not in ('approved', 'locked')), '[]'::jsonb));
end;
$$;
revoke all on function public.fn_hr_jornada_para_nomina(uuid, integer, date, date) from public, anon, authenticated;
grant execute on function public.fn_hr_jornada_para_nomina(uuid, integer, date, date) to service_role;
