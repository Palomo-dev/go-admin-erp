-- Reversión de 20261124230000_contraentrega_anticipo.
-- ADVERTENCIA: borra las columnas advance_* de web_orders con sus datos (no los restaura). Los
-- pagos de anticipo ya registrados en `payments` (processor_response->>'concepto' =
-- 'anticipo_contraentrega') y sus asientos NO se tocan: revísalos a mano antes de revertir si
-- hay pedidos contraentrega con anticipo en curso. Restaura expire_pending_web_orders y
-- fn_cobrar_pedido_web_en_caja tal como estaban antes (pg_get_functiondef del 2026-11-24).

drop function if exists public.fn_web_order_anticipo_resultado(integer, uuid, text, text, numeric, text, text, text, jsonb);
drop function if exists public.fn_web_order_anticipo_marcar_recibido(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.expire_pending_web_orders(p_expiration_minutes integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
      w.payment_method
    FROM web_orders w
    WHERE w.status = 'pending'
      AND w.payment_status = 'pending'
      AND w.stock_released_at IS NULL
      -- Plazo único (fn_web_order_plazo_minutos): configuración de la organización, 24 h para
      -- métodos sin pasarela, o el plazo del cron.
      AND w.created_at < now() - make_interval(
        mins => public.fn_web_order_plazo_minutos(w.organization_id, w.payment_method, p_expiration_minutes)
      )
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    PERFORM release_stock_for_order(v_order.id);

    UPDATE web_orders
       SET status = 'expired',
           payment_status = 'failed',
           cancelled_at = now(),
           cancellation_reason = 'Expirado por falta de pago'
     WHERE id = v_order.id;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_expired);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cobrar_pedido_web_en_caja(p_order_id uuid, p_metodo text, p_factura jsonb DEFAULT NULL::jsonb, p_referencia text DEFAULT NULL::text, p_monto numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_wo public.web_orders%rowtype;
  v_caja integer;
  v_inv public.invoice_sales%rowtype;
  v_pago uuid;
  v_ya boolean := false;
  v_moneda text;
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
            coalesce(p_monto, v_inv.total, v_wo.total, 0), v_moneda,
            nullif(btrim(coalesce(p_referencia, '')), ''), 'completed', v_uid)
    returning id into v_pago;
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

drop index if exists public.idx_web_orders_anticipo_pendiente;
alter table public.web_orders drop constraint if exists web_orders_advance_status_check;
alter table public.web_orders drop constraint if exists web_orders_advance_amount_check;
alter table public.web_orders drop column if exists advance_gateway;
alter table public.web_orders drop column if exists advance_reference;
alter table public.web_orders drop column if exists advance_due_at;
alter table public.web_orders drop column if exists advance_status;
alter table public.web_orders drop column if exists advance_amount;
