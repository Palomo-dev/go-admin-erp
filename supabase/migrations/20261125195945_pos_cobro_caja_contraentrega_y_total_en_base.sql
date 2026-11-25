-- Cobro en caja de pedidos web: sin doble cobro de la contraentrega y con el total decidido por la base.
--
-- 1 · Doble cobro (2026-11-25). «Cobrar» (sin entregar) en la caja, sobre un pedido cuyo envío lleva
--     una contraentrega que todavía cobra el domiciliario, registraba el pago en la caja y dejaba la
--     contraentrega viva: el cliente pagaba dos veces y el cuadre del domiciliario traía dinero que
--     la caja ya tenía (fn_cobrar_pedido_web_en_caja respondía «ya_cobrado» y el efectivo sobraba).
--     Decisión: se BLOQUEA en la base. Con contraentrega pendiente (o ya cobrada por el domiciliario
--     y sin cuadrar) el cobro de la caja solo entra por los dos caminos que cierran el recaudo:
--       · «Cobrar y entregar» (logistica_entregar_y_cobrar_en_caja): entrega + cobro, la contraentrega
--         queda `remitted` y no pasa al cuadre;
--       · el cuadre del domiciliario (logistica_cuadre_recibir_linea).
--     Ambos marcan la transacción con app.cobro_contraentrega ('entrega' | 'cuadre'). Fuera de ellos:
--       · CONTRAENTREGA_EN_ENVIO: el domiciliario la cobra al entregar; si el paquete está en la
--         oficina, «Cobrar y entregar».
--       · CONTRAENTREGA_EN_CUADRE: el domiciliario ya la cobró; entra con su cuadre.
--     Se descartó marcar la contraentrega como pagada desde «Cobrar»: logistica_marcar_entregado la
--     volvería a `collected` al entregar y el cuadre la pediría otra vez.
--     El envío se lee con fn_cobro_caja_contraentrega_envio (SECURITY DEFINER): la política de
--     shipments esconde los envíos a quien no tiene Logística, y el bloqueo no puede depender de eso.
--
-- 2 · Total de la caja decidido por la base. El navegador mandaba subtotal, impuestos, total y líneas
--     de la factura (p_factura) y la base los insertaba tal cual; p_monto también se aceptaba sin
--     tope. Ahora:
--       · total del pedido = Σ web_order_items.total + delivery_fee + tip_amount − discount_total
--         (+ tax_total cuando el impuesto va aparte), la misma regla con que la tienda arma el total
--         (app/api/orders: subtotal de líneas + impuesto aparte + envío + propina − descuento).
--         Si web_orders.total no cuadra con eso (±1): TOTAL_PEDIDO_INCONSISTENTE, no se cobra.
--         Verificado el 2026-11-25: 12 479 de 12 481 pedidos desde el 2026-11-04 cuadran; los 2 que
--         no, vencidos y sin líneas.
--       · Cabecera de la factura nueva (subtotal, tax_total, total): SIEMPRE la del pedido en la base.
--         Si el navegador mandó otra, se ignora y queda en ops_audit_log
--         (COBRO_CAJA_TOTAL_CLIENTE_DESCARTADO) en la misma transacción del cobro.
--       · Líneas de la factura nueva: deben sumar el total (±1); si no, FACTURA_NO_COINCIDE (la
--         factura electrónica sale de ellas: no se emite una que no cuadra).
--       · Factura ya existente: su total debe ser el del pedido (±1); si no, FACTURA_NO_COINCIDE.
--       · Pago: total − anticipo pagado (como hoy). p_monto distinto solo desde el cuadre (faltante
--         con motivo) y nunca mayor que el saldo: MONTO_NO_COINCIDE.
--     Los rechazos quedan en el registro de Postgres (ERROR con código y detalle); lo ignorado queda
--     en ops_audit_log.
--     En los casos normales el monto no cambia: el total era web_orders.total y lo sigue siendo.

-- ── a. Contraentrega viva del envío del pedido ─────────────────────────────

create or replace function public.fn_cobro_caja_contraentrega_envio(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_s record;
begin
  select w.organization_id into v_org from public.web_orders w where w.id = p_order_id;
  if v_org is null then
    return null;
  end if;
  perform public.fn_assert_acceso_org(v_org);
  select s.id, s.status, coalesce(s.cod_status, 'pending') as cod_status, s.cod_amount, s.shipment_number
    into v_s
    from public.shipments s
   where s.organization_id = v_org
     and s.source_type = 'web_order' and s.source_id = p_order_id
     and coalesce(s.cod_amount, 0) > 0
     and coalesce(s.cod_status, 'pending') in ('pending', 'collected')
     and s.status not in ('cancelled', 'returned', 'failed')
   order by s.created_at desc
   limit 1;
  if v_s.id is null then
    return null;
  end if;
  return jsonb_build_object('shipment_id', v_s.id, 'status', v_s.status, 'cod_status', v_s.cod_status,
                            'cod_amount', v_s.cod_amount, 'numero', v_s.shipment_number);
end;
$$;

revoke all on function public.fn_cobro_caja_contraentrega_envio(uuid) from public, anon;
grant execute on function public.fn_cobro_caja_contraentrega_envio(uuid) to authenticated, service_role;

comment on function public.fn_cobro_caja_contraentrega_envio(uuid) is
  'Contraentrega viva (pendiente o cobrada sin cuadrar) del envío de un pedido web; null si no hay. La usa fn_cobrar_pedido_web_en_caja para no cobrar dos veces (2026-11-25).';

-- ── b. Cobro en caja ───────────────────────────────────────────────────────

create or replace function public.fn_cobrar_pedido_web_en_caja(p_order_id uuid, p_metodo text, p_factura jsonb default null::jsonb, p_referencia text default null::text, p_monto numeric default null::numeric)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_wo public.web_orders%rowtype;
  v_caja integer;
  v_inv public.invoice_sales%rowtype;
  v_pago uuid;
  v_ya boolean := false;
  v_moneda text;
  v_anticipo numeric := 0;
  -- 2026-11-25: contraentrega del envío y total decidido por la base
  v_via text := coalesce(current_setting('app.cobro_contraentrega', true), '');
  v_envio jsonb;
  v_items numeric;
  v_base numeric;
  v_total numeric;
  v_lineas numeric;
  v_saldo numeric;
  v_cliente jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  -- Sonda del cliente (cobroEnCajaDisponible): sin efectos y sin 500/P0002.
  if p_order_id = '00000000-0000-0000-0000-000000000000'::uuid then
    return jsonb_build_object('sonda', true);
  end if;
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  if not public.app_branch_access(v_wo.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  -- Pedido de pasarela (pagado o no, también vencido): nunca un cobro de caja.
  if public.fn_pedido_web_es_pasarela(v_wo.payment_method, v_wo.payment_reference) then
    raise exception 'PEDIDO_DE_PASARELA' using errcode = '22023',
      detail = 'Pedido ' || v_wo.order_number || ' (' || coalesce(v_wo.payment_method, '-')
               || '): se marca pagado por la pasarela, no en caja.',
      hint = 'Usa «Marcar como pagado» (fn_marcar_pedido_web_pagado_pasarela).';
  end if;
  if v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_NO_CONFIRMABLE' using errcode = '22023';
  end if;
  if v_wo.table_session_id is not null then
    raise exception 'COBRAR_EN_LA_MESA' using errcode = '22023';
  end if;
  if v_wo.sale_id is null then
    raise exception 'PEDIDO_SIN_CONFIRMAR' using errcode = '22023';
  end if;
  if not exists (select 1 from public.payment_methods pm where pm.code = p_metodo and coalesce(pm.is_active, true)) then
    raise exception 'METODO_INVALIDO' using errcode = '22023';
  end if;

  -- 1 · Contraentrega viva en el envío: la caja no la cobra por fuera de la entrega o del cuadre.
  v_envio := public.fn_cobro_caja_contraentrega_envio(v_wo.id);
  if v_envio is not null and v_via not in ('entrega', 'cuadre') then
    if v_envio ->> 'cod_status' = 'collected' then
      raise exception 'CONTRAENTREGA_EN_CUADRE' using errcode = '22023',
        detail = 'Pedido ' || v_wo.order_number || ': el domiciliario ya cobró la contraentrega del envío '
                 || coalesce(v_envio ->> 'numero', '') || ' (' || coalesce(v_envio ->> 'cod_amount', '0') || ').',
        hint = 'Ese dinero entra a la caja con el cuadre del domiciliario.';
    end if;
    raise exception 'CONTRAENTREGA_EN_ENVIO' using errcode = '22023',
      detail = 'Pedido ' || v_wo.order_number || ': el envío ' || coalesce(v_envio ->> 'numero', '')
               || ' (' || coalesce(v_envio ->> 'status', '-') || ') lleva una contraentrega de '
               || coalesce(v_envio ->> 'cod_amount', '0') || ' que cobra el domiciliario.',
      hint = 'Si el paquete está en la oficina, usa «Cobrar y entregar»; si va en camino, la cobra el domiciliario.';
  end if;

  -- 2 · Total del pedido recalculado en la base (líneas + envío + propina − descuento [+ impuesto aparte]).
  select coalesce(sum(i.total), 0) into v_items from public.web_order_items i where i.web_order_id = v_wo.id;
  v_base := round(v_items + coalesce(v_wo.delivery_fee, 0) + coalesce(v_wo.tip_amount, 0) - coalesce(v_wo.discount_total, 0), 2);
  if abs(coalesce(v_wo.total, 0) - v_base) <= 1
     or abs(coalesce(v_wo.total, 0) - (v_base + coalesce(v_wo.tax_total, 0))) <= 1 then
    v_total := coalesce(v_wo.total, 0);
  else
    raise exception 'TOTAL_PEDIDO_INCONSISTENTE' using errcode = '22023',
      detail = 'Pedido ' || v_wo.order_number || ': total ' || coalesce(v_wo.total, 0)
               || '; líneas + envío + propina − descuento = ' || v_base || '.',
      hint = 'El total del pedido no cuadra con sus productos: revísalo antes de cobrar.';
  end if;

  -- Contraentrega con anticipo pagado (20261124230000): en la puerta solo se cobra el resto.
  if v_wo.advance_status = 'paid' and coalesce(v_wo.advance_amount, 0) > 0 then
    v_anticipo := v_wo.advance_amount;
  else
    v_anticipo := 0;
  end if;
  v_caja := public.fn_caja_abierta_para(v_wo.organization_id, v_wo.branch_id, v_uid);
  if v_caja is null then
    raise exception 'NO_OPEN_CASH_SESSION' using errcode = 'P0001',
      hint = 'Abre la caja de la sede para cobrar el pedido.';
  end if;
  select * into v_inv from public.invoice_sales i
   where i.sale_id = v_wo.sale_id and i.organization_id = v_wo.organization_id
     and coalesce(i.document_type, 'invoice') = 'invoice' and i.status <> 'void'
   order by i.created_at asc limit 1;
  if v_inv.id is null then
    if jsonb_typeof(p_factura) <> 'object' or coalesce(p_factura->>'number', '') = '' then
      raise exception 'FACTURA_REQUERIDA' using errcode = '22023';
    end if;
    -- Cabecera: la del pedido en la base. Lo que mande el navegador, si no coincide, se ignora y se registra.
    if (p_factura ? 'total' and abs(coalesce((p_factura->>'total')::numeric, v_total) - v_total) > 1)
       or (p_factura ? 'subtotal' and abs(coalesce((p_factura->>'subtotal')::numeric, coalesce(v_wo.subtotal, 0)) - coalesce(v_wo.subtotal, 0)) > 1)
       or (p_factura ? 'tax_total' and abs(coalesce((p_factura->>'tax_total')::numeric, coalesce(v_wo.tax_total, 0)) - coalesce(v_wo.tax_total, 0)) > 1) then
      v_cliente := jsonb_strip_nulls(jsonb_build_object(
        'subtotal', p_factura->'subtotal', 'tax_total', p_factura->'tax_total', 'total', p_factura->'total'));
    end if;
    -- Líneas: deben sumar el total del pedido (la factura electrónica sale de ellas).
    if jsonb_typeof(p_factura->'lineas') = 'array' and jsonb_array_length(p_factura->'lineas') > 0 then
      select coalesce(sum(coalesce((l.value->>'total_line')::numeric, 0)), 0) into v_lineas
        from jsonb_array_elements(p_factura->'lineas') as l(value);
      if abs(v_lineas - v_total) > 1 then
        raise exception 'FACTURA_NO_COINCIDE' using errcode = '22023',
          detail = 'Pedido ' || v_wo.order_number || ': las líneas de la factura suman ' || v_lineas
                   || ' y el pedido ' || v_total || '.',
          hint = 'Vuelve a cargar el pedido y cobra otra vez.';
      end if;
    end if;
    insert into public.invoice_sales (organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date,
                                      currency, subtotal, tax_total, total, balance, status, payment_method,
                                      payment_terms, tax_included, created_by, notes)
    values (v_wo.organization_id, v_wo.branch_id, public.fn_web_order_cliente_factura(v_wo.id), v_wo.sale_id, p_factura->>'number', now(), now(),
            null,
            coalesce(v_wo.subtotal, 0),
            coalesce(v_wo.tax_total, 0),
            v_total,
            v_total,
            'issued', p_metodo, 0,
            coalesce((p_factura->>'tax_included')::boolean, false), v_uid,
            'Factura del pedido web ' || v_wo.order_number || ' cobrado en caja')
    returning * into v_inv;
    if jsonb_typeof(p_factura->'lineas') = 'array' then
      insert into public.invoice_items (invoice_id, invoice_sales_id, invoice_type, product_id, description, qty,
                                        unit_price, total_line, tax_rate, tax_code, tax_included, discount_amount,
                                        note, impuestos_linea)
      select v_inv.id, v_inv.id, 'sale',
             nullif(l.value->>'product_id', '')::integer,
             left(coalesce(nullif(l.value->>'description', ''), 'Producto'), 255),
             coalesce((l.value->>'qty')::numeric, 1),
             coalesce((l.value->>'unit_price')::numeric, 0),
             coalesce((l.value->>'total_line')::numeric, 0),
             coalesce((l.value->>'tax_rate')::numeric, 0),
             nullif(l.value->>'tax_code', ''),
             coalesce((l.value->>'tax_included')::boolean, false),
             coalesce((l.value->>'discount_amount')::numeric, 0),
             nullif(l.value->>'note', ''),
             case when jsonb_typeof(l.value->'impuestos_linea') in ('array', 'object') then l.value->'impuestos_linea' end
        from jsonb_array_elements(p_factura->'lineas') with ordinality as l(value, ord)
       order by l.ord;
    end if;
    select * into v_inv from public.invoice_sales where id = v_inv.id;
  elsif abs(coalesce(v_inv.total, 0) - v_total) > 1 then
    raise exception 'FACTURA_NO_COINCIDE' using errcode = '22023',
      detail = 'Pedido ' || v_wo.order_number || ': la factura ' || coalesce(v_inv.number, '-') || ' es por '
               || coalesce(v_inv.total, 0) || ' y el pedido por ' || v_total || '.',
      hint = 'Revisa la factura del pedido antes de cobrar.';
  end if;

  -- Saldo a cobrar: total − anticipo pagado. p_monto distinto solo desde el cuadre (faltante con motivo).
  v_saldo := greatest(coalesce(v_inv.total, v_total) - v_anticipo, 0);
  if p_monto is not null and (p_monto < 0 or p_monto > v_saldo + 1
                              or (abs(p_monto - v_saldo) > 1 and v_via <> 'cuadre')) then
    raise exception 'MONTO_NO_COINCIDE' using errcode = '22023',
      detail = 'Pedido ' || v_wo.order_number || ': se pidió cobrar ' || p_monto || ' y el saldo es ' || v_saldo || '.',
      hint = 'La caja cobra el saldo del pedido; un faltante se registra en el cuadre del domiciliario.';
  end if;

  select p.id into v_pago from public.payments p
   where p.source = 'invoice_sales' and p.source_id = v_inv.id::text and p.status = 'completed'
     and coalesce(p.processor_response->>'concepto', '') <> 'anticipo_contraentrega'
   limit 1;
  if v_pago is not null then
    v_ya := true;
  else
    v_moneda := coalesce(
      nullif(btrim(v_inv.currency), ''),
      (select oc.currency_code from public.organization_currencies oc
        where oc.organization_id = v_wo.organization_id order by oc.is_base desc, oc.currency_code limit 1),
      'COP');
    insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency,
                                 reference, status, created_by)
    values (v_wo.organization_id, v_wo.branch_id, 'invoice_sales', v_inv.id::text, p_metodo,
            coalesce(p_monto, v_saldo), v_moneda,
            nullif(btrim(coalesce(p_referencia, '')), ''), 'completed', v_uid)
    returning id into v_pago;
  end if;
  if v_anticipo > 0 then
    -- El pago del anticipo pasa a la factura (sin cambiar su estado: no se vuelve a contabilizar;
    -- fn_recalc_invoice_balance_from_payments salda la factura y la cartera la sigue).
    update public.payments set source = 'invoice_sales', source_id = v_inv.id::text
     where source = 'web_order' and source_id = v_wo.id::text
       and organization_id = v_wo.organization_id
       and status = 'completed'
       and coalesce(processor_response->>'concepto', '') = 'anticipo_contraentrega';
  else
    -- Sin anticipo: como antes.
  end if;
  update public.sales set
    include_in_cash_register = true,
    status = 'paid', payment_status = 'paid', balance = 0, updated_at = now()
   where id = v_wo.sale_id;
  update public.web_orders set
    payment_status = 'paid',
    payment_method = coalesce(payment_method, p_metodo),
    payment_reference = coalesce(payment_reference, nullif(btrim(coalesce(p_referencia, '')), ''))
   where id = p_order_id;

  -- Cabecera del navegador ignorada: queda registrada con el cobro.
  if v_cliente <> '{}'::jsonb then
    insert into public.ops_audit_log (organization_id, branch_id, user_id, entity_type, entity_id, action,
                                      previous_data, new_data, metadata)
    values (v_wo.organization_id, v_wo.branch_id, v_uid, 'web_orders', v_wo.id::text,
            'COBRO_CAJA_TOTAL_CLIENTE_DESCARTADO',
            v_cliente,
            jsonb_build_object('subtotal', v_wo.subtotal, 'tax_total', v_wo.tax_total, 'total', v_total),
            jsonb_build_object('order_number', v_wo.order_number, 'invoice_id', v_inv.id,
                               'payment_id', v_pago, 'via', nullif(v_via, '')));
  end if;

  return jsonb_build_object(
    'ya_cobrado', v_ya,
    'invoice_id', v_inv.id,
    'invoice_number', v_inv.number,
    'payment_id', v_pago,
    'cash_session_id', v_caja,
    'sale_id', v_wo.sale_id,
    'total', v_total,
    'saldo', v_saldo);
end;
$function$;

-- ── c. Los dos caminos que cierran la contraentrega marcan la transacción ───

do $$
declare
  v_def text;
  c_entrega_viejo constant text := E'    v_cobro := public.fn_cobrar_pedido_web_en_caja(v_wo.id, v_metodo, p_factura, p_referencia, null);';
  c_entrega_nuevo constant text := E'    perform set_config(''app.cobro_contraentrega'', ''entrega'', true);\n'
                                || E'    v_cobro := public.fn_cobrar_pedido_web_en_caja(v_wo.id, v_metodo, p_factura, p_referencia, null);\n'
                                || E'    perform set_config(''app.cobro_contraentrega'', '''', true);';
  c_cuadre_viejo constant text := E'      v_r := public.fn_cobrar_pedido_web_en_caja(v_l.source_id, v_metodo, p_factura, p_referencia, v_monto);';
  c_cuadre_nuevo constant text := E'      perform set_config(''app.cobro_contraentrega'', ''cuadre'', true);\n'
                               || E'      v_r := public.fn_cobrar_pedido_web_en_caja(v_l.source_id, v_metodo, p_factura, p_referencia, v_monto);\n'
                               || E'      perform set_config(''app.cobro_contraentrega'', '''', true);';
begin
  v_def := pg_get_functiondef('public.logistica_entregar_y_cobrar_en_caja(uuid, jsonb, text, text, text, jsonb)'::regprocedure);
  if position('app.cobro_contraentrega' in v_def) = 0 then
    if position(c_entrega_viejo in v_def) = 0 then
      raise exception 'logistica_entregar_y_cobrar_en_caja cambió: no se encontró la llamada al cobro';
    end if;
    execute replace(v_def, c_entrega_viejo, c_entrega_nuevo);
  end if;

  v_def := pg_get_functiondef('public.logistica_cuadre_recibir_linea(uuid, text, numeric, text, jsonb, text)'::regprocedure);
  if position('app.cobro_contraentrega' in v_def) = 0 then
    if position(c_cuadre_viejo in v_def) = 0 then
      raise exception 'logistica_cuadre_recibir_linea cambió: no se encontró la llamada al cobro';
    end if;
    execute replace(v_def, c_cuadre_viejo, c_cuadre_nuevo);
  end if;
end;
$$;
