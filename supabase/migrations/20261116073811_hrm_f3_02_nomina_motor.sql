-- RR. HH., fase 3 (nómina): insumos del motor, guardado idempotente, inmutabilidad y datos de nómina. ADR-003 §3 y §4.
-- El motor es TypeScript puro (src/lib/hrm/nomina/motorNomina.ts); la base le entrega los insumos y guarda su salida.
-- Todas las RPC con p_actor solo las ejecuta la service role (el route handler pasa el actor de getServerOrgContext()).
-- Reversión: el archivo homónimo en supabase/rollbacks/.

-- 1. La jornada entrega también las horas por día (aditivo: la clave «horas» no cambia) ---
create or replace function public.fn_hr_jornada_para_nomina(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
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
    -- Las mismas horas por día local: la nómina valora cada hora con el salario de su fecha (ADR-003 §3).
    'horas_dia', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', h.employment_id, 'fecha', h.local_date, 'categoria', h.category,
                                          'recargo', h.surcharge, 'divisor', h.hour_divisor, 'minutos', h.minutos)
                       order by h.employment_id, h.local_date, h.category, h.surcharge)
        from (
          select l.employment_id, l.local_date, l.category, l.surcharge, l.hour_divisor,
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
           group by 1, 2, 3, 4, 5
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

-- 2. Ayudas internas (sin EXECUTE para nadie más que el dueño) ---------------------------
-- Salario por tramos del historial con fecha de efecto, sin registro (lo deja quien la llama).
create or replace function public.fn_hr_nomina_salario_tramos(p_employment uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_cortes date[];
  v_out jsonb := '[]'::jsonb;
  v jsonb;
  d date;
  h date;
  i integer;
begin
  select array_agg(x order by x) into v_cortes from (
    select p_desde as x
    union
    select ev.effective_from from public.hr_employment_events ev
     where ev.employment_id = p_employment and ev.field = 'salario' and ev.status = 'aprobado'
       and ev.effective_from > p_desde and ev.effective_from <= p_hasta) z;
  for i in 1 .. cardinality(v_cortes) loop
    d := v_cortes[i];
    h := case when i < cardinality(v_cortes) then v_cortes[i + 1] - 1 else p_hasta end;
    v := public.fn_hr_valor_vigente_interno(p_employment, 'salario', d);
    if v is not null and jsonb_typeof(v) <> 'null' then
      v_out := v_out || jsonb_build_array(jsonb_build_object('desde', d, 'hasta', h, 'valor', (v #>> '{}')::numeric));
    end if;
  end loop;
  return v_out;
end;
$$;
revoke execute on function public.fn_hr_nomina_salario_tramos(uuid, date, date) from public, anon, authenticated;

-- Pagos variables prestacionales liquidados (períodos cerrados) de un vínculo en un rango.
create or replace function public.fn_hr_nomina_variables(p_employment uuid, p_desde date, p_hasta date)
returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(i.amount), 0)
    from public.payroll_periods pp
    join public.payroll_slips s on s.payroll_run_id = public.fn_nomina_run_vigente(pp.id) and s.employment_id = p_employment
    join public.payroll_items i on i.payroll_slip_id = s.id
   where pp.organization_id = (select e.organization_id from public.employments e where e.id = p_employment)
     and pp.kind = 'ordinaria'
     and pp.status in ('approved', 'paid', 'closed')
     and pp.period_end between p_desde and p_hasta
     and i.item_type = 'earning'
     and i.code in ('RECARGO_NOCTURNO','RECARGO_DOMINICAL','RECARGO_DOMINICAL_NOCTURNO','HORA_EXTRA_DIURNA','HORA_EXTRA_NOCTURNA',
                    'HORA_EXTRA_DOMINICAL_DIURNA','HORA_EXTRA_DOMINICAL_NOCTURNA','COMISIONES','BONIFICACION_SALARIAL','RETROACTIVO','SALARIO_HORAS');
$$;
revoke execute on function public.fn_hr_nomina_variables(uuid, date, date) from public, anon, authenticated;

-- 3. Insumos del motor ---------------------------------------------------------------
-- Volátil: deja una fila en hr_access_log por cada vínculo cuyo salario lee.
create or replace function public.fn_hr_nomina_insumos(p_actor uuid, p_org integer, p_period uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_desde date;
  v_hasta date;
  v_mes date;
  v_tz text;
  v_params jsonb := '{}'::jsonb;
  v_codigo text;
  v_jornada jsonb := null;
  v_exo jsonb;
  v_emps jsonb := '[]'::jsonb;
  v_excl jsonb := '[]'::jsonb;
  v_anterior uuid;
  e public.employments;
  v_user uuid;
  v_ajustes public.hr_payroll_employee_settings;
  v_codigos text[] := array[
    'smmlv','auxilio_transporte','auxilio_transporte_tope_smmlv','ibc_tope_smmlv','ibc_no_salarial_tope_pct',
    'salario_integral_factor_ibc','salario_integral_minimo_smmlv','aporte_salud_trabajador','aporte_pension_trabajador',
    'aporte_salud_empleador','aporte_pension_empleador','aporte_ccf','aporte_icbf','aporte_sena','exoneracion_114_1_umbral_smmlv',
    'arl_tarifas','fsp_tabla','divisor_hora_mensual','vacaciones_dias_habiles_anio','intereses_cesantias_tasa','uvt',
    'retencion_art383_tabla','retencion_redondeo_cop','dep_dependientes_pct','dep_dependientes_tope_uvt_mes',
    'dep_medicina_prepagada_tope_uvt_mes','dep_intereses_vivienda_tope_uvt_mes','renta_exenta_voluntarios_pct',
    'renta_exenta_voluntarios_tope_uvt_anio','renta_exenta_25_pct','renta_exenta_25_tope_uvt_anio','limite_global_pct',
    'limite_global_tope_uvt_anio','cesantias_exenta_tabla','embargo_alimentos_max','embargo_fraccion_excedente',
    'libranza_neto_minimo','nomina_alerta_variacion_pct'];
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status in ('approved', 'paying', 'paid', 'closed', 'cancelled') then
    raise exception 'periodo_cerrado: un período cerrado no se recalcula; usa un ajuste' using errcode = '55000';
  end if;
  v_desde := pp.period_start;
  v_hasta := pp.period_end;
  v_mes := date_trunc('month', v_desde)::date;
  v_tz := public.fn_timezone_for(p_org, null);

  -- Parámetros por tramos de vigencia en el rango del período.
  foreach v_codigo in array v_codigos loop
    v_params := v_params || jsonb_build_object(v_codigo, coalesce((
      select jsonb_agg(jsonb_build_object('desde', t.desde, 'hasta', t.hasta, 'valor', t.valor, 'valor_json', t.valor_json, 'estado', t.status)
                       order by t.desde)
        from public.fn_hr_parametro_tramos(p_org, v_codigo, v_desde, v_hasta) t), '[]'::jsonb));
  end loop;
  v_exo := public.fn_hr_parametro_detalle(p_org, 'exoneracion_114_1_aplica', v_hasta);

  if pp.kind = 'ordinaria' then
    v_jornada := public.fn_hr_jornada_para_nomina(p_actor, p_org, v_desde, v_hasta);
  end if;

  -- Período ordinario anterior ya cerrado (para las alertas de variación).
  select x.id into v_anterior from public.payroll_periods x
   where x.organization_id = p_org and x.kind = 'ordinaria' and x.period_end < v_desde
     and x.status in ('approved', 'paid', 'closed')
   order by x.period_end desc limit 1;

  for e in
    select * from public.employments x
     where x.organization_id = p_org
       and (x.hire_date is null or x.hire_date <= v_hasta)
       and (x.termination_date is null or x.termination_date >= v_desde)
     order by x.id
  loop
    if e.hire_date is null then
      v_excl := v_excl || jsonb_build_array(jsonb_build_object('vinculo_id', e.id, 'motivo', 'sin_fecha_ingreso'));
      continue;
    end if;
    if coalesce(e.employment_type, 'employee') not in ('employee', 'temporary', 'part_time')
       or coalesce(e.contract_type, 'indefinite') in ('service', 'apprenticeship') then
      v_excl := v_excl || jsonb_build_array(jsonb_build_object('vinculo_id', e.id, 'motivo', 'tipo_de_vinculo_sin_nomina',
                  'tipo', e.employment_type, 'contrato', e.contract_type));
      continue;
    end if;
    select om.user_id into v_user from public.organization_members om where om.id = e.organization_member_id;
    select * into v_ajustes from public.hr_payroll_employee_settings s
     where s.employment_id = e.id and s.effective_from <= v_hasta
     order by s.effective_from desc limit 1;

    v_emps := v_emps || jsonb_build_array(jsonb_build_object(
      'vinculo_id', e.id,
      'persona_id', e.person_id,
      'nombre', public.fn_hr_nombre_persona(e.person_id),
      'sede_id', coalesce((public.fn_hr_valor_vigente_interno(e.id, 'sede', v_hasta) #>> '{}')::integer, e.branch_id),
      'ingreso', e.hire_date,
      'retiro', e.termination_date,
      'remoto', coalesce(e.work_location = 'remote', false),
      'moneda', coalesce(e.currency_code, 'COP'),
      'periodo_salario', coalesce(public.fn_hr_valor_vigente_interno(e.id, 'periodo_salario', v_hasta) #>> '{}', e.salary_period, 'monthly'),
      'salario', public.fn_hr_nomina_salario_tramos(e.id, v_desde, v_hasta),
      'clase_arl', public.fn_hr_clase_arl(e.id),
      'ajustes', case when v_ajustes.id is null then null else jsonb_build_object(
          'integral', v_ajustes.salario_integral, 'procedimiento', v_ajustes.retencion_procedimiento,
          'porcentaje_fijo', v_ajustes.retencion_porcentaje_fijo, 'dependientes', v_ajustes.dependientes,
          'medicina_prepagada', v_ajustes.medicina_prepagada, 'intereses_vivienda', v_ajustes.intereses_vivienda,
          'aportes_voluntarios', v_ajustes.aportes_voluntarios) end,
      'dependientes_registrados', (select count(*) from public.hr_person_beneficiaries b
                                    where b.person_id = e.person_id and b.is_active and b.is_tax_dependent),
      'novedades', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'concepto', n.concept_code, 'valor', n.amount,
                                                                 'cantidad', n.quantity, 'descripcion', n.description) order by n.created_at)
                               from public.hr_payroll_novelties n
                              where n.period_id = pp.id and n.employment_id = e.id and n.status = 'aprobada'), '[]'::jsonb),
      'comisiones', case when pp.kind <> 'ordinaria' or v_user is null then '[]'::jsonb else coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'valor', c.commission_amount) order by c.id)
            from public.commissions c
           where c.organization_id = p_org and c.status = 'accrued' and c.payee_id = v_user
             and c.accrued_at < ((v_hasta + 1)::timestamp at time zone v_tz)
             -- Una comisión ya incluida en otro período sin pagar no se cuenta dos veces.
             and not exists (
               select 1 from public.payroll_slips s2
                 join public.payroll_runs r2 on r2.id = s2.payroll_run_id and r2.superseded_by is null and r2.status = 'completed'
                 join public.payroll_periods p2 on p2.id = r2.payroll_period_id and p2.id <> pp.id and p2.status <> 'cancelled'
                where s2.employment_id = e.id and coalesce(s2.status, '') <> 'cancelled'
                  and s2.metadata->'comision_ids' ? c.id::text)), '[]'::jsonb) end,
      'prestamos', case when pp.kind <> 'ordinaria' then '[]'::jsonb else coalesce((
          select jsonb_agg(jsonb_build_object('cuota_id', li.id, 'prestamo_id', l.id,
                                              'valor', li.amount - coalesce(li.amount_paid, 0),
                                              'max_deduccion_pct', l.max_deduction_pct) order by li.due_date, li.installment_number)
            from public.loan_installments li join public.employee_loans l on l.id = li.loan_id
           where l.employment_id = e.id and l.organization_id = p_org and l.status in ('approved', 'active')
             and coalesce(l.auto_deduct, true) and li.status in ('pending', 'partial', 'overdue')
             and li.due_date <= v_hasta and li.amount - coalesce(li.amount_paid, 0) > 0), '[]'::jsonb) end,
      'embargos', coalesce((
          select jsonb_agg(jsonb_build_object('id', g.id, 'tipo', g.kind, 'recibido', g.received_on, 'modo', g.mode, 'valor', g.value,
                                              'saldo', case when g.total_amount is null then null else greatest(g.total_amount - g.applied_total, 0) end)
                           order by g.received_on, g.id)
            from public.hr_garnishments g
           where g.employment_id = e.id and g.status = 'activo' and g.starts_on <= v_hasta
             and (g.ends_on is null or g.ends_on >= v_desde)), '[]'::jsonb),
      -- Lo ya liquidado en el mismo mes por otro período ordinario (quincena anterior).
      'mes_previo', case when pp.kind <> 'ordinaria' then null else (
          select jsonb_build_object('ingresos_retencion', coalesce(sum((s.metadata->'retencion_mes'->>'ingresos')::numeric), 0),
                                    'incr', coalesce(sum((s.metadata->'retencion_mes'->>'incr')::numeric), 0),
                                    'retencion', coalesce(sum((s.metadata->'retencion_mes'->>'retencion')::numeric), 0))
            from public.payroll_periods x
            join public.payroll_slips s on s.payroll_run_id = public.fn_nomina_run_vigente(x.id) and s.employment_id = e.id
           where x.organization_id = p_org and x.kind = 'ordinaria' and x.id <> pp.id
             and x.period_end >= v_mes and x.period_end < v_desde
             and x.status not in ('open', 'cancelled')) end,
      'anterior', case when v_anterior is null then null else (
          select jsonb_build_object('devengado', s.gross_pay, 'neto', s.net_pay)
            from public.payroll_slips s
           where s.payroll_run_id = public.fn_nomina_run_vigente(v_anterior) and s.employment_id = e.id
           limit 1) end,
      'variables_12m', jsonb_build_object(
          'desde', greatest(e.hire_date, (v_desde - interval '1 year')::date),
          'hasta', v_desde - 1,
          'valor', public.fn_hr_nomina_variables(e.id, greatest(e.hire_date, (v_desde - interval '1 year')::date), v_desde - 1)),
      'acumulado', case when pp.kind = 'ordinaria' then null else jsonb_build_object(
          'desde', v_desde, 'hasta', v_hasta,
          'variables', public.fn_hr_nomina_variables(e.id, v_desde, v_hasta),
          'no_remunerados', coalesce((
              select jsonb_agg(jsonb_build_object('desde', greatest(l.start_date, v_desde), 'hasta', least(l.end_date, v_hasta)))
                from public.leave_requests l join public.leave_types lt on lt.id = l.leave_type_id
               where l.employment_id = e.id and l.status in ('approved', 'taken')
                 and (lt.legal_class = 'licencia_no_remunerada' or not lt.paid)
                 and l.start_date <= v_hasta and l.end_date >= v_desde), '[]'::jsonb)) end
    ));

    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, e.person_id, e.id, 'salario_pago', 'ver', p_ip, p_ua,
      coalesce(p_ruta, 'rpc:fn_hr_nomina_insumos'), jsonb_build_object('periodo', pp.id, 'motivo', 'preliquidacion'));
  end loop;

  return jsonb_build_object(
    'periodo', jsonb_build_object('id', pp.id, 'desde', v_desde, 'hasta', v_hasta, 'tipo', pp.kind, 'frecuencia', pp.frequency, 'estado', pp.status),
    'nomina_habilitada', public.fn_hr_nomina_habilitada(p_org),
    'parametros', v_params,
    'conceptos', public.fn_hr_nomina_conceptos(p_org),
    'exoneracion_114_1', case when v_exo is null or v_exo->>'valor' is null then null else (v_exo->>'valor')::numeric <> 0 end,
    'jornada', v_jornada,
    'pendientes', jsonb_build_object(
      'novedades_nomina', (select count(*) from public.hr_payroll_novelties n where n.period_id = pp.id and n.status = 'pendiente'),
      'novedades_asistencia', (select count(*) from public.hr_attendance_novelties n
                                where n.organization_id = p_org and n.status in ('pendiente', 'esperando_contraparte')
                                  and n.work_date between v_desde and v_hasta),
      'dias_no_listos', coalesce(jsonb_array_length(v_jornada->'dias_no_listos'), 0)),
    'empleados', v_emps,
    'excluidos', v_excl);
end;
$$;
revoke execute on function public.fn_hr_nomina_insumos(uuid, integer, uuid, text, text, text) from public, anon, authenticated;

-- 4. Inmutabilidad de lo que calculó el motor ------------------------------------------
-- Una colilla del motor (metadata.motor) y sus ítems solo cambian dentro de las RPC de nómina.
create or replace function public.fn_hr_nomina_inmutable()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_motor boolean;
begin
  if coalesce(current_setting('app.nomina_motor', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'payroll_slips' then
    v_motor := coalesce(old.metadata ? 'motor', false);
  elsif tg_table_name = 'payroll_runs' then
    v_motor := old.engine_version is not null;
  else
    select s.metadata ? 'motor' into v_motor from public.payroll_slips s where s.id = coalesce(new.payroll_slip_id, old.payroll_slip_id);
  end if;
  if coalesce(v_motor, false) then
    raise exception 'nomina_inmutable: lo calculado por el motor se corrige con un recálculo o un ajuste, no editando' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.fn_hr_nomina_inmutable() from public, anon, authenticated;
drop trigger if exists trg_hr_nomina_inmutable on public.payroll_slips;
create trigger trg_hr_nomina_inmutable before update or delete on public.payroll_slips
  for each row execute function public.fn_hr_nomina_inmutable();
drop trigger if exists trg_hr_nomina_inmutable on public.payroll_runs;
create trigger trg_hr_nomina_inmutable before update or delete on public.payroll_runs
  for each row execute function public.fn_hr_nomina_inmutable();
drop trigger if exists trg_hr_nomina_inmutable on public.payroll_items;
create trigger trg_hr_nomina_inmutable before insert or update or delete on public.payroll_items
  for each row execute function public.fn_hr_nomina_inmutable();

-- 5. Guardar el resultado del motor (transaccional e idempotente) ----------------------
create or replace function public.fn_hr_nomina_guardar(p_actor uuid, p_org integer, p_period uuid, p_resultado jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_huella text := p_resultado->>'huella';
  v_run uuid;
  v_previo uuid;
  v_num integer;
  c jsonb;
  it jsonb;
  e public.employments;
  v_slip uuid;
  v_dev numeric;
  v_ded numeric;
  v_sede integer;
  v_n integer := 0;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_huella is null or p_resultado->>'version_motor' is null or jsonb_typeof(p_resultado->'colillas') <> 'array' then
    raise exception 'resultado_invalido' using errcode = '22023';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org for update;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status not in ('open', 'calculating', 'calculated', 'reviewing') then
    raise exception 'periodo_cerrado: un período cerrado no se recalcula; usa un ajuste' using errcode = '55000';
  end if;

  -- Idempotencia por período y versión de la entrada: el mismo cálculo no crea otra versión.
  select r.id into v_run from public.payroll_runs r
   where r.payroll_period_id = pp.id and r.run_type = 'calculo' and r.status = 'completed'
     and r.superseded_by is null and r.input_hash = v_huella;
  if v_run is not null then
    return jsonb_build_object('run_id', v_run, 'reutilizado', true);
  end if;

  perform set_config('app.nomina_motor', 'on', true);
  -- Recalcular durante la revisión la devuelve a «preliquidado»: la aprobación en curso se cancela.
  if pp.status = 'reviewing' and pp.metadata ? 'aprobacion_id' then
    update public.hr_approval_instances set status = 'cancelada'
     where id = (pp.metadata->>'aprobacion_id')::uuid and status = 'pendiente';
  end if;
  select coalesce(max(r.run_number), 0) + 1 into v_num from public.payroll_runs r where r.payroll_period_id = pp.id;
  insert into public.payroll_runs (payroll_period_id, run_number, executed_by, status, run_type, engine_version, input_hash,
                                   parameters_snapshot, alerts, summary, is_final)
  values (pp.id, v_num, p_actor, 'completed', 'calculo', p_resultado->>'version_motor', v_huella,
          p_resultado->'parametros_snapshot', coalesce(p_resultado->'bloqueos', '[]'::jsonb), p_resultado->'totales', false)
  returning id into v_run;

  -- La versión anterior queda reemplazada (superseded_by), nunca se borra.
  for v_previo in select r.id from public.payroll_runs r
                   where r.payroll_period_id = pp.id and r.id <> v_run and r.superseded_by is null and r.status <> 'failed'
                     and r.run_type = 'calculo'
  loop
    update public.payroll_runs set status = 'superseded', superseded_by = v_run, updated_at = now() where id = v_previo;
    update public.payroll_slips set status = 'cancelled', updated_at = now()
     where payroll_run_id = v_previo and coalesce(status, 'draft') = 'draft';
  end loop;

  for c in select * from jsonb_array_elements(p_resultado->'colillas') loop
    select * into e from public.employments where id = (c->>'vinculo_id')::uuid and organization_id = p_org;
    if not found then
      raise exception 'vinculo_ajeno: %', c->>'vinculo_id' using errcode = '42501';
    end if;
    -- Cuadre: el neto es devengado − deducciones, ítem por ítem.
    select coalesce(sum((x->>'valor')::numeric) filter (where x->>'tipo' = 'earning'), 0),
           coalesce(sum((x->>'valor')::numeric) filter (where x->>'tipo' = 'deduction'), 0)
      into v_dev, v_ded
      from jsonb_array_elements(c->'items') x;
    if v_dev <> (c->'totales'->>'devengado')::numeric or v_ded <> (c->'totales'->>'deducciones')::numeric
       or (c->'totales'->>'neto')::numeric <> v_dev - v_ded
       or exists (select 1 from jsonb_array_elements(c->'items') x where (x->>'valor')::numeric <> round((x->>'valor')::numeric)) then
      raise exception 'colilla_descuadrada: %', e.id using errcode = '22023';
    end if;
    v_sede := (c->>'sede_id')::integer;
    if v_sede is not null and not exists (select 1 from public.branches b where b.id = v_sede and b.organization_id = p_org) then
      v_sede := null;
    end if;
    insert into public.payroll_slips (
      payroll_run_id, employment_id, currency_code, base_salary, salary_period,
      basic_salary, transport_allowance, overtime_pay, night_premium, holiday_premium, commissions, bonuses, other_earnings, gross_pay,
      health_deduction, pension_deduction, solidarity_fund, tax_withholding, loan_deductions, advance_deductions, other_deductions,
      total_deductions, net_pay, employer_health, employer_pension, employer_arl, employer_parafiscales, employer_severance,
      employer_severance_interest, employer_vacation_provision, employer_bonus_provision, total_employer_cost,
      regular_hours, overtime_day_hours, overtime_night_hours, holiday_hours, status, branch_id, input_hash, inputs, alerts, metadata)
    values (
      v_run, e.id, coalesce(c->>'moneda', e.currency_code, 'COP'), coalesce((c->'bases'->>'salario_mensual')::numeric, 0),
      coalesce(c->>'periodo_salario', e.salary_period, 'monthly'),
      (c->'columnas'->>'basic_salary')::numeric, (c->'columnas'->>'transport_allowance')::numeric, (c->'columnas'->>'overtime_pay')::numeric,
      (c->'columnas'->>'night_premium')::numeric, (c->'columnas'->>'holiday_premium')::numeric, (c->'columnas'->>'commissions')::numeric,
      (c->'columnas'->>'bonuses')::numeric, (c->'columnas'->>'other_earnings')::numeric, v_dev,
      (c->'columnas'->>'health_deduction')::numeric, (c->'columnas'->>'pension_deduction')::numeric, (c->'columnas'->>'solidarity_fund')::numeric,
      coalesce((c->'columnas'->>'tax_withholding')::numeric, 0), coalesce((c->'columnas'->>'loan_deductions')::numeric, 0), 0,
      (c->'columnas'->>'other_deductions')::numeric, v_ded, v_dev - v_ded,
      (c->'columnas'->>'employer_health')::numeric, (c->'columnas'->>'employer_pension')::numeric, (c->'columnas'->>'employer_arl')::numeric,
      (c->'columnas'->>'employer_parafiscales')::numeric, (c->'columnas'->>'employer_severance')::numeric,
      (c->'columnas'->>'employer_severance_interest')::numeric, (c->'columnas'->>'employer_vacation_provision')::numeric,
      (c->'columnas'->>'employer_bonus_provision')::numeric, (c->'columnas'->>'total_employer_cost')::numeric,
      (c->'columnas'->>'regular_hours')::numeric, (c->'columnas'->>'overtime_day_hours')::numeric,
      (c->'columnas'->>'overtime_night_hours')::numeric, (c->'columnas'->>'holiday_hours')::numeric,
      'draft', v_sede, c->>'huella_entrada', c->'entrada', coalesce(c->'alertas', '[]'::jsonb),
      jsonb_build_object('motor', p_resultado->>'version_motor', 'comision_ids', coalesce(c->'comision_ids', '[]'::jsonb),
                         'retencion_mes', c->'retencion_mes', 'bases', c->'bases', 'nombre', c->>'nombre'))
    returning id into v_slip;

    insert into public.payroll_items (payroll_slip_id, item_type, code, name, amount, quantity, rate, base_amount,
                                      is_taxable, affects_social_security, source_type, source_id, metadata)
    select v_slip, x->>'tipo', x->>'codigo', x->>'nombre', (x->>'valor')::numeric, (x->>'cantidad')::numeric, (x->>'tasa')::numeric,
           (x->>'base')::numeric,
           coalesce((p_resultado->'parametros_snapshot'->'conceptos'->(x->>'codigo')->>'base_retencion')::boolean, false),
           coalesce((p_resultado->'parametros_snapshot'->'conceptos'->(x->>'codigo')->>'base_ss')::boolean, false),
           x->'fuente'->>'tipo', x->'fuente'->>'id', coalesce(x->'detalle', '{}'::jsonb)
      from jsonb_array_elements(c->'items') x;
    v_n := v_n + 1;
  end loop;

  update public.payroll_periods
     set status = 'calculated',
         total_employees = v_n,
         total_gross = coalesce((p_resultado->'totales'->>'devengado')::numeric, 0),
         total_deductions = coalesce((p_resultado->'totales'->>'deducciones')::numeric, 0),
         total_net = coalesce((p_resultado->'totales'->>'neto')::numeric, 0),
         total_employer_cost = coalesce((p_resultado->'totales'->>'costo_empleador')::numeric, 0),
         metadata = (coalesce(metadata, '{}'::jsonb) - 'aprobacion_id') || jsonb_build_object('bloqueos', coalesce(p_resultado->'bloqueos', '[]'::jsonb),
                                                                         'excluidos', coalesce(p_resultado->'excluidos', '[]'::jsonb),
                                                                         'run_vigente', v_run),
         updated_at = now()
   where id = pp.id;
  perform set_config('app.nomina_motor', '', true);
  return jsonb_build_object('run_id', v_run, 'reutilizado', false, 'colillas', v_n, 'version', v_num);
end;
$$;
revoke execute on function public.fn_hr_nomina_guardar(uuid, integer, uuid, jsonb) from public, anon, authenticated;

-- 6. Crear período --------------------------------------------------------------------
create or replace function public.fn_hr_nomina_periodo_crear(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text := coalesce(p_datos->>'tipo', 'ordinaria');
  v_desde date := (p_datos->>'desde')::date;
  v_hasta date := (p_datos->>'hasta')::date;
  v_frec text := coalesce(p_datos->>'frecuencia', 'monthly');
  v_pago date := nullif(p_datos->>'fecha_pago', '')::date;
  v_id uuid;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_kind not in ('ordinaria', 'prima', 'cesantias') or v_frec not in ('weekly', 'biweekly', 'monthly')
     or v_desde is null or v_hasta is null or v_hasta < v_desde then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  if v_kind = 'ordinaria' and v_hasta - v_desde > 30 then
    raise exception 'periodo_invalido: un período ordinario dura hasta un mes' using errcode = '22023';
  end if;
  if v_kind = 'prima' and not ((extract(month from v_desde) = 1 and extract(day from v_desde) = 1 and v_hasta = make_date(extract(year from v_desde)::int, 6, 30))
                            or (extract(month from v_desde) = 7 and extract(day from v_desde) = 1 and v_hasta = make_date(extract(year from v_desde)::int, 12, 31))) then
    raise exception 'periodo_invalido: la prima se liquida por semestre (1-ene a 30-jun o 1-jul a 31-dic)' using errcode = '22023';
  end if;
  if v_kind = 'cesantias' and not (extract(month from v_desde) = 1 and extract(day from v_desde) = 1 and v_hasta = make_date(extract(year from v_desde)::int, 12, 31)) then
    raise exception 'periodo_invalido: las cesantías se liquidan por año calendario' using errcode = '22023';
  end if;
  if exists (select 1 from public.payroll_periods x
              where x.organization_id = p_org and x.kind = v_kind and x.status <> 'cancelled'
                and x.period_start <= v_hasta and x.period_end >= v_desde) then
    raise exception 'periodo_cruzado: ya hay un período de % en esas fechas', v_kind using errcode = '23P01';
  end if;
  insert into public.payroll_periods (organization_id, name, period_start, period_end, payment_date, frequency, status, kind, metadata)
  values (p_org, coalesce(nullif(btrim(p_datos->>'nombre'), ''),
                          case v_kind when 'prima' then 'Prima ' when 'cesantias' then 'Cesantías ' else 'Nómina ' end
                          || to_char(v_desde, 'YYYY-MM-DD') || ' a ' || to_char(v_hasta, 'YYYY-MM-DD')),
          v_desde, v_hasta, v_pago, v_frec, 'open', v_kind, jsonb_build_object('creado_por', p_actor))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;
revoke execute on function public.fn_hr_nomina_periodo_crear(uuid, integer, jsonb) from public, anon, authenticated;

-- 7. Datos de nómina por vínculo (grupo salario_pago, con registro) --------------------
create or replace function public.fn_hr_nomina_ajustes_guardar(p_actor uuid, p_org integer, p_employment uuid, p_datos jsonb,
                                                               p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  v_proc smallint := coalesce((p_datos->>'procedimiento')::smallint, 1);
  v_pct numeric := nullif(p_datos->>'porcentaje_fijo', '')::numeric;
  v_desde date := (p_datos->>'desde')::date;
  v_id uuid;
begin
  select * into e from public.employments where id = p_employment and organization_id = p_org;
  if not found then
    raise exception 'vinculo_no_existe' using errcode = 'P0002';
  end if;
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, e.person_id, 'salario_pago', 'editar') then
    perform public.fn_hr_registrar_intento(p_actor, p_org, e.person_id, e.id, 'salario_pago', p_ip, p_ua, p_ruta, '{"accion":"ajustes_nomina"}'::jsonb);
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_desde is null then
    raise exception 'fecha_obligatoria' using errcode = '22023';
  end if;
  if v_proc = 2 and v_pct is null then
    raise exception 'porcentaje_fijo_obligatorio: el procedimiento 2 necesita su porcentaje del semestre' using errcode = '22023';
  end if;
  insert into public.hr_payroll_employee_settings (organization_id, employment_id, effective_from, salario_integral,
      retencion_procedimiento, retencion_porcentaje_fijo, dependientes, medicina_prepagada, intereses_vivienda, aportes_voluntarios,
      reason, created_by)
  values (p_org, e.id, v_desde, coalesce((p_datos->>'integral')::boolean, false), v_proc, v_pct,
          coalesce((p_datos->>'dependientes')::boolean, false), coalesce((p_datos->>'medicina_prepagada')::numeric, 0),
          coalesce((p_datos->>'intereses_vivienda')::numeric, 0), coalesce((p_datos->>'aportes_voluntarios')::numeric, 0),
          nullif(btrim(p_datos->>'motivo'), ''), p_actor)
  on conflict (employment_id, effective_from) do update
     set salario_integral = excluded.salario_integral, retencion_procedimiento = excluded.retencion_procedimiento,
         retencion_porcentaje_fijo = excluded.retencion_porcentaje_fijo, dependientes = excluded.dependientes,
         medicina_prepagada = excluded.medicina_prepagada, intereses_vivienda = excluded.intereses_vivienda,
         aportes_voluntarios = excluded.aportes_voluntarios, reason = excluded.reason, created_by = excluded.created_by
  returning id into v_id;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, e.person_id, e.id, 'salario_pago', 'editar', p_ip, p_ua,
    coalesce(p_ruta, 'rpc:fn_hr_nomina_ajustes_guardar'),
    jsonb_build_object('campos', (select jsonb_agg(k) from jsonb_object_keys(p_datos) k)));
  return jsonb_build_object('id', v_id);
end;
$$;
revoke execute on function public.fn_hr_nomina_ajustes_guardar(uuid, integer, uuid, jsonb, text, text, text) from public, anon, authenticated;

create or replace function public.fn_hr_nomina_embargo_guardar(p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  v_id uuid := nullif(p_datos->>'id', '')::uuid;
begin
  select * into e from public.employments where id = (p_datos->>'vinculo_id')::uuid and organization_id = p_org;
  if not found then
    raise exception 'vinculo_no_existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process')
          and public.fn_hr_actor_puede_grupo(p_actor, p_org, e.person_id, 'salario_pago', 'editar')) then
    perform public.fn_hr_registrar_intento(p_actor, p_org, e.person_id, e.id, 'salario_pago', p_ip, p_ua, p_ruta, '{"accion":"embargo"}'::jsonb);
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.hr_garnishments (organization_id, employment_id, kind, received_on, mode, value, total_amount,
                                        starts_on, ends_on, court_reference, beneficiary, created_by)
    values (p_org, e.id, p_datos->>'tipo', (p_datos->>'recibido')::date, p_datos->>'modo', (p_datos->>'valor')::numeric,
            nullif(p_datos->>'total', '')::numeric, coalesce((p_datos->>'desde')::date, (p_datos->>'recibido')::date),
            nullif(p_datos->>'hasta', '')::date, nullif(btrim(p_datos->>'oficio'), ''), nullif(btrim(p_datos->>'beneficiario'), ''), p_actor)
    returning id into v_id;
  else
    update public.hr_garnishments
       set status = coalesce(p_datos->>'estado', status), ends_on = coalesce(nullif(p_datos->>'hasta', '')::date, ends_on), updated_at = now()
     where id = v_id and organization_id = p_org and employment_id = e.id;
    if not found then
      raise exception 'embargo_no_existe' using errcode = 'P0002';
    end if;
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, e.person_id, e.id, 'salario_pago', 'editar', p_ip, p_ua,
    coalesce(p_ruta, 'rpc:fn_hr_nomina_embargo_guardar'), jsonb_build_object('embargo', v_id));
  return jsonb_build_object('id', v_id);
end;
$$;
revoke execute on function public.fn_hr_nomina_embargo_guardar(uuid, integer, jsonb, text, text, text) from public, anon, authenticated;

-- 8. Novedades de nómina ---------------------------------------------------------------
create or replace function public.fn_hr_nomina_novedad_registrar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  e public.employments;
  v_concepto jsonb;
  v_codigo text := upper(btrim(coalesce(p_datos->>'concepto', '')));
  v_id uuid;
  v_inst uuid;
  v_calculados text[] := array['SALARIO','SALARIO_INTEGRAL','SALARIO_HORAS','DESCUENTO_TIEMPO','RECARGO_NOCTURNO','RECARGO_DOMINICAL',
    'RECARGO_DOMINICAL_NOCTURNO','HORA_EXTRA_DIURNA','HORA_EXTRA_NOCTURNA','HORA_EXTRA_DOMINICAL_DIURNA','HORA_EXTRA_DOMINICAL_NOCTURNA',
    'AUXILIO_TRANSPORTE','COMISIONES','VACACIONES_DISFRUTADAS','INCAPACIDAD_COMUN','INCAPACIDAD_LABORAL','LICENCIA_MATERNIDAD',
    'LICENCIA_PATERNIDAD','LICENCIA_REMUNERADA','PRIMA_SERVICIOS','INTERESES_CESANTIAS','SALUD_EMPLEADO','PENSION_EMPLEADO',
    'FONDO_SOLIDARIDAD','RETENCION_FUENTE','EMBARGO_ALIMENTOS','EMBARGO_COOPERATIVA','EMBARGO_ORDINARIO','PRESTAMO'];
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into pp from public.payroll_periods where id = (p_datos->>'periodo_id')::uuid and organization_id = p_org;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status not in ('open', 'calculated', 'reviewing') then
    raise exception 'periodo_cerrado: las novedades de un período cerrado van como ajuste' using errcode = '55000';
  end if;
  select * into e from public.employments where id = (p_datos->>'vinculo_id')::uuid and organization_id = p_org;
  if not found then
    raise exception 'vinculo_no_existe' using errcode = 'P0002';
  end if;
  v_concepto := public.fn_hr_nomina_conceptos(p_org)->v_codigo;
  if v_concepto is null or v_codigo = any (v_calculados) or v_concepto->>'tipo' not in ('devengado', 'deduccion') then
    raise exception 'concepto_no_admitido: % lo calcula el motor o no existe', v_codigo using errcode = '22023';
  end if;
  insert into public.hr_payroll_novelties (organization_id, employment_id, period_id, concept_code, amount, quantity, description, requested_by)
  values (p_org, e.id, pp.id, v_codigo, nullif(p_datos->>'valor', '')::numeric, nullif(p_datos->>'cantidad', '')::numeric,
          nullif(btrim(p_datos->>'descripcion'), ''), p_actor)
  returning id into v_id;
  -- Con regla de aprobación para «novedad_nomina» queda pendiente; sin regla, la registra quien procesa la nómina.
  if exists (select 1 from public.hr_approval_rules r where r.organization_id = p_org and r.request_type = 'novedad_nomina' and r.is_active) then
    v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'novedad_nomina', 'hr_payroll_novelties', v_id, e.id, p_actor,
      jsonb_build_object('concepto', v_codigo, 'monto', nullif(p_datos->>'valor', '')::numeric));
  end if;
  if v_inst is not null then
    update public.hr_payroll_novelties set approval_instance_id = v_inst where id = v_id;
  else
    update public.hr_payroll_novelties set status = 'aprobada', decided_at = now() where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'estado', case when v_inst is null then 'aprobada' else 'pendiente' end, 'aprobacion', v_inst);
end;
$$;
revoke execute on function public.fn_hr_nomina_novedad_registrar(uuid, integer, jsonb) from public, anon, authenticated;

create or replace function public.fn_hr_nomina_novedad_anular(p_actor uuid, p_org integer, p_novedad uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  n public.hr_payroll_novelties;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into n from public.hr_payroll_novelties where id = p_novedad and organization_id = p_org for update;
  if not found then
    raise exception 'novedad_no_existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.payroll_periods pp where pp.id = n.period_id and pp.status not in ('open', 'calculated', 'reviewing')) then
    raise exception 'periodo_cerrado' using errcode = '55000';
  end if;
  update public.hr_payroll_novelties set status = 'anulada', decided_at = now() where id = n.id and status in ('pendiente', 'aprobada');
  if n.approval_instance_id is not null then
    update public.hr_approval_instances set status = 'cancelada' where id = n.approval_instance_id and status = 'pendiente';
  end if;
  return jsonb_build_object('id', n.id, 'estado', 'anulada');
end;
$$;
revoke execute on function public.fn_hr_nomina_novedad_anular(uuid, integer, uuid) from public, anon, authenticated;

-- 9. Lectura del período (hr.payroll.view, con registro de accesos) ---------------------
create or replace function public.fn_hr_nomina_periodo_leer(p_actor uuid, p_org integer, p_period uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_run uuid;
  r record;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  v_run := public.fn_nomina_run_vigente(pp.id);
  for r in select e.id, e.person_id from public.payroll_slips s join public.employments e on e.id = s.employment_id
            where s.payroll_run_id = v_run loop
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, r.person_id, r.id, 'salario_pago', 'ver', p_ip, p_ua,
      coalesce(p_ruta, 'rpc:fn_hr_nomina_periodo_leer'), jsonb_build_object('periodo', pp.id));
  end loop;
  return jsonb_build_object(
    'periodo', to_jsonb(pp),
    'nomina_habilitada', public.fn_hr_nomina_habilitada(p_org),
    'versiones', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'numero', x.run_number, 'tipo', x.run_type, 'estado', x.status,
                                                              'motor', x.engine_version, 'huella', x.input_hash, 'reemplazada_por', x.superseded_by,
                                                              'motivo', x.reason, 'ejecutada', x.executed_at, 'alertas', x.alerts)
                                            order by x.run_number)
                             from public.payroll_runs x where x.payroll_period_id = pp.id), '[]'::jsonb),
    'colillas', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', s.id, 'vinculo_id', s.employment_id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
                             'sede_id', s.branch_id, 'estado', s.status, 'devengado', s.gross_pay, 'deducciones', s.total_deductions,
                             'neto', s.net_pay, 'costo_empleador', s.total_employer_cost, 'alertas', s.alerts, 'bases', s.metadata->'bases',
                             'items', (select coalesce(jsonb_agg(jsonb_build_object('tipo', i.item_type, 'codigo', i.code, 'nombre', i.name,
                                                                  'valor', i.amount, 'cantidad', i.quantity, 'tasa', i.rate, 'base', i.base_amount,
                                                                  'detalle', i.metadata) order by i.created_at, i.id), '[]'::jsonb)
                                         from public.payroll_items i where i.payroll_slip_id = s.id))
                                         order by public.fn_hr_nombre_persona(e.person_id))
                             from public.payroll_slips s join public.employments e on e.id = s.employment_id
                            where s.payroll_run_id = v_run), '[]'::jsonb),
    'novedades', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.hr_payroll_novelties n where n.period_id = pp.id), '[]'::jsonb));
end;
$$;
revoke execute on function public.fn_hr_nomina_periodo_leer(uuid, integer, uuid, text, text, text) from public, anon, authenticated;
