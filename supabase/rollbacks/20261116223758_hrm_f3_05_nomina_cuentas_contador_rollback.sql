-- Reversión de 20261116223758_hrm_f3_05_nomina_cuentas_contador.
-- Restaura las cuentas de la semilla de plataforma de 20261116072851_hrm_f3_01_nomina_modelo, quita los conceptos
-- nuevos de plataforma (APORTE_COOPERATIVA, FONDO_EMPLEADOS, CUOTA_SINDICAL, INCAPACIDAD_POR_COBRAR), borra las
-- funciones nuevas y devuelve las anteriores: fn_hr_nomina_asentar, fn_auto_journal_payroll_period y
-- fn_hr_nomina_contabilizar (20261116074847), fn_hr_nomina_habilitar (20261116072851), fn_hr_nomina_novedad_registrar
-- (20261116073811) y fn_hr_nomina_embargo_guardar (20261116223357_hrm_f3_05_nomina_ronda_contador, la versión con P20).
-- Antes, revierte 20261116224159_hrm_f3_07 y 20261116223844_hrm_f3_06.
-- ADVERTENCIA: no revierte datos. Los asientos publicados quedan como están (se corrigen con contra-asiento). Las
-- cuentas que fn_hr_nomina_preparar_plan haya creado en los planes de las empresas se quedan. Las columnas
-- hr_payroll_novelties.tercero_nit / tercero_nombre y hr_garnishments.beneficiary_doc se borran con lo que tengan.
-- Si una novedad o un ítem usa un concepto nuevo, borrar su fila de plataforma falla a propósito (revisar antes).

-- 1. Catálogo de plataforma: cuentas y código DIAN de la semilla original -----------------
update public.hr_payroll_concepts c
   set debit_account = v.debit_account, credit_account = v.credit_account, dian_code = v.dian_code, updated_at = now()
  from (values
  ('SALARIO', '5105', null, 'Basico'),
  ('SALARIO_INTEGRAL', '5105', null, 'Basico'),
  ('SALARIO_HORAS', '5105', null, 'Basico'),
  ('DESCUENTO_TIEMPO', '5105', null, 'Basico'),
  ('RECARGO_NOCTURNO', '5105', null, 'HRN'),
  ('RECARGO_DOMINICAL', '5105', null, 'HRDDF'),
  ('RECARGO_DOMINICAL_NOCTURNO', '5105', null, 'HRNDF'),
  ('HORA_EXTRA_DIURNA', '5105', null, 'HED'),
  ('HORA_EXTRA_NOCTURNA', '5105', null, 'HEN'),
  ('HORA_EXTRA_DOMINICAL_DIURNA', '5105', null, 'HEDDF'),
  ('HORA_EXTRA_DOMINICAL_NOCTURNA', '5105', null, 'HENDF'),
  ('AUXILIO_TRANSPORTE', '5105', null, 'AuxilioTransporte'),
  ('COMISIONES', '5105', null, 'Comision'),
  ('BONIFICACION_SALARIAL', '5105', null, 'BonificacionS'),
  ('BONIFICACION_NO_SALARIAL', '5105', null, 'BonificacionNS'),
  ('AUXILIO_NO_SALARIAL', '5105', null, 'AuxilioNS'),
  ('RETROACTIVO', '5105', null, 'Reintegro'),
  ('VACACIONES_DISFRUTADAS', '2525', null, 'VacacionesComunes'),
  ('VACACIONES_COMPENSADAS', '2525', null, 'VacacionesCompensadas'),
  ('INCAPACIDAD_COMUN', '5105', null, 'Incapacidad'),
  ('INCAPACIDAD_LABORAL', '5105', null, 'Incapacidad'),
  ('LICENCIA_MATERNIDAD', '5105', null, 'LicenciaMP'),
  ('LICENCIA_PATERNIDAD', '5105', null, 'LicenciaMP'),
  ('LICENCIA_REMUNERADA', '5105', null, 'LicenciaR'),
  ('PRIMA_SERVICIOS', '2520', null, 'Primas'),
  ('INTERESES_CESANTIAS', '2515', null, 'Cesantias'),
  ('SALUD_EMPLEADO', null, '2370', 'Salud'),
  ('PENSION_EMPLEADO', null, '2370', 'FondoPension'),
  ('FONDO_SOLIDARIDAD', null, '2370', 'FondoSP'),
  ('RETENCION_FUENTE', null, '23650501', 'RetencionFuente'),
  ('EMBARGO_ALIMENTOS', null, '2380', 'EmbargoFiscal'),
  ('EMBARGO_COOPERATIVA', null, '2380', 'EmbargoFiscal'),
  ('EMBARGO_ORDINARIO', null, '2380', 'EmbargoFiscal'),
  ('PRESTAMO', null, '1365', 'Deuda'),
  ('LIBRANZA', null, '2380', 'Libranza'),
  ('OTRO_DESCUENTO', null, '2380', 'OtraDeduccion'),
  ('SALUD_EMPLEADOR', '5105', '2370', null),
  ('PENSION_EMPLEADOR', '5105', '2370', null),
  ('ARL', '5105', '2370', null),
  ('CAJA_COMPENSACION', '5105', '2370', null),
  ('ICBF', '5105', '2370', null),
  ('SENA', '5105', '2370', null),
  ('PROVISION_CESANTIAS', '5105', '2510', null),
  ('PROVISION_INTERESES', '5105', '2515', null),
  ('PROVISION_PRIMA', '5105', '2520', null),
  ('PROVISION_VACACIONES', '5105', '2525', null),
  ('CESANTIAS_CONSIGNAR', '2510', '2380', 'Cesantias')
) as v(code, debit_account, credit_account, dian_code)
 where c.organization_id is null and c.code = v.code;

delete from public.hr_payroll_concepts
 where organization_id is null and code in ('APORTE_COOPERATIVA', 'FONDO_EMPLEADOS', 'CUOTA_SINDICAL', 'INCAPACIDAD_POR_COBRAR')
   and not exists (select 1 from public.hr_payroll_novelties n where n.concept_code = hr_payroll_concepts.code)
   and not exists (select 1 from public.payroll_items i where i.code = hr_payroll_concepts.code);

-- 2. Funciones anteriores -------------------------------------------------------------------
create or replace function public.fn_hr_nomina_asentar(p_slip public.payroll_slips, p_evento text, p_org integer, p_sede integer)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_fact text := 'payroll_slip:' || p_slip.id || ':' || p_evento;
  v_source_id text := p_slip.id || ':' || p_evento;
  v_conceptos jsonb := public.fn_hr_nomina_conceptos(p_org);
  v_por_pagar text := coalesce(public.fn_cuenta_por_clave(p_org, p_sede, 'nomina_por_pagar'), '25050501');
  v_tz text := public.fn_timezone_for(p_org, p_sede);
  v_fecha timestamptz;
  v_pago public.payments;
  v_banco text;
  v_lineas jsonb := '[]'::jsonb;
  v_mala text;
  v_deb numeric;
  v_cre numeric;
  v_entry integer;
  v_cc uuid;
  v_periodo public.payroll_periods;
  l record;
begin
  if exists (select 1 from public.journal_entries e where e.organization_id = p_org and e.fact_key = v_fact) then
    return;
  end if;
  select pp.* into v_periodo from public.payroll_periods pp join public.payroll_runs r on r.payroll_period_id = pp.id where r.id = p_slip.payroll_run_id;
  select e.cost_center_id into v_cc from public.employments e where e.id = p_slip.employment_id;

  if p_evento = 'created' then
    v_fecha := (v_periodo.period_end + time '12:00') at time zone v_tz;
    select coalesce(jsonb_agg(jsonb_build_object('cuenta', z.cuenta, 'debito', z.debito, 'credito', z.credito, 'detalle', z.detalle)), '[]'::jsonb)
      into v_lineas
      from (
        select y.cuenta, sum(y.debito) as debito, sum(y.credito) as credito, min(y.detalle) as detalle
          from (
            -- Devengados e informativos con cuenta débito; los negativos van al crédito.
            select v_conceptos->i.code->>'cuenta_debito' as cuenta,
                   greatest(i.amount, 0) as debito, greatest(-i.amount, 0) as credito, i.name as detalle
              from public.payroll_items i
             where i.payroll_slip_id = p_slip.id and i.item_type in ('earning', 'employer_cost', 'info')
            union all
            select v_conceptos->i.code->>'cuenta_credito',
                   greatest(-i.amount, 0), greatest(i.amount, 0), i.name
              from public.payroll_items i
             where i.payroll_slip_id = p_slip.id and i.item_type in ('deduction', 'employer_cost', 'info')
            union all
            select v_por_pagar, greatest(-p_slip.net_pay, 0), greatest(p_slip.net_pay, 0), 'Nómina por pagar'
          ) y
         group by y.cuenta) z
     where z.debito <> 0 or z.credito <> 0;
  else
    select * into v_pago from public.payments where id = p_slip.payment_id;
    v_fecha := coalesce(v_pago.payment_date, p_slip.paid_at, now());
    v_banco := coalesce(public.fn_money_account_code_pago(p_org, p_sede, coalesce(v_pago.method, 'transfer'), v_pago.bank_account_id),
                        (select b.account_code from public.bank_accounts b where b.id = v_pago.bank_account_id), '1110');
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta', v_por_pagar, 'debito', p_slip.net_pay, 'credito', 0, 'detalle', 'Pago de nómina'),
      jsonb_build_object('cuenta', v_banco, 'debito', 0, 'credito', p_slip.net_pay, 'detalle', 'Pago de nómina'));
  end if;

  select x->>'cuenta' into v_mala from jsonb_array_elements(v_lineas) x
   where x->>'cuenta' is null or not exists (
     select 1 from public.chart_of_accounts a
      where a.organization_id = p_org and a.account_code = x->>'cuenta' and a.es_movimiento is true and coalesce(a.is_active, true))
   limit 1;
  if found then
    perform public.fn_log_journal_failure(p_org, p_sede, v_fecha, 'payroll_slips', v_source_id, v_fact, null, null, p_slip.net_pay,
      'cuenta_no_es_de_movimiento', 'La cuenta ' || coalesce(v_mala, '(sin cuenta en el concepto)') || ' no existe o es de título');
    return;
  end if;
  select coalesce(sum((x->>'debito')::numeric), 0), coalesce(sum((x->>'credito')::numeric), 0) into v_deb, v_cre
    from jsonb_array_elements(v_lineas) x;
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
  for l in select x->>'cuenta' as cuenta, (x->>'debito')::numeric as debito, (x->>'credito')::numeric as credito, x->>'detalle' as detalle
             from jsonb_array_elements(v_lineas) x loop
    -- Una cuenta con débito y crédito en el mismo asiento queda en dos líneas.
    if l.debito > 0 then
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry, p_org, l.cuenta, l.detalle, l.debito, 0, case when l.cuenta like '5%' or l.cuenta like '7%' then v_cc end);
    end if;
    if l.credito > 0 then
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry, p_org, l.cuenta, l.detalle, 0, l.credito, null);
    end if;
  end loop;
end;
$$;
revoke execute on function public.fn_hr_nomina_asentar(public.payroll_slips, text, integer, integer) from public, anon, authenticated;

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
      -- Las colillas ya devengaron este costo. Devengarlo aquí lo contaría dos veces.
      if v_event_type = 'created' then
        return new;
      end if;
      -- Pagar aportes y provisiones contra 2370 no cuadra con un devengo que abona nómina
      -- por pagar. Queda a la vista hasta que el Contador defina el destino.
      perform public.fn_log_journal_failure(new.organization_id, v_branch_id, v_fecha, 'payroll_periods',
        new.id::text || ':paid', 'payroll_period:' || new.id::text || ':paid', null, null, v_amount,
        'criterio_contador', 'Pago de aportes y provisiones del periodo sin destino contable definido');
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

create or replace function public.fn_hr_nomina_contabilizar(p_actor uuid, p_org integer, p_period uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_faltan jsonb;
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
  select coalesce(jsonb_agg(jsonb_build_object('colilla', x.id, 'falta', x.fact,
                    'rechazo', (select f.reason || ': ' || coalesce(f.detail, '') from public.journal_entry_failures f
                                 where f.organization_id = p_org and f.fact_key = x.fact and f.resolved_at is null
                                 order by f.created_at desc limit 1))), '[]'::jsonb)
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

create or replace function public.fn_hr_nomina_habilitar(p_org integer, p_encendida boolean, p_motivo text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  insert into public.hr_payroll_settings (organization_id, hr_payroll_enabled, enabled_at, reason, updated_at)
  values (p_org, p_encendida, case when p_encendida then now() end, p_motivo, now())
  on conflict (organization_id) do update
    set hr_payroll_enabled = excluded.hr_payroll_enabled,
        enabled_at = case when excluded.hr_payroll_enabled then now() else public.hr_payroll_settings.enabled_at end,
        reason = excluded.reason, updated_at = now();
  return jsonb_build_object('organization_id', p_org, 'hr_payroll_enabled', p_encendida);
end;
$$;
revoke execute on function public.fn_hr_nomina_habilitar(integer, boolean, text) from public, anon, authenticated;

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

create or replace function public.fn_hr_nomina_embargo_guardar(p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  v_id uuid := nullif(p_datos->>'id', '')::uuid;
  v_prest boolean := coalesce((p_datos->>'incluye_prestaciones')::boolean, false);
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
  -- Solo un oficio de alimentos o de cooperativa puede incluir las prestaciones (CST 344; P20).
  if v_prest and coalesce(p_datos->>'tipo', '') not in ('alimentos', 'cooperativa') then
    raise exception 'embargo_prestaciones_solo_alimentos_o_cooperativa' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.hr_garnishments (organization_id, employment_id, kind, received_on, mode, value, total_amount,
                                        starts_on, ends_on, court_reference, beneficiary, base_incluye_prestaciones, created_by)
    values (p_org, e.id, p_datos->>'tipo', (p_datos->>'recibido')::date, p_datos->>'modo', (p_datos->>'valor')::numeric,
            nullif(p_datos->>'total', '')::numeric, coalesce((p_datos->>'desde')::date, (p_datos->>'recibido')::date),
            nullif(p_datos->>'hasta', '')::date, nullif(btrim(p_datos->>'oficio'), ''), nullif(btrim(p_datos->>'beneficiario'), ''), v_prest, p_actor)
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

-- 3. Funciones nuevas -----------------------------------------------------------------------
drop function if exists public.fn_hr_nomina_novedad_tercero(uuid, integer, uuid, text, text);
drop function if exists public.fn_hr_nomina_preparar_plan(integer, boolean);
drop function if exists public.fn_hr_nomina_tercero(uuid, text, date);
drop function if exists public.fn_hr_nomina_area(uuid, date);
drop function if exists public.fn_hr_nomina_centro(uuid, date);
drop function if exists public.fn_hr_nomina_cuenta_area(text, text);
drop function if exists public.fn_hr_nomina_cuenta(integer, text, boolean);

-- 4. Columnas nuevas ------------------------------------------------------------------------
alter table public.hr_payroll_novelties drop column if exists tercero_nit;
alter table public.hr_payroll_novelties drop column if exists tercero_nombre;
alter table public.hr_garnishments drop column if exists beneficiary_doc;
