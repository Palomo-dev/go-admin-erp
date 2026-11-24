-- Pedidos web: un solo cálculo del plazo para pagar (2026-11-24).
--
-- La consulta pública del pedido en la tienda (Figma «21 Logística» › 10, aprobada por el dueño
-- el 2026-11-24) dice «Apartamos tus productos hasta las 8:25 a. m.». Esa hora tiene que ser la
-- misma con la que `expire_pending_web_orders` vence el pedido. Antes el plazo vivía dentro de esa
-- función; ahora sale de `fn_web_order_plazo_minutos` y la usan las dos.
--
-- Regla (la de siempre, sin cambios):
--   1. `organization_settings` (key 'web_commerce') › `order_expiration_minutes` si es > 0;
--   2. si no, 1440 min (24 h) para métodos que se cobran fuera de la pasarela: transfer, cash,
--      bancolombia_transfer, bancolombia_collect, pse, o un método de la organización sin conexión
--      de pasarela (`fn_web_order_metodo_nativo`);
--   3. si no, el plazo por defecto (el `minutes` del cron, 30).
-- Única diferencia: un valor configurado que no es un número (p. ej. «30 min») ya no rompe el
-- vencimiento de TODAS las organizaciones con un error de conversión; se ignora como «sin
-- configurar» (igual que `fn_inicio_pedidos_web_pendientes`).

create or replace function public.fn_web_order_plazo_minutos(
  p_organization_id integer,
  p_payment_method text,
  p_por_defecto integer default 30
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_crudo text;
  v_configurado integer;
begin
  select os.settings->>'order_expiration_minutes' into v_crudo
    from public.organization_settings os
   where os.organization_id = p_organization_id and os.key = 'web_commerce'
   limit 1;
  if v_crudo ~ '^[0-9]{1,6}$' then
    v_configurado := nullif(v_crudo::integer, 0);
  end if;
  if v_configurado is not null then
    return v_configurado;
  end if;
  if p_payment_method in ('transfer', 'cash', 'bancolombia_transfer', 'bancolombia_collect', 'pse')
     or public.fn_web_order_metodo_nativo(p_organization_id, p_payment_method) then
    return 1440;
  end if;
  return coalesce(p_por_defecto, 30);
end;
$function$;

revoke execute on function public.fn_web_order_plazo_minutos(integer, text, integer) from public, anon;
grant execute on function public.fn_web_order_plazo_minutos(integer, text, integer) to authenticated, service_role;

comment on function public.fn_web_order_plazo_minutos(integer, text, integer) is
  'Minutos que un pedido web pendiente de pago aparta los productos antes de vencer. Lo usan expire_pending_web_orders y la consulta pública del pedido.';

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
