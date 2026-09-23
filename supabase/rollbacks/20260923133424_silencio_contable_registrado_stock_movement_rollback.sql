-- Rollback de 20260923133424_silencio_contable_registrado_stock_movement.sql:
-- lo cubre 20260923133338_silencio_contable_registrado_rollback.sql, que quita
-- la marca /* registro-sin-regla */ de todas las funciones que la llevan,
-- incluida fn_auto_journal_stock_movement.
select 1;
