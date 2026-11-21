-- Reversión de 20261121030426_pos_propinas_por_pagar_28150502.sql
--
-- Vuelve a liquidar directo de 28150501 a caja o bancos, sin estado «por pagar».
-- Si hay liquidaciones «por pagar» o asientos en 28150502, revisar con el
-- Contador antes: este script se detiene.

do $$
begin
  if exists (select 1 from public.tip_settlements where status = 'por_pagar')
     or exists (select 1 from public.journal_lines where account_code = '28150502') then
    raise exception 'Hay liquidaciones por pagar o movimientos en 28150502: revisar antes de revertir';
  end if;
end $$;

drop function if exists public.fn_propinas_cuadre(integer, timestamptz);
drop function if exists public.fn_propinas_liquidacion_pagar(uuid, jsonb);

create or replace function public.fn_propinas_liquidacion_crear(p_organization_id integer, p_branch_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_solicitud uuid;
  v_ids uuid[];
  v_reparto text := coalesce(p_datos->>'reparto', 'atendio');
  v_medio text := p_datos->>'medio';
  v_motivo_ajuste text := left(nullif(btrim(coalesce(p_datos->>'motivo_ajuste', '')), ''), 500);
  v_motivo text := left(nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), 500);
  v_existente public.tip_settlements%rowtype;
  v_n_encontradas integer;
  v_n_validas integer;
  v_abiertas integer;
  v_total numeric(14, 2);
  v_efectivo numeric(14, 2);
  v_banco numeric(14, 2);
  v_lineas jsonb := '[]'::jsonb;
  v_linea jsonb;
  v_suma_pct numeric;
  v_suma_ajustes numeric(14, 2);
  v_suma_calc numeric(14, 2);
  v_hay_ajuste boolean;
  v_numero integer;
  v_id uuid := gen_random_uuid();
  v_codigo text;
  v_sesion integer;
  v_mov jsonb;
  v_mov_id integer;
  v_caja text;
  v_bancos text;
  v_rec record;
  v_pasivo text;
  v_contra text;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'pos.propinas.liquidar') then
    raise exception 'SIN_PERMISO: liquidar propinas requiere el permiso pos.propinas.liquidar' using errcode = '42501';
  end if;
  if p_branch_id is null or not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SIN_SUCURSAL: la liquidación es de una sucursal' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;

  begin
    v_solicitud := (p_datos->>'solicitud')::uuid;
  exception when others then
    v_solicitud := null;
  end;
  if v_solicitud is null then
    raise exception 'SOLICITUD_REQUERIDA' using errcode = '22023';
  end if;

  -- Reintento de la misma solicitud: devuelve la liquidación ya creada.
  select * into v_existente from public.tip_settlements
   where organization_id = p_organization_id and request_id = v_solicitud;
  if found then
    return jsonb_build_object('id', v_existente.id, 'codigo', v_existente.code, 'total', v_existente.total,
                              'ya_registrada', true);
  end if;

  select coalesce(array_agg(distinct x::uuid), array[]::uuid[]) into v_ids
    from jsonb_array_elements_text(coalesce(p_datos->'propinas', '[]'::jsonb)) x;
  if cardinality(v_ids) = 0 then
    raise exception 'SIN_PROPINAS: elija al menos una propina' using errcode = '22023';
  end if;

  if v_reparto not in ('atendio', 'porcentaje') then
    raise exception 'REPARTO_INVALIDO: reparto %', v_reparto using errcode = '22023';
  end if;
  if v_medio is null or v_medio not in ('efectivo', 'transferencia', 'sin_pago') then
    raise exception 'MEDIO_INVALIDO: medio %', coalesce(v_medio, '(vacío)') using errcode = '22023';
  end if;

  -- Bloquea las propinas (orden estable para no cruzarse con otra liquidación).
  perform 1 from public.tips t
   where t.organization_id = p_organization_id and t.id = any (v_ids)
   order by t.id
   for update;

  select count(*),
         count(*) filter (where t.branch_id = p_branch_id and t.voided_at is null and not coalesce(t.is_distributed, false)),
         count(*) filter (where s.id is not null and coalesce(s.status, '') not in ('void', 'cancelled')
                                and coalesce(nullif(s.payment_status, ''), s.status, '') <> 'paid'),
         coalesce(sum(t.amount), 0),
         coalesce(sum(t.amount) filter (where t.tip_type = 'cash'), 0),
         coalesce(sum(t.amount) filter (where t.tip_type <> 'cash'), 0)
    into v_n_encontradas, v_n_validas, v_abiertas, v_total, v_efectivo, v_banco
    from public.tips t
    left join public.sales s on s.id = t.sale_id
   where t.organization_id = p_organization_id and t.id = any (v_ids);

  if v_n_encontradas <> cardinality(v_ids) or v_n_validas <> cardinality(v_ids) then
    raise exception 'PROPINAS_NO_DISPONIBLES: % de % propinas ya no están por liquidar en esta sucursal',
      cardinality(v_ids) - v_n_validas, cardinality(v_ids) using errcode = '22023';
  end if;
  if v_abiertas > 0 then
    raise exception 'VENTA_ABIERTA: % propinas son de ventas sin cobrar', v_abiertas using errcode = '22023';
  end if;
  if v_total <= 0 then
    raise exception 'SIN_PROPINAS: el total a liquidar es cero' using errcode = '22023';
  end if;

  -- ── Reparto: calculado por persona ──
  if v_reparto = 'atendio' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'persona', q.server_id, 'base', q.base,
             'pct', round(q.base * 100 / v_total, 4), 'calculado', q.base) order by q.base desc, q.server_id), '[]'::jsonb)
      into v_lineas
      from (select t.server_id, sum(t.amount)::numeric(14, 2) as base
              from public.tips t where t.organization_id = p_organization_id and t.id = any (v_ids)
             group by t.server_id) q;
  else
    if jsonb_typeof(p_datos->'participaciones') is distinct from 'array'
       or jsonb_array_length(p_datos->'participaciones') = 0 then
      raise exception 'PORCENTAJES_INVALIDOS: faltan las participaciones' using errcode = '22023';
    end if;
    select sum((x->>'pct')::numeric) into v_suma_pct from jsonb_array_elements(p_datos->'participaciones') x;
    if v_suma_pct is null or abs(v_suma_pct - 100) > 0.01
       or exists (select 1 from jsonb_array_elements(p_datos->'participaciones') x where (x->>'pct')::numeric < 0)
       or (select count(distinct x->>'persona') from jsonb_array_elements(p_datos->'participaciones') x)
          <> jsonb_array_length(p_datos->'participaciones') then
      raise exception 'PORCENTAJES_INVALIDOS: las participaciones deben sumar 100 %%' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_datos->'participaciones') x
                where not exists (select 1 from public.organization_members om
                                   where om.organization_id = p_organization_id and om.is_active
                                     and om.user_id = (x->>'persona')::uuid)) then
      raise exception 'PERSONA_INVALIDA: una persona del reparto no es miembro activo' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'persona', (x->>'persona')::uuid,
             'base', coalesce((select sum(t.amount) from public.tips t
                                where t.organization_id = p_organization_id and t.id = any (v_ids)
                                  and t.server_id = (x->>'persona')::uuid), 0),
             'pct', round((x->>'pct')::numeric, 4),
             'calculado', round(v_total * (x->>'pct')::numeric / 100, 2))
             order by (x->>'pct')::numeric desc, x->>'persona'), '[]'::jsonb)
      into v_lineas
      from jsonb_array_elements(p_datos->'participaciones') x;
    -- El redondeo va a la primera línea (la de mayor participación).
    select coalesce(sum((l->>'calculado')::numeric), 0) into v_suma_calc from jsonb_array_elements(v_lineas) l;
    if v_suma_calc <> v_total then
      v_lineas := jsonb_set(v_lineas, '{0,calculado}',
                            to_jsonb(((v_lineas->0->>'calculado')::numeric + (v_total - v_suma_calc))::numeric(14, 2)));
    end if;
  end if;

  -- ── Ajustes: suman cero y llevan motivo ──
  if jsonb_typeof(p_datos->'ajustes') = 'array' then
    if exists (select 1 from jsonb_array_elements(p_datos->'ajustes') a
                where coalesce((a->>'monto')::numeric, 0) <> 0
                  and not exists (select 1 from jsonb_array_elements(v_lineas) l where l->>'persona' = a->>'persona')) then
      raise exception 'PERSONA_INVALIDA: un ajuste es de alguien fuera del reparto' using errcode = '22023';
    end if;
    select coalesce(sum(round((a->>'monto')::numeric, 2)), 0), bool_or(coalesce((a->>'monto')::numeric, 0) <> 0)
      into v_suma_ajustes, v_hay_ajuste
      from jsonb_array_elements(p_datos->'ajustes') a;
  else
    v_suma_ajustes := 0;
    v_hay_ajuste := false;
  end if;
  if v_suma_ajustes <> 0 then
    raise exception 'AJUSTES_NO_SUMAN_CERO: los ajustes suman %', v_suma_ajustes using errcode = '22023';
  end if;
  if coalesce(v_hay_ajuste, false) and (v_motivo_ajuste is null or length(v_motivo_ajuste) < 3) then
    raise exception 'MOTIVO_AJUSTE_REQUERIDO: un valor ajustado a mano exige motivo' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(l || jsonb_build_object(
           'ajuste', coalesce((select sum(round((a->>'monto')::numeric, 2)) from jsonb_array_elements(coalesce(p_datos->'ajustes', '[]'::jsonb)) a
                                where a->>'persona' = l->>'persona'), 0))), '[]'::jsonb)
    into v_lineas
    from jsonb_array_elements(v_lineas) l;

  if exists (select 1 from jsonb_array_elements(v_lineas) l
              where (l->>'calculado')::numeric + (l->>'ajuste')::numeric < 0) then
    raise exception 'AJUSTE_NEGATIVO: nadie puede quedar con un valor negativo' using errcode = '22023';
  end if;

  -- ── Medio de pago ──
  if v_medio = 'transferencia' then
    if exists (select 1 from jsonb_array_elements(v_lineas) l
                where (l->>'calculado')::numeric + (l->>'ajuste')::numeric > 0
                  and coalesce(btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_datos->'referencias', '[]'::jsonb)) r
                                       where r->>'persona' = l->>'persona' limit 1)), '') = '') then
      raise exception 'REFERENCIA_REQUERIDA: cada transferencia lleva su referencia' using errcode = '22023';
    end if;
  elsif v_medio = 'sin_pago' then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'MOTIVO_REQUERIDO: marcar liquidada sin pago exige un motivo' using errcode = '22023';
    end if;
  elsif v_medio = 'efectivo' then
    v_sesion := public.fn_caja_abierta_para(p_organization_id, p_branch_id, v_uid);
    if v_sesion is null then
      raise exception 'CAJA_CERRADA: abra la caja para pagar en efectivo' using errcode = '55000';
    end if;
  end if;

  if v_medio in ('efectivo', 'transferencia')
     and not public.fn_is_period_open(p_organization_id, public.fn_today_for(p_organization_id, p_branch_id)) then
    raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
  end if;

  -- ── Número ──
  perform pg_advisory_xact_lock(hashtext('tip_settlements'), p_organization_id);
  select coalesce(max(number), 0) + 1 into v_numero from public.tip_settlements where organization_id = p_organization_id;
  v_codigo := 'LIQ-' || lpad(v_numero::text, 6, '0');

  insert into public.tip_settlements (
    id, organization_id, branch_id, number, period_from, period_to, distribution_method, payment_method,
    total, cash_tips, bank_tips, tips_count, tip_ids, adjustment_reason, notes, cash_session_id, request_id, created_by
  ) values (
    v_id, p_organization_id, p_branch_id, v_numero,
    nullif(p_datos->>'desde', '')::date, nullif(p_datos->>'hasta', '')::date,
    v_reparto, v_medio, v_total, v_efectivo, v_banco, cardinality(v_ids), v_ids,
    case when v_hay_ajuste then v_motivo_ajuste end, v_motivo, v_sesion, v_solicitud, v_uid
  );

  insert into public.tip_settlement_lines (settlement_id, organization_id, person_id, base, share_pct, calculated, adjustment, amount, transfer_reference)
  select v_id, p_organization_id, (l->>'persona')::uuid, (l->>'base')::numeric, (l->>'pct')::numeric,
         (l->>'calculado')::numeric, (l->>'ajuste')::numeric,
         (l->>'calculado')::numeric + (l->>'ajuste')::numeric,
         case when v_medio = 'transferencia' then
           nullif(btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_datos->'referencias', '[]'::jsonb)) r
                          where r->>'persona' = l->>'persona' limit 1)), '') end
    from jsonb_array_elements(v_lineas) l;

  perform set_config('app.propinas_rpc', 'on', true);
  update public.tips
     set is_distributed = true, distributed_at = now(), distribution_batch_id = v_id
   where organization_id = p_organization_id and id = any (v_ids);
  perform set_config('app.propinas_rpc', 'off', true);

  -- ── Pago ──
  -- Contador, 2026-11-20: la propina es de los trabajadores (art. 131 CST, Ley
  -- 1935 de 2018). Al cobrarla quedó en 28150501; al pagarla sale de ahí. Un
  -- asiento por trabajador: su documento es el tercero (fn_trg_tercero_linea_asiento
  -- lo lee de la clave 'tip_settlement:<liquidación>:<persona>').
  if v_medio = 'efectivo' then
    v_mov := public.pos_caja_registrar_movimiento(
      p_session_id := v_sesion,
      p_tipo := 'out',
      p_monto := v_total,
      p_concepto := 'Liquidación de propinas ' || v_codigo,
      p_concept_code := 'liquidacionPropinas',
      p_referencia := v_codigo,
      p_notas := null,
      p_uuid := v_solicitud);
    v_mov_id := (v_mov->>'id')::integer;
    update public.tip_settlements set cash_movement_id = v_mov_id where id = v_id;
    v_contra := coalesce(public.fn_money_account_code_pago(p_organization_id, p_branch_id, 'cash', null),
                         public.fn_cuenta_caja_existente(p_organization_id, p_branch_id, null));
  elsif v_medio = 'transferencia' then
    v_contra := coalesce(public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'bancos'),
                         public.fn_primera_cuenta_detalle(p_organization_id, array['1110']));
  end if;

  if v_medio in ('efectivo', 'transferencia') then
    v_pasivo := public.fn_primera_cuenta_detalle(p_organization_id, array['28150501']);
    if v_pasivo is null or v_contra is null then
      perform public.fn_log_journal_failure(p_organization_id, p_branch_id, now(), 'tip_settlements', v_id::text,
        'tip_settlement:' || v_id::text, v_pasivo, v_contra, v_total, 'sin_cuenta',
        'Liquidación de propinas sin la cuenta 28150501 o sin cuenta de '
          || case when v_medio = 'efectivo' then 'caja' else 'bancos' end);
    else
      for v_rec in
        select l.person_id, l.amount
          from public.tip_settlement_lines l
         where l.settlement_id = v_id and l.amount > 0
         order by l.amount desc, l.person_id
      loop
        perform public.fn_create_journal_entry(
          p_organization_id := p_organization_id,
          p_branch_id := p_branch_id,
          p_entry_date := now(),
          p_memo := 'Liquidación de propinas ' || v_codigo
                    || case when v_medio = 'efectivo' then ' en efectivo' else ' por transferencia' end,
          p_source := 'tip_settlements',
          p_source_id := v_id::text,
          p_debit_account := v_pasivo,
          p_credit_account := v_contra,
          p_amount := v_rec.amount,
          p_created_by := v_uid,
          p_fact_key := 'tip_settlement:' || v_id::text || ':' || v_rec.person_id::text);
      end loop;
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'total', v_total, 'ya_registrada', false,
                            'movimiento_caja', v_mov_id, 'sesion_caja', v_sesion);
end;
$function$;

create or replace function public.fn_propinas_liquidacion_anular(p_settlement_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_s public.tip_settlements%rowtype;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_sesion integer;
  v_mov jsonb;
  v_mov_id integer;
  v_je record;
  v_n_asientos integer := 0;
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_s from public.tip_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'LIQUIDACION_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_s.organization_id);
  if not public.fn_tiene_permiso(v_s.organization_id, 'pos.propinas.liquidar')
     or not public.fn_tiene_permiso(v_s.organization_id, 'pos.void') then
    raise exception 'SIN_PERMISO: anular una liquidación requiere pos.propinas.liquidar y pos.void' using errcode = '42501';
  end if;
  if not public.app_branch_access(v_s.branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;
  if v_s.status = 'anulada' then
    return jsonb_build_object('id', v_s.id, 'codigo', v_s.code, 'ya_anulada', true);
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO: anular una liquidación exige un motivo' using errcode = '22023';
  end if;

  -- El efectivo vuelve a la caja: la del egreso si sigue abierta; si no, la
  -- caja abierta de quien anula en la sucursal.
  if v_s.cash_movement_id is not null then
    select cs.id into v_sesion
      from public.cash_movements cm join public.cash_sessions cs on cs.id = cm.cash_session_id
     where cm.id = v_s.cash_movement_id and cs.status = 'open';
    if v_sesion is null then
      v_sesion := public.fn_caja_abierta_para(v_s.organization_id, v_s.branch_id, v_uid);
    end if;
    if v_sesion is null then
      raise exception 'CAJA_CERRADA: abra una caja para devolver el efectivo' using errcode = '55000';
    end if;
  end if;

  for v_je in
    select je.id from public.journal_entries je
     where je.organization_id = v_s.organization_id
       and je.source = 'tip_settlements' and je.source_id = v_s.id::text
       and coalesce(je.posted, false)
       and not exists (select 1 from public.journal_entries r
                        where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
     order by je.id
  loop
    if v_n_asientos = 0 and not public.fn_is_period_open(v_s.organization_id, public.fn_today_for(v_s.organization_id, v_s.branch_id)) then
      raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
    end if;
    perform public.fn_revertir_asiento_en_fecha(v_je.id, 'anulacion', 'liquidacion-propinas-' || v_s.id, now(), v_uid);
    v_n_asientos := v_n_asientos + 1;
  end loop;

  if v_sesion is not null then
    v_mov := public.pos_caja_registrar_movimiento(
      p_session_id := v_sesion,
      p_tipo := 'in',
      p_monto := v_s.total,
      p_concepto := 'Anulación de la liquidación de propinas ' || v_s.code,
      p_concept_code := 'liquidacionPropinas',
      p_referencia := v_s.code,
      p_notas := v_motivo);
    v_mov_id := (v_mov->>'id')::integer;
  end if;

  perform set_config('app.propinas_rpc', 'on', true);
  perform set_config('app.propinas_revertir', 'on', true);
  update public.tips
     set is_distributed = false, distributed_at = null, distribution_batch_id = null
   where organization_id = v_s.organization_id and distribution_batch_id = v_s.id and voided_at is null;
  get diagnostics v_n = row_count;
  perform set_config('app.propinas_revertir', 'off', true);
  perform set_config('app.propinas_rpc', 'off', true);

  update public.tip_settlements
     set status = 'anulada', voided_at = now(), voided_by = v_uid, void_reason = v_motivo,
         reversal_cash_movement_id = v_mov_id
   where id = v_s.id;

  return jsonb_build_object('id', v_s.id, 'codigo', v_s.code, 'ya_anulada', false,
                            'propinas_devueltas', v_n, 'asientos_revertidos', v_n_asientos,
                            'movimiento_caja', v_mov_id);
end;
$function$;

create or replace function public.fn_propinas_liquidacion_detalle(p_settlement_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_s public.tip_settlements%rowtype;
begin
  select * into v_s from public.tip_settlements where id = p_settlement_id;
  if not found then
    raise exception 'LIQUIDACION_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(v_s.branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_s.id, 'codigo', v_s.code, 'estado', v_s.status,
    'sucursal', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b where b.id = v_s.branch_id),
    'desde', v_s.period_from, 'hasta', v_s.period_to,
    'reparto', v_s.distribution_method, 'medio', v_s.payment_method,
    'total', v_s.total, 'efectivo', v_s.cash_tips, 'banco', v_s.bank_tips, 'cantidad', v_s.tips_count,
    'motivo_ajuste', v_s.adjustment_reason, 'notas', v_s.notes,
    'creada_en', v_s.created_at, 'creada_por', public.fn_propinas_persona(v_s.organization_id, v_s.created_by),
    'anulada_en', v_s.voided_at, 'motivo_anulacion', v_s.void_reason,
    'anulada_por', case when v_s.voided_by is not null then public.fn_propinas_persona(v_s.organization_id, v_s.voided_by) end,
    'sesion_caja', v_s.cash_session_id,
    'movimiento_caja', case when v_s.cash_movement_id is not null then
      (select jsonb_build_object('id', m.id, 'sesion', m.cash_session_id, 'fecha', m.created_at)
         from public.cash_movements m where m.id = v_s.cash_movement_id) end,
    'reingreso_caja', case when v_s.reversal_cash_movement_id is not null then
      (select jsonb_build_object('id', m.id, 'sesion', m.cash_session_id, 'fecha', m.created_at)
         from public.cash_movements m where m.id = v_s.reversal_cash_movement_id) end,
    'asientos', (select coalesce(jsonb_agg(jsonb_build_object('id', je.id, 'fecha', je.entry_date,
                                   'prefijo', je.comprobante_prefijo, 'numero', je.comprobante_numero) order by je.id), '[]'::jsonb)
                   from public.journal_entries je
                  where je.organization_id = v_s.organization_id
                    and je.source = 'tip_settlements' and je.source_id = v_s.id::text),
    'lineas', (select coalesce(jsonb_agg(public.fn_propinas_persona(v_s.organization_id, l.person_id) || jsonb_build_object(
                                 'base', l.base, 'pct', l.share_pct, 'calculado', l.calculated,
                                 'ajuste', l.adjustment, 'monto', l.amount, 'referencia', l.transfer_reference)
                               order by l.amount desc), '[]'::jsonb)
                 from public.tip_settlement_lines l where l.settlement_id = v_s.id),
    'propinas', (select coalesce(jsonb_agg(x order by (x->>'fecha') desc), '[]'::jsonb) from (
                   select jsonb_build_object(
                     'id', t.id, 'fecha', t.created_at, 'monto', t.amount, 'tipo', t.tip_type,
                     'persona', public.fn_propinas_persona(v_s.organization_id, t.server_id),
                     'venta', case when t.sale_id is null then null else jsonb_build_object(
                       'id', t.sale_id,
                       'numero', coalesce((select i.number from public.invoice_sales i
                                            where i.sale_id = t.sale_id and coalesce(i.document_type, 'invoice') <> 'credit_note'
                                            order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1),
                                          (select wo.order_number from public.web_orders wo join public.sales s on s.web_order_id = wo.id
                                            where s.id = t.sale_id)),
                       'tipo_numero', case when exists (select 1 from public.invoice_sales i where i.sale_id = t.sale_id
                                                          and coalesce(i.document_type, 'invoice') <> 'credit_note') then 'factura'
                                           else 'pedido' end) end) as x
                     from public.tips t
                    where t.organization_id = v_s.organization_id
                      and t.id = any (v_s.tip_ids)
                    limit 500) q)
  );
end;
$function$;

drop function if exists public.fn_propinas_pagar_lineas(uuid, text, integer, uuid, uuid, uuid[], jsonb);

alter table public.tip_settlement_lines drop constraint if exists tip_settlement_lines_paid_method_check;
alter table public.tip_settlement_lines
  drop column if exists cash_movement_id,
  drop column if exists paid_by,
  drop column if exists paid_method,
  drop column if exists paid_at;

alter table public.tip_settlements drop constraint if exists tip_settlements_status_check;
alter table public.tip_settlements add constraint tip_settlements_status_check
  check (status = any (array['pagada', 'anulada']));

delete from public.chart_of_accounts c
 where c.account_code = '28150502'
   and not exists (select 1 from public.journal_lines jl
                    where jl.organization_id = c.organization_id and jl.account_code = c.account_code);
delete from public.puc_plantilla where codigo = '28150502';
