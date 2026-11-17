-- RR. HH., fase 3 (nómina): ronda 4 del Contador (2026-11-16) sobre el ajuste anual de provisiones.
-- Aditiva: concepto de plataforma nuevo (RECUPERACION_PROVISIONES → 425050), columnas NULL-ables o con DEFAULT en
-- hr_payroll_year_adjustments y CREATE OR REPLACE de fn_hr_nomina_ajuste_anual_provisiones. La nómina sigue apagada.
-- Reversión: supabase/rollbacks/<mismo timestamp>_hrm_f3_11_nomina_ajuste_anual_recuperacion_rollback.sql
--
-- 1. Sobrante de un año cerrado. Criterio: decide el período contable del 31-dic del año, no el día en que se
--    corre el ajuste. Si fn_is_period_open(org, 31-dic) es verdadero, el asiento va fechado el 31-dic a las 23:00 y
--    el sobrante vuelve al gasto de ese mismo año (es un hecho posterior que ajusta las cifras del año: NIIF para
--    las Pymes, Sección 32). Si el período de diciembre o el año están cerrados, el asiento va fechado el día en que
--    se corre (en la zona de la empresa, con su período abierto) y el sobrante va a 425050 «Reintegro de otros
--    costos y gastos» (concepto RECUPERACION_PROVISIONES, sobrescribible por la empresa, resuelto con
--    fn_hr_nomina_cuenta y creado al encender como las demás cuentas). Un faltante de un año cerrado va al gasto del
--    año en curso. El saldo de la provisión se mide siempre hasta el fin del 31-dic del año.
-- 2. Soporte de las vacaciones pendientes: por vínculo, valor, días pendientes y salario base mensual usado; se
--    rechaza si falta uno o si valor ≠ días × salario ÷ 30 (tolerancia de un peso). Queda en
--    hr_payroll_year_adjustments.soporte_vacaciones, junto con el criterio aplicado y la fecha del asiento.

-- 1. Catálogo de la plataforma: semilla vigente ---------------------------------------------------------------
-- catalogo-nomina: semilla vigente de la plataforma (la prueba nominaCatalogoConceptos la compara con conceptos.ts)
insert into public.hr_payroll_concepts
  (organization_id, code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code, is_system)
select null, v.* , true from (values
  ('SALARIO', 'Salario', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('SALARIO_INTEGRAL', 'Salario integral', 'devengado', true, true, false, false, true, true, '510503', null, 'Basico'),
  ('SALARIO_HORAS', 'Horas ordinarias (salario por hora)', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('DESCUENTO_TIEMPO', 'Tiempo no trabajado sin justificar', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('RECARGO_NOCTURNO', 'Recargo nocturno', 'devengado', true, true, false, true, true, true, '510515', null, 'HRN'),
  ('RECARGO_DOMINICAL', 'Recargo dominical o festivo', 'devengado', true, true, false, true, true, true, '510515', null, 'HRDDF'),
  ('RECARGO_DOMINICAL_NOCTURNO', 'Recargo dominical o festivo nocturno', 'devengado', true, true, false, true, true, true, '510515', null, 'HRNDF'),
  ('HORA_EXTRA_DIURNA', 'Hora extra diurna', 'devengado', true, true, false, true, true, true, '510515', null, 'HED'),
  ('HORA_EXTRA_NOCTURNA', 'Hora extra nocturna', 'devengado', true, true, false, true, true, true, '510515', null, 'HEN'),
  ('HORA_EXTRA_DOMINICAL_DIURNA', 'Hora extra dominical o festiva diurna', 'devengado', true, true, false, true, true, true, '510515', null, 'HEDDF'),
  ('HORA_EXTRA_DOMINICAL_NOCTURNA', 'Hora extra dominical o festiva nocturna', 'devengado', true, true, false, true, true, true, '510515', null, 'HENDF'),
  ('AUXILIO_TRANSPORTE', 'Auxilio de transporte', 'devengado', false, false, false, true, true, false, '510527', null, 'AuxilioTransporte'),
  ('COMISIONES', 'Comisiones', 'devengado', true, true, false, true, true, true, '510518', null, 'Comision'),
  ('BONIFICACION_SALARIAL', 'Bonificación salarial', 'devengado', true, true, false, true, true, true, '510548', null, 'BonificacionS'),
  ('BONIFICACION_NO_SALARIAL', 'Bonificación no salarial', 'devengado', false, false, true, false, true, false, '510548', null, 'BonificacionNS'),
  ('AUXILIO_NO_SALARIAL', 'Auxilio no salarial', 'devengado', false, false, true, false, true, false, '510545', null, 'AuxilioNS'),
  ('RETROACTIVO', 'Retroactivo salarial', 'devengado', true, true, false, true, true, true, '510506', null, 'Reintegro'),
  ('VACACIONES_DISFRUTADAS', 'Vacaciones disfrutadas', 'devengado', true, true, false, false, true, true, '2525', null, 'VacacionesComunes'),
  ('VACACIONES_COMPENSADAS', 'Vacaciones compensadas en dinero', 'devengado', false, false, false, false, true, true, '2525', null, 'VacacionesCompensadas'),
  ('INCAPACIDAD_COMUN', 'Incapacidad de origen común', 'devengado', false, true, false, false, true, false, '510524', null, 'Incapacidad'),
  ('INCAPACIDAD_LABORAL', 'Incapacidad de origen laboral', 'devengado', false, true, false, false, true, false, '510524', null, 'Incapacidad'),
  ('LICENCIA_MATERNIDAD', 'Licencia de maternidad', 'devengado', false, true, false, false, true, false, '510595', null, 'LicenciaMP'),
  ('LICENCIA_PATERNIDAD', 'Licencia de paternidad', 'devengado', false, true, false, false, true, false, '510595', null, 'LicenciaMP'),
  ('LICENCIA_REMUNERADA', 'Licencia remunerada', 'devengado', true, true, false, true, true, true, '510506', null, 'LicenciaR'),
  ('PRIMA_SERVICIOS', 'Prima de servicios', 'devengado', false, false, false, false, true, false, '2520', null, 'Primas'),
  ('INTERESES_CESANTIAS', 'Intereses sobre cesantías', 'devengado', false, false, false, false, true, false, '2515', null, 'Cesantias'),
  ('SALUD_EMPLEADO', 'Salud (trabajador)', 'deduccion', false, false, false, false, false, false, null, '237005', 'Salud'),
  ('PENSION_EMPLEADO', 'Pensión (trabajador)', 'deduccion', false, false, false, false, false, false, null, '238030', 'FondoPension'),
  ('FONDO_SOLIDARIDAD', 'Fondo de solidaridad pensional', 'deduccion', false, false, false, false, false, false, null, '238030', 'FondoSP'),
  ('RETENCION_FUENTE', 'Retención en la fuente', 'deduccion', false, false, false, false, false, false, null, '236505', 'RetencionFuente'),
  ('EMBARGO_ALIMENTOS', 'Embargo por alimentos', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('EMBARGO_COOPERATIVA', 'Embargo de cooperativa', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('EMBARGO_ORDINARIO', 'Embargo ordinario', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('PRESTAMO', 'Préstamo a empleado', 'deduccion', false, false, false, false, false, false, null, '136595', 'Deuda'),
  ('LIBRANZA', 'Libranza', 'deduccion', false, false, false, false, false, false, null, '237030', 'Libranza'),
  ('APORTE_COOPERATIVA', 'Aporte a cooperativa', 'deduccion', false, false, false, false, false, false, null, '237040', 'Cooperativa'),
  ('FONDO_EMPLEADOS', 'Aporte al fondo de empleados', 'deduccion', false, false, false, false, false, false, null, '237045', null),
  ('CUOTA_SINDICAL', 'Cuota sindical', 'deduccion', false, false, false, false, false, false, null, '237035', 'Sindicatos'),
  ('OTRO_DESCUENTO', 'Otro descuento autorizado', 'deduccion', false, false, false, false, false, false, null, '237095', 'OtraDeduccion'),
  ('SALUD_EMPLEADOR', 'Salud (empleador)', 'aporte_empleador', false, false, false, false, false, false, '510569', '237005', null),
  ('PENSION_EMPLEADOR', 'Pensión (empleador)', 'aporte_empleador', false, false, false, false, false, false, '510570', '238030', null),
  ('ARL', 'Riesgos laborales (ARL)', 'aporte_empleador', false, false, false, false, false, false, '510568', '237006', null),
  ('CAJA_COMPENSACION', 'Caja de compensación', 'aporte_empleador', false, false, false, false, false, false, '510572', '237010', null),
  ('ICBF', 'ICBF', 'aporte_empleador', false, false, false, false, false, false, '510575', '237010', null),
  ('SENA', 'SENA', 'aporte_empleador', false, false, false, false, false, false, '510578', '237010', null),
  ('PROVISION_CESANTIAS', 'Provisión de cesantías', 'provision', false, false, false, false, false, false, '510530', '2510', null),
  ('PROVISION_INTERESES', 'Provisión de intereses sobre cesantías', 'provision', false, false, false, false, false, false, '510533', '2515', null),
  ('PROVISION_PRIMA', 'Provisión de prima de servicios', 'provision', false, false, false, false, false, false, '510536', '2520', null),
  ('PROVISION_VACACIONES', 'Provisión de vacaciones', 'provision', false, false, false, false, false, false, '510539', '2525', null),
  ('CESANTIAS_CONSIGNAR', 'Cesantías por consignar al fondo', 'informativo', false, false, false, false, false, false, '2510', '2510', 'Cesantias'),
  ('INCAPACIDAD_POR_COBRAR', 'Incapacidad o licencia por cobrar a la EPS, la ARL o el fondo', 'informativo', false, false, false, false, false, false, '138095', null, null),
  ('RECUPERACION_PROVISIONES', 'Recuperación de provisiones de nómina de un año cerrado', 'informativo', false, false, false, false, false, false, null, '425050', null)
) as v(code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code)
on conflict (organization_id, code) do update
  set name = excluded.name, kind = excluded.kind, is_salarial = excluded.is_salarial, base_ss = excluded.base_ss,
      cuenta_40 = excluded.cuenta_40, is_prestacional = excluded.is_prestacional, base_retencion = excluded.base_retencion,
      base_parafiscales = excluded.base_parafiscales, debit_account = excluded.debit_account,
      credit_account = excluded.credit_account, dian_code = excluded.dian_code, is_system = true, updated_at = now()
  where public.hr_payroll_concepts.organization_id is null;

-- 2. Registro del ajuste: soporte de vacaciones, criterio y fecha del asiento --------------------------------
alter table public.hr_payroll_year_adjustments add column if not exists soporte_vacaciones jsonb not null default '{}'::jsonb;
alter table public.hr_payroll_year_adjustments add column if not exists criterio text;
alter table public.hr_payroll_year_adjustments add column if not exists fecha_asiento timestamptz;
comment on column public.hr_payroll_year_adjustments.soporte_vacaciones is
  'Por vínculo: valor de las vacaciones pendientes al 31-dic, días pendientes y salario base mensual con que se calcularon, saldo de la provisión y ajuste. Soporte para auditoría (Contador, ronda 4).';
comment on column public.hr_payroll_year_adjustments.criterio is
  'anio_abierto: asiento al 31-dic y sobrante al gasto del año. anio_cerrado: asiento el día en que se corrió y sobrante a recuperaciones (425050).';

-- 3. Ajuste anual ------------------------------------------------------------------------------------------------
create or replace function public.fn_hr_nomina_ajuste_anual_provisiones(p_actor uuid, p_org integer, p_anio integer, p_vacaciones jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_corte date := make_date(p_anio, 12, 31);
  v_tz text := public.fn_timezone_for(p_org, null);
  v_hoy date := public.fn_today_for(p_org, null);
  -- El saldo de la provisión se mide hasta el fin del 31-dic del año, en la zona de la empresa.
  v_tope timestamptz := (make_date(p_anio + 1, 1, 1) + time '00:00') at time zone public.fn_timezone_for(p_org, null);
  v_conceptos jsonb := public.fn_hr_nomina_conceptos(p_org);
  v_cerrado boolean;
  v_fecha timestamptz;
  v_recupera text;
  v_sede integer;
  v_lineas jsonb := '[]'::jsonb;
  v_detalle jsonb := '[]'::jsonb;
  v_soporte jsonb := '{}'::jsonb;
  v_vac jsonb;
  k record;
  e record;
  v_pasivo text;
  v_gasto text;
  v_contra text;
  v_cc uuid;
  v_saldo numeric;
  v_real numeric;
  v_dias numeric;
  v_salario numeric;
  v_dif numeric;
  v_entry integer;
  l record;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.close') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_nomina_habilitada(p_org) then
    raise exception 'nomina_no_habilitada' using errcode = '55000';
  end if;
  if exists (select 1 from public.hr_payroll_year_adjustments a where a.organization_id = p_org and a.anio = p_anio) then
    raise exception 'ajuste_ya_registrado: el ajuste anual de % ya existe', p_anio using errcode = '55000';
  end if;
  if v_hoy < v_corte then
    raise exception 'anio_sin_terminar: el ajuste de % se hace desde el 31 de diciembre', p_anio using errcode = '55000';
  end if;
  -- El año tiene que estar liquidado: el período de cesantías cerrado y ningún período del año sin cerrar.
  if not exists (select 1 from public.payroll_periods p where p.organization_id = p_org and p.kind = 'cesantias'
                    and extract(year from p.period_end) = p_anio and p.status in ('approved', 'paid', 'closed')) then
    raise exception 'falta_periodo_cesantias: cierra primero el período de cesantías de %', p_anio using errcode = '55000';
  end if;
  if exists (select 1 from public.payroll_periods p where p.organization_id = p_org and extract(year from p.period_end) = p_anio
                and p.status in ('open', 'calculating', 'calculated', 'reviewing')) then
    raise exception 'periodos_abiertos: hay períodos de % sin cerrar', p_anio using errcode = '55000';
  end if;

  -- Criterio (ronda 4): decide el período contable del 31-dic, no la fecha en que se corre el ajuste.
  v_cerrado := not public.fn_is_period_open(p_org, v_corte);
  if v_cerrado then
    if not public.fn_is_period_open(p_org, v_hoy) then
      raise exception 'periodo_contable_cerrado: ni el 31-dic de % ni hoy tienen el período contable abierto', p_anio using errcode = '55000';
    end if;
    v_fecha := (v_hoy + time '12:00') at time zone v_tz;
    v_recupera := public.fn_hr_nomina_cuenta(p_org, v_conceptos->'RECUPERACION_PROVISIONES'->>'cuenta_credito');
    if v_recupera is null then
      raise exception 'cuenta_no_es_de_movimiento: la cuenta de recuperaciones (%) no existe en el plan',
        coalesce(v_conceptos->'RECUPERACION_PROVISIONES'->>'cuenta_credito', 'concepto RECUPERACION_PROVISIONES') using errcode = '55000';
    end if;
  else
    v_fecha := (v_corte + time '23:00') at time zone v_tz;
  end if;
  select b.id into v_sede from public.branches b where b.organization_id = p_org order by b.is_main desc nulls last, b.id limit 1;

  for k in select x.key as codigo, x.value as c from jsonb_each(v_conceptos) x where x.value->>'tipo' = 'provision' order by x.key loop
    v_pasivo := public.fn_hr_nomina_cuenta(p_org, k.c->>'cuenta_credito');
    if v_pasivo is null then
      raise exception 'cuenta_no_es_de_movimiento: %', k.c->>'cuenta_credito' using errcode = '55000';
    end if;
    for e in
      select em.id, t.nit, t.nombre, em.status
        from public.employments em
       cross join lateral public.fn_hr_nomina_tercero(em.id, 'empleado', v_corte) t
       where em.organization_id = p_org and t.nit is not null
    loop
      select coalesce(sum(coalesce(jl.credit, 0) - coalesce(jl.debit, 0)), 0) into v_saldo
        from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id
       where jl.organization_id = p_org and je.organization_id = p_org and jl.account_code = v_pasivo
         and jl.tercero_nit = e.nit and je.entry_date < v_tope;
      v_real := 0;
      if k.codigo = 'PROVISION_VACACIONES' and (e.status = 'active' or v_saldo <> 0) then
        -- Soporte obligatorio (ronda 4): valor, días pendientes y salario base mensual usado.
        v_vac := case when p_vacaciones is null then null else p_vacaciones->e.id::text end;
        if v_vac is null or jsonb_typeof(v_vac) <> 'object'
           or jsonb_typeof(v_vac->'valor') is distinct from 'number'
           or jsonb_typeof(v_vac->'dias_pendientes') is distinct from 'number'
           or jsonb_typeof(v_vac->'salario_base') is distinct from 'number' then
          raise exception 'falta_soporte_vacaciones: el vínculo % debe traer valor, dias_pendientes y salario_base', e.id using errcode = '22023';
        end if;
        v_real := round((v_vac->>'valor')::numeric);
        v_dias := (v_vac->>'dias_pendientes')::numeric;
        v_salario := (v_vac->>'salario_base')::numeric;
        if v_real < 0 or v_dias < 0 or v_salario < 0 or abs(v_real - round(v_dias * v_salario / 30)) > 1 then
          raise exception 'soporte_vacaciones_inconsistente: vínculo %: % ≠ % días × % ÷ 30', e.id, v_real, v_dias, v_salario using errcode = '22023';
        end if;
        v_soporte := v_soporte || jsonb_build_object(e.id::text, jsonb_build_object(
          'valor', v_real, 'dias_pendientes', v_dias, 'salario_base', v_salario, 'saldo_provision', v_saldo, 'ajuste', v_real - v_saldo));
      end if;
      v_dif := v_real - v_saldo;
      continue when v_dif = 0;
      v_gasto := public.fn_hr_nomina_cuenta(p_org, public.fn_hr_nomina_cuenta_area(k.c->>'cuenta_debito', public.fn_hr_nomina_area(e.id, v_corte)));
      if v_gasto is null then
        raise exception 'cuenta_no_es_de_movimiento: gasto de % para el vínculo %', k.codigo, e.id using errcode = '55000';
      end if;
      -- Faltante: siempre al gasto (del año, o del año en curso si el año está cerrado).
      -- Sobrante: al gasto del mismo año si está abierto; a recuperaciones si está cerrado.
      v_contra := case when v_dif < 0 and v_cerrado then v_recupera else v_gasto end;
      v_cc := public.fn_hr_nomina_centro(e.id, v_corte);
      v_lineas := v_lineas
        || jsonb_build_object('cuenta', v_contra, 'debito', greatest(v_dif, 0), 'credito', greatest(-v_dif, 0), 'nit', e.nit, 'nombre', e.nombre,
                              'cc', v_cc, 'detalle', 'Ajuste anual ' || p_anio || ' ' || k.codigo
                                                      || case when v_contra = v_recupera then ' (recuperación de un año cerrado)' else '' end)
        || jsonb_build_object('cuenta', v_pasivo, 'debito', greatest(-v_dif, 0), 'credito', greatest(v_dif, 0), 'nit', e.nit, 'nombre', e.nombre,
                              'cc', null, 'detalle', 'Ajuste anual ' || p_anio || ' ' || k.codigo);
      v_detalle := v_detalle || jsonb_build_object('vinculo_id', e.id, 'concepto', k.codigo, 'saldo', v_saldo, 'real', v_real,
                                                   'ajuste', v_dif, 'contrapartida', v_contra);
    end loop;
  end loop;

  if jsonb_array_length(v_lineas) > 0 then
    insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key)
    values (p_org, v_sede, v_fecha, 'Ajuste anual de provisiones de nómina ' || p_anio, 'hr_payroll_year_adjustments',
            p_org || ':' || p_anio, true, 'payroll_year_adjustment:' || p_org || ':' || p_anio)
    returning id into v_entry;
    for l in select x->>'cuenta' as cuenta, (x->>'debito')::numeric as debito, (x->>'credito')::numeric as credito,
                    x->>'nit' as nit, x->>'nombre' as nombre, nullif(x->>'cc', '')::uuid as cc, x->>'detalle' as detalle
               from jsonb_array_elements(v_lineas) x loop
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit, cost_center_id, tercero_nit, tercero_nombre)
      values (v_entry, p_org, l.cuenta, l.detalle, l.debito, l.credito, case when l.cuenta ~ '^[457]' then l.cc end, l.nit, l.nombre);
    end loop;
  end if;
  insert into public.hr_payroll_year_adjustments (organization_id, anio, journal_entry_id, detalle, created_by, soporte_vacaciones, criterio, fecha_asiento)
  values (p_org, p_anio, v_entry, v_detalle, p_actor, v_soporte, case when v_cerrado then 'anio_cerrado' else 'anio_abierto' end, v_fecha);
  return jsonb_build_object('anio', p_anio, 'asiento', v_entry, 'criterio', case when v_cerrado then 'anio_cerrado' else 'anio_abierto' end,
                            'fecha', v_fecha, 'ajustes', v_detalle, 'soporte_vacaciones', v_soporte);
end;
$$;
revoke execute on function public.fn_hr_nomina_ajuste_anual_provisiones(uuid, integer, integer, jsonb) from public, anon, authenticated;
