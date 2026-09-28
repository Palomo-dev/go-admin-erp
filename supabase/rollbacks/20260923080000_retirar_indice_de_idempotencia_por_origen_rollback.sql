-- Rollback de 20260923080000_retirar_indice_de_idempotencia_por_origen.sql
--
-- Vuelve a crear el índice único por origen. Aviso: si después de retirarlo se
-- escribieron dos asientos con el mismo `(source, source_id)` —posible, porque
-- el índice ya no lo impedía—, la creación falla. En ese caso hay que decidir
-- cuál de los dos se conserva antes de volver atrás.

create unique index if not exists idx_journal_entries_unique_source
  on public.journal_entries (source, source_id)
  where source is not null and source_id is not null;

drop index if exists public.idx_journal_entries_source;
