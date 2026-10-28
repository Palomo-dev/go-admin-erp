-- 20261027241500 · fn_cobrar_pedido_web_en_caja: sonda sin 500 y pasarela pagada = ya cobrado
-- ORDEN COMPLETO (aplicar): 20261027241500 → 20261027243000 → 20261027244000 → 20261027245000 → 20261027242000
--   (la 242000 SOLO tras confirmar en el panel de Wompi). ROLLBACK en orden INVERSO:
--   242000 → 245000 → 244000 → 243000 → 241500.
-- SIN APLICAR. Aplicar con: psql -v ON_ERROR_STOP=1 -f <archivo> (directa o sesión 5432).
--
-- Base: pg_get_functiondef de PROD (jgmgphmzusbluqhuqihj) leído el 27-oct-2026 21:10 (UTC-5).
-- Cambios (firma, SECURITY INVOKER, search_path y grants iguales):
--  1. p_order_id = uuid cero → {"sonda": true} (cobroEnCajaDisponible daba P0002/500).
--  2. Pedido de PASARELA (fn_metodo_es_pasarela), pagado o no, también vencido → PEDIDO_DE_PASARELA
--     (22023). Nunca se cobra en caja: se marca pagado con fn_marcar_pedido_web_pagado_pasarela
--     (20261027243000). Caso WO-335-MVRDVAGK-MRHJ, cobrado otra vez como CASH.
--  3. fn_metodo_es_pasarela incluye nequi, daviplata y card: en web_orders solo llegan por el webhook
--     de Wompi (goadmin-websites app/api/webhooks/wompi_co/route.ts escribe payment_method =
--     payment_method_type) — 996 nequi / 99 daviplata / 62 card, todos con referencia Wompi
--     (salvo 1 nequi). Sin EXECUTE para PUBLIC ni anon.
-- Rollback: supabase/rollbacks/20261027241500_fn_cobrar_pedido_web_pasarela_rollback.sql

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

-- Mantener en sync con PASARELAS_DE_PAGO / esMetodoDePasarela (src/lib/pos/pedidosWeb/metodosCaja.ts).
-- Valores que escriben las pasarelas en web_orders.payment_method (goadmin-websites):
--   checkout/init escribe el código de la pasarela elegida: wompi, wompi_co, card (→ wompi_co),
--   mp_checkout, payu_co, stripe_payments, paypal_checkout, bold_link; luego cada webhook lo pisa con
--   el submétodo: wompi_co → payment_method_type (card, nequi, pse, daviplata, bancolombia_*, su_plus…),
--   bold → data.payment_method (card, pse, nequi, credit_card, boton_bancolombia…), mercadopago →
--   payment_method_id/payment_type_id (visa, master, account_money, credit_card, ticket…, o 'mercadopago'),
--   stripe → payment_method_types[0] (card, link…), paypal → payment_source (paypal, card, venmo…),
--   payu → paymentMethod (visa, pse, efecty… o 'payu'). Por eso además de la lista, un pedido es de
--   pasarela si trae REFERENCIA de la pasarela (fn_pedido_web_es_pasarela): cubre pasarelas futuras.
create or replace function public.fn_metodo_es_pasarela(p_metodo text)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $$
  select m in (
           'wompi', 'wompi_co', 'epayco', 'mercadopago', 'mercado_pago', 'mp', 'mp_checkout', 'payu', 'payu_co',
           'stripe', 'stripe_payments', 'paypal', 'paypal_checkout', 'bold', 'bold_link', 'bold_qr', 'bold_card',
           'addi', 'pse', 'bancolombia_bnpl', 'bancolombia_collect', 'bancolombia_transfer',
           'boton_bancolombia', 'su_plus', 'nequi', 'daviplata', 'card', 'credit_card', 'debit_card', 'prepaid_card',
           'account_money', 'visa', 'master', 'mastercard', 'amex', 'diners', 'debvisa', 'debmaster', 'efecty',
           'link', 'venmo', 'apple_pay', 'google_pay', 'sistecredito', 'conekta', 'oxxo', 'openpay', 'kushki', 'dlocal')
      or m like 'wompi%' or m like 'bold\_%' or m like 'mp\_%' or m like 'payu\_%'
      or m like 'stripe\_%' or m like 'paypal\_%' or m like 'mercadopago%'
    from (select lower(btrim(coalesce(p_metodo, ''))) as m) x;
$$;
revoke all on function public.fn_metodo_es_pasarela(text) from public, anon;
grant execute on function public.fn_metodo_es_pasarela(text) to authenticated, service_role;

-- ¿El PEDIDO web vino de una pasarela? web_orders no tiene columna de proveedor: el método de la lista,
-- o cualquier método con referencia de la pasarela (los webhooks siempre escriben payment_reference
-- junto al submétodo) que no sea de caja/mostrador. Mantener en sync con pedidoEsDePasarela (TS).
create or replace function public.fn_pedido_web_es_pasarela(p_metodo text, p_referencia text)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $$
  select public.fn_metodo_es_pasarela(p_metodo)
      or (nullif(btrim(coalesce(p_referencia, '')), '') is not null
          and upper(btrim(p_referencia)) <> 'MANUAL'
          and lower(btrim(coalesce(p_metodo, ''))) not in (
                '', 'cash', 'efectivo', 'transfer', 'transferencia', 'qr', 'mesa', 'cash_on_delivery',
                'contraentrega', 'contra_entrega', 'credit', 'check', 'datafono'));
$$;
revoke all on function public.fn_pedido_web_es_pasarela(text, text) from public, anon;
grant execute on function public.fn_pedido_web_es_pasarela(text, text) to authenticated, service_role;

-- Código de payment_methods con que queda el pago manual de un pedido de pasarela (siempre la
-- pasarela, nunca efectivo). Submétodo desconocido (p. ej. 'visa' de Mercado Pago) → la pasarela
-- de pagos conectada de la organización si hay una sola; si no, null (METODO_INVALIDO).
create or replace function public.fn_pasarela_metodo_pago(p_org integer, p_metodo text)
 returns text
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $$
  with m as (select lower(btrim(coalesce(p_metodo, ''))) as m),
  directo as (
    select case
      when m like 'wompi%' or m in ('nequi', 'daviplata', 'card', 'pse', 'bancolombia_bnpl', 'bancolombia_collect',
           'bancolombia_transfer', 'su_plus') then 'wompi'
      when m in ('mercadopago', 'mercado_pago', 'mp', 'mp_checkout') or m like 'mp\_%' or m like 'mercadopago%' then 'mp'
      when m in ('payu', 'payu_co') or m like 'payu\_%' then 'payu'
      when m in ('stripe', 'stripe_payments') or m like 'stripe\_%' then 'stripe'
      when m in ('paypal', 'paypal_checkout') or m like 'paypal\_%' then 'paypal'
      when m in ('bold', 'bold_link') then 'bold_link'
      when m like 'bold\_%' then m
      else null end as c
    from m),
  org as (
    select case k.code when 'wompi_co' then 'wompi' when 'mp_checkout' then 'mp' when 'payu_co' then 'payu'
                       when 'stripe_payments' then 'stripe' when 'paypal_checkout' then 'paypal'
                       when 'bold_link' then 'bold_link' end as c
      from public.integration_connections ic
      join public.integration_connectors k on k.id = ic.connector_id
     where ic.organization_id = p_org and coalesce(ic.status, '') not in ('disconnected', 'error', 'inactive')
       and k.code in ('wompi_co', 'mp_checkout', 'payu_co', 'stripe_payments', 'paypal_checkout', 'bold_link')
     group by 1)
  select coalesce(
    (select d.c from directo d join public.payment_methods pm on pm.code = d.c and coalesce(pm.is_active, true)),
    (select m.m from m join public.payment_methods pm on pm.code = m.m and coalesce(pm.is_active, true)
      where public.fn_metodo_es_pasarela(m.m) and m.m not in ('cash', 'transfer', 'qr')),
    (select o.c from org o join public.payment_methods pm on pm.code = o.c and coalesce(pm.is_active, true)
      where (select count(*) from org) = 1));
$$;
revoke all on function public.fn_pasarela_metodo_pago(integer, text) from public, anon;
grant execute on function public.fn_pasarela_metodo_pago(integer, text) to authenticated, service_role;

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

-- Grants iguales a prod: {postgres, authenticated, service_role}, sin PUBLIC.
revoke all on function public.fn_cobrar_pedido_web_en_caja(uuid, text, jsonb, text, numeric) from public;
grant execute on function public.fn_cobrar_pedido_web_en_caja(uuid, text, jsonb, text, numeric) to authenticated, service_role;

commit;
