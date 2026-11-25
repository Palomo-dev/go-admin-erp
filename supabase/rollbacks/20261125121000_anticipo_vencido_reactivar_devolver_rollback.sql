-- Reversión de 20261125121000_anticipo_vencido_reactivar_devolver.
--
-- Deja fn_web_order_anticipo_resultado como en 20261124230000 (con el pedido cerrado responde
-- 'pagado_pedido_cerrado' y no reactiva), quita el recordatorio de pg_cron y las funciones nuevas.
-- Las devoluciones ya registradas (web_order_refunds y sus asientos web_order_advance:refund:*)
-- NO se tocan: son dinero que ya salió.
-- La restricción de web_order_notices.moment solo vuelve a la lista anterior si no hay filas con
-- los momentos nuevos; si las hay, se deja ampliada (borrar historial de avisos no es reversión).

DO $cron$
begin
  if exists (select 1 from cron.job where jobname = 'anticipo-vencido-recordatorios') then
    perform cron.unschedule('anticipo-vencido-recordatorios');
  end if;
end
$cron$;

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
    return jsonb_build_object('ok', true, 'status', 'rechazado', 'advance_status', v_wo.advance_status);
  elsif p_estado = 'refunded' then
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

  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency,
                               reference, processor_response, status)
  values (v_wo.organization_id, v_wo.branch_id, 'web_order', v_wo.id::text,
          coalesce(nullif(btrim(coalesce(p_metodo, '')), ''), nullif(btrim(coalesce(p_pasarela, '')), ''), 'card'),
          v_monto, coalesce(nullif(btrim(coalesce(p_moneda, '')), ''), 'COP'), v_tx,
          coalesce(p_respuesta, '{}'::jsonb)
            || jsonb_build_object('gateway', p_pasarela, 'concepto', 'anticipo_contraentrega'),
          'completed')
  returning id into v_pago;

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

DROP FUNCTION IF EXISTS public.fn_web_order_anticipo_vencido_recordar();
DROP FUNCTION IF EXISTS public.fn_web_order_anticipo_devolver(uuid, text, text, text, integer, numeric);
DROP FUNCTION IF EXISTS public.fn_web_order_anticipo_vencido_stock(uuid);
DROP FUNCTION IF EXISTS public.fn_web_order_anticipo_tardio(uuid);
DROP FUNCTION IF EXISTS public.fn_web_order_anticipo_campana(public.web_orders, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.fn_pesos_texto(numeric);

DO $momentos$
begin
  if not exists (select 1 from public.web_order_notices
                  where moment in ('anticipo_reactivado', 'anticipo_revisando', 'anticipo_devuelto')) then
    alter table public.web_order_notices drop constraint if exists web_order_notices_moment_check;
    alter table public.web_order_notices add constraint web_order_notices_moment_check
      check (moment = any (array['recibido'::text, 'confirmado'::text, 'listo'::text, 'en_camino'::text,
                                 'entregado'::text, 'novedad'::text, 'rechazado'::text]));
  end if;
end
$momentos$;
