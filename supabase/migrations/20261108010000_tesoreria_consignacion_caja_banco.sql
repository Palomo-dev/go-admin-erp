-- ============================================================================
-- Ronda 3 de Finanzas, frente T · Tesorería. Aplicada por el MCP el 2026-11-07
-- con orden del dueño.
--
-- Consignar caja a banco (Tesorería v2, frame 1004:82448; M2 de
-- docs/design/FINANZAS-TESORERIA-V2.md §1.4). Hoy no hay forma de registrar
-- que el efectivo de un turno se llevó al banco: quien lo intentaba hacía un
-- egreso de caja y un ingreso de banco por separado, con DOS asientos contra
-- resultados (5195 y 4295) en vez de un traslado entre cuentas 11.
--
-- Qué hace `fn_consignacion_caja_banco`, en una sola transacción:
--   1. Egreso de la caja por `pos_caja_registrar_movimiento` (la RPC única de
--      movimientos de caja), concepto `consignacionBanco`, uuid = p_id.
--      `fn_asiento_movimiento_caja` lo OMITE: el asiento lo hace el banco.
--   2. Ingreso en la cuenta bancaria (`bank_transactions` deposit) con
--      `cuenta_contable` = la caja (1105xx) e `import_source = 'consignacion'`.
--      `trg_bank_tx_saldo` mueve el saldo y `fn_auto_journal_bank` genera el
--      único asiento: 1110xx (banco) D / 1105xx (caja) C.
--   3. Si hay comisión o GMF pagado con el mismo efectivo: un segundo egreso de
--      caja con `cuenta_contable` 5305xx (gastos bancarios) → 5305 D / 1105 C.
-- Idempotente por p_id (doble clic o reintento devuelven la misma consignación).
-- Permiso `finance.create`; misma organización; caja abierta; banco activo en la
-- moneda base; fecha no futura en la zona de la organización.
-- Decisión del dueño (pregunta 3): en caja NO se bloquea si supera el esperado
-- (el esperado puede ir atrasado); la pantalla avisa.
-- ============================================================================

-- 1. El concepto de consignación no genera asiento por el lado de la caja.
create or replace function public.fn_asiento_movimiento_caja(p_organization_id integer, p_tipo text, p_concept_code text)
 returns table(accion text, debito text, credito text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text := case when p_tipo in ('in', 'deposit', 'income') then 'in' else 'out' end;
  v_clave text := coalesce(p_concept_code, '');
  v_caja text;
  v_contra text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  -- `consignacionBanco`: el asiento 1110 D / 1105 C lo genera el ingreso bancario
  -- de `fn_consignacion_caja_banco` (si la caja también asentara, sería doble).
  if v_clave in ('cambioEfectivo', 'consignacionBanco') then
    accion := 'omitir';
    debito := null;
    credito := null;
    return next;
    return;
  end if;

  v_caja := public.fn_cuenta_caja_existente(p_organization_id, null, null);

  if v_tipo = 'out' then
    v_contra := case v_clave
      when 'pagoProveedor' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['22050501', '2205', '2105']))
      when 'prestamoEmpleado' then public.fn_primera_cuenta_detalle(p_organization_id, array['1365'])
      when 'retiroConsignacion' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      when 'retiroEfectivo' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      else public.fn_primera_cuenta_detalle(p_organization_id, array['5195', '5135', '5305', '5105'])
    end;
    if v_contra is not null and left(v_contra, 1) = '4' then
      v_contra := null;
    end if;
    if v_caja is null or v_contra is null then
      accion := 'sin_cuenta';
      debito := v_contra;
      credito := v_caja;
      return next;
      return;
    end if;
    accion := 'asiento';
    debito := v_contra;
    credito := v_caja;
    return next;
    return;
  end if;

  v_contra := case v_clave
    when 'ventaContadoEspecial' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['4135', '414015', '4145', '4235', '4105']))
    when 'fondoAdicional' then public.fn_primera_cuenta_detalle(p_organization_id, array['3105', '3115', '3605'])
    when 'prestamoInterno' then public.fn_primera_cuenta_detalle(p_organization_id, array['2380', '2305', '2195'])
    when 'devolucionRecibida' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['22050501', '2205', '2105']))
    else public.fn_primera_cuenta_detalle(p_organization_id, array[public.fn_cuenta_ingresos_diversos(p_organization_id, null)])
  end;
  if v_clave is distinct from 'ventaContadoEspecial' and v_contra is not null and left(v_contra, 4) = '4105' then
    v_contra := null;
  end if;
  if v_caja is null or v_contra is null then
    accion := 'sin_cuenta';
    debito := v_caja;
    credito := v_contra;
    return next;
    return;
  end if;
  accion := 'asiento';
  debito := v_caja;
  credito := v_contra;
  return next;
end;
$function$;

-- 2. La consignación.
create or replace function public.fn_consignacion_caja_banco(
  p_id uuid,
  p_organization_id integer,
  p_sesion_id integer,
  p_cuenta_banco integer,
  p_monto numeric,
  p_comision numeric default 0,
  p_fecha date default null,
  p_referencia text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_comision numeric := round(coalesce(p_comision, 0), 2);
  s record;
  b public.bank_accounts%rowtype;
  v_previa public.bank_transactions%rowtype;
  v_caja text;
  v_gasto text;
  v_tz text;
  v_fecha timestamptz;
  v_moneda_base text;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_mov jsonb;
  v_tx public.bank_transactions%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_id is null or p_organization_id is null or p_sesion_id is null or p_cuenta_banco is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);

  -- Idempotencia por el id que genera el cliente al abrir el diálogo.
  perform pg_advisory_xact_lock(hashtextextended('fn_consignacion_caja_banco:' || p_id::text, 0));
  select * into v_previa
    from public.bank_transactions
   where organization_id = p_organization_id
     and import_source = 'consignacion'
     and import_id = p_id::text
   limit 1;
  if found then
    return jsonb_build_object('id', p_id, 'repetida', true, 'bank_transaction_id', v_previa.id);
  end if;

  if v_monto <= 0 or v_monto > 1e12 or v_comision < 0 or v_comision > v_monto then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  select id, organization_id, branch_id, status into s
    from public.cash_sessions where id = p_sesion_id for share;
  if not found or s.organization_id <> p_organization_id then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;
  if s.status <> 'open' then
    raise exception 'caja_cerrada' using errcode = '55000';
  end if;

  select * into b from public.bank_accounts where id = p_cuenta_banco for update;
  if b.id is null or b.organization_id <> p_organization_id then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  if not coalesce(b.is_active, true) then
    raise exception 'cuenta_inactiva' using errcode = '22023';
  end if;
  perform public.fn_fc_acceso_sucursal(b.branch_id);
  v_moneda_base := upper(btrim(public.fn_moneda_base_organizacion(p_organization_id)));
  if upper(btrim(coalesce(b.currency, v_moneda_base))) <> v_moneda_base then
    raise exception 'moneda_distinta' using errcode = '22023';
  end if;

  if p_fecha is null then
    v_fecha := now();
  else
    if p_fecha > public.fn_today_for(p_organization_id, s.branch_id) then
      raise exception 'fecha_futura' using errcode = '22023';
    end if;
    v_tz := public.fn_timezone_for(p_organization_id, s.branch_id);
    v_fecha := ((p_fecha + (now() at time zone v_tz)::time) at time zone v_tz);
  end if;

  v_caja := public.fn_primera_cuenta_detalle(p_organization_id, array['1105']);
  if v_caja is null then
    raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023', detail = 'sin cuenta de caja 1105';
  end if;

  -- 1. Sale el efectivo de la caja (sin asiento propio).
  v_mov := public.pos_caja_registrar_movimiento(
    p_session_id := p_sesion_id,
    p_tipo := 'out',
    p_monto := v_monto,
    p_concepto := 'Consignación a ' || coalesce(nullif(btrim(b.name), ''), b.bank_name, 'banco'),
    p_concept_code := 'consignacionBanco',
    p_referencia := v_ref,
    p_notas := null,
    p_uuid := p_id
  );

  -- 2. Entra al banco: asiento 1110xx D / 1105xx C por el disparador del banco.
  insert into public.bank_transactions (
    organization_id, branch_id, bank_account_id, trans_date, description, amount,
    reference, transaction_type, status, import_source, import_id, cuenta_contable
  ) values (
    p_organization_id, coalesce(s.branch_id, b.branch_id), b.id, v_fecha,
    'Consignación de caja #' || p_sesion_id, v_monto,
    v_ref, 'deposit', 'unmatched', 'consignacion', p_id::text, v_caja
  ) returning * into v_tx;

  -- 3. Comisión o GMF pagados con el mismo efectivo: gasto bancario.
  if v_comision > 0 then
    v_gasto := public.fn_primera_cuenta_detalle(p_organization_id, array['530505', '5305']);
    if v_gasto is null then
      raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023', detail = 'sin cuenta de gastos bancarios 5305';
    end if;
    perform public.pos_caja_registrar_movimiento(
      p_session_id := p_sesion_id,
      p_tipo := 'out',
      p_monto := v_comision,
      p_concepto := 'Comisión de consignación',
      p_referencia := v_ref,
      p_uuid := public.fn_uuid_desde_texto('consignacion-comision:' || p_id::text),
      p_cuenta_contable := v_gasto
    );
  end if;

  return jsonb_build_object(
    'id', p_id,
    'repetida', false,
    'cash_movement_id', (v_mov->>'id')::integer,
    'bank_transaction_id', v_tx.id,
    'monto', v_monto,
    'comision', v_comision
  );
end;
$function$;

-- uuid estable a partir de un texto (para la comisión, idempotente con la consignación).
create or replace function public.fn_uuid_desde_texto(p_texto text)
 returns uuid
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-5' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12))::uuid
    from (select encode(sha256(convert_to(p_texto, 'UTF8')), 'hex') as h) x;
$function$;

revoke all on function public.fn_consignacion_caja_banco(uuid, integer, integer, integer, numeric, numeric, date, text) from public, anon;
grant execute on function public.fn_consignacion_caja_banco(uuid, integer, integer, integer, numeric, numeric, date, text) to authenticated, service_role;
revoke all on function public.fn_uuid_desde_texto(text) from public, anon;
grant execute on function public.fn_uuid_desde_texto(text) to authenticated, service_role;

comment on function public.fn_consignacion_caja_banco(uuid, integer, integer, integer, numeric, numeric, date, text) is
  'Consigna efectivo de una caja abierta en una cuenta bancaria: egreso de caja sin asiento propio + ingreso bancario con un solo asiento 1110 D / 1105 C (+ comisión 5305 D / 1105 C). Idempotente por p_id.';

-- Verificación sugerida antes de aplicar (begin; … rollback;):
--   select * from public.fn_asiento_movimiento_caja(<org>, 'out', 'consignacionBanco'); -- accion = 'omitir'
--   con una sesión abierta y un banco de prueba de la misma org, llamar dos veces con el mismo p_id:
--   la segunda devuelve repetida = true; un asiento source = 'bank_transactions' con 1110xx D / 1105xx C.
