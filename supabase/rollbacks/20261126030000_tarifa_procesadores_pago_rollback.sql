-- Rollback de 20261126030000_tarifa_procesadores_pago.sql.
--
-- AVISO: quitar la columna borra las tarifas que las organizaciones hayan guardado después de
-- aplicar la migración (no se pueden restaurar desde aquí). La fila de la organización 358 que
-- creó la migración se borra solo si no tiene otros datos (NIT, nombre, origen…); si los tiene,
-- se conserva y solo pierde la tarifa.
delete from public.payment_processor_settings
 where organization_id = 358 and processor = 'bold'
   and tercero_nit is null and tercero_nombre is null and tercero_doc_type is null
   and origin is null and retains_balance is null;

drop function if exists public.fn_procesador_pago_tarifa_guardar(integer, text, jsonb);

alter table public.payment_processor_settings drop column if exists fee_schedule;
