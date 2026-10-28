-- 20261027244000 · fn_marcar_pedido_web_pagado (RPC VIEJA): cerrada para pedidos de pasarela y para métodos de caja
-- ORDEN COMPLETO (aplicar): 20261027241500 → 20261027243000 → 20261027244000 → 20261027245000 → 20261027242000
--   (la 242000 SOLO tras confirmar en el panel de Wompi). ROLLBACK en orden INVERSO:
--   242000 → 245000 → 244000 → 243000 → 241500.
--   20261027246000 (liberar reservas de cancelados) es INDEPENDIENTE: va aparte, con su respaldo y su rollback.
-- SIN APLICAR. Aplicar DESPUÉS de 20261027241500 (fn_metodo_es_pasarela) y 20261027243000
-- (fn_marcar_pedido_web_pagado_pasarela), con: psql -v ON_ERROR_STOP=1 -f <archivo>
--
-- Por qué (QA 98a021b73, amarillo 1): la RPC vieja es SECURITY DEFINER, se puede llamar directo por
-- PostgREST y en pedidos VENCIDOS aceptaba cualquier p_metodo (también 'cash'), creando un pago
-- source web_order fuera de caja. Regla de Juan: el pago manual de un pedido de pasarela es solo
-- confirmar y queda como pago de la pasarela (fn_marcar_pedido_web_pagado_pasarela), nunca efectivo.
--
-- Quién la llama (27-oct-2026): NADIE. Ni el código (src/, supabase/functions: 0 referencias; la UI
-- dejó de usarla), ni otra función de prod (pg_proc.prosrc: 0). No hay flujo de contra entrega ni
-- de pedidos no pasarela que dependa de ella: esos se cobran en caja (fn_cobrar_pedido_web_en_caja).
-- No se puede DELEGAR en fn_marcar_pedido_web_pagado_pasarela: la vieja exige pedido SIN venta
-- (PEDIDO_CON_VENTA) y la nueva exige pedido confirmado (PEDIDO_SIN_CONFIRMAR). Por eso RECHAZA:
--   1. Pedido de pasarela (fn_metodo_es_pasarela(web_orders.payment_method)) → USAR_MARCAR_PAGADO_PASARELA
--      (22023), con hint: confirmar el pedido (también vencido) y «Marcar como pagado»
--      (fn_marcar_pedido_web_pagado_pasarela).
--   2. p_metodo que no es de pasarela (cash, transfer, datáfono, contra entrega…) → METODO_DE_CAJA
--      (22023): se cobra en caja. Cierra el hueco de 'cash' en vencidos no pasarela.
-- Lo demás (firma, SECURITY DEFINER, search_path, chequeos y cuerpo) igual a prod (md5 de
-- pg_get_functiondef antes: aa40a852fda85d60893de1752351874c). Grants: solo authenticated y
-- service_role (sin PUBLIC ni anon; en prod ya era así, se reafirma).
-- Rollback: supabase/rollbacks/20261027244000_fn_marcar_pedido_web_pagado_solo_pasarela_rollback.sql

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

CREATE OR REPLACE FUNCTION public.fn_marcar_pedido_web_pagado(p_order_id uuid, p_referencia text, p_metodo text DEFAULT 'wompi'::text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_wo public.web_orders%rowtype;
  v_ref text := left(nullif(btrim(coalesce(p_referencia, '')), ''), 200);
  v_metodo text := coalesce(nullif(btrim(coalesce(p_metodo, '')), ''), 'wompi');
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_items jsonb;
  v_reserva jsonb := null;
  v_pago uuid;
  v_moneda text;
  v_otro text;
  v_existente boolean := false;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if v_ref is null or length(v_ref) < 3 then
    raise exception 'REFERENCIA_REQUERIDA' using errcode = '22023',
      hint = 'Escriba la referencia de la transacción en Wompi.';
  end if;
  if v_ref !~ '^[0-9]{3,}-[0-9]{6,}-[0-9]{3,}$' then
    raise exception 'REFERENCIA_INVALIDA' using errcode = '22023',
      hint = 'Formato Wompi: <comercio>-<epoch>-<aleatorio>, p. ej. 1578504-1792942441-37635.';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
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
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  -- 20261027244000: un pedido de pasarela solo se marca pagado con fn_marcar_pedido_web_pagado_pasarela
  -- (pago de la pasarela, referencia MANUAL, auditoría MARK_PAID_GATEWAY_MANUAL), nunca aquí.
  if public.fn_pedido_web_es_pasarela(v_wo.payment_method, v_wo.payment_reference) then
    raise exception 'USAR_MARCAR_PAGADO_PASARELA' using errcode = '22023',
      detail = 'Pedido ' || v_wo.order_number || ' (' || coalesce(v_wo.payment_method, '-')
               || '): pedido de pasarela.',
      hint = 'Confirma el pedido (también si está vencido) y usa «Marcar como pagado» (fn_marcar_pedido_web_pagado_pasarela).';
  end if;
  -- 20261027244000: nunca un método de caja (cash, transferencia, datáfono…) fuera de la caja.
  if not public.fn_metodo_es_pasarela(v_metodo) then
    raise exception 'METODO_DE_CAJA' using errcode = '22023',
      detail = 'Método ' || v_metodo || ': se cobra en caja (fn_cobrar_pedido_web_en_caja).';
  end if;

  -- Idempotente: ya pagado, nada que hacer (la confirmación sigue por su camino).
  if v_wo.payment_status = 'paid' and v_wo.status in ('pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered') then
    return jsonb_build_object('ok', true, 'ya_pagado', true, 'order_id', v_wo.id, 'status', v_wo.status);
  end if;

  if not (v_wo.status in ('pending', 'expired')
          or (v_wo.status = 'cancelled' and v_wo.payment_status = 'failed')) then
    raise exception 'PEDIDO_NO_REACTIVABLE' using errcode = '22023',
      detail = 'El pedido está ' || v_wo.status || '/' || coalesce(v_wo.payment_status, '-') || '.';
  end if;
  if v_wo.sale_id is not null or v_wo.table_session_id is not null then
    raise exception 'PEDIDO_CON_VENTA' using errcode = '22023';
  end if;
  -- MEDIO 3: efectivo / transferencia / mesa se cobran en caja; solo los vencidos admiten cualquier método.
  if v_wo.status <> 'expired' and lower(coalesce(v_wo.payment_method, '')) not in
       ('wompi', 'wompi_co', 'card', 'nequi', 'daviplata', 'pse', 'bancolombia_transfer',
        'bancolombia_collect', 'bancolombia_bnpl', 'su_plus') then
    raise exception 'PEDIDO_NO_REACTIVABLE' using errcode = '22023',
      detail = 'Método ' || coalesce(v_wo.payment_method, '-') || ': se cobra en caja.';
  end if;
  -- MEDIO 2: la referencia ya está en otro pago → avisar, no duplicar.
  select p.source || ':' || p.source_id into v_otro from public.payments p
   where p.reference = v_ref and p.organization_id = v_wo.organization_id
     and not (p.source = 'web_order' and p.source_id = p_order_id::text)
   limit 1;
  if v_otro is not null then
    raise exception 'REFERENCIA_DUPLICADA' using errcode = '23505',
      detail = 'La referencia ' || v_ref || ' ya está registrada en el pago ' || v_otro || '.';
  end if;

  -- Stock: la expiración lo liberó → reservar otra vez, todo o nada.
  if v_wo.stock_released_at is not null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
      into v_items
      from public.web_order_items i
     where i.web_order_id = p_order_id and i.product_id is not null and coalesce(i.quantity, 0) > 0;
    if jsonb_array_length(v_items) > 0 then
      v_reserva := public.reserve_stock_for_web_order(v_wo.organization_id, v_wo.branch_id, p_order_id, v_items);
      if not coalesce((v_reserva->>'ok')::boolean, false) then
        return jsonb_build_object('ok', false, 'error', 'STOCK_INSUFICIENTE', 'order_id', v_wo.id,
                                  'shortages', coalesce(v_reserva->'shortages', '[]'::jsonb));
      end if;
    end if;
  end if;

  update public.web_orders set
    status = 'pending',
    payment_status = 'paid',
    payment_method = v_metodo,
    payment_reference = v_ref,
    cancelled_at = null,
    cancelled_by = null,
    cancellation_reason = null,
    stock_released_at = null,
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
      '[PAGO MANUAL ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') || ' COT] ref ' || v_ref
      || ' (' || v_metodo || ') por ' || v_uid::text || ': ' || v_motivo),
    updated_at = now()
  where id = p_order_id;

  -- El pago, como lo deja el webhook de la tienda (source web_order): la confirmación
  -- lo vincula a la factura (webOrderConfirmationService.createPayment).
  select p.id into v_pago from public.payments p
   where p.source = 'web_order' and p.source_id = p_order_id::text and p.status in ('paid', 'completed')
   limit 1;
  v_existente := v_pago is not null;
  if v_pago is null then
    v_moneda := coalesce(
      (select oc.currency_code from public.organization_currencies oc
        where oc.organization_id = v_wo.organization_id order by oc.is_base desc, oc.currency_code limit 1),
      'COP');
    insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency,
                                 reference, status, created_by)
    values (v_wo.organization_id, v_wo.branch_id, 'web_order', p_order_id::text, v_metodo,
            coalesce(v_wo.total, 0), v_moneda, v_ref, 'completed', v_uid)
    returning id into v_pago;
  end if;

  insert into public.ops_audit_log (
    organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, new_data, metadata
  ) values (
    v_wo.organization_id, v_wo.branch_id, v_uid, 'web_orders', v_wo.id::text, 'MARK_PAID_MANUAL',
    jsonb_build_object('status', v_wo.status, 'payment_status', v_wo.payment_status,
                       'payment_reference', v_wo.payment_reference, 'payment_method', v_wo.payment_method,
                       'cancellation_reason', v_wo.cancellation_reason, 'stock_released_at', v_wo.stock_released_at),
    jsonb_build_object('status', 'pending', 'payment_status', 'paid', 'payment_reference', v_ref,
                       'payment_method', v_metodo),
    jsonb_build_object('referencia_pago', v_ref, 'metodo', v_metodo, 'motivo', v_motivo,
                       'order_number', v_wo.order_number, 'payment_id', v_pago, 'reserva', v_reserva)
  );

  return jsonb_build_object('ok', true, 'ya_pagado', false, 'order_id', v_wo.id, 'pago_existente', v_existente,
                            'estado_anterior', v_wo.status, 'payment_id', v_pago,
                            'stock_reservado', v_reserva is not null, 'reserva', v_reserva);
end;
$function$
;

revoke all on function public.fn_marcar_pedido_web_pagado(uuid, text, text, text) from public, anon;
grant execute on function public.fn_marcar_pedido_web_pagado(uuid, text, text, text) to authenticated, service_role;

commit;
