-- Rollback de 20260930090435_compras_retenciones_reporte_certificado.
--
-- Retira el reporte de retenciones practicadas, el certificado por proveedor y
-- su lectura interna. No hay datos que revertir: las tres funciones solo leen.

drop function if exists public.fn_certificado_retenciones_proveedor(integer, integer, date, date);
drop function if exists public.fn_reporte_retenciones_practicadas(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_retenciones_practicadas_filas(integer, timestamptz, timestamptz, integer, integer);
