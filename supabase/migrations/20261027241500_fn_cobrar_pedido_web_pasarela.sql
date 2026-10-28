-- 20261027241500 · fn_cobrar_pedido_web_en_caja: sonda sin 500 y pasarela pagada = ya cobrado
-- SIN APLICAR. Aplicar con: psql -v ON_ERROR_STOP=1 -f <archivo> (directa o sesión 5432).
--
-- Base: pg_get_functiondef de PROD (jgmgphmzusbluqhuqihj) leído el 27-oct-2026 21:10 (UTC-5).
-- Cambios (firma, SECURITY INVOKER, search_path y grants iguales):
--  1. p_order_id = uuid cero → {"sonda": true} (cobroEnCajaDisponible daba P0002/500).
--  2. Pedido paid con método de pasarela (fn_metodo_es_pasarela): tras PEDIDO_SIN_CONFIRMAR
--     marca la venta pagada SIN pago ni caja y devuelve ya_cobrado (caso WO-335-MVRDVAGK-MRHJ,
--     cobrado otra vez como CASH). No crea factura ni toca asientos.
--  3. Un vencido ('expired') pagado por pasarela no choca con PEDIDO_NO_CONFIRMABLE.
-- Rollback: supabase/rollbacks/20261027241500_fn_cobrar_pedido_web_pasarela_rollback.sql

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

-- Mantener en sync con PASARELAS_DE_PAGO (src/lib/pos/pedidosWeb/metodosCaja.ts).
create or replace function public.fn_metodo_es_pasarela(p_metodo text)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $$
  select lower(btrim(coalesce(p_metodo, ''))) in (
           'wompi', 'wompi_co', 'epayco', 'mercadopago', 'mercado_pago', 'mp', 'payu', 'stripe', 'paypal',
           'bold', 'bold_link', 'bold_qr', 'bold_card', 'addi', 'pse', 'bancolombia_bnpl', 'bancolombia_collect',
           'bancolombia_transfer', 'su_plus', 'sistecredito', 'conekta', 'oxxo', 'openpay', 'kushki', 'dlocal')
      or lower(btrim(coalesce(p_metodo, ''))) like 'wompi%'
      or lower(btrim(coalesce(p_metodo, ''))) like 'bold\_%';
$$;
revoke all on function public.fn_metodo_es_pasarela(text) from public;
grant execute on function public.fn_metodo_es_pasarela(text) to authenticated, service_role;

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
  v_pasarela_pagado boolean := false;
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
  v_pasarela_pagado := v_wo.payment_status = 'paid' and public.fn_metodo_es_pasarela(v_wo.payment_method);
  -- Un vencido pagado por pasarela no se bloquea aquí: solo se confirma (abajo, ya_cobrado).
  if v_wo.status in ('cancelled', 'rejected', 'refunded')
     or (v_wo.status = 'expired' and not v_pasarela_pagado) then
    raise exception 'PEDIDO_NO_CONFIRMABLE' using errcode = '22023';
  end if;
  if v_wo.table_session_id is not null then
    raise exception 'COBRAR_EN_LA_MESA' using errcode = '22023';
  end if;
  if v_wo.sale_id is null then
    raise exception 'PEDIDO_SIN_CONFIRMAR' using errcode = '22023';
  end if;
  -- Respaldo: pagado por pasarela = ya cobrado. Sin pago nuevo, sin caja y sin
  -- factura nueva (la del flujo de pasarela y su asiento quedan como están).
  if v_pasarela_pagado then
    select * into v_inv from public.invoice_sales i
     where i.sale_id = v_wo.sale_id and i.organization_id = v_wo.organization_id
       and coalesce(i.document_type, 'invoice') = 'invoice' and i.status <> 'void'
     order by i.created_at asc limit 1;
    if v_inv.id is not null then
      select p.id into v_pago from public.payments p
       where p.source = 'invoice_sales' and p.source_id = v_inv.id::text and p.status = 'completed'
       limit 1;
    end if;
    update public.sales set
      status = 'paid', payment_status = 'paid', balance = 0, updated_at = now()
     where id = v_wo.sale_id
       and (status is distinct from 'paid' or payment_status is distinct from 'paid' or balance is distinct from 0);
    return jsonb_build_object(
      'ya_cobrado', true,
      'pasarela', true,
      'invoice_id', v_inv.id,
      'invoice_number', v_inv.number,
      'payment_id', v_pago,
      'cash_session_id', null,
      'sale_id', v_wo.sale_id);
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
