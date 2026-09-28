-- Rollback de 20260923000000_journal_entries_fact_key.sql
-- Retira el índice y la columna. La idempotencia vuelve a depender de
-- (source, source_id), con el doble asiento que eso implica.
drop index if exists public.uq_journal_entries_fact_key;
alter table public.journal_entries drop column if exists fact_key;
