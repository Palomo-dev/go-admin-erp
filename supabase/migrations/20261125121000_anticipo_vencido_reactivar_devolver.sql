-- GO-contraentrega · Anticipo pagado con el pedido vencido (Figma «05 POS y ventas» 3181-202769)
--
-- Decisiones del dueño (2026-11-25):
--   1. Se reactiva SOLO si el anticipo llega hasta 24 h después de vencer y hay stock de TODAS las
--      líneas, por el MISMO camino que el anticipo pagado a tiempo: la base vuelve a apartar el
--      stock (todo o nada) y deja el pedido «Pendiente» con el anticipo pagado; la tienda pide al
--      ERP la confirmación automática de siempre (autoConfirmPaidOrder →
--      confirmarContraentregaConAnticipo → fn_confirmar_pedido_web_completo).
--   2. Sin stock o con más de 24 h: queda «Anticipo pagado · vencido» (estado deducido: expired +
--      advance_status='paid' + sin devolución; sin columna nueva), con aviso en la campana.
--   3. Devolver: completo, por el mismo medio (reverso en la pasarela) o por transferencia.
--      Asiento Dr 2805 / Cr 138020xx (pasarela) o 1110 (banco). La comisión ya quedó como gasto
--      cuando la pasarela liquidó: no se reversa.
--   4. Recordatorios internos a las 2 h y a las 24 h si nadie decide. NUNCA se devuelve dinero solo.
--
-- Piezas:
--   · fn_web_order_anticipo_tardio(pedido): evalúa y reactiva (solo service_role).
--   · fn_web_order_anticipo_resultado: tras registrar el pago de un pedido vencido llama a la
--     anterior y responde 'pagado_tarde_reactivable', 'pagado_vencido_sin_stock' o
--     'pagado_vencido_fuera_de_plazo' (antes, siempre 'pagado_pedido_cerrado').
--   · fn_web_order_anticipo_vencido_stock(pedido): stock por línea en la sede (pantalla del detalle).
--   · fn_web_order_anticipo_devolver(...): la devolución con su asiento (sesión + permiso).
--   · fn_web_order_anticipo_vencido_recordar(): campana a las 2 h y a las 24 h (pg_cron, 15 min).
--   · web_order_notices.moment admite 'anticipo_reactivado', 'anticipo_revisando',
--     'anticipo_devuelto' (avisos al cliente con la marca de la tienda).
--
-- Requiere 20261125120000 (anticipo en 2805: fn_anticipo_en_2805).

-- ─────────────────────────────────────────────────────────────────────────────
-- Momentos nuevos de los avisos al cliente.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.web_order_notices DROP CONSTRAINT IF EXISTS web_order_notices_moment_check;
ALTER TABLE public.web_order_notices ADD CONSTRAINT web_order_notices_moment_check
  CHECK (moment = ANY (ARRAY['recibido'::text, 'confirmado'::text, 'listo'::text, 'en_camino'::text,
                             'entregado'::text, 'novedad'::text, 'rechazado'::text,
                             'anticipo_reactivado'::text, 'anticipo_revisando'::text, 'anticipo_devuelto'::text]));

-- Pesos sin decimales con punto de miles: «$ 20.000».
CREATE OR REPLACE FUNCTION public.fn_pesos_texto(p_valor numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select '$ ' || replace(to_char(round(coalesce(p_valor, 0))::bigint, 'FM999,999,999,990'), ',', '.');
$function$;

-- Aviso en la campana del equipo (una vez por pedido y tipo/hito).
CREATE OR REPLACE FUNCTION public.fn_web_order_anticipo_campana(
  p_wo public.web_orders, p_tipo text, p_titulo text, p_texto text, p_hito text DEFAULT NULL, p_urgente boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if exists (select 1 from public.notifications n
              where n.organization_id = p_wo.organization_id
                and n.payload->>'type' = p_tipo
                and n.payload->>'order_id' = p_wo.id::text
                and coalesce(n.payload->>'hito', '') = coalesce(p_hito, '')) then
    return;
  end if;
  insert into public.notifications (organization_id, recipient_user_id, channel, status, payload)
  values (p_wo.organization_id, null, 'app', 'pending',
          jsonb_build_object(
            'type', p_tipo,
            'title', p_titulo,
            'content', p_texto,
            'body', p_texto,
            'order_id', p_wo.id::text,
            'order_number', p_wo.order_number,
            'branch_id', p_wo.branch_id,
            'hito', p_hito,
            'priority', case when p_urgente then 'urgent' else 'normal' end,
            'href', '/app/pos/pedidos-online/' || p_wo.id::text));
exception when others then
  raise warning 'fn_web_order_anticipo_campana: %', sqlerrm;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Evaluar el anticipo tardío y reactivar si se puede.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_web_order_anticipo_tardio(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wo public.web_orders%rowtype;
  v_pagado_en timestamptz;
  v_monto numeric;
  v_vence timestamptz;
  v_min integer;
  v_items jsonb;
  v_reserva jsonb;
  v_faltan integer := 0;
  v_tz text;
  v_cliente text;
begin
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('resultado', 'no_aplica', 'motivo', 'pedido_no_encontrado');
  end if;
  if v_wo.status <> 'expired' or coalesce(v_wo.advance_status, '') <> 'paid'
     or v_wo.sale_id is not null or v_wo.table_session_id is not null then
    return jsonb_build_object('resultado', 'no_aplica', 'status', v_wo.status);
  end if;
  if exists (select 1 from public.web_order_refunds r
              where r.web_order_id = v_wo.id and r.estado in ('reserved', 'done')) then
    return jsonb_build_object('resultado', 'no_aplica', 'motivo', 'anticipo_devuelto');
  end if;

  select min(p.created_at), sum(p.amount) into v_pagado_en, v_monto
    from public.payments p
   where p.organization_id = v_wo.organization_id
     and p.source = 'web_order' and p.source_id = v_wo.id::text
     and p.status = 'completed'
     and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega';
  v_pagado_en := coalesce(v_pagado_en, now());
  v_monto := coalesce(v_monto, v_wo.advance_amount, 0);
  v_vence := coalesce(v_wo.advance_due_at, v_wo.cancelled_at, v_pagado_en);
  v_min := greatest(0, ceil(extract(epoch from (v_pagado_en - v_vence)) / 60.0))::integer;
  v_tz := coalesce(public.fn_timezone_for(v_wo.organization_id, v_wo.branch_id), 'America/Bogota');
  v_cliente := coalesce(nullif(btrim(v_wo.customer_name), ''), 'El cliente');

  -- Más de 24 h después de vencer: decide una persona.
  if v_pagado_en > v_vence + interval '24 hours' then
    perform public.fn_web_order_anticipo_campana(v_wo, 'web_order_advance_expired_paid',
      'Anticipo pagado con el pedido vencido · ' || v_wo.order_number,
      v_cliente || ' pagó el anticipo de ' || public.fn_pesos_texto(v_monto)
        || ' más de 24 h después de vencer. Reactiva el pedido o devuelve el anticipo.',
      null, true);
    return jsonb_build_object('resultado', 'fuera_de_plazo', 'minutos_tarde', v_min);
  end if;

  -- Stock de TODAS las líneas, todo o nada (la misma reserva que la reactivación de
  -- fn_confirmar_pedido_web_completo: fn_inv_int_reservar exigiendo disponible).
  if v_wo.stock_released_at is not null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
      into v_items
      from public.web_order_items i
     where i.web_order_id = v_wo.id and i.product_id is not null and coalesce(i.quantity, 0) > 0;
    if jsonb_array_length(v_items) > 0 then
      begin
        v_reserva := public.fn_inv_int_reservar(v_wo.organization_id, v_wo.branch_id, 'web_order', v_wo.id::text, v_items, true);
      exception when others then
        v_reserva := jsonb_build_object('ok', false, 'error', sqlerrm);
      end;
      if not coalesce((v_reserva->>'ok')::boolean, false) then
        v_faltan := coalesce(jsonb_array_length(case when jsonb_typeof(v_reserva->'shortages') = 'array'
                                                     then v_reserva->'shortages' else '[]'::jsonb end), 0);
        perform public.fn_web_order_anticipo_campana(v_wo, 'web_order_advance_expired_paid',
          'Anticipo pagado con el pedido vencido · ' || v_wo.order_number,
          v_cliente || ' pagó el anticipo de ' || public.fn_pesos_texto(v_monto) || ' ' || v_min
            || ' min después de vencer y ya no hay stock'
            || case when v_faltan > 0 then ' de ' || v_faltan || case when v_faltan = 1 then ' producto' else ' productos' end else '' end
            || '. Reactívalo o devuelve el anticipo.',
          null, true);
        return jsonb_build_object('resultado', 'sin_stock', 'minutos_tarde', v_min,
                                  'faltantes', coalesce(v_reserva->'shortages', '[]'::jsonb));
      end if;
    end if;
  end if;

  update public.web_orders set
    status = 'pending',
    cancelled_at = null,
    cancelled_by = null,
    cancellation_reason = null,
    stock_released_at = null,
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
      '[REACTIVADO POR ANTICIPO TARDÍO ' || to_char(now() at time zone v_tz, 'YYYY-MM-DD HH24:MI') || '] '
      || public.fn_pesos_texto(v_monto) || ' pagado ' || v_min || ' min después de vencer; stock apartado, se confirma solo'),
    updated_at = now()
   where id = v_wo.id;

  insert into public.ops_audit_log (organization_id, branch_id, user_id, entity_type, entity_id, action,
                                    previous_data, new_data, metadata)
  values (v_wo.organization_id, v_wo.branch_id, null, 'web_orders', v_wo.id::text, 'REACTIVATE_LATE_ADVANCE',
          jsonb_build_object('status', v_wo.status, 'cancelled_at', v_wo.cancelled_at,
                             'cancellation_reason', v_wo.cancellation_reason, 'stock_released_at', v_wo.stock_released_at),
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('order_number', v_wo.order_number, 'monto', v_monto, 'minutos_tarde', v_min,
                             'pagado_en', v_pagado_en, 'vencia', v_vence, 'reserva', v_reserva));

  perform public.fn_web_order_anticipo_campana(v_wo, 'web_order_advance_reactivated',
    'Pedido ' || v_wo.order_number || ' reactivado solo',
    v_cliente || ' pagó el anticipo de ' || public.fn_pesos_texto(v_monto) || ' ' || v_min
      || ' min después de vencer y había stock: el pedido se confirma solo.',
    null, false);

  return jsonb_build_object('resultado', 'reactivado', 'minutos_tarde', v_min);
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_web_order_anticipo_tardio(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_web_order_anticipo_tardio(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_web_order_anticipo_campana(public.web_orders, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_web_order_anticipo_campana(public.web_orders, text, text, text, text, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Resultado del anticipo: con el pedido vencido, evalúa la reactivación.
-- (Texto anterior: 20261124230000; solo cambia el final, tras registrar el pago.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_web_order_anticipo_resultado(p_organization_id integer, p_order_id uuid, p_estado text, p_transaction_id text, p_monto numeric, p_moneda text DEFAULT 'COP'::text, p_pasarela text DEFAULT NULL::text, p_metodo text DEFAULT NULL::text, p_respuesta jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wo public.web_orders%rowtype;
  v_tx text := nullif(btrim(coalesce(p_transaction_id, '')), '');
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_pago uuid;
  v_cerrado boolean;
  v_tardio jsonb;
  v_status text;
begin
  select * into v_wo from public.web_orders
   where id = p_order_id and organization_id = p_organization_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'pedido_no_encontrado');
  end if;
  if coalesce(v_wo.advance_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_anticipo');
  end if;

  if p_estado = 'pending' then
    return jsonb_build_object('ok', true, 'status', 'sin_cambio', 'advance_status', v_wo.advance_status);
  elsif p_estado = 'failed' then
    -- Un rechazo no cancela el pedido: el cliente reintenta hasta advance_due_at.
    return jsonb_build_object('ok', true, 'status', 'rechazado', 'advance_status', v_wo.advance_status);
  elsif p_estado = 'refunded' then
    -- Reembolso del anticipo en la pasarela: se deja constancia para que el equipo lo concilie.
    update public.web_orders set
      internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
        '[ANTICIPO REEMBOLSADO ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')
        || ' COT] ' || coalesce(p_pasarela, '-') || ' tx ' || coalesce(v_tx, '-')),
      updated_at = now()
     where id = v_wo.id;
    return jsonb_build_object('ok', true, 'status', 'reembolso_registrado', 'advance_status', v_wo.advance_status);
  elsif p_estado <> 'paid' then
    return jsonb_build_object('ok', false, 'motivo', 'estado_invalido');
  end if;

  -- Pagado. Idempotente: el mismo pago (o un anticipo ya pagado) no se repite.
  if v_tx is not null then
    select p.id into v_pago from public.payments p
     where p.organization_id = v_wo.organization_id
       and p.reference = v_tx
       and p.status = 'completed'
       and ((p.source = 'web_order' and p.source_id = v_wo.id::text)
            or p.source = 'invoice_sales')
       and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega'
     limit 1;
  end if;
  if v_wo.advance_status = 'paid' or v_pago is not null then
    return jsonb_build_object('ok', true, 'status', 'ya_pagado', 'advance_status', 'paid', 'payment_id', v_pago);
  end if;
  if v_monto + 0.5 < v_wo.advance_amount then
    update public.web_orders set
      internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
        '[ANTICIPO INCOMPLETO ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')
        || ' COT] ' || coalesce(p_pasarela, '-') || ' aprobó ' || v_monto::text || ' de ' || v_wo.advance_amount::text
        || ' (tx ' || coalesce(v_tx, '-') || ')'),
      updated_at = now()
     where id = v_wo.id;
    return jsonb_build_object('ok', false, 'motivo', 'monto_insuficiente');
  end if;

  v_cerrado := v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired');

  update public.web_orders set
    advance_status = 'paid',
    advance_reference = coalesce(v_tx, advance_reference),
    advance_gateway = coalesce(nullif(btrim(coalesce(p_pasarela, '')), ''), advance_gateway),
    payment_status = case when payment_status in ('pending', 'failed') then 'partial' else payment_status end,
    internal_notes = case when v_cerrado then concat_ws(E'\n', nullif(internal_notes, ''),
        '[ANTICIPO PAGADO CON EL PEDIDO CERRADO ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')
        || ' COT] ' || v_monto::text || ' por ' || coalesce(p_pasarela, '-') || ': reactivar el pedido o devolver el anticipo')
      else internal_notes end,
    updated_at = now()
   where id = v_wo.id;

  -- Cobro de pasarela: el disparador trg_auto_journal_payment lo lleva a la cuenta por cobrar del
  -- procesador (fn_cuenta_cobro → 138020xx) contra 2805 (20261125120000).
  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency,
                               reference, processor_response, status)
  values (v_wo.organization_id, v_wo.branch_id, 'web_order', v_wo.id::text,
          coalesce(nullif(btrim(coalesce(p_metodo, '')), ''), nullif(btrim(coalesce(p_pasarela, '')), ''), 'card'),
          v_monto, coalesce(nullif(btrim(coalesce(p_moneda, '')), ''), 'COP'), v_tx,
          coalesce(p_respuesta, '{}'::jsonb)
            || jsonb_build_object('gateway', p_pasarela, 'concepto', 'anticipo_contraentrega'),
          'completed')
  returning id into v_pago;

  -- Si el envío ya existe, la puerta cobra total − anticipo.
  update public.shipments set
    cod_amount = greatest(round(coalesce(v_wo.total, 0) - v_wo.advance_amount, 2), 0),
    updated_at = now()
   where source_type = 'web_order' and source_id = v_wo.id
     and organization_id = v_wo.organization_id
     and cod_status = 'pending';

  v_status := case when v_cerrado then 'pagado_pedido_cerrado' else 'pagado' end;
  -- Pedido VENCIDO (20261125121000): hasta 24 h y con stock de todo, vuelve a «Pendiente» con el
  -- stock apartado y la tienda pide la confirmación automática de siempre. Si no, queda
  -- «Anticipo pagado · vencido» y decide una persona (campana).
  if v_wo.status = 'expired' then
    v_tardio := public.fn_web_order_anticipo_tardio(v_wo.id);
    v_status := case v_tardio->>'resultado'
                  when 'reactivado' then 'pagado_tarde_reactivable'
                  when 'sin_stock' then 'pagado_vencido_sin_stock'
                  when 'fuera_de_plazo' then 'pagado_vencido_fuera_de_plazo'
                  else v_status end;
  end if;

  return jsonb_build_object('ok', true, 'status', v_status,
                            'advance_status', 'paid', 'payment_id', v_pago,
                            'minutos_tarde', v_tardio->'minutos_tarde');
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Stock por línea en la sede (detalle del pedido vencido). Con la sesión del usuario (RLS).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_web_order_anticipo_vencido_stock(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wo record;
begin
  select w.id, w.organization_id, w.branch_id into v_wo from public.web_orders w where w.id = p_order_id;
  if v_wo.id is null then
    return '[]'::jsonb;
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'product_id', i.product_id,
             'product_name', i.product_name,
             'quantity', i.quantity,
             'disponible', greatest(coalesce(s.disponible, 0), 0)) order by i.created_at, i.id)
      from public.web_order_items i
      left join lateral (
        select sum(coalesce(sl.qty_on_hand, 0) - coalesce(sl.qty_reserved, 0)) as disponible
          from public.stock_levels sl
         where sl.branch_id = v_wo.branch_id
           and sl.product_id = i.product_id) s on true
     where i.web_order_id = v_wo.id and i.product_id is not null), '[]'::jsonb);
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_web_order_anticipo_vencido_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_web_order_anticipo_vencido_stock(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Devolver el anticipo (completo). Dr 2805 / Cr 138020xx (pasarela) o la cuenta del banco.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_web_order_anticipo_devolver(
  p_order_id uuid,
  p_medio text,
  p_referencia text,
  p_motivo text DEFAULT NULL,
  p_bank_account_id integer DEFAULT NULL,
  p_monto numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_wo public.web_orders%rowtype;
  v_medio text := lower(btrim(coalesce(p_medio, '')));
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 300), '');
  v_pago public.payments%rowtype;
  v_monto numeric;
  v_cuenta text;
  v_refund public.web_order_refunds%rowtype;
  v_asiento integer;
  v_tz text;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  if not public.app_branch_access(v_wo.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if not (public.fn_tiene_permiso(v_wo.organization_id, 'pos.refund')
          or public.fn_tiene_permiso(v_wo.organization_id, 'pos.void')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  -- Idempotente: la misma devolución (misma referencia) no se registra dos veces.
  if v_ref is not null then
    select * into v_refund from public.web_order_refunds r
     where r.web_order_id = v_wo.id and r.reference = v_ref and r.estado = 'done'
     limit 1;
    if v_refund.id is not null then
      return jsonb_build_object('ok', true, 'ya_registrado', true, 'refund_id', v_refund.id, 'monto', v_refund.amount);
    end if;
  end if;

  if v_wo.status <> 'expired' or coalesce(v_wo.advance_status, '') <> 'paid' or v_wo.sale_id is not null then
    raise exception 'NO_ES_ANTICIPO_VENCIDO' using errcode = '22023',
      detail = 'Solo se devuelve el anticipo de un pedido vencido con el anticipo pagado y sin venta.';
  end if;
  if exists (select 1 from public.web_order_refunds r where r.web_order_id = v_wo.id and r.estado in ('reserved', 'done')) then
    raise exception 'YA_DEVUELTO' using errcode = '22023';
  end if;
  if v_medio not in ('pasarela', 'transferencia') then
    raise exception 'MEDIO_INVALIDO' using errcode = '22023', hint = 'pasarela o transferencia';
  end if;
  if v_ref is null then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = '22023';
  end if;

  select * into v_pago from public.payments p
   where p.organization_id = v_wo.organization_id
     and p.source = 'web_order' and p.source_id = v_wo.id::text
     and p.status = 'completed'
     and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega'
   order by p.created_at
   limit 1;
  if v_pago.id is null then
    raise exception 'ANTICIPO_SIN_PAGO' using errcode = '22023';
  end if;
  if not public.fn_anticipo_en_2805(v_pago.id) then
    raise exception 'ANTICIPO_SIN_2805' using errcode = '22023',
      detail = 'El recibo del anticipo no quedó en 2805: revisa el asiento antes de devolver.';
  end if;
  v_monto := round(v_pago.amount, 2);
  -- Decisión del dueño: la devolución es completa.
  if p_monto is not null and abs(round(p_monto, 2) - v_monto) > 0.004 then
    raise exception 'DEVOLUCION_COMPLETA' using errcode = '22023',
      detail = 'El anticipo se devuelve completo: ' || v_monto::text;
  end if;

  if v_medio = 'pasarela' then
    -- La misma cuenta por cobrar del procesador que cargó el recibo.
    select l.account_code into v_cuenta
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_wo.organization_id
       and e.fact_key = 'settlement:payment:' || v_pago.id::text
       and l.debit > 0
     order by l.id
     limit 1;
    v_cuenta := coalesce(v_cuenta, public.fn_cuenta_cobro(v_wo.organization_id, v_wo.branch_id, v_pago.method, null, v_pago.processor));
  else
    v_cuenta := public.fn_money_account_code_pago(v_wo.organization_id, v_wo.branch_id, 'transfer', p_bank_account_id);
  end if;
  if v_cuenta is null then
    raise exception 'CUENTA_NO_RESUELTA' using errcode = '22023';
  end if;

  insert into public.web_order_refunds (web_order_id, organization_id, amount, estado, completo, estado_previo, reason, reference)
  values (v_wo.id, v_wo.organization_id, v_monto, 'done', true, v_wo.status,
          coalesce(v_motivo, 'Anticipo devuelto') || ' · ' || v_medio, v_ref)
  returning * into v_refund;

  v_asiento := public.fn_create_journal_entry(
    p_organization_id := v_wo.organization_id,
    p_branch_id := v_wo.branch_id,
    p_entry_date := now(),
    p_memo := 'Devolución del anticipo de contraentrega - pedido ' || v_wo.order_number || ' - Ref: ' || v_ref,
    p_source := 'web_order_advance',
    p_source_id := v_wo.id::text,
    p_debit_account := '2805',
    p_credit_account := v_cuenta,
    p_amount := v_monto,
    p_created_by := v_uid,
    p_fact_key := 'web_order_advance:refund:' || v_refund.id::text
  );
  if v_asiento is null then
    raise exception 'ASIENTO_NO_REGISTRADO' using errcode = 'P0001',
      detail = 'La devolución no se guardó: el asiento Dr 2805 / Cr ' || v_cuenta || ' no se pudo registrar (ver journal_entry_failures).';
  end if;

  v_tz := coalesce(public.fn_timezone_for(v_wo.organization_id, v_wo.branch_id), 'America/Bogota');
  update public.web_orders set
    status = 'cancelled',
    payment_status = 'refunded',
    cancelled_at = now(),
    cancelled_by = v_uid,
    cancellation_reason = left('Anticipo devuelto: ' || coalesce(v_motivo, 'pedido vencido'), 500),
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
      '[ANTICIPO DEVUELTO ' || to_char(now() at time zone v_tz, 'YYYY-MM-DD HH24:MI') || '] '
      || public.fn_pesos_texto(v_monto) || ' por ' || case v_medio when 'pasarela' then 'reverso en la pasarela' else 'transferencia' end
      || ' · ref ' || v_ref),
    updated_at = now()
   where id = v_wo.id;

  insert into public.ops_audit_log (organization_id, branch_id, user_id, entity_type, entity_id, action,
                                    previous_data, new_data, metadata)
  values (v_wo.organization_id, v_wo.branch_id, v_uid, 'web_orders', v_wo.id::text, 'REFUND_ADVANCE',
          jsonb_build_object('status', v_wo.status, 'payment_status', v_wo.payment_status),
          jsonb_build_object('status', 'cancelled', 'payment_status', 'refunded'),
          jsonb_build_object('order_number', v_wo.order_number, 'monto', v_monto, 'medio', v_medio,
                             'referencia', v_ref, 'cuenta', v_cuenta, 'journal_entry_id', v_asiento,
                             'refund_id', v_refund.id, 'payment_id', v_pago.id, 'motivo', v_motivo));

  return jsonb_build_object('ok', true, 'ya_registrado', false, 'refund_id', v_refund.id, 'monto', v_monto,
                            'cuenta', v_cuenta, 'journal_entry_id', v_asiento, 'aviso', 'anticipo_devuelto');
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_web_order_anticipo_devolver(uuid, text, text, text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_web_order_anticipo_devolver(uuid, text, text, text, integer, numeric) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recordatorios internos a las 2 h y a las 24 h (nunca devuelve dinero).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_web_order_anticipo_vencido_recordar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_r record;
  v_n integer := 0;
  v_hito record;
begin
  for v_r in
    select w.*, pg.pagado_en, pg.monto
      from public.web_orders w
      join lateral (
        select min(p.created_at) as pagado_en, sum(p.amount) as monto
          from public.payments p
         where p.organization_id = w.organization_id
           and p.source = 'web_order' and p.source_id = w.id::text
           and p.status = 'completed'
           and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega') pg on pg.pagado_en is not null
     where w.status = 'expired'
       and w.advance_status = 'paid'
       and w.sale_id is null
       and pg.pagado_en > now() - interval '7 days'
       and not exists (select 1 from public.web_order_refunds r
                        where r.web_order_id = w.id and r.estado in ('reserved', 'done'))
  loop
    for v_hito in select * from (values ('2h', interval '2 hours'), ('24h', interval '24 hours')) as h(hito, espera) loop
      if now() >= v_r.pagado_en + v_hito.espera then
        perform public.fn_web_order_anticipo_campana(
          (select w from public.web_orders w where w.id = v_r.id),
          'web_order_advance_reminder',
          'Sigue sin decidir · ' || v_r.order_number,
          coalesce(nullif(btrim(v_r.customer_name), ''), 'El cliente') || ' pagó ' || public.fn_pesos_texto(v_r.monto)
            || ' hace ' || case v_hito.hito when '2h' then '2 horas' else '24 horas' end
            || ' y el pedido sigue vencido. Reactívalo o devuelve el anticipo.',
          v_hito.hito, true);
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'revisados', v_n);
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_web_order_anticipo_vencido_recordar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_web_order_anticipo_vencido_recordar() TO service_role;

DO $cron$
begin
  if exists (select 1 from cron.job where jobname = 'anticipo-vencido-recordatorios') then
    perform cron.unschedule('anticipo-vencido-recordatorios');
  end if;
  perform cron.schedule('anticipo-vencido-recordatorios', '*/15 * * * *',
                        'select public.fn_web_order_anticipo_vencido_recordar()');
end
$cron$;
