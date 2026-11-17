-- RR. HH., fase 3 (nómina): cuentas contables según la respuesta del Contador del 2026-11-16 (§4, C1 a C6).
-- docs/contador/RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md. La nómina sigue apagada (hr_payroll_enabled = false).
-- Aditiva: catálogo de plataforma actualizado (las filas de organización no se tocan), columnas NULL-ables,
-- funciones nuevas y CREATE OR REPLACE de la contabilización.
-- Reversión: supabase/rollbacks/<mismo timestamp>_hrm_f3_05_nomina_cuentas_contador_rollback.sql
--
-- Decisiones (detalle en docs/hrm/ADR-003-nomina.md, §5 «Cuentas del Contador»):
-- C1  Subcuentas PUC por concepto (abajo). Las subcuentas no existen hoy en ningún plan (0 de 40 organizaciones):
--     fn_hr_nomina_preparar_plan las crea con el mecanismo de la plataforma (fn_puc_cuenta_para_asiento: subcuenta
--     de título + auxiliar «01» de movimiento) al encender la nómina de una empresa. Una cuenta que no exista como
--     cuenta de movimiento sigue mandando el asiento entero a la bandeja de rechazos.
-- C2  El área sale del tipo del centro de costo vigente del empleado (cost_centers.type: administracion, ventas,
--     operacion; la siembra de centros ya lo trae). 5105 → 5205 (ventas) o 7205 (operación/producción), con la
--     misma subcuenta. Sin centro: el del área (departamento); sin nada: administración. Sin columnas nuevas.
-- C3  Toda línea de 1365, 1380, 2365, 2370, 2380, 2505 y 2510 a 2525 lleva tercero con NIT. Si falta el tercero
--     o su NIT, el asiento entero va a rechazos ('tercero_requerido'): una línea publicada es inmutable y un tercero
--     sin NIT no sirve para la PILA ni la exógena; el rechazo se reintenta al contabilizar, después de completar
--     el dato. Las líneas de gasto no llevan tercero.
-- C4  Sin cambios: fecha del último día del período y sede del empleado.
-- C5  Si la provisión del empleado (saldo contable de la cuenta con su NIT hasta la fecha del asiento, más lo que
--     el mismo asiento provisiona) no alcanza para la prima, las vacaciones, los intereses o las cesantías, el
--     faltante va al gasto de la provisión (510530/33/36/39 según área) en el mismo asiento. El ajuste de fin de
--     año al valor consolidado queda pendiente (documentado).
-- C6  El pago de aportes y provisiones del período ya no deja un rechazo 'criterio_contador': quedan en 2370 y
--     238030 con su tercero hasta la fase PILA.

-- 1. Columnas para el tercero de descuentos y embargos -------------------------------------
alter table public.hr_payroll_novelties add column if not exists tercero_nit text;
alter table public.hr_payroll_novelties add column if not exists tercero_nombre text;
comment on column public.hr_payroll_novelties.tercero_nit is
  'NIT de la entidad a la que se le debe el descuento (libranza, cooperativa, fondo de empleados, sindicato). Tercero de la línea de 2370 del asiento (C3).';
comment on column public.hr_payroll_novelties.tercero_nombre is 'Nombre de la entidad del descuento (C3).';
alter table public.hr_garnishments add column if not exists beneficiary_doc text;
comment on column public.hr_garnishments.beneficiary_doc is
  'Documento o NIT del demandante o del juzgado que recibe el embargo. Tercero de la línea 237025 del asiento (C3).';

-- 2. Catálogo de la plataforma: semilla vigente ------------------------------------------------
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
  ('INCAPACIDAD_POR_COBRAR', 'Incapacidad o licencia por cobrar a la EPS, la ARL o el fondo', 'informativo', false, false, false, false, false, false, '138095', null, null)
) as v(code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code)
on conflict (organization_id, code) do update
  set name = excluded.name, kind = excluded.kind, is_salarial = excluded.is_salarial, base_ss = excluded.base_ss,
      cuenta_40 = excluded.cuenta_40, is_prestacional = excluded.is_prestacional, base_retencion = excluded.base_retencion,
      base_parafiscales = excluded.base_parafiscales, debit_account = excluded.debit_account,
      credit_account = excluded.credit_account, dian_code = excluded.dian_code, is_system = true, updated_at = now()
  where public.hr_payroll_concepts.organization_id is null;

-- 3. Resolución de cuentas, área y terceros ---------------------------------------------------
-- Cuenta de movimiento para un código del catálogo: el mismo código si es de movimiento; si es de título, su
-- sucesora del plan (plan_cuentas_sucesoras) o, con p_descender, su primera cuenta de movimiento por debajo
-- (236505 → 23650501, 510506 → 51050601), con el orden de fn_puc_cuenta_para_asiento. Si no existe: null
-- (el asiento va a rechazos). Nunca sube a la cuenta de arriba.
create or replace function public.fn_hr_nomina_cuenta(p_org integer, p_codigo text, p_descender boolean default true)
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_mov boolean;
  v text;
  v_sig text;
  i integer := 0;
begin
  if nullif(btrim(coalesce(p_codigo, '')), '') is null then
    return null;
  end if;
  select a.es_movimiento into v_mov from public.chart_of_accounts a
   where a.organization_id = p_org and a.account_code = p_codigo and coalesce(a.is_active, true);
  if not found then
    return null;
  end if;
  if v_mov is true then
    return p_codigo;
  end if;
  v := p_codigo;
  while i < 5 loop
    i := i + 1;
    select s.sucesora into v_sig from public.plan_cuentas_sucesoras s where s.organization_id = p_org and s.account_code = v;
    exit when v_sig is null;
    v := v_sig;
    if exists (select 1 from public.chart_of_accounts a where a.organization_id = p_org and a.account_code = v
                 and a.es_movimiento is true and coalesce(a.is_active, true)) then
      return v;
    end if;
  end loop;
  if not p_descender then
    return null;
  end if;
  select a.account_code into v from public.chart_of_accounts a
   where a.organization_id = p_org and a.account_code like p_codigo || '%' and a.account_code <> p_codigo
     and a.es_movimiento is true and coalesce(a.is_active, true)
   order by length(a.account_code), a.account_code
   limit 1;
  return v;
end;
$$;
revoke execute on function public.fn_hr_nomina_cuenta(integer, text, boolean) from public, anon, authenticated;

-- C2: el gasto de personal va a 5105 (administración), 5205 (ventas) o 7205 (operación o producción),
-- con la misma subcuenta. Solo cambia las cuentas del grupo 5105; una cuenta propia fuera de él se respeta.
create or replace function public.fn_hr_nomina_cuenta_area(p_cuenta text, p_area text)
returns text
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_cuenta like '5105%' and p_area = 'ventas' then '5205' || substr(p_cuenta, 5)
    when p_cuenta like '5105%' and p_area = 'operacion' then '7205' || substr(p_cuenta, 5)
    else p_cuenta end
$$;

-- Centro de costo del empleado en una fecha: el vigente (evento «centro_costo»); si no tiene, el de su área.
create or replace function public.fn_hr_nomina_centro(p_employment uuid, p_fecha date)
returns uuid
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v text;
  v_cc uuid;
begin
  v := public.fn_hr_valor_vigente_interno(p_employment, 'centro_costo', p_fecha) #>> '{}';
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_cc := v::uuid;
  end if;
  if v_cc is null then
    v := public.fn_hr_valor_vigente_interno(p_employment, 'area', p_fecha) #>> '{}';
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select d.cost_center_id into v_cc from public.departments d where d.id = v::uuid;
    end if;
  end if;
  return v_cc;
end;
$$;
revoke execute on function public.fn_hr_nomina_centro(uuid, date) from public, anon, authenticated;

-- Área contable del empleado: el tipo de su centro de costo (o del primer centro de arriba que lo tenga).
create or replace function public.fn_hr_nomina_area(p_employment uuid, p_fecha date)
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_cc uuid := public.fn_hr_nomina_centro(p_employment, p_fecha);
  v_tipo text;
  v_padre uuid;
  i integer := 0;
begin
  while v_cc is not null and i < 6 loop
    i := i + 1;
    select lower(btrim(c.type)), c.parent_id into v_tipo, v_padre from public.cost_centers c where c.id = v_cc;
    exit when nullif(v_tipo, '') is not null;
    v_cc := v_padre;
  end loop;
  return case
    when v_tipo = 'ventas' then 'ventas'
    when v_tipo in ('operacion', 'produccion') then 'operacion'
    else 'administracion' end;
end;
$$;
revoke execute on function public.fn_hr_nomina_area(uuid, date) from public, anon, authenticated;

-- Tercero de una línea: el empleado, su entidad de seguridad social vigente al corte, o una entidad nacional.
-- ICBF, SENA y DIAN: NIT sin dígito de verificación.
create or replace function public.fn_hr_nomina_tercero(p_employment uuid, p_quien text, p_corte date, out nit text, out nombre text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v text;
  v_person uuid;
begin
  nit := null;
  nombre := null;
  if p_quien = 'empleado' then
    select e.person_id into v_person from public.employments e where e.id = p_employment;
    select nullif(btrim(i.doc_number), '') into nit from public.hr_people_identification i where i.person_id = v_person;
    nombre := public.fn_hr_nombre_persona(v_person);
  elsif p_quien in ('eps', 'afp', 'arl', 'ccf', 'cesantias') then
    v := public.fn_hr_valor_vigente_interno(p_employment, p_quien, p_corte) #>> '{}';
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select nullif(btrim(s.nit), ''), s.name into nit, nombre from public.hr_ss_entities s where s.id = v::uuid;
    elsif nullif(btrim(coalesce(v, '')), '') is not null then
      nombre := btrim(v);
    end if;
  elsif p_quien = 'icbf' then
    nit := '899999239'; nombre := 'Instituto Colombiano de Bienestar Familiar (ICBF)';
  elsif p_quien = 'sena' then
    nit := '899999034'; nombre := 'Servicio Nacional de Aprendizaje (SENA)';
  elsif p_quien = 'dian' then
    nit := '800197268'; nombre := 'Dirección de Impuestos y Aduanas Nacionales (DIAN)';
  end if;
end;
$$;
revoke execute on function public.fn_hr_nomina_tercero(uuid, text, date) from public, anon, authenticated;

-- 4. Asiento de una colilla del motor --------------------------------------------------------
create or replace function public.fn_hr_nomina_asentar(p_slip public.payroll_slips, p_evento text, p_org integer, p_sede integer)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_fact text := 'payroll_slip:' || p_slip.id || ':' || p_evento;
  v_source_id text := p_slip.id || ':' || p_evento;
  v_conceptos jsonb := public.fn_hr_nomina_conceptos(p_org);
  v_tz text := public.fn_timezone_for(p_org, p_sede);
  -- C3: cuentas cuyas líneas llevan tercero con NIT.
  v_req constant text[] := array['1365', '1380', '2365', '2370', '2380', '2505', '2510', '2515', '2520', '2525'];
  v_periodo public.payroll_periods;
  v_corte date;
  v_fecha timestamptz;
  v_cc uuid;
  v_area text;
  v_emp_nit text;
  v_emp_nombre text;
  v_por_pagar text;
  v_pago public.payments;
  v_banco text;
  v_raw jsonb := '[]'::jsonb;
  v_res jsonb := '[]'::jsonb;
  v_lineas jsonb;
  v_motivo text;
  v_falta text;
  it record;
  x record;
  c jsonb;
  v_cta text;
  v_quien text;
  v_cuenta text;
  v_nit text;
  v_nom text;
  v_tipo_prestamo text;
  v_gasto text;
  v_consumo numeric;
  v_disponible numeric;
  v_faltante numeric;
  v_deb numeric;
  v_cre numeric;
  v_entry integer;
  l record;
begin
  if exists (select 1 from public.journal_entries e where e.organization_id = p_org and e.fact_key = v_fact) then
    return;
  end if;
  select pp.* into v_periodo from public.payroll_periods pp join public.payroll_runs r on r.payroll_period_id = pp.id where r.id = p_slip.payroll_run_id;
  v_corte := v_periodo.period_end;
  select t.nit, t.nombre into v_emp_nit, v_emp_nombre from public.fn_hr_nomina_tercero(p_slip.employment_id, 'empleado', v_corte) t;
  v_por_pagar := coalesce(public.fn_cuenta_por_clave(p_org, p_sede, 'nomina_por_pagar'), public.fn_hr_nomina_cuenta(p_org, '2505'));

  if p_evento = 'created' then
    v_fecha := (v_corte + time '12:00') at time zone v_tz;
    v_cc := coalesce(public.fn_hr_nomina_centro(p_slip.employment_id, v_corte),
                     (select e.cost_center_id from public.employments e where e.id = p_slip.employment_id));
    v_area := public.fn_hr_nomina_area(p_slip.employment_id, v_corte);

    -- Líneas en bruto: cuenta del catálogo (ya por área), lado, valor y de quién es el tercero.
    for it in select i.* from public.payroll_items i where i.payroll_slip_id = p_slip.id order by i.created_at, i.id loop
      c := v_conceptos->it.code;
      if c is null then
        v_motivo := 'cuenta_no_es_de_movimiento';
        v_falta := 'El concepto ' || it.code || ' no está en el catálogo';
        exit;
      end if;
      if it.item_type = 'earning' then
        if it.metadata->>'paga' in ('eps', 'arl', 'fondo_pensiones') then
          -- C1: lo que paga la EPS, la ARL o el fondo no es gasto: cuenta por cobrar con la entidad (CTCP 411 de 2015).
          v_cta := v_conceptos->'INCAPACIDAD_POR_COBRAR'->>'cuenta_debito';
          v_quien := case it.metadata->>'paga' when 'fondo_pensiones' then 'afp' else it.metadata->>'paga' end;
        else
          v_cta := public.fn_hr_nomina_cuenta_area(c->>'cuenta_debito', v_area);
          v_quien := 'empleado';
        end if;
        v_raw := v_raw || jsonb_build_object('cta', v_cta, 'deb', greatest(it.amount, 0), 'cre', greatest(-it.amount, 0),
                                             'det', it.name, 'quien', v_quien, 'consumo', true, 'concepto', it.code);
      elsif it.item_type = 'deduction' then
        v_cta := c->>'cuenta_credito';
        v_quien := case
          when it.code = 'SALUD_EMPLEADO' then 'eps'
          when it.code in ('PENSION_EMPLEADO', 'FONDO_SOLIDARIDAD') then 'afp'
          when it.code = 'RETENCION_FUENTE' then 'dian'
          when it.source_type = 'hr_garnishments' then 'embargo:' || coalesce(it.source_id, '')
          when it.code = 'PRESTAMO' or it.source_type = 'loan_installments' then 'empleado'
          when it.source_type = 'hr_payroll_novelties' then 'novedad:' || coalesce(it.source_id, '')
          else 'empleado' end;
        -- C1: préstamos por tipo (vivienda, vehículo, educación, calamidad); el resto a 136595. Solo si la
        -- empresa no cambió la cuenta del concepto.
        if it.code = 'PRESTAMO' and v_cta = '136595' then
          v_tipo_prestamo := null;
          begin
            select l2.loan_type into v_tipo_prestamo from public.employee_loans l2 where l2.id = (it.metadata->>'prestamo_id')::uuid;
          exception when others then
            v_tipo_prestamo := null;
          end;
          v_cta := case v_tipo_prestamo when 'housing' then '136505' when 'vehicle' then '136510'
                                        when 'education' then '136515' when 'calamity' then '136525' else '136595' end;
        end if;
        v_raw := v_raw || jsonb_build_object('cta', v_cta, 'deb', greatest(-it.amount, 0), 'cre', greatest(it.amount, 0),
                                             'det', it.name, 'quien', v_quien, 'consumo', false, 'concepto', it.code);
      elsif it.item_type = 'employer_cost' then
        v_raw := v_raw || jsonb_build_object('cta', public.fn_hr_nomina_cuenta_area(c->>'cuenta_debito', v_area),
                                             'deb', greatest(it.amount, 0), 'cre', greatest(-it.amount, 0),
                                             'det', it.name, 'quien', null, 'consumo', false, 'concepto', it.code);
        v_quien := case it.code
          when 'SALUD_EMPLEADOR' then 'eps' when 'PENSION_EMPLEADOR' then 'afp' when 'ARL' then 'arl'
          when 'CAJA_COMPENSACION' then 'ccf' when 'ICBF' then 'icbf' when 'SENA' then 'sena'
          else 'empleado' end;
        v_raw := v_raw || jsonb_build_object('cta', c->>'cuenta_credito', 'deb', greatest(-it.amount, 0), 'cre', greatest(it.amount, 0),
                                             'det', it.name, 'quien', v_quien, 'consumo', false, 'concepto', it.code);
      elsif it.item_type = 'info' then
        -- C1: las cesantías del año se quedan en 2510; solo pasan del empleado al fondo de cesantías.
        v_raw := v_raw || jsonb_build_object('cta', public.fn_hr_nomina_cuenta_area(c->>'cuenta_debito', v_area),
                                             'deb', greatest(it.amount, 0), 'cre', greatest(-it.amount, 0),
                                             'det', it.name, 'quien', 'empleado', 'consumo', true, 'concepto', it.code);
        v_raw := v_raw || jsonb_build_object('cta', c->>'cuenta_credito', 'deb', greatest(-it.amount, 0), 'cre', greatest(it.amount, 0),
                                             'det', it.name, 'quien', case when it.code = 'CESANTIAS_CONSIGNAR' then 'cesantias' else 'empleado' end,
                                             'consumo', false, 'concepto', it.code);
      end if;
    end loop;
    v_raw := v_raw || jsonb_build_object('cta', v_por_pagar, 'deb', greatest(-p_slip.net_pay, 0), 'cre', greatest(p_slip.net_pay, 0),
                                         'det', 'Nómina por pagar', 'quien', 'empleado', 'consumo', false, 'concepto', 'NETO');
  else
    select * into v_pago from public.payments where id = p_slip.payment_id;
    v_fecha := coalesce(v_pago.payment_date, p_slip.paid_at, now());
    -- C1: sin la cuenta contable de la cuenta bancaria no hay asiento de pago (nunca la 1110 genérica).
    select nullif(btrim(b.account_code), '') into v_banco from public.bank_accounts b
     where b.id = v_pago.bank_account_id and b.organization_id = p_org;
    if v_banco is null then
      perform public.fn_log_journal_failure(p_org, p_sede, v_fecha, 'payroll_slips', v_source_id, v_fact, v_por_pagar, null, p_slip.net_pay,
        'banco_sin_cuenta', 'La cuenta bancaria del pago no tiene cuenta contable');
      return;
    end if;
    v_raw := jsonb_build_array(
      jsonb_build_object('cta', v_por_pagar, 'deb', p_slip.net_pay, 'cre', 0, 'det', 'Pago de nómina', 'quien', 'empleado', 'consumo', false),
      jsonb_build_object('cta', v_banco, 'deb', 0, 'cre', p_slip.net_pay, 'det', 'Pago de nómina', 'quien', null, 'consumo', false, 'banco', true));
  end if;

  -- Cuenta de movimiento y tercero de cada línea. Un solo faltante manda el asiento entero a rechazos.
  if v_falta is null then
    for x in select e.value as j from jsonb_array_elements(v_raw) e loop
      if coalesce((x.j->>'deb')::numeric, 0) = 0 and coalesce((x.j->>'cre')::numeric, 0) = 0 then
        continue;
      end if;
      v_cuenta := public.fn_hr_nomina_cuenta(p_org, x.j->>'cta', not coalesce((x.j->>'banco')::boolean, false));
      if v_cuenta is null then
        v_motivo := 'cuenta_no_es_de_movimiento';
        v_falta := 'La cuenta ' || coalesce(x.j->>'cta', '(sin cuenta en el concepto ' || coalesce(x.j->>'concepto', '') || ')')
                   || ' no existe o no tiene cuenta de movimiento en el plan';
        exit;
      end if;
      v_nit := null;
      v_nom := null;
      v_quien := x.j->>'quien';
      if v_quien = 'empleado' then
        v_nit := v_emp_nit;
        v_nom := v_emp_nombre;
      elsif v_quien like 'embargo:%' then
        begin
          select nullif(btrim(g.beneficiary_doc), ''), coalesce(nullif(btrim(g.beneficiary), ''), nullif(btrim(g.court_reference), ''))
            into v_nit, v_nom
            from public.hr_garnishments g where g.id = substr(v_quien, 9)::uuid and g.organization_id = p_org;
        exception when others then
          v_nit := null;
        end;
      elsif v_quien like 'novedad:%' then
        begin
          select nullif(btrim(n.tercero_nit), ''), nullif(btrim(n.tercero_nombre), '') into v_nit, v_nom
            from public.hr_payroll_novelties n where n.id = substr(v_quien, 9)::uuid and n.organization_id = p_org;
        exception when others then
          v_nit := null;
        end;
        -- Un descuento a favor de la empresa (cuenta por cobrar al trabajador) es del empleado.
        if v_nit is null and v_cuenta like '1%' then
          v_nit := v_emp_nit;
          v_nom := v_emp_nombre;
        end if;
      elsif v_quien is not null then
        select t.nit, t.nombre into v_nit, v_nom from public.fn_hr_nomina_tercero(p_slip.employment_id, v_quien, v_corte) t;
      end if;
      -- Las líneas de gasto (clases 5 y 7) no llevan tercero: llevan el centro de costo.
      if v_cuenta ~ '^[57]' then
        v_nit := null;
        v_nom := null;
        v_quien := null;
      end if;
      if v_nit is null and left(v_cuenta, 4) = any (v_req) then
        v_motivo := 'tercero_requerido';
        v_falta := 'La línea ' || coalesce(x.j->>'det', '') || ' (' || v_cuenta || ') no tiene tercero con NIT: '
                   || case
                        when v_quien = 'empleado' then 'el empleado no tiene documento'
                        when v_quien like 'embargo:%' then 'el embargo no tiene el documento del demandante o del juzgado'
                        when v_quien like 'novedad:%' then 'el descuento no tiene la entidad (NIT)'
                        when v_nom is null then 'el empleado no tiene ' || upper(coalesce(v_quien, '?')) || ' en su ficha'
                        else upper(v_quien) || ' «' || v_nom || '» no tiene NIT en el catálogo de entidades' end;
        exit;
      end if;
      v_res := v_res || jsonb_build_object('cuenta', v_cuenta, 'deb', coalesce((x.j->>'deb')::numeric, 0), 'cre', coalesce((x.j->>'cre')::numeric, 0),
                                           'det', x.j->>'det', 'nit', v_nit, 'nombre', v_nom,
                                           'consumo', coalesce((x.j->>'consumo')::boolean, false) and v_quien = 'empleado');
    end loop;
  end if;

  -- C5: el faltante de la provisión del empleado va al gasto de esa provisión, en el mismo asiento.
  if v_falta is null and p_evento = 'created' and v_emp_nit is not null then
    for x in select distinct r.value->>'cuenta' as cuenta from jsonb_array_elements(v_res) r where (r.value->>'consumo')::boolean loop
      v_gasto := null;
      select public.fn_hr_nomina_cuenta_area(k.value->>'cuenta_debito', v_area) into v_gasto
        from jsonb_each(v_conceptos) k
       where k.value->>'tipo' = 'provision' and public.fn_hr_nomina_cuenta(p_org, k.value->>'cuenta_credito') = x.cuenta
       order by k.key limit 1;
      continue when v_gasto is null;
      select coalesce(sum((r.value->>'deb')::numeric - (r.value->>'cre')::numeric), 0) into v_consumo
        from jsonb_array_elements(v_res) r where r.value->>'cuenta' = x.cuenta and (r.value->>'consumo')::boolean;
      continue when v_consumo <= 0;
      select coalesce(sum(coalesce(jl.credit, 0) - coalesce(jl.debit, 0)), 0) into v_disponible
        from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id
       where jl.organization_id = p_org and je.organization_id = p_org and jl.account_code = x.cuenta
         and jl.tercero_nit = v_emp_nit and je.entry_date <= v_fecha;
      v_disponible := v_disponible + coalesce((select sum((r.value->>'cre')::numeric - (r.value->>'deb')::numeric)
                                                 from jsonb_array_elements(v_res) r
                                                where r.value->>'cuenta' = x.cuenta and r.value->>'nit' = v_emp_nit
                                                  and not (r.value->>'consumo')::boolean), 0);
      v_faltante := greatest(v_consumo - greatest(v_disponible, 0), 0);
      continue when v_faltante <= 0;
      v_cuenta := public.fn_hr_nomina_cuenta(p_org, v_gasto);
      if v_cuenta is null then
        v_motivo := 'cuenta_no_es_de_movimiento';
        v_falta := 'La cuenta ' || v_gasto || ' (faltante de la provisión de ' || x.cuenta || ') no existe o no tiene cuenta de movimiento';
        exit;
      end if;
      v_res := v_res
        || jsonb_build_object('cuenta', x.cuenta, 'deb', -v_faltante, 'cre', 0, 'det', 'Faltante de provisión', 'nit', v_emp_nit, 'nombre', v_emp_nombre, 'consumo', true)
        || jsonb_build_object('cuenta', v_cuenta, 'deb', v_faltante, 'cre', 0, 'det', 'Faltante de provisión (' || x.cuenta || ')', 'nit', null, 'nombre', null, 'consumo', false);
    end loop;
  end if;

  if v_falta is not null then
    perform public.fn_log_journal_failure(p_org, p_sede, v_fecha, 'payroll_slips', v_source_id, v_fact, null, null, p_slip.net_pay, v_motivo, v_falta);
    return;
  end if;

  -- Una línea por cuenta y tercero; débito y crédito de la misma cuenta quedan en dos líneas.
  select coalesce(jsonb_agg(jsonb_build_object('cuenta', z.cuenta, 'nit', z.nit, 'nombre', z.nombre, 'debito', z.debito,
                                               'credito', z.credito, 'detalle', z.detalle) order by z.orden), '[]'::jsonb)
    into v_lineas
    from (select r.value->>'cuenta' as cuenta, r.value->>'nit' as nit, max(r.value->>'nombre') as nombre,
                 sum((r.value->>'deb')::numeric) as debito, sum((r.value->>'cre')::numeric) as credito,
                 left(string_agg(distinct r.value->>'det', ', '), 250) as detalle, min(r.ordinality) as orden
            from jsonb_array_elements(v_res) with ordinality r
           group by r.value->>'cuenta', r.value->>'nit') z
   where z.debito <> 0 or z.credito <> 0;

  select coalesce(sum((x2->>'debito')::numeric), 0), coalesce(sum((x2->>'credito')::numeric), 0) into v_deb, v_cre
    from jsonb_array_elements(v_lineas) x2;
  if v_deb <> v_cre or v_deb = 0 then
    perform public.fn_log_journal_failure(p_org, p_sede, v_fecha, 'payroll_slips', v_source_id, v_fact, null, null, v_deb,
      'descuadre', 'Débitos ' || v_deb || ' y créditos ' || v_cre);
    return;
  end if;
  if not public.fn_is_period_open(p_org, (v_fecha at time zone v_tz)::date) then
    perform public.fn_log_journal_failure(p_org, p_sede, v_fecha, 'payroll_slips', v_source_id, v_fact, null, null, v_deb,
      'period_closed', 'Periodo contable cerrado');
    return;
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key)
  values (p_org, p_sede, v_fecha,
          case p_evento when 'created' then 'Nómina ' else 'Pago de nómina ' end || coalesce(v_periodo.name, '') || ' · colilla ' || p_slip.id,
          'payroll_slips', v_source_id, true, v_fact)
  returning id into v_entry;
  for l in select x3->>'cuenta' as cuenta, (x3->>'debito')::numeric as debito, (x3->>'credito')::numeric as credito,
                  x3->>'detalle' as detalle, x3->>'nit' as nit, x3->>'nombre' as nombre
             from jsonb_array_elements(v_lineas) x3 loop
    if l.debito > 0 then
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit, cost_center_id, tercero_nit, tercero_nombre)
      values (v_entry, p_org, l.cuenta, l.detalle, l.debito, 0, case when l.cuenta like '5%' or l.cuenta like '7%' then v_cc end, l.nit, l.nombre);
    end if;
    if l.credito > 0 then
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit, cost_center_id, tercero_nit, tercero_nombre)
      values (v_entry, p_org, l.cuenta, l.detalle, 0, l.credito, case when l.cuenta like '5%' or l.cuenta like '7%' then v_cc end, l.nit, l.nombre);
    end if;
  end loop;
  -- El rechazo anterior de este hecho queda resuelto.
  update public.journal_entry_failures
     set resolved_at = now(), resolved_entry_id = v_entry, resolution = 'Asentado al reintentar la nómina.'
   where organization_id = p_org and fact_key = v_fact and resolved_at is null;
end;
$$;
revoke execute on function public.fn_hr_nomina_asentar(public.payroll_slips, text, integer, integer) from public, anon, authenticated;

-- 5. C6: el pago de aportes y provisiones del período no se asienta aparte -------------------
create or replace function public.fn_auto_journal_payroll_period()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rule record;
  v_entry_id integer;
  v_branch_id integer;
  v_event_type text;
  v_amount numeric;
  v_country_code text;
  v_fecha timestamptz;
begin
  if new.status is null then
    return new;
  end if;

  if (new.status = 'approved' or new.status = 'paid')
     and (old.status is distinct from new.status) then

    -- Período del motor de la fase 3: los aportes y provisiones ya los asientan sus colillas,
    -- y su pago va por la PILA (fase 4). El período no asienta nada aparte.
    if new.metadata ? 'run_vigente' then
      return new;
    end if;

    v_event_type := case new.status when 'approved' then 'created' when 'paid' then 'paid' end;

    -- total_employer_cost trae el devengado más los aportes y provisiones: el periodo solo
    -- responde por el costo patronal.
    v_amount := greatest(coalesce(new.total_employer_cost, 0) - coalesce(new.total_gross, 0), 0);
    if v_amount <= 0 then
      return new;
    end if;

    select country_code into v_country_code from public.organizations where id = new.organization_id;
    -- R8: sede principal de la organización (antes, la de menor id).
    select b.id into v_branch_id from public.branches b where b.organization_id = new.organization_id
     order by b.is_main desc nulls last, b.id limit 1;
    v_fecha := coalesce(new.payment_date::timestamptz, new.approved_at, new.updated_at, now());

    if v_country_code = 'COL' then
      -- Las colillas ya devengaron este costo (devengarlo aquí lo contaría dos veces), y el Contador
      -- decidió (C6, 2026-11-16) que los aportes quedan en 2370 y 238030, con su tercero, hasta que
      -- se paguen con la PILA. Pagar el período no mueve esos pasivos.
      return new;
    end if;

    select * into v_rule
      from public.accounting_rules
     where organization_id = new.organization_id
       and source_type = 'payroll_period'
       and event_type = v_event_type
       and is_active = true
     order by priority limit 1;

    if v_rule is null then
      select * into v_rule
        from public.accounting_rules
       where organization_id = new.organization_id
         and source_type = 'payroll_period'
         and is_active = true
       order by priority limit 1;
    end if;

    if v_rule is null then
      perform public.fn_log_journal_failure(new.organization_id, v_branch_id, v_fecha, 'payroll_periods',
        new.id::text || ':' || v_event_type, 'payroll_period:' || new.id::text || ':' || v_event_type,
        null, null, v_amount, 'no_rule', 'Sin regla contable activa de periodo de nómina');
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := v_branch_id,
      p_entry_date := v_fecha,
      p_memo := 'Cierre Período Nómina - ' || coalesce(new.name, new.id::text) || ' (' || v_event_type || ')',
      p_source := 'payroll_periods',
      p_source_id := new.id::text || ':' || v_event_type,
      p_debit_account := v_rule.debit_account_code,
      p_credit_account := v_rule.credit_account_code,
      p_amount := v_amount,
      p_fact_key := 'payroll_period:' || new.id::text || ':' || v_event_type
    );
  end if;

  return new;
end;
$function$;

-- 6. Contabilizado: reintenta los asientos que faltan antes de responder ----------------------
create or replace function public.fn_hr_nomina_contabilizar(p_actor uuid, p_org integer, p_period uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_faltan jsonb;
  v_s public.payroll_slips;
  f record;
  v_sede integer;
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.close') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.pay')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org for update;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status <> 'paid' then
    raise exception 'estado_invalido: se contabiliza una nómina pagada' using errcode = '55000';
  end if;
  -- Un asiento rechazado (cuenta o tercero que faltaba) se reintenta aquí, después de completar el dato.
  for f in select s.id, v.ev
             from public.payroll_slips s
             join public.payroll_runs r on r.id = s.payroll_run_id
            cross join lateral (values ('created'), ('paid')) v(ev)
            where r.payroll_period_id = pp.id and r.status = 'completed'
              and ((r.run_type = 'calculo' and r.is_final) or r.run_type = 'ajuste')
              and s.status in ('approved', 'paid') and s.metadata ? 'motor'
              and (v.ev = 'created' or s.status = 'paid')
              and not exists (select 1 from public.journal_entries j where j.organization_id = p_org
                                 and j.fact_key = 'payroll_slip:' || s.id || ':' || v.ev)
            order by s.id, v.ev loop
    select * into v_s from public.payroll_slips where id = f.id;
    v_sede := coalesce(v_s.branch_id,
                       (select e.branch_id from public.employments e where e.id = v_s.employment_id),
                       (select b.id from public.branches b where b.organization_id = p_org order by b.is_main desc nulls last, b.id limit 1));
    perform public.fn_hr_nomina_asentar(v_s, f.ev, p_org, v_sede);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('colilla', x.id, 'falta', x.fact,
                    'rechazo', (select f2.reason || ': ' || coalesce(f2.detail, '') from public.journal_entry_failures f2
                                 where f2.organization_id = p_org and f2.fact_key = x.fact and f2.resolved_at is null
                                 order by f2.created_at desc limit 1))), '[]'::jsonb)
    into v_faltan
    from (select s.id, 'payroll_slip:' || s.id || ':' || ev as fact
            from public.payroll_slips s
            join public.payroll_runs r on r.id = s.payroll_run_id
            cross join lateral (values ('created'), ('paid')) v(ev)
           where r.payroll_period_id = pp.id and r.status = 'completed'
             and ((r.run_type = 'calculo' and r.is_final) or r.run_type = 'ajuste')
             and s.status in ('approved', 'paid')
             and (ev = 'created' or s.status = 'paid')) x
   where not exists (select 1 from public.journal_entries j where j.organization_id = p_org and j.fact_key = x.fact);
  if jsonb_array_length(v_faltan) > 0 then
    return jsonb_build_object('contabilizado', false, 'faltan', v_faltan);
  end if;
  update public.payroll_periods set status = 'closed', updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('contabilizado_por', p_actor)
   where id = pp.id;
  return jsonb_build_object('contabilizado', true);
end;
$$;
revoke execute on function public.fn_hr_nomina_contabilizar(uuid, integer, uuid) from public, anon, authenticated;

-- 7. Preparar el plan de cuentas de una empresa para la nómina ---------------------------------
-- Lista las cuentas que usa la nómina (catálogo efectivo de la empresa, variantes por área de sus empleados
-- activos, préstamos por tipo y nómina por pagar) y los terceros que faltan. Con p_aplicar crea las cuentas
-- que faltan con fn_puc_cuenta_para_asiento (subcuenta + auxiliar «01» de movimiento; la cuenta de arriba que
-- ya es de movimiento sigue siéndolo). Solo la plataforma (service role); la llama fn_hr_nomina_habilitar.
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
    ), areas as (
      select distinct public.fn_hr_nomina_area(e.id, v_hoy) as area
        from public.employments e
       where e.organization_id = p_org and e.status = 'active'
    )
    select distinct x.cta
      from (select b.cta from base b
            union select public.fn_hr_nomina_cuenta_area(b.cta, a.area) from base b cross join areas a) x
     where nullif(btrim(coalesce(x.cta, '')), '') is not null
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

-- Encender la nómina prepara el plan de cuentas de la empresa (las subcuentas del Contador).
create or replace function public.fn_hr_nomina_habilitar(p_org integer, p_encendida boolean, p_motivo text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_plan jsonb;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if p_encendida then
    v_plan := public.fn_hr_nomina_preparar_plan(p_org, true);
  end if;
  insert into public.hr_payroll_settings (organization_id, hr_payroll_enabled, enabled_at, reason, updated_at)
  values (p_org, p_encendida, case when p_encendida then now() end, p_motivo, now())
  on conflict (organization_id) do update
    set hr_payroll_enabled = excluded.hr_payroll_enabled,
        enabled_at = case when excluded.hr_payroll_enabled then now() else public.hr_payroll_settings.enabled_at end,
        reason = excluded.reason, updated_at = now();
  return jsonb_build_object('organization_id', p_org, 'hr_payroll_enabled', p_encendida, 'plan', v_plan);
end;
$$;
revoke execute on function public.fn_hr_nomina_habilitar(integer, boolean, text) from public, anon, authenticated;

-- 8. Captura del tercero en descuentos y embargos -------------------------------------------
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
  insert into public.hr_payroll_novelties (organization_id, employment_id, period_id, concept_code, amount, quantity, description,
                                           requested_by, tercero_nit, tercero_nombre)
  values (p_org, e.id, pp.id, v_codigo, nullif(p_datos->>'valor', '')::numeric, nullif(p_datos->>'cantidad', '')::numeric,
          nullif(btrim(p_datos->>'descripcion'), ''), p_actor,
          nullif(btrim(p_datos->>'tercero_nit'), ''), nullif(btrim(p_datos->>'tercero_nombre'), ''))
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

-- Completar la entidad de un descuento ya registrado (también en un período cerrado: no cambia el cálculo,
-- solo el tercero del asiento, que se reintenta al contabilizar).
create or replace function public.fn_hr_nomina_novedad_tercero(p_actor uuid, p_org integer, p_novedad uuid, p_nit text, p_nombre text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_nit, '')), '') is null or nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'tercero_incompleto: NIT y nombre son obligatorios' using errcode = '22023';
  end if;
  update public.hr_payroll_novelties
     set tercero_nit = btrim(p_nit), tercero_nombre = btrim(p_nombre)
   where id = p_novedad and organization_id = p_org;
  if not found then
    raise exception 'novedad_no_existe' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_novedad);
end;
$$;
revoke execute on function public.fn_hr_nomina_novedad_tercero(uuid, integer, uuid, text, text) from public, anon, authenticated;

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
                                        starts_on, ends_on, court_reference, beneficiary, beneficiary_doc, created_by)
    values (p_org, e.id, p_datos->>'tipo', (p_datos->>'recibido')::date, p_datos->>'modo', (p_datos->>'valor')::numeric,
            nullif(p_datos->>'total', '')::numeric, coalesce((p_datos->>'desde')::date, (p_datos->>'recibido')::date),
            nullif(p_datos->>'hasta', '')::date, nullif(btrim(p_datos->>'oficio'), ''), nullif(btrim(p_datos->>'beneficiario'), ''),
            nullif(btrim(p_datos->>'beneficiario_doc'), ''), p_actor)
    returning id into v_id;
  else
    -- El oficio, el demandante y su documento se pueden completar después (C3: tercero del asiento).
    update public.hr_garnishments
       set status = coalesce(p_datos->>'estado', status), ends_on = coalesce(nullif(p_datos->>'hasta', '')::date, ends_on),
           court_reference = coalesce(nullif(btrim(p_datos->>'oficio'), ''), court_reference),
           beneficiary = coalesce(nullif(btrim(p_datos->>'beneficiario'), ''), beneficiary),
           beneficiary_doc = coalesce(nullif(btrim(p_datos->>'beneficiario_doc'), ''), beneficiary_doc),
           updated_at = now()
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
