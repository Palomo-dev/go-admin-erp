-- Contraentrega con condiciones (Figma «05 POS y ventas» 3014:194407 y «16 Sitio web» 3019:76125,
-- aprobado por el dueño el 2026-11-24). Aditiva: columnas NULL-ables, funciones nuevas y
-- CREATE OR REPLACE de dos funciones existentes con su comportamiento de hoy intacto cuando el
-- pedido no tiene anticipo (todas las filas existentes: advance_* en NULL).
--
-- 1. web_orders.advance_*: anticipo en línea de un pedido contraentrega (efectivo). El método del
--    pedido sigue siendo `cash` y `payment_reference` no se toca: el pedido NO pasa a ser de
--    pasarela (fn_pedido_web_es_pasarela / pedidoEsDePasarela).
-- 2. fn_web_order_anticipo_resultado: lo que dice la pasarela del anticipo (webhook de la tienda,
--    service_role). Transaccional e idempotente por transacción. Pagado: payment_status 'partial'
--    (valor que el CHECK ya admitía), pago en `payments` source 'web_order' que el disparador
--    contabiliza como cobro de pasarela (138020xx por `processor`), y el cobro en la puerta del
--    envío (si ya existe) baja a total − anticipo. NO confirma el pedido ni lo marca 'paid'.
-- 3. fn_web_order_anticipo_marcar_recibido: «Marcar anticipo recibido…» del ERP (el cliente pagó
--    por otro medio). Sesión, organización, sede y permiso de marcar pagado; queda en ops_audit_log.
-- 4. expire_pending_web_orders: un anticipo pendiente vence en `advance_due_at` (30 min) con la
--    misma liberación de stock que un pedido con pasarela sin pagar. Lo demás, igual.
-- 5. fn_cobrar_pedido_web_en_caja: con anticipo pagado, el valor por defecto es total − anticipo y
--    el pago del anticipo pasa a la factura (mismo movimiento que hace el ERP con el pago del sitio
--    al facturar: source 'invoice_sales'), así la factura y la cartera quedan saldadas. Sin anticipo,
--    igual que hoy.

-- ─── 1. Columnas ──────────────────────────────────────────────────────────────────────────────
alter table public.web_orders add column if not exists advance_amount numeric(14,2);
alter table public.web_orders add column if not exists advance_status text;
alter table public.web_orders add column if not exists advance_due_at timestamptz;
alter table public.web_orders add column if not exists advance_reference text;
alter table public.web_orders add column if not exists advance_gateway text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'web_orders_advance_status_check'
                  and conrelid = 'public.web_orders'::regclass) then
    alter table public.web_orders add constraint web_orders_advance_status_check
      check (advance_status is null or advance_status in ('pending', 'paid', 'expired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'web_orders_advance_amount_check'
                  and conrelid = 'public.web_orders'::regclass) then
    alter table public.web_orders add constraint web_orders_advance_amount_check
      check (advance_amount is null or advance_amount > 0);
  end if;
end $$;

comment on column public.web_orders.advance_amount is
  'Contraentrega con anticipo: valor que se paga en línea para confirmar el pedido; el resto se cobra al entregar (total − anticipo). NULL = sin anticipo.';
comment on column public.web_orders.advance_status is
  'pending (esperando el pago, vence en advance_due_at) | paid (entró por la pasarela o lo marcó el ERP) | expired (venció: pedido cancelado y stock liberado).';
comment on column public.web_orders.advance_due_at is
  'Hora límite para pagar el anticipo (creación + plazo, 30 min por defecto). Lo usa expire_pending_web_orders.';
comment on column public.web_orders.advance_reference is
  'Id de la transacción del anticipo en la pasarela (o el comprobante si se marcó recibido a mano).';
comment on column public.web_orders.advance_gateway is
  'Pasarela con que se cobra el anticipo (wompi_co, mp_checkout, bold_link…), o el medio si se marcó a mano.';

create index if not exists idx_web_orders_anticipo_pendiente
  on public.web_orders (advance_due_at)
  where advance_status = 'pending';

-- ─── 2. Resultado de la pasarela (tienda, service_role) ───────────────────────────────────────
create or replace function public.fn_web_order_anticipo_resultado(
  p_organization_id integer,
  p_order_id uuid,
  p_estado text,
  p_transaction_id text,
  p_monto numeric,
  p_moneda text default 'COP',
  p_pasarela text default null,
  p_metodo text default null,
  p_respuesta jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wo public.web_orders%rowtype;
  v_tx text := nullif(btrim(coalesce(p_transaction_id, '')), '');
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_pago uuid;
  v_cerrado boolean;
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
  -- procesador (fn_cuenta_cobro → 138020xx), como un pedido web pagado en línea.
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

  return jsonb_build_object('ok', true, 'status', case when v_cerrado then 'pagado_pedido_cerrado' else 'pagado' end,
                            'advance_status', 'paid', 'payment_id', v_pago);
end;
$function$;

revoke all on function public.fn_web_order_anticipo_resultado(integer, uuid, text, text, numeric, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_web_order_anticipo_resultado(integer, uuid, text, text, numeric, text, text, text, jsonb) to service_role;

-- ─── 3. «Marcar anticipo recibido…» (ERP, sesión) ─────────────────────────────────────────────
create or replace function public.fn_web_order_anticipo_marcar_recibido(
  p_order_id uuid,
  p_metodo text,
  p_referencia text,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_wo public.web_orders%rowtype;
  v_metodo text := lower(btrim(coalesce(p_metodo, '')));
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_pago uuid;
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
  if not (public.fn_tiene_permiso(v_wo.organization_id, 'pos.pedidos_web.marcar_pagado')
          or public.fn_tiene_permiso(v_wo.organization_id, 'pos.void')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if coalesce(v_wo.advance_amount, 0) <= 0 then
    raise exception 'SIN_ANTICIPO' using errcode = '22023';
  end if;
  if v_wo.advance_status = 'paid' then
    return jsonb_build_object('ok', true, 'ya_pagado', true);
  end if;
  if v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_CERRADO' using errcode = '22023';
  end if;
  if v_ref is null then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = '22023';
  end if;
  if not exists (select 1 from public.payment_methods pm where pm.code = v_metodo and coalesce(pm.is_active, true)) then
    raise exception 'METODO_INVALIDO' using errcode = '22023';
  end if;

  update public.web_orders set
    advance_status = 'paid',
    advance_reference = v_ref,
    advance_gateway = v_metodo,
    payment_status = case when payment_status in ('pending', 'failed') then 'partial' else payment_status end,
    updated_at = now()
   where id = v_wo.id;

  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency,
                               reference, processor_response, status, created_by)
  values (v_wo.organization_id, v_wo.branch_id, 'web_order', v_wo.id::text, v_metodo, v_wo.advance_amount,
          coalesce((select oc.currency_code from public.organization_currencies oc
                     where oc.organization_id = v_wo.organization_id
                     order by oc.is_base desc, oc.currency_code limit 1), 'COP'),
          v_ref, jsonb_build_object('concepto', 'anticipo_contraentrega', 'manual', true), 'completed', v_uid)
  returning id into v_pago;

  update public.shipments set
    cod_amount = greatest(round(coalesce(v_wo.total, 0) - v_wo.advance_amount, 2), 0),
    updated_at = now()
   where source_type = 'web_order' and source_id = v_wo.id
     and organization_id = v_wo.organization_id
     and cod_status = 'pending';

  insert into public.ops_audit_log (organization_id, branch_id, user_id, entity_type, entity_id, action,
                                    previous_data, new_data, metadata)
  values (v_wo.organization_id, v_wo.branch_id, v_uid, 'web_orders', v_wo.id::text, 'MARK_ADVANCE_RECEIVED',
          jsonb_build_object('advance_status', v_wo.advance_status, 'payment_status', v_wo.payment_status),
          jsonb_build_object('advance_status', 'paid', 'advance_reference', v_ref, 'advance_gateway', v_metodo),
          jsonb_build_object('order_number', v_wo.order_number, 'monto', v_wo.advance_amount,
                             'motivo', nullif(btrim(coalesce(p_motivo, '')), ''), 'payment_id', v_pago));

  return jsonb_build_object('ok', true, 'ya_pagado', false, 'payment_id', v_pago);
end;
$function$;

revoke all on function public.fn_web_order_anticipo_marcar_recibido(uuid, text, text, text) from public, anon;
grant execute on function public.fn_web_order_anticipo_marcar_recibido(uuid, text, text, text) to authenticated, service_role;

-- ─── 4. Vencimiento: el anticipo pendiente vence en advance_due_at ────────────────────────────
create or replace function public.expire_pending_web_orders(p_expiration_minutes integer default 30)
 returns jsonb
 language plpgsql
 security definer
as $function$
DECLARE
  v_order record;
  v_expired integer := 0;
BEGIN
  FOR v_order IN
    SELECT
      w.id,
      w.organization_id,
      w.branch_id,
      w.order_number,
      w.payment_method,
      (w.advance_status = 'pending' AND w.advance_due_at IS NOT NULL) AS por_anticipo
    FROM web_orders w
    WHERE w.status = 'pending'
      AND w.payment_status = 'pending'
      AND w.stock_released_at IS NULL
      AND CASE
            -- Contraentrega con anticipo (20261124230000): vence a la hora límite del anticipo,
            -- igual que un pedido con pasarela sin pagar.
            WHEN w.advance_status = 'pending' AND w.advance_due_at IS NOT NULL
              THEN w.advance_due_at < now()
            -- Plazo único (fn_web_order_plazo_minutos): configuración de la organización, 24 h para
            -- métodos sin pasarela, o el plazo del cron.
            ELSE w.created_at < now() - make_interval(
                   mins => public.fn_web_order_plazo_minutos(w.organization_id, w.payment_method, p_expiration_minutes)
                 )
          END
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    PERFORM release_stock_for_order(v_order.id);

    UPDATE web_orders
       SET status = 'expired',
           payment_status = 'failed',
           advance_status = CASE WHEN v_order.por_anticipo THEN 'expired' ELSE advance_status END,
           cancelled_at = now(),
           cancellation_reason = CASE WHEN v_order.por_anticipo THEN 'Anticipo sin pagar'
                                      ELSE 'Expirado por falta de pago' END
     WHERE id = v_order.id;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_expired);
END;
$function$;

-- ─── 5. Cobro en caja / cuadre: el anticipo pagado ya cuenta ──────────────────────────────────
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
    insert into public.invoice_sales (organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date,
                                      currency, subtotal, tax_total, total, balance, status, payment_method,
                                      payment_terms, tax_included, created_by, notes)
    values (v_wo.organization_id, v_wo.branch_id, v_wo.customer_id, v_wo.sale_id, p_factura->>'number', now(), now(),
            null,
            coalesce((p_factura->>'subtotal')::numeric, v_wo.subtotal, 0),
            coalesce((p_factura->>'tax_total')::numeric, v_wo.tax_total, 0),
            coalesce((p_factura->>'total')::numeric, v_wo.total, 0),
            coalesce((p_factura->>'total')::numeric, v_wo.total, 0),
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
            coalesce(p_monto, greatest(coalesce(v_inv.total, v_wo.total, 0) - v_anticipo, 0)), v_moneda,
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
  return jsonb_build_object(
    'ya_cobrado', v_ya,
    'invoice_id', v_inv.id,
    'invoice_number', v_inv.number,
    'payment_id', v_pago,
    'cash_session_id', v_caja,
    'sale_id', v_wo.sale_id);
end;
$function$;
