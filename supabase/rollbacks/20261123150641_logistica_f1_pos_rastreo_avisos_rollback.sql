-- Reversión de 20261123150641_logistica_f1_pos_rastreo_avisos.sql (logística Fase 1, 5/5).
--
-- ADVERTENCIA: no restaura datos.
-- - Los envíos creados desde ventas POS se quedan (borrarlos borraría su historial).
-- - El CHECK de momentos vuelve sin 'novedad': falla si ya hay avisos 'novedad'; bórrelos o
--   cámbielos antes.
-- - Los eventos 'created' completados con canonical_status = 'created' no se devuelven a NULL (es
--   el valor correcto y no hay forma de distinguir cuáles venían vacíos).

drop function if exists public.logistica_rastreo_publico(integer, uuid);
drop function if exists public.logistica_crear_envio_venta_pos(uuid, jsonb, uuid);
alter table public.web_order_notices drop constraint if exists web_order_notices_moment_check;
alter table public.web_order_notices add constraint web_order_notices_moment_check
  check (moment = any (array['recibido', 'confirmado', 'listo', 'en_camino', 'entregado', 'rechazado']));
