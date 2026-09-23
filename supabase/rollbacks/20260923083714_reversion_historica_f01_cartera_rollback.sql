-- Rollback de 20260923083714_reversion_historica_f01_cartera.sql
--
-- Retira el ejecutor F-01. Los 1.278 contra-asientos F-01 publicados no se
-- borran; para deshacerlos se revierten (procedimiento, §4):
--
--   SELECT fn_revertir_asiento(reversal_entry_id, 'F-01', 'rollback-f01')
--   FROM journal_reversals WHERE categoria = 'F-01' AND lote = 'cierre-contable-f01-2026-09-23';
--
-- El CHECK de categoría se conserva con 'F-01' mientras existan filas F-01.
drop function if exists public.fn_reversion_f01_org(integer, text, boolean);
