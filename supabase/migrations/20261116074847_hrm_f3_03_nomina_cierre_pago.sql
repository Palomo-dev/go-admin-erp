-- RR. HH., fase 3 (nómina): revisión, cierre, pago, contabilización, ajustes, archivo del banco y colillas del empleado.
-- ADR-003 §4 a §7. Con hr_payroll_enabled = false solo se preliquida: cerrar, pagar y ajustar responden 55000.
-- Reversión: el archivo homónimo en supabase/rollbacks/.

-- 1. Consecuencias del motor de aprobaciones: novedades de nómina y revisión del período ---
create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
  v_ev uuid;
  v_estado text;
  v_nov public.hr_attendance_novelties;
begin
  select * into v_inst from public.hr_approval_instances where id = p_inst;
  if not found or v_inst.status = 'pendiente' then return; end if;
  v_estado := case v_inst.status when 'aprobada' then 'aprobado' when 'rechazada' then 'rechazado' else 'anulado' end;
  select s.decided_by into v_ultimo from public.hr_approval_steps s
   where s.instance_id = p_inst and s.status in ('aprobado','rechazado')
   order by s.step_order desc limit 1;
  if v_inst.subject_table = 'hr_employment_events' then
    -- Todos los eventos de la solicitud (cargo + salario enlazados): juntos.
    update public.hr_employment_events ev
       set status = v_estado,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else ev.approved_by end,
           approved_at = case when v_inst.status = 'aprobada' then now() else ev.approved_at end
     where ev.approval_instance_id = p_inst and ev.status = 'pendiente';
    if v_inst.status = 'aprobada' then
      for v_ev in select ev.id from public.hr_employment_events ev where ev.approval_instance_id = p_inst order by ev.created_at loop
        perform public.fn_hr_aplicar_evento(v_ev);
      end loop;
    end if;
  elsif v_inst.subject_table = 'hr_bank_account_requests' then
    update public.hr_bank_account_requests set status = v_estado
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'pendiente';
    if v_inst.status = 'aprobada' then
      perform public.fn_hr_banco_aplicar_solicitud(v_inst.subject_id);
    end if;
  elsif v_inst.subject_table = 'hr_attendance_novelties' then
    -- ADR-002 §4: horas extra se pagan; tardanza, salida o ausencia quedan justificadas; el cambio de turno se aplica.
    update public.hr_attendance_novelties n
       set status = case v_inst.status when 'aprobada' then 'aprobada' when 'rechazada' then 'rechazada' else 'anulada' end,
           decided_at = now()
     where n.id = v_inst.subject_id and n.approval_instance_id = p_inst and n.status = 'pendiente'
     returning * into v_nov;
    if v_nov.id is not null and v_nov.kind = 'cambio_turno' and v_inst.status = 'aprobada' then
      perform public.fn_hr_cambio_turno_aplicar(v_nov.id, v_ultimo);
    end if;
  elsif v_inst.subject_table = 'timesheet_adjustments' then
    -- Ajuste de marca (Figma 20.10.6): aprobado, se agrega la marca manual con la hora pedida.
    update public.timesheet_adjustments a
       set status = case v_inst.status when 'aprobada' then 'approved' else 'rejected' end,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else a.approved_by end,
           approved_at = now()
     where a.id = v_inst.subject_id and a.approval_instance_id = p_inst and a.status = 'pending';
    if v_inst.status = 'aprobada' then
      -- Sin sesión (service role) se aplica ya; con sesión lo aplica la ruta o el job.
      perform public.fn_hr_ajustes_aplicar_interno(v_inst.organization_id);
    end if;
  elsif v_inst.subject_table = 'leave_requests' then
    -- ADR-002 §5 y §6: vacaciones, licencias e incapacidades.
    update public.leave_requests
       set status = case v_inst.status when 'aprobada' then 'approved' when 'rechazada' then 'rejected' else 'cancelled' end,
           reviewed_by = v_ultimo, reviewed_at = now()
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'requested';
  elsif v_inst.subject_table = 'hr_payroll_novelties' then
    -- ADR-003 §4: la novedad aprobada entra a la próxima preliquidación.
    update public.hr_payroll_novelties
       set status = case v_inst.status when 'aprobada' then 'aprobada' when 'rechazada' then 'rechazada' else 'anulada' end,
           decided_at = now()
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'pendiente';
  elsif v_inst.subject_table = 'payroll_periods' then
    -- ADR-003 §4: la revisión aprobada deja el período listo para cerrar; rechazada, vuelve a preliquidado.
    -- Cerrar sigue siendo un paso explícito (fn_hr_nomina_cerrar): la decisión no mueve dinero ni asientos.
    update public.payroll_periods
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('revision', v_estado, 'revisado_por', v_ultimo),
           status = case when v_inst.status = 'aprobada' then status else 'calculated' end,
           updated_at = now()
     where id = v_inst.subject_id and status = 'reviewing' and metadata->>'aprobacion_id' = p_inst::text;
  end if;
end;
$function$;

-- 2. Qué impide cerrar un período -------------------------------------------------------
create or replace function public.fn_hr_nomina_bloqueos(p_org integer, p_period uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_run public.payroll_runs;
  v_out jsonb := '[]'::jsonb;
  v_n integer;
  v_inst public.hr_approval_instances;
  v_falta text[];
begin
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  select * into v_run from public.payroll_runs r
   where r.payroll_period_id = pp.id and r.run_type = 'calculo' and r.status = 'completed' and r.superseded_by is null
   order by r.run_number desc limit 1;
  if v_run.id is null then
    v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'sin_preliquidacion'));
  else
    v_out := v_out || coalesce((select jsonb_agg(a) from jsonb_array_elements(v_run.alerts) a where a->>'severidad' = 'bloqueo'), '[]'::jsonb);
    if v_run.engine_version is null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'calculo_sin_motor'));
    end if;
  end if;
  select count(*) into v_n from public.hr_payroll_novelties n where n.period_id = pp.id and n.status = 'pendiente';
  if v_n > 0 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'novedades_nomina_pendientes', 'cantidad', v_n));
  end if;
  -- Novedades aprobadas después de la preliquidación: hay que recalcular.
  select count(*) into v_n from public.hr_payroll_novelties n
   where n.period_id = pp.id and n.status in ('aprobada', 'anulada') and n.decided_at > coalesce(v_run.executed_at, '-infinity'::timestamptz);
  if v_n > 0 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'novedades_despues_del_calculo', 'cantidad', v_n));
  end if;
  if pp.kind = 'ordinaria' then
    select count(*) into v_n from public.hr_attendance_novelties n
     where n.organization_id = p_org and n.status in ('pendiente', 'esperando_contraparte')
       and n.work_date between pp.period_start and pp.period_end;
    if v_n > 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'novedades_asistencia_pendientes', 'cantidad', v_n));
    end if;
    select count(*) into v_n from public.timesheets t
     where t.organization_id = p_org and t.work_date between pp.period_start and pp.period_end and t.status not in ('approved', 'locked');
    if v_n > 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'dias_no_listos', 'cantidad', v_n));
    end if;
  end if;
  if pp.metadata ? 'aprobacion_id' then
    select * into v_inst from public.hr_approval_instances where id = (pp.metadata->>'aprobacion_id')::uuid;
    if v_inst.status is distinct from 'aprobada' then
      v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'revision_pendiente', 'estado', v_inst.status));
    end if;
  end if;
  v_falta := public.fn_hr_parametros_para_cierre(p_org, pp.period_end);
  if cardinality(v_falta) > 0 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('codigo', 'parametros_pendientes', 'faltan', to_jsonb(v_falta)));
  end if;
  return v_out;
end;
$$;
revoke execute on function public.fn_hr_nomina_bloqueos(integer, uuid) from public, anon, authenticated;

-- 3. Enviar a revisión ------------------------------------------------------------------
create or replace function public.fn_hr_nomina_enviar_revision(p_actor uuid, p_org integer, p_period uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_inst uuid;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org for update;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status <> 'calculated' then
    raise exception 'estado_invalido: solo se envía a revisión una nómina preliquidada' using errcode = '55000';
  end if;
  -- Con regla «cierre_nomina» decide el motor de aprobaciones; sin regla, la revisa quien tenga hr.payroll.close.
  if exists (select 1 from public.hr_approval_rules r where r.organization_id = p_org and r.request_type = 'cierre_nomina' and r.is_active) then
    v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'cierre_nomina', 'payroll_periods', pp.id, null, p_actor,
      jsonb_build_object('monto', pp.total_net, 'empleados', pp.total_employees, 'desde', pp.period_start, 'hasta', pp.period_end));
  end if;
  update public.payroll_periods
     set status = 'reviewing',
         metadata = (coalesce(metadata, '{}'::jsonb) - 'aprobacion_id' - 'revision')
                    || case when v_inst is null then '{}'::jsonb else jsonb_build_object('aprobacion_id', v_inst) end
                    || jsonb_build_object('enviado_a_revision_por', p_actor),
         updated_at = now()
   where id = pp.id;
  return jsonb_build_object('estado', 'reviewing', 'aprobacion', v_inst);
end;
$$;
revoke execute on function public.fn_hr_nomina_enviar_revision(uuid, integer, uuid) from public, anon, authenticated;

-- 4. Cerrar -----------------------------------------------------------------------------
create or replace function public.fn_hr_nomina_cerrar(p_actor uuid, p_org integer, p_period uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_run uuid;
  v_bloqueos jsonb;
  v_n integer;
  it record;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.close') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_nomina_habilitada(p_org) then
    raise exception 'nomina_no_habilitada: la nómina de esta organización solo se preliquida hasta la ronda del Contador' using errcode = '55000';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org for update;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status not in ('calculated', 'reviewing') then
    raise exception 'estado_invalido: solo se cierra una nómina preliquidada o en revisión' using errcode = '55000';
  end if;
  v_bloqueos := public.fn_hr_nomina_bloqueos(p_org, pp.id);
  if jsonb_array_length(v_bloqueos) > 0 then
    raise exception 'cierre_bloqueado: %', v_bloqueos::text using errcode = '55000';
  end if;
  select r.id into v_run from public.payroll_runs r
   where r.payroll_period_id = pp.id and r.run_type = 'calculo' and r.status = 'completed' and r.superseded_by is null
   order by r.run_number desc limit 1;

  perform set_config('app.nomina_motor', 'on', true);
  update public.payroll_runs set is_final = true, updated_at = now() where id = v_run;
  -- Colillas aprobadas: el trigger fn_auto_journal_payroll asienta el devengo, en la sede del empleado.
  update public.payroll_slips set status = 'approved', updated_at = now() where payroll_run_id = v_run and status = 'draft';
  get diagnostics v_n = row_count;

  -- Cuotas de préstamo descontadas: quedan pagadas por la nómina (la nómina las asienta, no la cuota).
  for it in select i.id, i.payroll_slip_id, i.source_id, i.amount from public.payroll_items i
             join public.payroll_slips s on s.id = i.payroll_slip_id
            where s.payroll_run_id = v_run and i.code = 'PRESTAMO' and i.source_type = 'loan_installments' loop
    update public.loan_installments li
       set amount_paid = coalesce(li.amount_paid, 0) + it.amount,
           status = case when coalesce(li.amount_paid, 0) + it.amount >= li.amount then 'paid' else 'partial' end,
           paid_at = now(), payroll_slip_id = it.payroll_slip_id, payroll_item_id = it.id, updated_at = now()
     where li.id = it.source_id::uuid;
  end loop;
  -- Embargos: lo aplicado se acumula para su saldo.
  update public.hr_garnishments g
     set applied_total = g.applied_total + x.total, updated_at = now(),
         status = case when g.total_amount is not null and g.applied_total + x.total >= g.total_amount then 'terminado' else g.status end
    from (select i.source_id::uuid as id, sum(i.amount) as total from public.payroll_items i
            join public.payroll_slips s on s.id = i.payroll_slip_id
           where s.payroll_run_id = v_run and i.source_type = 'hr_garnishments' group by 1) x
   where g.id = x.id;

  update public.payroll_periods
     set status = 'approved', approved_by = p_actor, approved_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cerrado_por', p_actor, 'run_final', v_run),
         updated_at = now()
   where id = pp.id;
  perform set_config('app.nomina_motor', '', true);
  return jsonb_build_object('estado', 'approved', 'run_id', v_run, 'colillas', v_n);
end;
$$;
revoke execute on function public.fn_hr_nomina_cerrar(uuid, integer, uuid) from public, anon, authenticated;

-- 5. Pagar: un egreso en Tesorería por período (no expone el salario de nadie) ----------
-- El recibo de un egreso de nómina es comprobante de egreso (CE), como el pago a proveedores.
create or replace function public.fn_recibo_serie_pago(p_source text)
returns text
language sql immutable parallel safe
set search_path to 'public', 'pg_temp'
as $function$
  select case when p_source in ('invoice_purchase', 'account_payable', 'payroll_period') then 'CE' else 'RC' end
$function$;

create or replace function public.fn_hr_nomina_pagar(p_actor uuid, p_org integer, p_period uuid, p_bank_account integer, p_fecha date, p_referencia text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_ids uuid[];
  v_total numeric;
  v_pago uuid;
  v_tz text := public.fn_timezone_for(p_org, null);
  v_fecha timestamptz;
  v_sede integer;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.pay') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_nomina_habilitada(p_org) then
    raise exception 'nomina_no_habilitada: la nómina de esta organización solo se preliquida hasta la ronda del Contador' using errcode = '55000';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org for update;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status not in ('approved', 'paid', 'closed') then
    raise exception 'estado_invalido: solo se paga una nómina cerrada' using errcode = '55000';
  end if;
  if p_fecha is null then
    raise exception 'fecha_obligatoria' using errcode = '22023';
  end if;
  if not exists (select 1 from public.bank_accounts b where b.id = p_bank_account and b.organization_id = p_org and coalesce(b.is_active, true)) then
    raise exception 'cuenta_bancaria_ajena' using errcode = '42501';
  end if;
  -- Colillas cerradas sin pagar con neto positivo: las del cálculo final y las de sus ajustes.
  select array_agg(s.id order by s.id), coalesce(sum(s.net_pay), 0) into v_ids, v_total
    from public.payroll_slips s join public.payroll_runs r on r.id = s.payroll_run_id
   where r.payroll_period_id = pp.id and r.status = 'completed'
     and ((r.run_type = 'calculo' and r.is_final) or r.run_type = 'ajuste')
     and s.status = 'approved' and s.payment_id is null and s.net_pay > 0;
  if v_ids is null then
    raise exception 'nada_por_pagar' using errcode = '55000';
  end if;
  v_fecha := (p_fecha + time '12:00') at time zone v_tz;
  select b.id into v_sede from public.branches b where b.organization_id = p_org order by b.is_main desc nulls last, b.id limit 1;

  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
                               created_by, payment_date, bank_account_id, idempotency_key, discount_amount, change_amount)
  values (p_org, v_sede, 'payroll_period', pp.id::text, 'transfer', v_total, 'COP',
          coalesce(nullif(btrim(p_referencia), ''), 'Pago de nómina ' || coalesce(pp.name, pp.id::text)), 'completed',
          p_actor, v_fecha, p_bank_account, 'nomina:' || pp.id || ':' || md5(array_to_string(v_ids, ',')), 0, 0)
  returning id into v_pago;

  perform set_config('app.nomina_motor', 'on', true);
  -- Colilla pagada: el trigger fn_auto_journal_payroll asienta nómina por pagar contra el banco.
  update public.payroll_slips set status = 'paid', payment_id = v_pago, paid_at = v_fecha, updated_at = now()
   where id = any (v_ids);
  if pp.status = 'approved' then
    update public.payroll_periods set status = 'paid', updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('pagado_por', p_actor)
     where id = pp.id;
  end if;
  perform set_config('app.nomina_motor', '', true);
  return jsonb_build_object('payment_id', v_pago, 'total', v_total, 'colillas', cardinality(v_ids), 'colilla_ids', to_jsonb(v_ids));
end;
$$;
revoke execute on function public.fn_hr_nomina_pagar(uuid, integer, uuid, integer, date, text) from public, anon, authenticated;

-- 6. Contabilización por trigger: sede del empleado (R8) y líneas por concepto ----------
-- Asiento de una colilla del motor: cada ítem a la cuenta de su concepto; el neto a nómina por pagar.
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

create or replace function public.fn_auto_journal_payroll()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rule record;
  v_entry_id integer;
  v_run record;
  v_org_id integer;
  v_branch_id integer;
  v_event_type text;
  v_memo text;
  v_source_id text;
  v_fact_key text;
  v_total numeric := 0;
  v_country_code text;
  v_fecha timestamptz;
  v_gasto text;
  v_pasivo text;
  v_cuenta_mala text;
  v_linea record;
begin
  if new.status is null then
    return new;
  end if;

  if (new.status = 'approved' or new.status = 'paid')
     and (old.status is distinct from new.status) then

    select * into v_run from public.payroll_runs where id = new.payroll_run_id;
    if v_run is null then
      return new;
    end if;

    select organization_id into v_org_id
      from public.payroll_periods
     where id = v_run.payroll_period_id;
    if v_org_id is null then
      return new;
    end if;

    v_event_type := case new.status when 'approved' then 'created' when 'paid' then 'paid' end;

    -- R8 (ADR-003 §5): la sede del asiento es la del empleado, no la sede de menor id.
    v_branch_id := coalesce(
      new.branch_id,
      (select e.branch_id from public.employments e where e.id = new.employment_id),
      (select b.id from public.branches b where b.organization_id = v_org_id order by b.is_main desc nulls last, b.id limit 1));

    -- Colillas del motor de la fase 3: un asiento por concepto (fn_hr_nomina_asentar).
    if new.metadata ? 'motor' then
      perform public.fn_hr_nomina_asentar(new, v_event_type, v_org_id, v_branch_id);
      return new;
    end if;

    select * into v_rule
      from public.accounting_rules
     where organization_id = v_org_id
       and source_type = 'payroll'
       and event_type = v_event_type
       and is_active = true
     order by priority limit 1;

    if v_rule is null then
      select * into v_rule
        from public.accounting_rules
       where organization_id = v_org_id
         and source_type = 'payroll'
         and is_active = true
       order by priority limit 1;
    end if;

    select country_code into v_country_code from public.organizations where id = v_org_id;

    v_memo := 'Nómina - Slip: ' || new.id::text || ' (' || v_event_type || ')';
    v_source_id := new.id::text || ':' || v_event_type;
    v_fact_key := 'payroll_slip:' || new.id::text || ':' || v_event_type;

    if v_rule is null then
      perform public.fn_log_journal_failure(v_org_id, v_branch_id, now(), 'payroll_slips', v_source_id,
        v_fact_key, null, null, new.gross_pay, 'no_rule', 'Sin regla contable activa de nómina');
      return new;
    end if;

    if v_event_type = 'paid' then
      v_entry_id := public.fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := v_branch_id,
        p_entry_date := coalesce(new.paid_at, new.updated_at, now()),
        p_memo := v_memo,
        p_source := 'payroll_slips',
        p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := new.net_pay,
        p_fact_key := v_fact_key
      );
      return new;
    end if;

    if v_country_code is distinct from 'COL' then
      v_entry_id := public.fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := v_branch_id,
        p_entry_date := coalesce(new.updated_at, now()),
        p_memo := v_memo,
        p_source := 'payroll_slips',
        p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := new.net_pay,
        p_fact_key := v_fact_key
      );
      return new;
    end if;

    -- Devengo en Colombia: varias líneas de gasto contra nómina por pagar.
    if exists (select 1 from public.journal_entries e
                where e.organization_id = v_org_id and e.fact_key = v_fact_key) then
      return new;
    end if;

    v_fecha := coalesce(new.updated_at, now());
    v_gasto := v_rule.debit_account_code;
    v_pasivo := coalesce(public.fn_cuenta_por_clave(v_org_id, v_branch_id, 'nomina_por_pagar'), '25050501');

    select sum(round(coalesce(x.monto, 0), 0)) into v_total
      from unnest(array[new.gross_pay, new.employer_health, new.employer_pension, new.employer_arl,
                        new.employer_parafiscales, new.employer_severance, new.employer_severance_interest,
                        new.employer_vacation_provision, new.employer_bonus_provision]) as x(monto);
    if coalesce(v_total, 0) <= 0 then
      return new;
    end if;

    select c.cuenta into v_cuenta_mala
      from unnest(array[v_gasto, v_pasivo]) as c(cuenta)
     where not exists (
       select 1 from public.chart_of_accounts a
        where a.organization_id = v_org_id and a.account_code = c.cuenta
          and a.es_movimiento is true and coalesce(a.is_active, true)
     )
     limit 1;
    if v_cuenta_mala is not null then
      perform public.fn_log_journal_failure(v_org_id, v_branch_id, v_fecha, 'payroll_slips', v_source_id,
        v_fact_key, v_gasto, v_pasivo, v_total, 'cuenta_no_es_de_movimiento',
        'La cuenta ' || v_cuenta_mala || ' no existe o es de título');
      return new;
    end if;

    if not public.fn_is_period_open(v_org_id, (v_fecha at time zone public.fn_timezone_for(v_org_id, v_branch_id))::date) then
      perform public.fn_log_journal_failure(v_org_id, v_branch_id, v_fecha, 'payroll_slips', v_source_id,
        v_fact_key, v_gasto, v_pasivo, v_total, 'period_closed', 'Periodo contable cerrado');
      return new;
    end if;

    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
    ) values (
      v_org_id, v_branch_id, v_fecha, v_memo, 'payroll_slips', v_source_id, true, v_fact_key
    ) returning id into v_entry_id;

    for v_linea in
      select d.descripcion, round(coalesce(d.monto, 0), 0) as monto
        from (values
          (1, 'Salario base', new.gross_pay),
          (2, 'Salud patronal', new.employer_health),
          (3, 'Pensión patronal', new.employer_pension),
          (4, 'ARL patronal', new.employer_arl),
          (5, 'Parafiscales', new.employer_parafiscales),
          (6, 'Provisión cesantías', new.employer_severance),
          (7, 'Interés cesantías', new.employer_severance_interest),
          (8, 'Provisión vacaciones', new.employer_vacation_provision),
          (9, 'Provisión prima', new.employer_bonus_provision)
        ) as d(orden, descripcion, monto)
       where round(coalesce(d.monto, 0), 0) > 0
       order by d.orden
    loop
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
      values (v_entry_id, v_org_id, v_gasto, v_linea.descripcion, v_linea.monto, 0);
    end loop;

    insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
    values (v_entry_id, v_org_id, v_pasivo, 'Nómina por pagar', 0, v_total);
  end if;

  return new;
end;
$function$;

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

-- La cuota descontada por nómina la asienta la colilla (crédito a 1365); asentarla también
-- como recaudo en caja (1105 contra 1365) la contaría dos veces.
create or replace function public.fn_auto_journal_loan_installment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_loan RECORD;
    v_org_id integer;
    v_default_branch integer;
    v_memo text;
BEGIN
    -- Solo cuotas pagadas y solo cuando cambia el estado
    IF NEW.status NOT IN ('paid', 'completed') THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- ADR-003 §5: descontada por nómina, la asienta la colilla.
    IF NEW.payroll_slip_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Obtener organización desde employee_loans
    SELECT * INTO v_loan FROM employee_loans WHERE id = NEW.loan_id;
    IF v_loan IS NULL THEN
        RETURN NEW;
    END IF;

    v_org_id := v_loan.organization_id;
    SELECT MIN(id) INTO v_default_branch FROM branches WHERE organization_id = v_org_id;

    -- Buscar regla específica de installment/paid
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_org_id
      AND source_type = 'installment'
      AND event_type = 'paid'
      AND is_active = true
    ORDER BY priority LIMIT 1;

    -- Fallback: cualquier regla de installment activa
    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_org_id
          AND source_type = 'installment'
          AND is_active = true
        ORDER BY priority LIMIT 1;
    END IF;

    -- Fallback final: regla de loan/paid
    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_org_id
          AND source_type = 'loan'
          AND event_type = 'paid'
          AND is_active = true
        ORDER BY priority LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure(coalesce((to_jsonb(NEW)->>'organization_id')::integer, v_org_id), NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    -- Memo diferenciado según loan_type
    v_memo := CASE v_loan.loan_type
        WHEN 'advance' THEN 'Descuento Anticipo N°' || NEW.installment_number::text || ' - ' || COALESCE(v_loan.loan_number, v_loan.id::text)
        ELSE 'Cuota préstamo N°' || NEW.installment_number::text || ' - ' || COALESCE(v_loan.loan_number, v_loan.id::text)
    END;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := v_default_branch,
        p_entry_date := COALESCE(NEW.paid_at, NEW.updated_at, now()),
        p_memo := v_memo,
        p_source := 'loan_installments',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.amount
    );

    RETURN NEW;
END;
$function$;

-- 7. Contabilizado: todas las colillas tienen sus asientos ------------------------------
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

-- 8. Ajuste controlado de un período cerrado (las reglas originales, con motivo) ---------
create or replace function public.fn_hr_nomina_ajuste_insumos(p_actor uuid, p_org integer, p_period uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_run public.payroll_runs;
  r record;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status not in ('approved', 'paid', 'closed') then
    raise exception 'estado_invalido: un período abierto se recalcula, no se ajusta' using errcode = '55000';
  end if;
  select * into v_run from public.payroll_runs x where x.payroll_period_id = pp.id and x.run_type = 'calculo' and x.is_final limit 1;
  if v_run.id is null or v_run.parameters_snapshot is null then
    raise exception 'periodo_sin_motor: solo se ajusta una nómina calculada por el motor' using errcode = '55000';
  end if;
  for r in select e.id, e.person_id from public.payroll_slips s join public.employments e on e.id = s.employment_id where s.payroll_run_id = v_run.id loop
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, r.person_id, r.id, 'salario_pago', 'ver', p_ip, p_ua,
      coalesce(p_ruta, 'rpc:fn_hr_nomina_ajuste_insumos'), jsonb_build_object('periodo', pp.id, 'motivo', 'ajuste'));
  end loop;
  return jsonb_build_object(
    'periodo', jsonb_build_object('id', pp.id, 'desde', pp.period_start, 'hasta', pp.period_end, 'tipo', pp.kind),
    'run_id', v_run.id,
    'parametros_snapshot', v_run.parameters_snapshot,
    'colillas', coalesce((select jsonb_agg(jsonb_build_object('vinculo_id', s.employment_id, 'entrada', s.inputs, 'nombre', s.metadata->>'nombre'))
                            from public.payroll_slips s where s.payroll_run_id = v_run.id), '[]'::jsonb));
end;
$$;
revoke execute on function public.fn_hr_nomina_ajuste_insumos(uuid, integer, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.fn_hr_nomina_ajuste_guardar(p_actor uuid, p_org integer, p_period uuid, p_resultado jsonb, p_motivo text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_final public.payroll_runs;
  v_run uuid;
  v_num integer;
  c jsonb;
  e public.employments;
  v_slip uuid;
  v_dev numeric;
  v_ded numeric;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_nomina_habilitada(p_org) then
    raise exception 'nomina_no_habilitada' using errcode = '55000';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo_obligatorio: un ajuste lleva su motivo' using errcode = '22023';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org for update;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status not in ('approved', 'paid', 'closed') then
    raise exception 'estado_invalido: un período abierto se recalcula, no se ajusta' using errcode = '55000';
  end if;
  select * into v_final from public.payroll_runs x where x.payroll_period_id = pp.id and x.run_type = 'calculo' and x.is_final limit 1;
  if v_final.id is null then
    raise exception 'periodo_sin_motor' using errcode = '55000';
  end if;
  -- Idempotencia del ajuste: la misma diferencia no se registra dos veces.
  select x.id into v_run from public.payroll_runs x
   where x.payroll_period_id = pp.id and x.run_type = 'ajuste' and x.input_hash = p_resultado->>'huella' and x.status = 'completed';
  if v_run is not null then
    return jsonb_build_object('run_id', v_run, 'reutilizado', true);
  end if;

  perform set_config('app.nomina_motor', 'on', true);
  select coalesce(max(x.run_number), 0) + 1 into v_num from public.payroll_runs x where x.payroll_period_id = pp.id;
  -- Las reglas del ajuste son las del cálculo cerrado (parameters_snapshot), nunca las de hoy.
  insert into public.payroll_runs (payroll_period_id, run_number, executed_by, status, run_type, engine_version, input_hash,
                                   parameters_snapshot, alerts, summary, reason, adjusts_run_id, is_final)
  values (pp.id, v_num, p_actor, 'completed', 'ajuste', p_resultado->>'version_motor', p_resultado->>'huella',
          v_final.parameters_snapshot, '[]'::jsonb, p_resultado->'totales', btrim(p_motivo), v_final.id, false)
  returning id into v_run;

  for c in select * from jsonb_array_elements(p_resultado->'colillas') loop
    select * into e from public.employments where id = (c->>'vinculo_id')::uuid and organization_id = p_org;
    if not found then
      raise exception 'vinculo_ajeno' using errcode = '42501';
    end if;
    select coalesce(sum((x->>'valor')::numeric) filter (where x->>'tipo' = 'earning'), 0),
           coalesce(sum((x->>'valor')::numeric) filter (where x->>'tipo' = 'deduction'), 0)
      into v_dev, v_ded
      from jsonb_array_elements(c->'items') x;
    insert into public.payroll_slips (payroll_run_id, employment_id, currency_code, base_salary, salary_period, gross_pay,
        tax_withholding, loan_deductions, total_deductions, net_pay, status, branch_id, input_hash, inputs, metadata)
    select v_run, e.id, coalesce(s.currency_code, 'COP'), s.base_salary, s.salary_period, v_dev,
           coalesce((select sum((x->>'valor')::numeric) from jsonb_array_elements(c->'items') x where x->>'codigo' = 'RETENCION_FUENTE'), 0),
           coalesce((select sum((x->>'valor')::numeric) from jsonb_array_elements(c->'items') x where x->>'codigo' = 'PRESTAMO'), 0),
           v_ded, v_dev - v_ded, 'draft', s.branch_id, c->>'huella_entrada', c->'entrada',
           jsonb_build_object('motor', p_resultado->>'version_motor', 'ajuste', true, 'motivo', btrim(p_motivo), 'ajusta_colilla', s.id)
      from public.payroll_slips s where s.payroll_run_id = v_final.id and s.employment_id = e.id
    returning id into v_slip;
    if v_slip is null then
      raise exception 'ajuste_sin_colilla: % no estaba en la nómina cerrada', e.id using errcode = '22023';
    end if;
    insert into public.payroll_items (payroll_slip_id, item_type, code, name, amount, source_type, source_id, metadata)
    select v_slip, x->>'tipo', x->>'codigo', x->>'nombre', (x->>'valor')::numeric, x->'fuente'->>'tipo', x->'fuente'->>'id',
           jsonb_build_object('ajuste', true)
      from jsonb_array_elements(c->'items') x;
  end loop;
  perform set_config('app.nomina_motor', '', true);
  return jsonb_build_object('run_id', v_run, 'reutilizado', false);
end;
$$;
revoke execute on function public.fn_hr_nomina_ajuste_guardar(uuid, integer, uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.fn_hr_nomina_ajuste_cerrar(p_actor uuid, p_org integer, p_run uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.close') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_nomina_habilitada(p_org) then
    raise exception 'nomina_no_habilitada' using errcode = '55000';
  end if;
  if not exists (select 1 from public.payroll_runs r join public.payroll_periods pp on pp.id = r.payroll_period_id
                  where r.id = p_run and r.run_type = 'ajuste' and pp.organization_id = p_org) then
    raise exception 'ajuste_no_existe' using errcode = 'P0002';
  end if;
  perform set_config('app.nomina_motor', 'on', true);
  update public.payroll_slips set status = 'approved', updated_at = now() where payroll_run_id = p_run and status = 'draft';
  get diagnostics v_n = row_count;
  perform set_config('app.nomina_motor', '', true);
  return jsonb_build_object('run_id', p_run, 'colillas', v_n);
end;
$$;
revoke execute on function public.fn_hr_nomina_ajuste_cerrar(uuid, integer, uuid) from public, anon, authenticated;

-- 9. Datos del archivo para el banco (grupo banco, con registro por persona) -------------
create or replace function public.fn_hr_nomina_archivo_banco(p_actor uuid, p_org integer, p_period uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pp public.payroll_periods;
  v_filas jsonb := '[]'::jsonb;
  r record;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.pay') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into pp from public.payroll_periods where id = p_period and organization_id = p_org;
  if not found then
    raise exception 'periodo_no_existe' using errcode = 'P0002';
  end if;
  if pp.status not in ('approved', 'paid', 'closed') then
    raise exception 'estado_invalido: el archivo del banco sale de una nómina cerrada' using errcode = '55000';
  end if;
  for r in
    select s.id as colilla, s.net_pay, e.id as vinculo, e.person_id,
           public.fn_hr_nombre_persona(e.person_id) as nombre, pi.doc_type, pi.doc_number,
           b.bank_code, b.bank_name, b.account_type, b.account_number, b.holder_name
      from public.payroll_slips s
      join public.payroll_runs ru on ru.id = s.payroll_run_id
      join public.employments e on e.id = s.employment_id
      left join public.hr_people_identification pi on pi.person_id = e.person_id
      left join lateral (select * from public.hr_person_bank_accounts x
                          where x.person_id = e.person_id and x.is_active
                            and (x.valid_to is null or x.valid_to >= pp.period_end)
                          order by x.is_primary desc, x.valid_from desc nulls last limit 1) b on true
     where ru.payroll_period_id = pp.id and ru.status = 'completed'
       and ((ru.run_type = 'calculo' and ru.is_final) or ru.run_type = 'ajuste')
       and s.status = 'approved' and s.payment_id is null and s.net_pay > 0
     order by 5
  loop
    if not public.fn_hr_actor_puede_grupo(p_actor, p_org, r.person_id, 'banco', 'ver') then
      perform public.fn_hr_registrar_intento(p_actor, p_org, r.person_id, r.vinculo, 'banco', p_ip, p_ua, p_ruta, '{"accion":"archivo_banco"}'::jsonb);
      raise exception 'sin_permiso: ver las cuentas bancarias' using errcode = '42501';
    end if;
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, r.person_id, r.vinculo, 'banco', 'exportar', p_ip, p_ua,
      coalesce(p_ruta, 'rpc:fn_hr_nomina_archivo_banco'), jsonb_build_object('periodo', pp.id, 'campos', jsonb_build_array('cuenta', 'documento', 'valor')));
    v_filas := v_filas || jsonb_build_array(jsonb_build_object(
      'colilla_id', r.colilla, 'vinculo_id', r.vinculo, 'nombre', r.nombre, 'tipo_documento', r.doc_type, 'documento', r.doc_number,
      'banco_codigo', r.bank_code, 'banco', r.bank_name, 'tipo_cuenta', r.account_type, 'cuenta', r.account_number,
      'titular', r.holder_name, 'valor', r.net_pay));
  end loop;
  return jsonb_build_object('periodo', jsonb_build_object('id', pp.id, 'nombre', pp.name, 'fecha_pago', pp.payment_date), 'filas', v_filas);
end;
$$;
revoke execute on function public.fn_hr_nomina_archivo_banco(uuid, integer, uuid, text, text, text) from public, anon, authenticated;

-- 10. El empleado ve SOLO sus colillas cerradas -----------------------------------------
create or replace function public.fn_hr_nomina_mis_colillas()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id
    from public.payroll_slips s
    join public.payroll_runs r on r.id = s.payroll_run_id
    join public.payroll_periods pp on pp.id = r.payroll_period_id
   where s.employment_id in (select public.fn_hr_mis_empleos())
     and s.status in ('approved', 'paid')
     and pp.status in ('approved', 'paid', 'closed')
     and r.status = 'completed'
     and (r.run_type = 'ajuste' or r.is_final or r.engine_version is null);
$$;
revoke execute on function public.fn_hr_nomina_mis_colillas() from public, anon;

drop policy if exists payroll_slips_select on public.payroll_slips;
create policy payroll_slips_select on public.payroll_slips
  for select to authenticated
  using (payroll_run_id in (select pr.id from public.payroll_runs pr join public.payroll_periods pp on pp.id = pr.payroll_period_id
                             where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')))
         or id in (select public.fn_hr_nomina_mis_colillas()));

drop policy if exists payroll_items_select on public.payroll_items;
create policy payroll_items_select on public.payroll_items
  for select to authenticated
  using (payroll_slip_id in (select ps.id from public.payroll_slips ps
                               join public.payroll_runs pr on pr.id = ps.payroll_run_id
                               join public.payroll_periods pp on pp.id = pr.payroll_period_id
                              where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')))
         or payroll_slip_id in (select public.fn_hr_nomina_mis_colillas()));
