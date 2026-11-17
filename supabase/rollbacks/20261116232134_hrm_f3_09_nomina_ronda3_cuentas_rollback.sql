-- Reversión de 20261116232134_hrm_f3_09_nomina_ronda3_cuentas.
-- Devuelve fn_hr_nomina_asentar y fn_hr_nomina_habilitar a 20261116223758_hrm_f3_05_nomina_cuentas_contador y
-- fn_hr_nomina_preparar_plan a 20261116224159_hrm_f3_07_nomina_preparar_plan_areas; borra el bloqueo del cierre sin
-- ajuste anual, las funciones nuevas y las tablas hr_payroll_enablement_reviews y hr_payroll_year_adjustments.
-- ADVERTENCIA: no revierte datos. Los asientos publicados (de colillas o de ajuste anual) quedan como están y se
-- corrigen con contra-asiento; las cuentas creadas al encender se quedan en los planes. Borrar las dos tablas
-- borra el registro de las vistas previas, sus aprobaciones y los ajustes anuales: expórtalas antes.

-- 1. Bloqueo del cierre sin ajuste anual -------------------------------------------------------------------
drop trigger if exists trg_hr_nomina_exigir_ajuste_anual on public.payroll_periods;
drop function if exists public.fn_hr_nomina_exigir_ajuste_anual();
drop function if exists public.fn_hr_nomina_ajuste_anual_provisiones(uuid, integer, integer, jsonb);

-- 2. Funciones anteriores -----------------------------------------------------------------------------------
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

-- 3. Vista previa y aprobación del encendido ----------------------------------------------------------------
drop function if exists public.fn_hr_nomina_plan_aprobar(uuid, text, text, text);
drop function if exists public.fn_hr_nomina_plan_vista_previa(integer, text);
drop function if exists public.fn_hr_nomina_plan_huella(jsonb);

-- 4. Tablas nuevas ------------------------------------------------------------------------------------------
drop table if exists public.hr_payroll_year_adjustments;
drop table if exists public.hr_payroll_enablement_reviews;
