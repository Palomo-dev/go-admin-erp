-- Rollback de 20261122041519_pos_devoluciones_anular_saldo_usado_ajuste.
--
-- No hay nada que deshacer por separado: el ajuste solo quitó de
-- fn_devolucion_anular el INSERT en journal_reversals (que la restricción de
-- categorías rechazaba) y agregó dos datos al diff de finance_audit_log.
-- Para volver atrás del todo, aplique el rollback de
-- 20261122041421_pos_devoluciones_anular_saldo_usado, que restaura la firma
-- anterior de la función.
select 1;
