-- F-01: Desactivar trigger de contabilizacion automatica de CxC
--
-- Causa: trg_auto_journal_ar duplica el asiento contable de cada factura
-- de venta. fn_auto_journal_sale (sobre invoice_sales) ya contabiliza la
-- venta correctamente, incluyendo distincion contado/credito y sucursal.
-- fn_auto_journal_ar (sobre accounts_receivable) publica el mismo hecho
-- economico con la regla equivocada (no filtra is_credit) y sucursal
-- arbitraria (MIN(branches.id)).
--
-- La factura es la unica fuente de verdad contable. La CxC es el detalle
-- de cartera, no un segundo hecho economico.
--
-- Reversible: ALTER TABLE accounts_receivable ENABLE TRIGGER trg_auto_journal_ar;

ALTER TABLE accounts_receivable DISABLE TRIGGER trg_auto_journal_ar;
