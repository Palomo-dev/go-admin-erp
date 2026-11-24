-- Reversión de 20261124235000_promociones_registro_por_venta.
-- ADVERTENCIA: borra sale_promotions con sus filas (qué promoción se usó en cada venta y pedido
-- web). No las restaura. usage_count y promotion_customer_uses no se tocan.

set lock_timeout = '10s';

-- pos_checkout_v1: quita las dos líneas añadidas (reemplazo textual inverso).
do $$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
begin
  if position('fn_venta_registrar_promociones' in v_def) = 0 then
    return;
  end if;
  v_def := replace(v_def, chr(10) || '      perform public.fn_venta_registrar_promociones(v_sale_id);', '');
  v_def := replace(v_def, chr(10) || '        perform public.fn_venta_registrar_promociones(v_sale_id);', '');
  execute v_def;
end $$;

drop function if exists public.fn_promocion_estadisticas(uuid, timestamptz, timestamptz, integer);
drop function if exists public.fn_promociones_resumen(integer, timestamptz, timestamptz, integer);
drop trigger if exists trg_web_orders_promociones_venta on public.web_orders;
drop function if exists public.fn_web_orders_promociones_venta();
drop function if exists public.fn_pedido_web_promociones_guardar(uuid, jsonb);
drop function if exists public.fn_venta_registrar_promociones(uuid);
drop function if exists public.fn_texto_cantidad(numeric);
drop table if exists public.sale_promotions;
