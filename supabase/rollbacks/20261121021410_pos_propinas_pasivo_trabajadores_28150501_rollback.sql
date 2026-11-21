-- Reversión de 20261121021410_pos_propinas_pasivo_trabajadores_28150501.sql
--
-- Vuelve a la regla anterior (Débito 5105 / Crédito 1105), al devengo de la
-- venta POS por su total y a la liquidación sin asiento en efectivo. Las cuentas
-- 281505 y 28150501 se borran solo donde no tienen movimientos (el trigger
-- trg_puc_no_borrar_con_movimientos protege las que sí).
--
-- Ojo: si ya hay propinas asentadas en 28150501, revertir deja ese saldo ahí;
-- las liquidaciones nuevas lo dejarían sin bajar. Revisar con el Contador antes.

-- ── Regla de la propina ────────────────────────────────────────────────────
update public.accounting_rules
   set debit_account_code = '5105', credit_account_code = '1105', description = 'Registro de propina'
 where source_type = 'tip' and debit_account_code = '1305' and credit_account_code = '28150501';

do $$
declare
  v_def text := pg_get_functiondef('public.fn_create_default_accounting_rules'::regproc);
  v_viejo text := $q$(org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true)$q$;
  v_nuevo text := $q$(org_id, 'Propina', 'Propina recibida para trabajadores (Ley 1935 de 2018)', 'tip', 'created', '1305', '28150501', null, false, 30, true)$q$;
begin
  if position(v_nuevo in v_def) > 0 then
    execute replace(v_def, v_nuevo, v_viejo);
  end if;
end $$;

-- ── Asiento de la propina (definición anterior) ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_journal_tip()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_default_branch integer;
BEGIN
    IF COALESCE(NEW.amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT MIN(id) INTO v_default_branch FROM branches WHERE organization_id = NEW.organization_id;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'tip'
      AND is_active = true
    ORDER BY priority LIMIT 1;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(NEW.branch_id, v_default_branch),
        p_entry_date := COALESCE(NEW.created_at, now()),
        p_memo := 'Propina - ' || COALESCE(NEW.id::text, ''),
        p_source := 'tips',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.amount
    );

    RETURN NEW;
END;
$function$;

-- ── Devengo de la venta POS por su total ───────────────────────────────────
do $$
declare v_def text := pg_get_functiondef('public.fn_auto_journal_sale_pos'::regproc);
begin
  v_def := replace(v_def, E'    v_fallo text;\n    v_venta numeric;\nBEGIN', E'    v_fallo text;\nBEGIN');
  v_def := replace(v_def, E'    -- Propinas (Contador, 2026-11-20): sales.total incluye la propina, que no es\n    -- ingreso ni parte de la base del impuesto. Se devenga solo la venta; la\n    -- propina va a 28150501 con su propio asiento (fn_auto_journal_tip).\n    v_venta := coalesce(NEW.total, 0) - coalesce(NEW.tip_amount, 0);\n\n', '');
  v_def := replace(v_def, 'p_amount := v_venta,', 'p_amount := NEW.total,');
  v_def := replace(v_def, ', v_venta,', ', NEW.total,');
  if position('v_venta' in v_def) > 0 then
    raise exception 'fn_auto_journal_sale_pos no quedó como antes';
  end if;
  execute v_def;
end $$;

-- ── Tercero de las líneas (sin propinas ni liquidaciones) ──────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_tercero_linea_asiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_nit text;
  v_nombre text;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id
    into v_source, v_source_id, v_org
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales',
                                          'supplier_advance', 'supplier_advance_application', 'supplier_advance_refund') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  elsif v_source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund') then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_anticipo_proveedor(v_source, v_source_id) t;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

-- ── Movimiento de caja y liquidación (definiciones de 20261120200000) ──────
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
  -- liquidacionPropinas: el asiento de cada propina (fn_auto_journal_tip) ya
  -- acreditó caja al cobrarla; el egreso (y su reingreso al anular) es solo
  -- la salida física del dinero.
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

  if v_medio = 'transferencia'
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
  elsif v_medio = 'transferencia' then
    -- Reclasificación: la propina acreditó caja al cobrarse, pero el dinero
    -- sale del banco.
    v_caja := public.fn_cuenta_caja_existente(p_organization_id, p_branch_id, null);
    v_bancos := coalesce(public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'bancos'),
                         public.fn_primera_cuenta_detalle(p_organization_id, array['1110']));
    if v_caja is null or v_bancos is null then
      perform public.fn_log_journal_failure(p_organization_id, p_branch_id, now(), 'tip_settlements', v_id::text,
        'tip_settlement:' || v_id::text, v_caja, v_bancos, v_total, 'sin_cuenta',
        'Liquidación de propinas por transferencia sin cuenta de caja o de bancos');
    else
      perform public.fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := p_branch_id,
        p_entry_date := now(),
        p_memo := 'Liquidación de propinas ' || v_codigo || ' por transferencia',
        p_source := 'tip_settlements',
        p_source_id := v_id::text,
        p_debit_account := v_caja,
        p_credit_account := v_bancos,
        p_amount := v_total,
        p_created_by := v_uid,
        p_fact_key := 'tip_settlement:' || v_id::text);
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'total', v_total, 'ya_registrada', false,
                            'movimiento_caja', v_mov_id, 'sesion_caja', v_sesion);
end;
$function$;

-- ── Cuentas ────────────────────────────────────────────────────────────────
delete from public.chart_of_accounts c
 where c.account_code = '28150501'
   and not exists (select 1 from public.journal_lines jl
                    where jl.organization_id = c.organization_id and jl.account_code = c.account_code);
delete from public.chart_of_accounts c
 where c.account_code = '281505'
   and not exists (select 1 from public.chart_of_accounts h
                    where h.organization_id = c.organization_id and h.parent_code = '281505')
   and not exists (select 1 from public.journal_lines jl
                    where jl.organization_id = c.organization_id and jl.account_code = c.account_code);

delete from public.puc_plantilla where codigo in ('28150501', '281505');
update public.puc_plantilla set es_movimiento = true where codigo = '2815';
