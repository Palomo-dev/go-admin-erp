-- Rollback de 20261126091500_avisos_pago_pedido_web.sql.
--
-- AVISO: borra los avisos de pago de pedidos online (member_notices con event 'pedido.pago.%'):
-- las restricciones viejas no los admiten. Los pedidos y pagos no se tocan.

DROP TRIGGER IF EXISTS trg_avisos_pago_pedido_web ON public.web_orders;
DROP FUNCTION IF EXISTS public.fn_avisos_pago_pedido_web();
DROP INDEX IF EXISTS public.member_notices_pago_pedido_idx;

DELETE FROM public.member_notices WHERE event LIKE 'pedido.pago.%' OR entity_type = 'web_order';

ALTER TABLE public.member_notices DROP CONSTRAINT IF EXISTS member_notices_event_check;
ALTER TABLE public.member_notices ADD CONSTRAINT member_notices_event_check
  CHECK (event = ANY (ARRAY[
    'tarea.asignada'::text, 'oportunidad.asignada'::text, 'oportunidad.etapa'::text, 'tarea.completada'::text,
    'tarea.atrasada'::text, 'tarea.vence'::text, 'oportunidad.vence'::text, 'oportunidad.atrasada'::text,
    'oportunidad.ganada'::text, 'oportunidad.perdida'::text, 'oportunidad.contacto'::text, 'caja.diferencia'::text,
    'cartera.resumen'::text, 'inventario.cero'::text, 'inventario.bajo'::text, 'transporte.documento.vence'::text]));

ALTER TABLE public.member_notices DROP CONSTRAINT IF EXISTS member_notices_entity_check;
ALTER TABLE public.member_notices ADD CONSTRAINT member_notices_entity_check
  CHECK (entity_type = ANY (ARRAY['task'::text, 'opportunity'::text, 'cash_session'::text, 'digest'::text,
                                  'stock'::text, 'vehicle_document'::text]));
