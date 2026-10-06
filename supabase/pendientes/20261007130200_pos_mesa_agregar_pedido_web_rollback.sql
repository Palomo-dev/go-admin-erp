-- Rollback de 20261007130200_pos_mesa_agregar_pedido_web.
-- Antes: el ERP deja de llamar a la RPC (el código la trata como ausente y el
-- pedido dine_in se confirma por fn_confirmar_pedido_web_completo, con venta
-- propia). Las sesiones, líneas y comandas ya creadas se conservan: son la
-- cuenta real de la mesa.

drop function if exists public.pos_mesa_agregar_pedido_web(uuid, jsonb, integer, uuid);
