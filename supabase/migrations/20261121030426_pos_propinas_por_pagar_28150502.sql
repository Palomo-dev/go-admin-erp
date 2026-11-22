-- Propinas liquidadas por pagar a trabajadores: 28150502 (Contador, 2026-11-20).
--
-- Al liquidar, la deuda deja de ser «propinas en general» (28150501) y pasa a
-- ser una deuda con cada trabajador (28150502). Ambas siguen en la 2815: es
-- plata de terceros.
--
--   Liquidar (cualquier medio): Débito 28150501 / Crédito 28150502, un asiento
--     por trabajador con su NIT o cédula como tercero.
--   Pagar (en el momento o después): Débito 28150502 / Crédito caja (1105) o
--     bancos (1110), un asiento por trabajador.
--   «Pagar después» (antes «sin pago»): la liquidación queda «por_pagar» hasta
--     pagar a todos con fn_propinas_liquidacion_pagar.
--   Anular: se reversan los asientos (la plata vuelve a 28150501) y el efectivo
--     pagado vuelve a la caja. Una liquidación pagada por nómina no se anula.
--   Cuadre (fn_propinas_cuadre): 28150501 = cobrado sin liquidar; 28150502 =
--     liquidado sin pagar, por trabajador.
--
-- A la fecha no hay liquidaciones (0 filas): el cambio de estados no toca datos.

-- ── 1. Cuenta 28150502 ─────────────────────────────────────────────────────
insert into public.puc_plantilla (codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
                                  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif)
values ('28150502', 'Propinas liquidadas por pagar a trabajadores', 'liability', '281505',
        'Propinas ya repartidas y todavía no pagadas, por trabajador (tercero). No es ingreso, gasto ni salario.',
        'credito', true, true, false, 'no_aplica', 'corriente')
on conflict (codigo) do nothing;

do $$
declare
  v_orgs integer[];
  v_org integer;
begin
  -- El arreglo se arma antes: fn_puc_asegurar_cuenta hace ALTER TABLE.
  select array_agg(distinct organization_id order by organization_id) into v_orgs from public.chart_of_accounts;
  foreach v_org in array v_orgs loop
    perform public.fn_puc_asegurar_cuenta(v_org, '28150502', 'Propinas liquidadas por pagar a trabajadores', true);
  end loop;
end $$;

update public.chart_of_accounts c
   set requiere_tercero = true,
       description = coalesce(c.description,
         'Propinas ya repartidas y todavía no pagadas, por trabajador (tercero). No es ingreso, gasto ni salario.')
 where c.account_code = '28150502' and not c.requiere_tercero;

-- ── 2. Estado «por pagar» y pago por línea ─────────────────────────────────
alter table public.tip_settlements drop constraint if exists tip_settlements_status_check;
alter table public.tip_settlements add constraint tip_settlements_status_check
  check (status = any (array['por_pagar', 'pagada', 'anulada']));

alter table public.tip_settlement_lines
  add column if not exists paid_at timestamptz,
  add column if not exists paid_method text,
  add column if not exists paid_by uuid references auth.users(id),
  add column if not exists cash_movement_id integer references public.cash_movements(id);

alter table public.tip_settlement_lines drop constraint if exists tip_settlement_lines_paid_method_check;
alter table public.tip_settlement_lines add constraint tip_settlement_lines_paid_method_check
  check (paid_method is null or paid_method = any (array['efectivo', 'transferencia', 'nomina']));

comment on column public.tip_settlement_lines.paid_at is 'Cuándo se pagó esta parte al trabajador (Débito 28150502). Null: liquidada y por pagar.';
comment on column public.tip_settlement_lines.paid_method is 'Cómo se le pagó: efectivo (caja), transferencia (bancos) o nómina.';
comment on column public.tip_settlement_lines.cash_movement_id is 'Egreso de caja del pago en efectivo.';

-- ── 3. Pago de las líneas (interna: la usan crear y pagar) ─────────────────
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

revoke all on function public.fn_propinas_pagar_lineas(uuid, text, integer, uuid, uuid, uuid[], jsonb) from public, anon, authenticated;

-- ── 4. Liquidar: 28150501 → 28150502 y, si se paga ya, 28150502 → caja o bancos ─
do $$
declare
  v_def text := pg_get_functiondef('public.fn_propinas_liquidacion_crear'::regproc);
  v_ini int;
  v_fin int;
begin
  if position('fn_propinas_pagar_lineas' in v_def) > 0 then
    return;
  end if;
  -- «Pagar después» ya no exige motivo.
  v_def := replace(v_def,
    E'  elsif v_medio = ''sin_pago'' then\n    if v_motivo is null or length(v_motivo) < 3 then\n      raise exception ''MOTIVO_REQUERIDO: marcar liquidada sin pago exige un motivo'' using errcode = ''22023'';\n    end if;\n',
    E'  elsif v_medio = ''sin_pago'' then\n    null;  -- «Pagar después»: queda por pagar en 28150502.\n');
  -- Todo medio asienta: el periodo tiene que estar abierto.
  v_def := replace(v_def,
    E'  if v_medio in (''efectivo'', ''transferencia'')\n     and not public.fn_is_period_open(',
    E'  if not public.fn_is_period_open(');
  v_ini := position('  -- ── Pago ──' in v_def);
  v_fin := position(E'  return jsonb_build_object(''id'', v_id, ''codigo'', v_codigo, ''total'', v_total, ''ya_registrada'', false,' in v_def);
  if v_ini = 0 or v_fin = 0 or position('MOTIVO_REQUERIDO: marcar' in v_def) > 0
     or position(E'  if not public.fn_is_period_open(' in v_def) = 0 then
    raise exception 'fn_propinas_liquidacion_crear cambió: revisar antes de aplicar';
  end if;
  v_def := substr(v_def, 1, v_ini - 1) || $p$  -- ── Liquidar y pagar ──
  -- Contador, 2026-11-20: al liquidar, la deuda pasa de 28150501 (propinas en
  -- general) a 28150502 (deuda con cada trabajador). Un asiento por
  -- trabajador; su documento es el tercero (fn_trg_tercero_linea_asiento lo
  -- lee de la clave). Pagar es otro asiento: 28150502 contra caja o bancos.
  v_pasivo := public.fn_primera_cuenta_detalle(p_organization_id, array['28150501']);
  v_contra := public.fn_primera_cuenta_detalle(p_organization_id, array['28150502']);
  if v_pasivo is null or v_contra is null then
    raise exception 'SIN_CUENTA: faltan las cuentas 28150501 o 28150502 en el plan' using errcode = '22023';
  end if;
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
      p_memo := 'Liquidación de propinas ' || v_codigo,
      p_source := 'tip_settlements',
      p_source_id := v_id::text,
      p_debit_account := v_pasivo,
      p_credit_account := v_contra,
      p_amount := v_rec.amount,
      p_created_by := v_uid,
      p_fact_key := 'tip_settlement:' || v_id::text || ':' || v_rec.person_id::text);
  end loop;

  if v_medio in ('efectivo', 'transferencia') then
    v_mov := public.fn_propinas_pagar_lineas(v_id, v_medio, v_sesion, v_solicitud, v_uid, null,
                                             coalesce(p_datos->'referencias', '[]'::jsonb));
    v_mov_id := nullif(v_mov->>'movimiento_caja', '')::integer;
  else
    update public.tip_settlements set status = 'por_pagar' where id = v_id;
  end if;

$p$ || substr(v_def, v_fin);
  execute v_def;
end $$;

-- ── 5. Pagar una liquidación «por pagar» ───────────────────────────────────
create or replace function public.fn_propinas_liquidacion_pagar(p_settlement_id uuid, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_s public.tip_settlements%rowtype;
  v_medio text := p_datos->>'medio';
  v_solicitud uuid;
  v_personas uuid[];
  v_sesion integer;
  v_r jsonb;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_s from public.tip_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'LIQUIDACION_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_s.organization_id);
  if not public.fn_tiene_permiso(v_s.organization_id, 'pos.propinas.liquidar') then
    raise exception 'SIN_PERMISO: pagar propinas requiere el permiso pos.propinas.liquidar' using errcode = '42501';
  end if;
  if not public.app_branch_access(v_s.branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;
  if v_s.status = 'anulada' then
    raise exception 'LIQUIDACION_ANULADA: % está anulada', v_s.code using errcode = '22023';
  end if;
  if v_s.status = 'pagada' then
    return jsonb_build_object('id', v_s.id, 'codigo', v_s.code, 'ya_pagada', true);
  end if;
  if v_medio is null or v_medio not in ('efectivo', 'transferencia') then
    raise exception 'MEDIO_INVALIDO: medio %', coalesce(v_medio, '(vacío)') using errcode = '22023';
  end if;
  begin
    v_solicitud := (p_datos->>'solicitud')::uuid;
  exception when others then
    v_solicitud := null;
  end;
  if v_solicitud is null then
    raise exception 'SOLICITUD_REQUERIDA' using errcode = '22023';
  end if;
  if jsonb_typeof(p_datos->'personas') = 'array' and jsonb_array_length(p_datos->'personas') > 0 then
    select array_agg(distinct x::uuid) into v_personas from jsonb_array_elements_text(p_datos->'personas') x;
  end if;
  if not public.fn_is_period_open(v_s.organization_id, public.fn_today_for(v_s.organization_id, v_s.branch_id)) then
    raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
  end if;
  if v_medio = 'efectivo' then
    v_sesion := public.fn_caja_abierta_para(v_s.organization_id, v_s.branch_id, v_uid);
    if v_sesion is null then
      raise exception 'CAJA_CERRADA: abra la caja para pagar en efectivo' using errcode = '55000';
    end if;
  end if;

  v_r := public.fn_propinas_pagar_lineas(v_s.id, v_medio, v_sesion, v_solicitud, v_uid, v_personas,
                                         coalesce(p_datos->'referencias', '[]'::jsonb));
  return v_r || jsonb_build_object('id', v_s.id, 'codigo', v_s.code, 'ya_pagada', false,
    'estado', (select status from public.tip_settlements where id = v_s.id), 'sesion_caja', v_sesion);
end;
$function$;

revoke all on function public.fn_propinas_liquidacion_pagar(uuid, jsonb) from public, anon;
grant execute on function public.fn_propinas_liquidacion_pagar(uuid, jsonb) to authenticated;

-- ── 6. Anular: devuelve el efectivo pagado (ya no siempre el total) ─────────
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
  v_efectivo numeric(14, 2);
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
  if exists (select 1 from public.tip_settlement_lines l where l.settlement_id = v_s.id and l.paid_method = 'nomina') then
    raise exception 'PAGADA_POR_NOMINA: parte de % se pagó por nómina; se corrige en la nómina', v_s.code using errcode = '22023';
  end if;

  -- El efectivo pagado vuelve a la caja: la del último egreso si sigue abierta;
  -- si no, la caja abierta de quien anula en la sucursal.
  select coalesce(sum(l.amount), 0) into v_efectivo
    from public.tip_settlement_lines l where l.settlement_id = v_s.id and l.paid_method = 'efectivo';
  if v_efectivo > 0 then
    select cs.id into v_sesion
      from public.tip_settlement_lines l
      join public.cash_movements cm on cm.id = l.cash_movement_id
      join public.cash_sessions cs on cs.id = cm.cash_session_id
     where l.settlement_id = v_s.id and cs.status = 'open'
     order by cm.id desc limit 1;
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
     order by je.id desc
  loop
    if v_n_asientos = 0 and not public.fn_is_period_open(v_s.organization_id, public.fn_today_for(v_s.organization_id, v_s.branch_id)) then
      raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
    end if;
    perform public.fn_revertir_asiento_en_fecha(v_je.id, 'anulacion', 'liquidacion-propinas-' || v_s.id, now(), v_uid);
    v_n_asientos := v_n_asientos + 1;
  end loop;

  if v_efectivo > 0 then
    v_mov := public.pos_caja_registrar_movimiento(
      p_session_id := v_sesion,
      p_tipo := 'in',
      p_monto := v_efectivo,
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

-- ── 7. Detalle: el pago de cada línea ──────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_propinas_liquidacion_detalle'::regproc);
  v_viejo text := $q$'ajuste', l.adjustment, 'monto', l.amount, 'referencia', l.transfer_reference)$q$;
  v_nuevo text := $q$'ajuste', l.adjustment, 'monto', l.amount, 'referencia', l.transfer_reference,
                                 'pagado_en', l.paid_at, 'medio_pago', l.paid_method)$q$;
begin
  if position('pagado_en' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'fn_propinas_liquidacion_detalle cambió';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- ── 8. Cuadre de cierre ────────────────────────────────────────────────────
-- 28150501 = propinas cobradas y sin liquidar; 28150502 = liquidadas y sin
-- pagar, por trabajador. Una diferencia distinta de cero se revisa.
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

revoke all on function public.fn_propinas_cuadre(integer, timestamptz) from public, anon;
grant execute on function public.fn_propinas_cuadre(integer, timestamptz) to authenticated;

comment on function public.fn_propinas_liquidacion_pagar(uuid, jsonb) is
  'Paga una liquidación de propinas «por pagar» (todas sus personas o las elegidas): Débito 28150502 / Crédito caja o bancos, un asiento por trabajador.';
