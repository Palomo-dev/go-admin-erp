-- Rollback de 20260923083859_reversion_historica_devengo_caja_con_saldo.sql
--
-- Retira el ejecutor. Los 378 contra-asientos y devengos corregidos publicados
-- no se borran; para deshacerlos se revierten ambos (procedimiento, §4):
--
--   SELECT fn_revertir_asiento(reversal_entry_id, categoria, 'rollback-caja-saldo'),
--          fn_revertir_asiento(repost_entry_id, categoria, 'rollback-caja-saldo')
--   FROM journal_reversals WHERE lote = 'cierre-contable-caja-saldo-2026-09-23';
drop function if exists public.fn_reversion_devengo_caja_con_saldo_org(integer, text, boolean);
