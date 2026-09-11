-- Reversion de F-01: Reactivar trigger de contabilizacion automatica de CxC
--
-- Reversa la migracion 20260910120000_f01_disable_trg_auto_journal_ar.sql
-- ADVERTENCIA: al reactivar este trigger se reanuda la duplicacion contable
-- de cada factura de venta. Solo reactivar si se ha identificado un problema
-- que requiera volver al comportamiento anterior.

ALTER TABLE accounts_receivable ENABLE TRIGGER trg_auto_journal_ar;
