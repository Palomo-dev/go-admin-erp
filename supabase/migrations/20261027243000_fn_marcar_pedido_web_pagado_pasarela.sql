-- 20261027243000 · fn_marcar_pedido_web_pagado_pasarela: «Marcar como pagado» de UN CLIC para pedidos de pasarela
-- ORDEN COMPLETO (aplicar): 20261027241500 → 20261027243000 → 20261027244000 → 20261027245000 → 20261027242000
--   (la 242000 SOLO tras confirmar en el panel de Wompi). ROLLBACK en orden INVERSO:
--   242000 → 245000 → 244000 → 243000 → 241500.
--   20261027246000 (liberar reservas de cancelados) es INDEPENDIENTE: va aparte, con su respaldo y su rollback.
-- SIN APLICAR. Aplicar DESPUÉS de 20261027241500 (usa fn_metodo_es_pasarela), con:
--   psql -v ON_ERROR_STOP=1 -f <archivo>   (conexión directa o sesión 5432)
--
-- Por qué (QA RED sobre 98a021b73): Juan confirma pedidos en lote y luego abre cada uno para
-- marcarlo pagado. Un pedido de pasarela (Wompi y sus submétodos nequi/daviplata/card/pse/
-- bancolombia_*, Bold, Stripe, PayPal, PayU, Mercado Pago…; también vencidos) NO se cobra en caja:
-- fn_cobrar_pedido_web_en_caja ahora lo rechaza con PEDIDO_DE_PASARELA (241500). Esta función es el
-- único camino para dejarlo pagado:
--   * Pago con el método de la PASARELA (wompi para la familia Wompi), SIN caja: no exige caja abierta,
--     no marca include_in_cash_register y no usa method='cash' (pos_caja__esperado_calculo no lo suma).
--   * Asiento: el disparador fn_auto_journal_payment lo contabiliza con fn_money_account_code_pago
--     (wompi → 1110, verificado en prod; bank_account_id NULL).
--   * Referencia 'MANUAL' + quién y cuándo (processor_response, internal_notes y ops_audit_log
--     MARK_PAID_GATEWAY_MANUAL). No pide referencia ni comprobante.
--   * Idempotente: si la factura ya tiene un pago completed → ya_pagado, sin crear otro.
--   * Requiere el pedido CONFIRMADO (sale_id): el detalle confirma primero (también un vencido) y
--     luego llama esta función. De mesa → COBRAR_EN_LA_MESA. No pasarela → NO_ES_PASARELA.
-- SECURITY DEFINER (como fn_marcar_pedido_web_pagado) con search_path fijo y chequeos explícitos:
-- sesión, fn_assert_acceso_org, app_branch_access y permiso pos.pedidos_web.marcar_pagado o pos.void.
-- Grants: solo authenticated y service_role (sin PUBLIC ni anon).
-- Rollback: supabase/rollbacks/20261027243000_fn_marcar_pedido_web_pagado_pasarela_rollback.sql

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

create or replace function public.fn_marcar_pedido_web_pagado_pasarela(
  p_order_id uuid,
  p_factura jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_wo public.web_orders%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_pago uuid;
  v_metodo text;
  v_crudo text;
  v_moneda text;
  v_ahora timestamptz := now();
  v_marca text;
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
  v_crudo := lower(btrim(coalesce(v_wo.payment_method, '')));
  if not public.fn_pedido_web_es_pasarela(v_crudo, v_wo.payment_reference) then
    raise exception 'NO_ES_PASARELA' using errcode = '22023',
      detail = 'Método ' || coalesce(nullif(v_crudo, ''), '-') || ': se cobra en caja.';
  end if;
  if v_wo.status in ('cancelled', 'rejected', 'refunded') then
    raise exception 'PEDIDO_NO_CONFIRMABLE' using errcode = '22023';
  end if;
  if v_wo.table_session_id is not null then
    raise exception 'COBRAR_EN_LA_MESA' using errcode = '22023';
  end if;
  if v_wo.sale_id is null then
    raise exception 'PEDIDO_SIN_CONFIRMAR' using errcode = '22023';
  end if;

  -- Método de la pasarela tal como existe (activo) en payment_methods.
  -- Cualquier pasarela (Wompi, Mercado Pago, PayU, Stripe, PayPal, Bold…): fn_pasarela_metodo_pago.
  v_metodo := public.fn_pasarela_metodo_pago(v_wo.organization_id, v_crudo);
  if not exists (select 1 from public.payment_methods pm where pm.code = v_metodo and coalesce(pm.is_active, true)) then
    raise exception 'METODO_INVALIDO' using errcode = '22023',
      detail = 'La pasarela ' || v_crudo || ' no tiene método activo (' || coalesce(v_metodo, '-') || ').';
  end if;

  select * into v_inv from public.invoice_sales i
   where i.sale_id = v_wo.sale_id and i.organization_id = v_wo.organization_id
     and coalesce(i.document_type, 'invoice') = 'invoice' and i.status <> 'void'
   order by i.created_at asc limit 1;
  if v_inv.id is null then
    if jsonb_typeof(p_factura) is distinct from 'object' or coalesce(p_factura->>'number', '') = '' then
      raise exception 'FACTURA_REQUERIDA' using errcode = '22023';
    end if;
    insert into public.invoice_sales (organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date,
                                      currency, subtotal, tax_total, total, balance, status, payment_method,
                                      payment_terms, tax_included, created_by, notes)
    values (v_wo.organization_id, v_wo.branch_id, v_wo.customer_id, v_wo.sale_id, p_factura->>'number', v_ahora, v_ahora,
            null,
            coalesce((p_factura->>'subtotal')::numeric, v_wo.subtotal, 0),
            coalesce((p_factura->>'tax_total')::numeric, v_wo.tax_total, 0),
            coalesce((p_factura->>'total')::numeric, v_wo.total, 0),
            coalesce((p_factura->>'total')::numeric, v_wo.total, 0),
            'issued', v_metodo, 0,
            coalesce((p_factura->>'tax_included')::boolean, false), v_uid,
            'Factura del pedido web ' || v_wo.order_number || ' pagado por pasarela (' || v_crudo || ')')
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

  -- Idempotencia: un pago completed en la factura = ya pagado (cualquier método).
  select p.id into v_pago from public.payments p
   where p.source = 'invoice_sales' and p.source_id = v_inv.id::text and p.status = 'completed'
   order by p.created_at limit 1;
  if v_pago is not null then
    update public.sales set
      status = 'paid', payment_status = 'paid', balance = 0, include_in_cash_register = false, updated_at = v_ahora
     where id = v_wo.sale_id
       and (status is distinct from 'paid' or payment_status is distinct from 'paid' or balance is distinct from 0);
    update public.web_orders set payment_status = 'paid', updated_at = v_ahora
     where id = p_order_id and payment_status is distinct from 'paid';
    return jsonb_build_object('ok', true, 'ya_pagado', true, 'order_id', v_wo.id, 'invoice_id', v_inv.id,
                              'invoice_number', v_inv.number, 'payment_id', v_pago, 'sale_id', v_wo.sale_id);
  end if;

  v_moneda := coalesce(
    nullif(btrim(v_inv.currency), ''),
    (select oc.currency_code from public.organization_currencies oc
      where oc.organization_id = v_wo.organization_id order by oc.is_base desc, oc.currency_code limit 1),
    'COP');
  v_marca := '[PAGO PASARELA MANUAL ' || to_char(v_ahora at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')
             || ' COT] (' || v_crudo || ' → ' || v_metodo || ') por ' || v_uid::text;
  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency,
                               reference, status, created_by, processor_response)
  values (v_wo.organization_id, v_wo.branch_id, 'invoice_sales', v_inv.id::text, v_metodo,
          coalesce(v_inv.total, v_wo.total, 0), v_moneda, 'MANUAL', 'completed', v_uid,
          jsonb_build_object('confirmacion', 'manual', 'pasarela', v_crudo, 'marcado_por', v_uid,
                             'marcado_en', v_ahora, 'web_order_id', v_wo.id,
                             'referencia_pasarela', v_wo.payment_reference))
  returning id into v_pago;

  update public.sales set
    include_in_cash_register = false,
    status = 'paid', payment_status = 'paid', balance = 0, updated_at = v_ahora
   where id = v_wo.sale_id;
  update public.web_orders set
    payment_status = 'paid',
    payment_reference = coalesce(nullif(btrim(payment_reference), ''), 'MANUAL'),
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''), v_marca),
    updated_at = v_ahora
   where id = p_order_id;

  insert into public.ops_audit_log (
    organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, new_data, metadata
  ) values (
    v_wo.organization_id, v_wo.branch_id, v_uid, 'web_orders', v_wo.id::text, 'MARK_PAID_GATEWAY_MANUAL',
    jsonb_build_object('status', v_wo.status, 'payment_status', v_wo.payment_status,
                       'payment_method', v_wo.payment_method, 'payment_reference', v_wo.payment_reference),
    jsonb_build_object('payment_status', 'paid', 'payment_id', v_pago, 'method', v_metodo, 'reference', 'MANUAL'),
    jsonb_build_object('order_number', v_wo.order_number, 'invoice_id', v_inv.id, 'marcado_en', v_ahora,
                       'cancelado_por_pago_fallido', exists (
                         select 1 from public.ops_audit_log a
                          where a.entity_type = 'web_orders' and a.entity_id = v_wo.id::text
                            and a.action = 'REACTIVATE_FAILED_PAYMENT'))
  );

  return jsonb_build_object('ok', true, 'ya_pagado', false, 'order_id', v_wo.id, 'invoice_id', v_inv.id,
                            'invoice_number', v_inv.number, 'payment_id', v_pago, 'metodo', v_metodo,
                            'sale_id', v_wo.sale_id);
end;
$function$;

revoke all on function public.fn_marcar_pedido_web_pagado_pasarela(uuid, jsonb) from public, anon;
grant execute on function public.fn_marcar_pedido_web_pagado_pasarela(uuid, jsonb) to authenticated, service_role;

commit;
