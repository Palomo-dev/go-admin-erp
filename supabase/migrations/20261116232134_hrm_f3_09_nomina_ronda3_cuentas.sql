-- RR. HH., fase 3 (nómina): ronda 3 del Contador (2026-11-16), parte contable.
-- Aditiva: dos tablas nuevas, funciones nuevas y CREATE OR REPLACE de fn_hr_nomina_asentar, fn_hr_nomina_preparar_plan y
-- fn_hr_nomina_habilitar. La nómina sigue apagada en todas las empresas.
-- Reversión: supabase/rollbacks/<mismo timestamp>_hrm_f3_09_nomina_ronda3_cuentas_rollback.sql
--
-- 1. Las líneas de gasto (5105, 5205, 7205) llevan al empleado como tercero.
-- 2. La línea de 2510 del fondo de cesantías conserva en su detalle el nombre y el documento del empleado.
-- 3. INCAPACIDAD_LABORAL va siempre a 138095 con la ARL de tercero (la paga la ARL desde el día 1), aunque el tramo
--    del parámetro incapacidad_tramos diga 'empleador' para el día 1.
-- 4. Subcuentas automáticas con las condiciones (a)–(d) del Contador: vista previa registrada
--    (hr_payroll_enablement_reviews), aprobada por escrito por la empresa y el Contador, y creación dentro de
--    fn_hr_nomina_habilitar. Terceros sin NIT bloquean el encendido.
-- 5. Ajuste anual de provisiones (C5) y bloqueo: sin él no se cierra ningún período del año siguiente.

-- 1. Asiento de una colilla del motor ---------------------------------------------------------------------
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
        if it.metadata->>'paga' in ('eps', 'arl', 'fondo_pensiones') or it.code = 'INCAPACIDAD_LABORAL' then
          -- C1: lo que paga la EPS, la ARL o el fondo no es gasto: cuenta por cobrar con la entidad (CTCP 411 de 2015).
          -- Ronda 3: la incapacidad de origen laboral la paga la ARL desde el día 1, diga lo que diga el tramo.
          v_cta := v_conceptos->'INCAPACIDAD_POR_COBRAR'->>'cuenta_debito';
          v_quien := case when it.code = 'INCAPACIDAD_LABORAL' then 'arl'
                          when it.metadata->>'paga' = 'fondo_pensiones' then 'afp' else it.metadata->>'paga' end;
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
        -- Ronda 3: la línea del fondo conserva en el detalle de quién son las cesantías.
        v_raw := v_raw || jsonb_build_object('cta', c->>'cuenta_credito', 'deb', greatest(-it.amount, 0), 'cre', greatest(it.amount, 0),
                                             'det', case when it.code = 'CESANTIAS_CONSIGNAR'
                                                         then it.name || ' · ' || coalesce(v_emp_nombre, 'empleado') || ' (' || coalesce(v_emp_nit, 'sin documento') || ')'
                                                         else it.name end,
                                             'quien', case when it.code = 'CESANTIAS_CONSIGNAR' then 'cesantias' else 'empleado' end,
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
      -- Ronda 3: las líneas de gasto (clases 5 y 7) llevan al empleado de tercero, además del centro de costo.
      if v_cuenta ~ '^[57]' then
        v_nit := v_emp_nit;
        v_nom := v_emp_nombre;
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
        || jsonb_build_object('cuenta', v_cuenta, 'deb', v_faltante, 'cre', 0, 'det', 'Faltante de provisión (' || x.cuenta || ')', 'nit', v_emp_nit, 'nombre', v_emp_nombre, 'consumo', false);
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

-- 2. C1 (ronda 3) · Subcuentas automáticas: vista previa registrada, aprobada y creada al encender -----------
-- Condiciones del Contador: (a) solo las que faltan, con código y nombre del PUC, bajo la cuenta de 4 dígitos que
-- ya existe y con su naturaleza; (b) nunca sobrescribir ni duplicar: si la empresa ya tiene la subcuenta, una
-- auxiliar de movimiento debajo o su propia cuenta en el concepto (fila de la empresa en hr_payroll_concepts), se
-- usa la suya; (c) antes de encender se muestra a la empresa y al Contador la lista y queda registro de quién y
-- cuándo; (d) se crean dentro de la aprobación escrita de encendido, no antes.
create table if not exists public.hr_payroll_enablement_reviews (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          integer not null references public.organizations(id) on delete cascade,
  status                   text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'aplicada', 'anulada')),
  plan                     jsonb not null,
  cuentas_a_crear          jsonb not null,
  huella                   text not null,
  preparada_por            text not null,
  preparada_at             timestamptz not null default now(),
  aprobada_empresa_por     text,
  aprobada_contador_por    text,
  referencia_aprobacion    text,
  aprobada_at              timestamptz,
  aplicada_at              timestamptz,
  resultado                jsonb
);
create index if not exists hr_payroll_enablement_reviews_org_idx on public.hr_payroll_enablement_reviews (organization_id, preparada_at desc);
comment on table public.hr_payroll_enablement_reviews is
  'Vista previa del encendido de la nómina por empresa: cuentas que se crearán en el plan y terceros que faltan. Registro de quién la preparó, quién la aprobó (empresa y Contador, con la referencia de la aprobación escrita) y cuándo se aplicó. Solo la plataforma escribe (service role); la empresa la lee con hr.payroll.view.';
alter table public.hr_payroll_enablement_reviews enable row level security;
revoke all on public.hr_payroll_enablement_reviews from anon;
revoke insert, update, delete, truncate on public.hr_payroll_enablement_reviews from authenticated;
drop policy if exists hr_payroll_enablement_reviews_select on public.hr_payroll_enablement_reviews;
create policy hr_payroll_enablement_reviews_select on public.hr_payroll_enablement_reviews
  for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')));

-- Lista las cuentas que usa la nómina y los terceros que faltan. Cada cuenta queda:
--   lista               ya hay cuenta de movimiento (la misma, su sucesora o una auxiliar suya);
--   crear               subcuenta PUC de 6 dígitos que falta y cuya cuenta de 4 dígitos existe;
--   creada              se creó en esta llamada (solo dentro de fn_hr_nomina_habilitar);
--   falta_cuenta_mayor  falta la cuenta de 4 dígitos: no se crea nada, la crea la empresa;
--   no_se_crea          código que no es subcuenta PUC (p. ej. una cuenta propia de la empresa que no existe).
-- p_aplicar = true solo dentro de fn_hr_nomina_habilitar (condición d).
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
  v_estado text;
begin
  if p_aplicar and coalesce(current_setting('app.nomina_habilitando', true), '') <> 'on' then
    raise exception 'plan_solo_al_encender: las cuentas se crean dentro de fn_hr_nomina_habilitar, con la vista previa aprobada' using errcode = '55000';
  end if;
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
    v_nombre := null;
    if v_mov is not null then
      v_estado := 'lista';
    elsif r.cta !~ '^[1-9][0-9]{5}$' then
      v_estado := 'no_se_crea';
    elsif exists (select 1 from public.chart_of_accounts a where a.organization_id = p_org and a.account_code = r.cta) then
      -- Existe pero sin movimiento ni auxiliar de movimiento: nunca se sobrescribe (b).
      v_estado := 'no_se_crea';
    elsif not exists (select 1 from public.chart_of_accounts a where a.organization_id = p_org and a.account_code = left(r.cta, 4)) then
      v_estado := 'falta_cuenta_mayor';
    else
      select k.nombre into v_nombre from public.puc_catalogo k where k.codigo = r.cta;
      -- 5205 y 7205 llevan las mismas subcuentas que 5105 (Decreto 2650).
      if v_nombre is null and r.cta ~ '^(5205|7205)' then
        select k.nombre into v_nombre from public.puc_catalogo k where k.codigo = '5105' || substr(r.cta, 5);
      end if;
      if v_nombre is null then
        v_estado := 'no_se_crea';
      elsif p_aplicar then
        -- Subcuenta de movimiento con el código y el nombre del PUC; la naturaleza sale de la clase.
        perform public.fn_puc_asegurar_cuenta(p_org, r.cta, v_nombre, true);
        v_mov := public.fn_hr_nomina_cuenta(p_org, r.cta);
        v_estado := case when v_mov is not null then 'creada' else 'no_se_crea' end;
      else
        v_estado := 'crear';
      end if;
    end if;
    v_cuentas := v_cuentas || jsonb_build_object('cuenta', r.cta, 'movimiento', v_mov, 'estado', v_estado,
                                                 'nombre', v_nombre, 'cuenta_mayor', left(r.cta, 4));
  end loop;

  -- C3: terceros que harían rechazar el asiento (empleados activos). Bloquean el encendido.
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
                            'cuentas_a_crear', coalesce((select jsonb_agg(z order by z->>'cuenta') from jsonb_array_elements(v_cuentas) z
                                                          where z->>'estado' in ('crear', 'creada')), '[]'::jsonb),
                            'faltan_cuentas', (select count(*) from jsonb_array_elements(v_cuentas) z
                                                where z->>'estado' in ('crear', 'falta_cuenta_mayor', 'no_se_crea')),
                            'bloqueos', (select count(*) from jsonb_array_elements(v_cuentas) z
                                          where z->>'estado' in ('falta_cuenta_mayor', 'no_se_crea')),
                            'terceros_incompletos', v_terceros);
end;
$$;
revoke execute on function public.fn_hr_nomina_preparar_plan(integer, boolean) from public, anon, authenticated;

-- Huella de la lista de cuentas a crear: la aprobación vale para esa lista exacta.
create or replace function public.fn_hr_nomina_plan_huella(p_cuentas jsonb)
returns text
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select md5(coalesce((select string_agg((z->>'cuenta') || '|' || coalesce(z->>'nombre', ''), ',' order by z->>'cuenta')
                         from jsonb_array_elements(p_cuentas) z), ''))
$$;

-- (c) La plataforma registra la vista previa (anula las pendientes anteriores de la empresa).
create or replace function public.fn_hr_nomina_plan_vista_previa(p_org integer, p_preparada_por text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_plan jsonb;
  v_id uuid;
begin
  if nullif(btrim(coalesce(p_preparada_por, '')), '') is null then
    raise exception 'preparada_por_obligatorio' using errcode = '22023';
  end if;
  v_plan := public.fn_hr_nomina_preparar_plan(p_org, false);
  update public.hr_payroll_enablement_reviews set status = 'anulada'
   where organization_id = p_org and status in ('pendiente', 'aprobada');
  insert into public.hr_payroll_enablement_reviews (organization_id, plan, cuentas_a_crear, huella, preparada_por)
  values (p_org, v_plan, v_plan->'cuentas_a_crear', public.fn_hr_nomina_plan_huella(v_plan->'cuentas_a_crear'), btrim(p_preparada_por))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'cuentas_a_crear', v_plan->'cuentas_a_crear', 'bloqueos', v_plan->'bloqueos',
                            'terceros_incompletos', v_plan->'terceros_incompletos');
end;
$$;
revoke execute on function public.fn_hr_nomina_plan_vista_previa(integer, text) from public, anon, authenticated;

-- (c) Aprobación escrita de la empresa y del Contador sobre esa vista previa.
create or replace function public.fn_hr_nomina_plan_aprobar(p_vista uuid, p_empresa_por text, p_contador_por text, p_referencia text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_empresa_por, '')), '') is null or nullif(btrim(coalesce(p_contador_por, '')), '') is null
     or nullif(btrim(coalesce(p_referencia, '')), '') is null then
    raise exception 'aprobacion_incompleta: la empresa, el Contador y la referencia de la aprobación escrita son obligatorios' using errcode = '22023';
  end if;
  update public.hr_payroll_enablement_reviews
     set status = 'aprobada', aprobada_empresa_por = btrim(p_empresa_por), aprobada_contador_por = btrim(p_contador_por),
         referencia_aprobacion = btrim(p_referencia), aprobada_at = now()
   where id = p_vista and status = 'pendiente';
  if not found then
    raise exception 'vista_previa_no_pendiente' using errcode = '55000';
  end if;
  return jsonb_build_object('id', p_vista, 'status', 'aprobada');
end;
$$;
revoke execute on function public.fn_hr_nomina_plan_aprobar(uuid, text, text, text) from public, anon, authenticated;

-- (d) Encender exige la vista previa aprobada y vigente (misma lista de cuentas), cero cuentas que no se puedan
-- crear y cero terceros sin NIT (bloqueante, §5 de ADR-003). Crea las cuentas y enciende en la misma transacción.
create or replace function public.fn_hr_nomina_habilitar(p_org integer, p_encendida boolean, p_motivo text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_vista public.hr_payroll_enablement_reviews;
  v_actual jsonb;
  v_plan jsonb;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if p_encendida then
    select * into v_vista from public.hr_payroll_enablement_reviews
     where organization_id = p_org and status = 'aprobada' order by aprobada_at desc limit 1;
    if not found then
      raise exception 'vista_previa_sin_aprobar: registra la vista previa (fn_hr_nomina_plan_vista_previa) y su aprobación escrita (fn_hr_nomina_plan_aprobar)' using errcode = '55000';
    end if;
    v_actual := public.fn_hr_nomina_preparar_plan(p_org, false);
    if public.fn_hr_nomina_plan_huella(v_actual->'cuentas_a_crear') <> v_vista.huella then
      raise exception 'vista_previa_desactualizada: la lista de cuentas a crear cambió desde la aprobación' using errcode = '55000';
    end if;
    if (v_actual->>'bloqueos')::integer > 0 then
      raise exception 'cuentas_sin_crear: % cuenta(s) no se pueden crear solas (falta la cuenta mayor o no es subcuenta PUC)', v_actual->>'bloqueos' using errcode = '55000';
    end if;
    if jsonb_array_length(v_actual->'terceros_incompletos') > 0 then
      raise exception 'terceros_incompletos: % tercero(s) sin entidad o sin NIT', jsonb_array_length(v_actual->'terceros_incompletos') using errcode = '55000';
    end if;
    perform set_config('app.nomina_habilitando', 'on', true);
    v_plan := public.fn_hr_nomina_preparar_plan(p_org, true);
    perform set_config('app.nomina_habilitando', '', true);
    update public.hr_payroll_enablement_reviews set status = 'aplicada', aplicada_at = now(), resultado = v_plan where id = v_vista.id;
  end if;
  insert into public.hr_payroll_settings (organization_id, hr_payroll_enabled, enabled_at, reason, updated_at)
  values (p_org, p_encendida, case when p_encendida then now() end, p_motivo, now())
  on conflict (organization_id) do update
    set hr_payroll_enabled = excluded.hr_payroll_enabled,
        enabled_at = case when excluded.hr_payroll_enabled then now() else public.hr_payroll_settings.enabled_at end,
        reason = excluded.reason, updated_at = now();
  return jsonb_build_object('organization_id', p_org, 'hr_payroll_enabled', p_encendida, 'vista_previa', v_vista.id,
                            'cuentas_creadas', coalesce(v_plan->'cuentas_a_crear', '[]'::jsonb));
end;
$$;
revoke execute on function public.fn_hr_nomina_habilitar(integer, boolean, text) from public, anon, authenticated;

-- 3. C5 (ronda 3) · Ajuste anual de las provisiones al valor real consolidado por empleado ------------------
-- Al 31-dic, después de liquidar el año (cesantías consignadas al fondo, intereses y prima de diciembre pagados),
-- el valor real de 2510, 2515 y 2520 del empleado es 0: lo que quede con su NIT es provisión de más (o de menos)
-- y vuelve al gasto. 2525 se ajusta al valor de las vacaciones pendientes que calcula el motor (p_vacaciones:
-- {vinculo_id: valor}); es obligatorio para todo vínculo activo o con saldo. Un solo asiento por empresa y año,
-- fecha 31-dic, sede principal, una línea por empleado y cuenta (tercero el empleado; gasto por su área).
create table if not exists public.hr_payroll_year_adjustments (
  organization_id   integer not null references public.organizations(id) on delete cascade,
  anio              integer not null,
  journal_entry_id  integer references public.journal_entries(id),
  detalle           jsonb not null default '[]'::jsonb,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  primary key (organization_id, anio)
);
comment on table public.hr_payroll_year_adjustments is
  'Ajuste anual de las provisiones de nómina (2510–2525) al valor real consolidado por empleado al 31-dic (Contador, C5). Sin él no se cierra ningún período del año siguiente de una empresa con la nómina encendida.';
alter table public.hr_payroll_year_adjustments enable row level security;
revoke all on public.hr_payroll_year_adjustments from anon;
revoke insert, update, delete, truncate on public.hr_payroll_year_adjustments from authenticated;
drop policy if exists hr_payroll_year_adjustments_select on public.hr_payroll_year_adjustments;
create policy hr_payroll_year_adjustments_select on public.hr_payroll_year_adjustments
  for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')));

create or replace function public.fn_hr_nomina_ajuste_anual_provisiones(p_actor uuid, p_org integer, p_anio integer, p_vacaciones jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_corte date := make_date(p_anio, 12, 31);
  v_tz text := public.fn_timezone_for(p_org, null);
  v_fecha timestamptz := (make_date(p_anio, 12, 31) + time '23:00') at time zone public.fn_timezone_for(p_org, null);
  v_conceptos jsonb := public.fn_hr_nomina_conceptos(p_org);
  v_sede integer;
  v_lineas jsonb := '[]'::jsonb;
  v_detalle jsonb := '[]'::jsonb;
  k record;
  e record;
  v_pasivo text;
  v_gasto text;
  v_saldo numeric;
  v_real numeric;
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
  -- El año tiene que estar liquidado: el período de cesantías cerrado y ningún período del año sin cerrar.
  if not exists (select 1 from public.payroll_periods p where p.organization_id = p_org and p.kind = 'cesantias'
                    and extract(year from p.period_end) = p_anio and p.status in ('approved', 'paid', 'closed')) then
    raise exception 'falta_periodo_cesantias: cierra primero el período de cesantías de %', p_anio using errcode = '55000';
  end if;
  if exists (select 1 from public.payroll_periods p where p.organization_id = p_org and extract(year from p.period_end) = p_anio
                and p.status in ('open', 'calculating', 'calculated', 'reviewing')) then
    raise exception 'periodos_abiertos: hay períodos de % sin cerrar', p_anio using errcode = '55000';
  end if;
  if not public.fn_is_period_open(p_org, v_corte) then
    raise exception 'periodo_contable_cerrado' using errcode = '55000';
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
         and jl.tercero_nit = e.nit and je.entry_date <= v_fecha;
      if k.codigo = 'PROVISION_VACACIONES' then
        if e.status = 'active' or v_saldo <> 0 then
          if p_vacaciones is null or not (p_vacaciones ? e.id::text) then
            raise exception 'falta_valor_vacaciones: el vínculo % no trae el valor de sus vacaciones pendientes', e.id using errcode = '22023';
          end if;
          v_real := round((p_vacaciones->>e.id::text)::numeric);
        else
          v_real := 0;
        end if;
      else
        v_real := 0;
      end if;
      v_dif := v_real - v_saldo;
      continue when v_dif = 0;
      v_gasto := public.fn_hr_nomina_cuenta(p_org, public.fn_hr_nomina_cuenta_area(k.c->>'cuenta_debito', public.fn_hr_nomina_area(e.id, v_corte)));
      if v_gasto is null then
        raise exception 'cuenta_no_es_de_movimiento: gasto de % para el vínculo %', k.codigo, e.id using errcode = '55000';
      end if;
      -- Más provisión: gasto contra pasivo. Provisión de más: pasivo contra gasto (mismo año).
      v_lineas := v_lineas
        || jsonb_build_object('cuenta', v_gasto, 'debito', greatest(v_dif, 0), 'credito', greatest(-v_dif, 0), 'nit', e.nit, 'nombre', e.nombre,
                              'cc', public.fn_hr_nomina_centro(e.id, v_corte), 'detalle', 'Ajuste anual ' || k.codigo)
        || jsonb_build_object('cuenta', v_pasivo, 'debito', greatest(-v_dif, 0), 'credito', greatest(v_dif, 0), 'nit', e.nit, 'nombre', e.nombre,
                              'cc', null, 'detalle', 'Ajuste anual ' || k.codigo);
      v_detalle := v_detalle || jsonb_build_object('vinculo_id', e.id, 'concepto', k.codigo, 'saldo', v_saldo, 'real', v_real, 'ajuste', v_dif);
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
      values (v_entry, p_org, l.cuenta, l.detalle, l.debito, l.credito, l.cc, l.nit, l.nombre);
    end loop;
  end if;
  insert into public.hr_payroll_year_adjustments (organization_id, anio, journal_entry_id, detalle, created_by)
  values (p_org, p_anio, v_entry, v_detalle, p_actor);
  return jsonb_build_object('anio', p_anio, 'asiento', v_entry, 'ajustes', v_detalle);
end;
$$;
revoke execute on function public.fn_hr_nomina_ajuste_anual_provisiones(uuid, integer, integer, jsonb) from public, anon, authenticated;

-- Sin el ajuste anual de un año con nómina cerrada, no se cierra ningún período que termine el año siguiente.
create or replace function public.fn_hr_nomina_exigir_ajuste_anual()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_anio integer;
begin
  if new.status = 'approved' and old.status is distinct from new.status
     and public.fn_hr_nomina_habilitada(new.organization_id) then
    v_anio := extract(year from new.period_end)::integer - 1;
    if exists (select 1 from public.payroll_periods p
                where p.organization_id = new.organization_id and p.id <> new.id
                  and extract(year from p.period_end) = v_anio
                  and p.status in ('approved', 'paid', 'closed') and p.metadata ? 'run_vigente')
       and not exists (select 1 from public.hr_payroll_year_adjustments a where a.organization_id = new.organization_id and a.anio = v_anio) then
      raise exception 'ajuste_anual_pendiente: registra el ajuste de provisiones de % (fn_hr_nomina_ajuste_anual_provisiones) antes de cerrar este período', v_anio
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_nomina_exigir_ajuste_anual() from public, anon, authenticated;
drop trigger if exists trg_hr_nomina_exigir_ajuste_anual on public.payroll_periods;
create trigger trg_hr_nomina_exigir_ajuste_anual before update of status on public.payroll_periods
  for each row execute function public.fn_hr_nomina_exigir_ajuste_anual();
