-- Rollback de 20261007130100_fn_confirmar_pedido_web_completo (regenerado el 2026-10-06).
--
-- Antes: apagar el interruptor NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA en el ERP (el código
-- vuelve al camino anterior) y revertir E3 (pos_mesa_agregar_pedido_web usa fn_lineas_a_cocina).
--
-- Regenerado desde la base viva: la versión anterior de este archivo restauraba
-- fn_auto_journal_web_order con un cuerpo que NO era el vivo (md5 distinto). Esa función ya no es
-- parte de E2: su corrección se aplicó aparte (20261006114659_auto_journal_web_order_sin_pagar),
-- con su propio rollback generado con pg_get_functiondef. Este archivo no la toca.
--
-- Lo demás de E2 es nuevo (no existía el 2026-10-06, verificado por MCP: sin
-- fn_confirmar_pedido_web_completo, sin fn_lineas_a_cocina, sin kitchen_tickets.web_order_id ni
-- uq_kitchen_tickets_web_order), así que revertir es quitarlo. Las comandas, ventas y líneas ya
-- creadas por la RPC se conservan (son datos del negocio). La columna kitchen_tickets.web_order_id
-- se conserva (aditiva, NULL-able): quitarla perdería el vínculo comanda ↔ pedido.

drop function if exists public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean);
drop function if exists public.fn_lineas_a_cocina(integer, uuid[]);
drop index if exists public.uq_kitchen_tickets_web_order;
