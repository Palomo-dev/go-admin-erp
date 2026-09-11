-- Reversion de F-01 BACKFILL: Borra los 161 asientos creados por el backfill
--
-- Reversa la migracion 20260910150000_f01_backfill_missing_invoice_journals.sql
-- Busca por la marca de lote 'BACKFILL-F01-20260911' en el memo.
--
-- EXCEPCION A "no borrar asientos": aplica porque son asientos que este script
-- creo y que aun no ha visto nadie. No se borran asientos preexistentes.
--
-- Borra en cascada: journal_lines primero, luego journal_entries.

DELETE FROM journal_lines
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries
  WHERE memo LIKE 'BACKFILL-F01-20260911%'
);

DELETE FROM journal_entries
WHERE memo LIKE 'BACKFILL-F01-20260911%';
