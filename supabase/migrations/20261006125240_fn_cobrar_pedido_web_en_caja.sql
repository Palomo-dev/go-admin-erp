-- ⚠️ SIN APLICAR (2026-10-07). Paquete E · E4 — «Cobrar y entregar»: el pedido web que se paga en
-- el local (efectivo, datáfono, transferencia) entra a la caja abierta de la sede.
-- Requiere E2 aplicada antes. La corrección de trg_auto_journal_web_order (la confirmación sin
-- pagar ya no falla) ya está aplicada aparte: 20261006114659_auto_journal_web_order_sin_pagar.
--
-- ENSAYO (2026-10-07, bloque `do` que aplica esta migración más la corrección
-- de fn_auto_journal_web_order de E2, prueba como `authenticated` miembro de la
-- org 140 (caja 82 abierta, sede 115) y se deshace con `raise exception`):
--   ENSAYO_OK cobro={ya_cobrado: false, invoice_number: FACT-ENSAYO-E4,
--   cash_session_id: 82} | reintento ya_cobrado=true mismo_pago=t |
--   factura=paid total=30000.00 balance=0.00 | venta(caja status
--   pago)=true paid paid | pedido=paid | arqueo_efectivo antes=397000
--   despues=427000.00 | metodo_malo=[METODO_INVALIDO] |
--   sin_confirmar=[PEDIDO_SIN_CONFIRMAR] | sin_caja=[NO_OPEN_CASH_SESSION]
--   (caja 82 cerrada dentro del ensayo) | anon=[42501 permission denied]
--
-- Problema: el pedido pagado en el local se marcaba pagado desde el navegador
-- (`web_orders.payment_status='paid'` en handleMarkAsPaid) sin factura, sin
-- pago y sin caja: la venta web nace con include_in_cash_register=false, el
-- dinero entraba al cajón y el arqueo no lo veía (o se perdía el cobro si no
-- había factura).
--
-- Qué hace `fn_cobrar_pedido_web_en_caja(p_order_id, p_metodo, p_factura,
-- p_referencia, p_monto)`, SECURITY INVOKER (RLS del cajero), en una
-- transacción:
-- 1. Exige sesión (SESION_REQUERIDA): es un cobro de una persona en la caja.
--    Toma el pedido FOR UPDATE, exige pertenencia y acceso a la sede, y que
--    esté confirmado con venta propia (PEDIDO_SIN_CONFIRMAR). Un «Comer aquí»
--    agregado a una mesa se cobra en la mesa (COBRAR_EN_LA_MESA).
-- 2. Método activo de payment_methods (METODO_INVALIDO).
-- 3. Caja abierta de la sede del pedido con `fn_caja_abierta_para` (la misma
--    regla del POS, modo sede o cajero): si no hay, NO_OPEN_CASH_SESSION.
-- 4. Factura: reutiliza la de la venta si existe; si no, la crea con
--    `p_factura` = {number, subtotal, tax_total, total, tax_included,
--    lineas[]}, calculada en el servidor con webOrderTotals
--    (lineasFacturaWebConImpuesto) y generateInvoiceNumber: el reparto de
--    líneas NO se reimplementa en SQL.
-- 5. Pago `completed` con source='invoice_sales', la sede del pedido y
--    created_by = el cajero: es lo que `pos_caja__esperado_calculo` suma al
--    arqueo (efectivo por método, por sede y ventana de la caja). NO se
--    inserta en cash_movements: el arqueo ya cuenta el pago y un movimiento lo
--    contaría dos veces (verificado leyendo pos_caja__esperado_calculo).
-- 6. La venta pasa a include_in_cash_register=true, status/payment_status
--    'paid' y saldo 0 (aparece en «Ventas del turno»). El pedido queda
--    payment_status='paid'.
-- Idempotente: si la factura ya tiene un pago completed, no crea otro y
-- devuelve ya_cobrado=true. `fn_confirmar_pedido_web` NO cambia: lo pagado en
-- línea sigue fuera de caja.

create or replace function public.fn_cobrar_pedido_web_en_caja(
  p_order_id uuid,
  p_metodo text,
  p_factura jsonb default null,
  p_referencia text default null,
  p_monto numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $f$
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
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  if not public.app_branch_access(v_wo.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
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

  -- Factura de la venta (se reutiliza: no consume otro consecutivo)
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

  -- Pago (uno solo por factura)
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
$f$;

comment on function public.fn_cobrar_pedido_web_en_caja(uuid, text, jsonb, text, numeric) is
  'Cobra en la caja abierta de la sede un pedido web pagado en el local: factura (reutilizada o desde p_factura ya calculada), pago completed del cajero, venta dentro de caja. Idempotente por pago completed de la factura. NO_OPEN_CASH_SESSION sin caja.';

revoke all on function public.fn_cobrar_pedido_web_en_caja(uuid, text, jsonb, text, numeric) from public, anon;
grant execute on function public.fn_cobrar_pedido_web_en_caja(uuid, text, jsonb, text, numeric) to authenticated;
