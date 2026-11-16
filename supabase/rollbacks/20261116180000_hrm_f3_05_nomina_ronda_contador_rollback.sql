-- Reversión de 20261116180000_hrm_f3_05_nomina_ronda_contador.sql: vuelve a las
-- funciones de 20261116073811_hrm_f3_02_nomina_motor.sql y quita lo agregado.

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

drop function if exists public.fn_hr_nomina_variables_vacaciones(uuid, date, date);

alter table public.hr_payroll_employee_settings drop constraint if exists hr_payroll_employee_settings_pension_licencia_chk;
alter table public.hr_payroll_employee_settings drop column if exists pension_en_licencia;
alter table public.hr_garnishments drop constraint if exists hr_garnishments_prestaciones_chk;
alter table public.hr_garnishments drop column if exists base_incluye_prestaciones;

update public.hr_legal_parameters
   set status = 'por_confirmar', verificacion = 'NC',
       legal_source = 'Ley 2381 de 2024 (reforma pensional); Corte Constitucional, Sentencia C-264 de 2026',
       notes = '[ADR-001] Tabla de fuentes secundarias, sin confirmar el artículo ni la versión final. Colpensiones pidió aplazar a 2028.',
       value_json = '[{"tarifa": 0.015, "desde_smmlv": 4, "hasta_smmlv": 7}, {"tarifa": 0.018, "desde_smmlv": 7, "hasta_smmlv": 11}, {"tarifa": 0.025, "desde_smmlv": 11, "hasta_smmlv": 19}, {"tarifa": 0.028, "desde_smmlv": 19, "hasta_smmlv": 20}, {"tarifa": 0.03, "desde_smmlv": 20, "hasta_smmlv": null}]'::jsonb
 where country_code = 'COL' and code = 'fsp_tabla' and effective_from = '2027-04-01';
update public.hr_legal_parameters
   set status = 'por_confirmar', verificacion = 'NC', legal_source = 'Ley 1280 de 2009 (CST 57 num. 10)',
       notes = '[ADR-002] No está en la investigación del 2026-11-14: no limita ni se usa para calcular hasta que el Contador lo confirme.'
 where country_code = 'COL' and code = 'licencia_luto_dias_habiles' and effective_from = '2023-07-15';
delete from public.hr_legal_parameters where country_code = 'COL' and code = 'retencion_redondeo_tabla';
delete from public.hr_org_parameters where code in ('retencion_redondeo_tabla', 'incapacidad_empleador_fraccion');
delete from public.hr_parameter_catalog where code in ('retencion_redondeo_tabla', 'incapacidad_empleador_fraccion');
