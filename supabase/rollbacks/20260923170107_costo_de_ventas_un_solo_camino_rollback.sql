-- Rollback de 20260923170107_costo_de_ventas_un_solo_camino.sql
--
-- Vuelve a habilitar trg_auto_journal_sale_item_cogs. OJO: sin regla
-- inventory/confirmed solo registra rechazos; si se siembra esa regla, el costo
-- de ventas se duplicaria con el del kardex (ADR-CC-010). Las columnas de
-- resolucion de journal_entry_failures se conservan (aditivas, son rastro).
alter table public.sale_items enable trigger trg_auto_journal_sale_item_cogs;
comment on function public.fn_auto_journal_sale_item_cogs() is null;
