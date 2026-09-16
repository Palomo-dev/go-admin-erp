-- 20260915090000_fase0_5_indice_unico_envio_por_pedido_web_rollback.sql
-- Revierte 20260915090000_fase0_5_indice_unico_envio_por_pedido_web.sql
--
-- Quita el índice único parcial. Vuelve a ser posible que dos llamadas concurrentes
-- creen dos envíos para el mismo pedido web; el código sigue consultando antes de
-- insertar, así que sólo pasa si se cruzan en el tiempo.
--
-- No toca datos: la migración no modificó ninguna fila.

DROP INDEX IF EXISTS public.idx_shipments_web_order_unique;
