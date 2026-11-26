-- Reversión de 20261126070000_caja_entre_turnos_fase1.sql («Caja — lo que sale entre turnos», fase 1).
-- Devuelve pos_caja__esperado_calculo, fn_asiento_movimiento_caja y fn_consignacion_caja_banco a su
-- versión anterior y quita lo nuevo. OJO: borra las columnas nuevas de cash_sessions / cash_movements
-- y la bitácora; los asientos y movimientos ya creados por las RPC nuevas se quedan (son hechos
-- contables) y, sin destino_cierre, sus movimientos volverían a contar en el esperado de su turno.
-- Probado en seco el 2026-11-25 (transacción revertida).

drop function if exists public.pos_caja_revisar_descuadre(integer, text);
drop function if exists public.pos_caja_abrir(integer, integer, numeric, text, text, text, jsonb, text, text, uuid);
drop function if exists public.pos_caja_base_sugerida(integer, integer);
drop function if exists public.fn_caja_turno_anterior(integer, integer, uuid);
drop function if exists public.pos_caja_cerrar_turno(integer, numeric, jsonb, jsonb, jsonb, text, boolean);
drop function if exists public.fn_caja_turno_asiento_tercero(integer, integer, timestamptz, text, text, text, text, text, text, text, text, text, text, numeric);
drop function if exists public.fn_caja_turno_movimiento(integer, text, numeric, text, text, text, text, text, text, text, text, text, uuid);
drop function if exists public.fn_caja_turno_contrapartida(integer, text, uuid, text, text, boolean);
drop function if exists public.fn_caja_turno_tercero_persona(integer, uuid);
drop function if exists public.fn_caja_turno_cuenta(integer, text);
drop function if exists public.fn_caja_turno_cuenta_caja(integer, integer, text);
drop function if exists public.fn_caja_turno_config(integer, integer);
drop function if exists public.fn_org_tipo_persona(integer);

-- fn_consignacion_caja_banco vuelve a tener su cuerpo completo.
create or replace function public.fn_consignacion_caja_banco(p_id uuid, p_organization_id integer, p_sesion_id integer, p_cuenta_banco integer, p_monto numeric, p_comision numeric DEFAULT 0, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text)
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

  insert into public.bank_transactions (
    organization_id, branch_id, bank_account_id, trans_date, description, amount,
    reference, transaction_type, status, import_source, import_id, cuenta_contable
  ) values (
    p_organization_id, coalesce(s.branch_id, b.branch_id), b.id, v_fecha,
    'Consignación de caja #' || p_sesion_id, v_monto,
    v_ref, 'deposit', 'unmatched', 'consignacion', p_id::text, v_caja
  ) returning * into v_tx;

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
drop function if exists public.fn_consignacion_caja_banco__aplicar(uuid, integer, integer, integer, numeric, numeric, date, text);

-- fn_asiento_movimiento_caja sin 'destinoCierre' ni 'trasladoCaja' en la lista de omitidos.
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
  if v_clave in ('cambioEfectivo', 'consignacionBanco', 'liquidacionPropinas') then
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

-- pos_caja__esperado_calculo vuelve a contar todos los movimientos de la sesión.
create or replace function public.pos_caja__esperado_calculo(p_session_id integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  s public.cash_sessions%rowtype;
  v_hasta timestamptz;
  v_por_cajero boolean;
  v_ventas_ef numeric := 0;
  v_vuelto numeric := 0;
  v_abonos_ef numeric := 0;
  v_compras_ef numeric := 0;
  v_devoluciones numeric := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_efectivo numeric := 0;
  v_por_metodo jsonb := '{}'::jsonb;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  v_hasta := coalesce(s.closed_at, now());
  v_por_cajero := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = s.organization_id and os.key = 'pos_cash_session_mode'),
    'branch') = 'user';

  with p as (
    select coalesce(pay.method, 'other') as metodo,
           coalesce(pay.amount, 0) as monto,
           coalesce(pay.change_amount, 0) as vuelto,
           coalesce(pay.source, '') as origen
      from public.payments pay
     where pay.organization_id = s.organization_id
       and pay.status = 'completed'
       and pay.created_at >= s.opened_at
       and pay.created_at <= v_hasta
       and (s.branch_id is null or pay.branch_id = s.branch_id)
       and (not v_por_cajero or pay.created_by = s.opened_by)
  )
  select
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(vuelto) filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'account_receivable'), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen in ('invoice_purchase', 'account_payable')), 0),
    coalesce(
      (select jsonb_object_agg(x.metodo, x.total)
         from (select metodo, sum(monto) as total from p
                where metodo <> 'cash' and origen not in ('invoice_purchase', 'account_payable')
                group by metodo) x),
      '{}'::jsonb)
    into v_ventas_ef, v_vuelto, v_abonos_ef, v_compras_ef, v_por_metodo
    from p;

  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
     and r.refund_method is null
     and r.created_at >= s.opened_at
     and r.created_at <= v_hasta
     and (s.branch_id is null or r.branch_id = s.branch_id)
     and (not v_por_cajero or r.user_id = s.opened_by);

  select coalesce(sum(m.amount) filter (where m.type = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.type = 'out'), 0)
    into v_entradas, v_salidas
    from public.cash_movements m
   where m.cash_session_id = s.id;

  v_efectivo := coalesce(s.initial_amount, 0)
              + (v_ventas_ef - v_vuelto)
              + v_abonos_ef
              + v_entradas - v_salidas
              - v_compras_ef
              - v_devoluciones;

  return jsonb_build_object(
    'session_id', s.id,
    'organization_id', s.organization_id,
    'status', s.status,
    'efectivo_esperado', round(v_efectivo, 2),
    'por_metodo', v_por_metodo || jsonb_build_object('cash', round(v_efectivo, 2)),
    'detalle', jsonb_build_object(
      'inicial', coalesce(s.initial_amount, 0),
      'ventas_efectivo', v_ventas_ef - v_vuelto,
      'vuelto', v_vuelto,
      'abonos_efectivo', v_abonos_ef,
      'entradas', v_entradas,
      'salidas', v_salidas,
      'compras_efectivo', v_compras_ef,
      'devoluciones', v_devoluciones
    ),
    'por_cajero', v_por_cajero,
    'hasta', v_hasta
  );
end;
$function$;

drop trigger if exists trg_caja_turno_guarda on public.cash_sessions;
drop trigger if exists trg_caja_turno_guarda on public.cash_movements;
drop function if exists public.fn_caja_turno_guarda();

drop table if exists public.cash_session_revisiones;

delete from public.role_permissions
 where permission_id in (select id from public.permissions where code = 'pos.cajas.explicar_diferencias');
delete from public.permissions where code = 'pos.cajas.explicar_diferencias';

alter table public.cash_movements drop constraint if exists cash_movements_destino_cierre_chk;
alter table public.cash_movements drop column if exists destino_cierre;

alter table public.cash_sessions
  drop constraint if exists cash_sessions_diferencia_apertura_estado_chk,
  drop constraint if exists cash_sessions_diferencia_apertura_motivo_chk,
  drop constraint if exists cash_sessions_descuadre_estado_chk,
  drop constraint if exists cash_sessions_faltante_a_cargo_chk;
alter table public.cash_sessions
  drop column if exists base_dejada,
  drop column if exists base_sugerida,
  drop column if exists diferencia_apertura,
  drop column if exists diferencia_apertura_motivo,
  drop column if exists diferencia_apertura_nota,
  drop column if exists diferencia_apertura_estado,
  drop column if exists origen_base,
  drop column if exists reconteo_pedido_at,
  drop column if exists descuadre_estado,
  drop column if exists descuadre_revisado_por,
  drop column if exists descuadre_revisado_at,
  drop column if exists descuadre_nota,
  drop column if exists tolerancia_aplicada,
  drop column if exists faltante_a_cargo;
