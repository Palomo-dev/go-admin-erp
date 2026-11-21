-- Reversión de 20261121031559_hrm_nomina_concepto_propinas.sql
--
-- Quita el concepto «Propinas (no salarial)», el control de saldo en la novedad
-- y en la contabilización de la colilla, y el pago parcial por línea. Se detiene
-- si alguna nómina ya pagó propinas.

do $$
begin
  if exists (select 1 from public.tip_settlement_lines where paid_method = 'nomina')
     or exists (select 1 from public.hr_payroll_novelties where concept_code = 'PROPINAS') then
    raise exception 'Hay propinas pagadas o por pagar por nómina: revisar antes de revertir';
  end if;
end $$;

-- Contabilizar la colilla sin el control de propinas.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_hr_nomina_asentar'::regproc);
  v_ini int; v_fin int;
begin
  if position('propinas_sin_saldo' in v_def) = 0 then
    return;
  end if;
  v_def := replace(v_def, E'  l record;
  v_prop numeric := 0;
  v_usuario uuid;
  v_saldo numeric;
begin', E'  l record;
begin');
  v_ini := position('  -- Propinas (no salarial), Contador 2026-11-20: no más que lo liquidado y por' in v_def);
  v_fin := position(E'  if v_falta is not null then
    perform public.fn_log_journal_failure(p_org, p_sede, v_fecha, ''payroll_slips''' in v_def);
  v_def := substr(v_def, 1, v_ini - 1) || substr(v_def, v_fin);
  v_def := replace(v_def, E'  if p_evento = ''created'' and v_prop > 0 then
    perform public.fn_propinas_aplicar_nomina(p_org, v_usuario, v_prop, p_slip.id);
  end if;
', '');
  if position('v_prop' in v_def) > 0 then
    raise exception 'fn_hr_nomina_asentar no quedó como antes';
  end if;
  execute v_def;
end $$;

-- Novedad sin el control de propinas.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_hr_nomina_novedad_registrar'::regproc);
  v_ini int; v_fin int;
begin
  if position('propinas_sin_saldo' in v_def) = 0 then
    return;
  end if;
  v_def := replace(v_def, E'  v_inst uuid;
  v_saldo numeric;
  v_usuario uuid;
', E'  v_inst uuid;
');
  v_ini := position('  -- Propinas (no salarial), Contador 2026-11-20: la nómina no paga más que lo' in v_def);
  v_fin := position('  insert into public.hr_payroll_novelties' in v_def);
  v_def := substr(v_def, 1, v_ini - 1) || substr(v_def, v_fin);
  execute v_def;
end $$;

-- Pago y cuadre sin pago parcial (definiciones de 20261121030426).
create or replace function public.fn_propinas_pagar_lineas(
  p_settlement_id uuid, p_medio text, p_sesion integer, p_solicitud uuid, p_uid uuid,
  p_personas uuid[] default null, p_referencias jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_s public.tip_settlements%rowtype;
  v_total numeric(14, 2);
  v_pasivo text;
  v_contra text;
  v_mov jsonb;
  v_mov_id integer;
  v_rec record;
  v_n integer := 0;
begin
  select * into v_s from public.tip_settlements where id = p_settlement_id;
  if p_medio not in ('efectivo', 'transferencia') then
    raise exception 'MEDIO_INVALIDO: medio %', coalesce(p_medio, '(vacío)') using errcode = '22023';
  end if;

  select coalesce(sum(l.amount), 0) into v_total
    from public.tip_settlement_lines l
   where l.settlement_id = v_s.id and l.paid_at is null and l.amount > 0
     and (p_personas is null or l.person_id = any (p_personas));
  if v_total <= 0 then
    return jsonb_build_object('pagadas', 0, 'total', 0);
  end if;

  if p_medio = 'transferencia' then
    if exists (select 1 from public.tip_settlement_lines l
                where l.settlement_id = v_s.id and l.paid_at is null and l.amount > 0
                  and (p_personas is null or l.person_id = any (p_personas))
                  and coalesce(nullif(btrim(l.transfer_reference), ''),
                               btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_referencias, '[]'::jsonb)) r
                                       where r->>'persona' = l.person_id::text limit 1)), '') = '') then
      raise exception 'REFERENCIA_REQUERIDA: cada transferencia lleva su referencia' using errcode = '22023';
    end if;
    v_contra := coalesce(public.fn_cuenta_por_clave(v_s.organization_id, v_s.branch_id, 'bancos'),
                         public.fn_primera_cuenta_detalle(v_s.organization_id, array['1110']));
  else
    v_mov := public.pos_caja_registrar_movimiento(
      p_session_id := p_sesion,
      p_tipo := 'out',
      p_monto := v_total,
      p_concepto := 'Pago de propinas ' || v_s.code,
      p_concept_code := 'liquidacionPropinas',
      p_referencia := v_s.code,
      p_notas := null,
      p_uuid := p_solicitud);
    v_mov_id := (v_mov->>'id')::integer;
    v_contra := coalesce(public.fn_money_account_code_pago(v_s.organization_id, v_s.branch_id, 'cash', null),
                         public.fn_cuenta_caja_existente(v_s.organization_id, v_s.branch_id, null));
  end if;

  v_pasivo := public.fn_primera_cuenta_detalle(v_s.organization_id, array['28150502']);
  if v_pasivo is null or v_contra is null then
    raise exception 'SIN_CUENTA: falta la cuenta 28150502 o la de %', case when p_medio = 'efectivo' then 'caja' else 'bancos' end
      using errcode = '22023';
  end if;

  for v_rec in
    select l.id, l.person_id, l.amount
      from public.tip_settlement_lines l
     where l.settlement_id = v_s.id and l.paid_at is null and l.amount > 0
       and (p_personas is null or l.person_id = any (p_personas))
     order by l.amount desc, l.person_id
     for update
  loop
    perform public.fn_create_journal_entry(
      p_organization_id := v_s.organization_id,
      p_branch_id := v_s.branch_id,
      p_entry_date := now(),
      p_memo := 'Pago de propinas ' || v_s.code
                || case when p_medio = 'efectivo' then ' en efectivo' else ' por transferencia' end,
      p_source := 'tip_settlements',
      p_source_id := v_s.id::text,
      p_debit_account := v_pasivo,
      p_credit_account := v_contra,
      p_amount := v_rec.amount,
      p_created_by := p_uid,
      p_fact_key := 'tip_settlement_pago:' || v_s.id::text || ':' || v_rec.person_id::text);
    update public.tip_settlement_lines l
       set paid_at = now(), paid_method = p_medio, paid_by = p_uid, cash_movement_id = v_mov_id,
           transfer_reference = case when p_medio = 'transferencia' then coalesce(nullif(btrim(l.transfer_reference), ''),
             nullif(btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_referencias, '[]'::jsonb)) r
                            where r->>'persona' = l.person_id::text limit 1)), '')) else l.transfer_reference end
     where l.id = v_rec.id;
    v_n := v_n + 1;
  end loop;

  update public.tip_settlements s
     set status = case when exists (select 1 from public.tip_settlement_lines l
                                     where l.settlement_id = s.id and l.paid_at is null and l.amount > 0)
                       then 'por_pagar' else 'pagada' end,
         cash_session_id = coalesce(s.cash_session_id, p_sesion),
         cash_movement_id = coalesce(s.cash_movement_id, v_mov_id)
   where s.id = v_s.id;

  return jsonb_build_object('pagadas', v_n, 'total', v_total, 'movimiento_caja', v_mov_id);
end;
$function$;

create or replace function public.fn_propinas_cuadre(p_organization_id integer, p_hasta timestamptz default now())
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c01 numeric;
  v_c02 numeric;
  v_sin_liquidar numeric;
  v_por_pagar numeric;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select coalesce(sum(jl.credit - jl.debit) filter (where jl.account_code = '28150501'), 0),
         coalesce(sum(jl.credit - jl.debit) filter (where jl.account_code = '28150502'), 0)
    into v_c01, v_c02
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
   where je.organization_id = p_organization_id and je.posted is true and je.entry_date <= p_hasta
     and jl.account_code in ('28150501', '28150502');

  select coalesce(sum(t.amount), 0) into v_sin_liquidar
    from public.tips t
   where t.organization_id = p_organization_id and t.voided_at is null
     and t.created_at <= p_hasta
     and (not coalesce(t.is_distributed, false) or t.distributed_at > p_hasta);

  select coalesce(sum(l.amount), 0) into v_por_pagar
    from public.tip_settlement_lines l
    join public.tip_settlements s on s.id = l.settlement_id
   where s.organization_id = p_organization_id and s.status <> 'anulada'
     and s.created_at <= p_hasta and l.amount > 0
     and (l.paid_at is null or l.paid_at > p_hasta);

  return jsonb_build_object(
    'hasta', p_hasta,
    'cuenta_28150501', jsonb_build_object('contable', v_c01, 'propinas_sin_liquidar', v_sin_liquidar, 'diferencia', v_c01 - v_sin_liquidar),
    'cuenta_28150502', jsonb_build_object('contable', v_c02, 'liquidado_sin_pagar', v_por_pagar, 'diferencia', v_c02 - v_por_pagar,
      'por_trabajador', (select coalesce(jsonb_agg(jsonb_build_object('persona', public.fn_propinas_persona(p_organization_id, q.person_id),
                                                                      'por_pagar', q.monto) order by q.monto desc), '[]'::jsonb)
                           from (select l.person_id, sum(l.amount) as monto
                                   from public.tip_settlement_lines l
                                   join public.tip_settlements s on s.id = l.settlement_id
                                  where s.organization_id = p_organization_id and s.status <> 'anulada'
                                    and s.created_at <= p_hasta and l.amount > 0
                                    and (l.paid_at is null or l.paid_at > p_hasta)
                                  group by l.person_id) q))
  );
end;
$function$;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_propinas_liquidacion_detalle'::regproc);
begin
  execute replace(v_def, $q$, 'pagado_monto', l.paid_amount)$q$, ')');
end $$;

drop function if exists public.fn_propinas_aplicar_nomina(integer, uuid, numeric, uuid);
drop function if exists public.fn_propinas_usuario_de_vinculo(uuid);
drop function if exists public.fn_propinas_saldo_por_pagar(integer, uuid);

alter table public.tip_settlement_lines
  drop column if exists payroll_slip_id,
  drop column if exists paid_amount;

delete from public.hr_payroll_concepts where organization_id is null and code = 'PROPINAS';
