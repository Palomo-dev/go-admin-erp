-- Rollback de 20260930085948_compras_asiento_previo.
--
-- Retira la vista previa del asiento. No hay datos que revertir: la función
-- deshace siempre lo que hace (solo avanzan secuencias).

drop function if exists public.fn_factura_compra_asiento_previo(uuid);
