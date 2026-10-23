-- Rollback de 20261023021654_seriales_iva_backfill.sql
--
-- No revierte datos. Estos backfills no se pueden deshacer sin una copia
-- anterior, porque no queda marca de cuáles filas escribió esta migración:
--   * sale_items.serial_ids completados desde seriales vendidos
--   * warranty_months / warranty_start / warranty_end de seriales fuera de bodega
--   * filas de configuracion_contable sembradas en organizaciones que no tenían ninguna
--
-- Los asientos históricos no se tocaron. fn_reclasificar_iva_generado no se
-- ejecutó en la migración; si alguien la llamó después, ese asiento nuevo
-- (fact_key reclasificacion:iva_generado:<org>) queda publicado y este
-- script no lo anula.
--
-- Solo retira la función opcional.

drop function if exists public.fn_reclasificar_iva_generado(integer);
