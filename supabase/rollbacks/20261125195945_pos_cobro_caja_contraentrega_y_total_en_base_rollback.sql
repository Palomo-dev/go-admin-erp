-- Reversión de 20261125195945_pos_cobro_caja_contraentrega_y_total_en_base.
--
-- ADVERTENCIA: vuelve a abrir el doble cobro de la contraentrega («Cobrar» en la caja con el envío
-- en camino) y a aceptar la cabecera, las líneas y p_monto que mande el navegador. No toca datos:
-- las facturas, pagos y filas de ops_audit_log creadas mientras estuvo vigente se quedan.
--
-- Orden: primero los dos llamadores (dejan de marcar la transacción), luego el cobro (cuerpo exacto
-- anterior, tomado con pg_get_functiondef el 2026-11-25) y al final la función auxiliar.

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
  if position(c_entrega_nuevo in v_def) > 0 then
    execute replace(v_def, c_entrega_nuevo, c_entrega_viejo);
  end if;
  v_def := pg_get_functiondef('public.logistica_cuadre_recibir_linea(uuid, text, numeric, text, jsonb, text)'::regprocedure);
  if position(c_cuadre_nuevo in v_def) > 0 then
    execute replace(v_def, c_cuadre_nuevo, c_cuadre_viejo);
  end if;
end;
$$;

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
    values (v_wo.organization_id, v_wo.branch_id, public.fn_web_order_cliente_factura(v_wo.id), v_wo.sale_id, p_factura->>'number', now(), now(),
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

drop function if exists public.fn_cobro_caja_contraentrega_envio(uuid);
