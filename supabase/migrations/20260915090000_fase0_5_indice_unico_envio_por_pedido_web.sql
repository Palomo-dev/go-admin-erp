-- 20260915090000_fase0_5_indice_unico_envio_por_pedido_web.sql
-- Versión aplicada en Supabase: 20260915062704 (vía MCP, proyecto jgmgphmzusbluqhuqihj).
-- Fase 0.5 (GO-1) — Un pedido web, un envío.
--
-- Hasta ahora dos rutas de código independientes creaban el envío de un pedido web
-- (confirmación manual desde el POS y auto-confirmación por pago), ambas con
-- "consultar y luego insertar" sin transacción y sin ninguna restricción en la base.
-- Si se cruzaban sobre el mismo pedido, quedaban dos envíos, y la función que los
-- busca (.single()) empezaba a fallar en la UI de asignación y de seguimiento.
--
-- Verificado antes de aplicar (vía Supabase MCP, proyecto jgmgphmzusbluqhuqihj):
--   493 envíos de pedido web, 0 duplicados. Ensayado en begin … rollback.
--
-- El código ahora tiene una sola ruta (deliveryIntegrationService.createShipmentFromWebOrder)
-- que, ante el 23505 de este índice, devuelve el envío que ganó la carrera en vez de
-- propagar el error.
--
-- Limitación deliberada, a revisar cuando toque: este índice impide que un pedido salga
-- en DOS guías (envío parcial), algo normal en e-commerce cuando un producto está en
-- otra bodega. Hoy no se hace, así que no rompe nada. Si se necesita, el modelo pasa a
-- (source_type, source_id, secuencia) y este índice se sustituye.
--
-- Idempotente: IF NOT EXISTS. No toca datos.
-- Rollback: supabase/rollbacks/20260915090000_fase0_5_indice_unico_envio_por_pedido_web_rollback.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_web_order_unique
  ON public.shipments (source_type, source_id)
  WHERE source_type = 'web_order';
