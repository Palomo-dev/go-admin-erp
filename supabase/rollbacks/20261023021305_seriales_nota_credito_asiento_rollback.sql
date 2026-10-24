-- Rollback de 20261023021305_seriales_nota_credito_asiento.sql
-- Borra el asiento propio de la nota de devolución.
-- Ejecutar después de revertir procesar_devolucion, que la llama.
-- No borra asientos ya publicados.

drop function if exists public.fn_nc_asiento_devolucion(integer, uuid);
