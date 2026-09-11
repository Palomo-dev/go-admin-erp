-- scripts/detectar-asientos-divergentes.sql
--
-- F-32: Detecta facturas cuyo asiento contable no coincide con el total.
--
-- Causa: trg_auto_journal_sale dispara en AFTER INSERT con el total que
-- mandó el cliente. Luego trg_recalc_invoice_totals corrige el total al
-- insertar los items. El asiento nunca se entera.
--
-- Uso: ejecutar por MCP (execute_sql) antes del cierre de mes.
-- Si devuelve filas, hay facturas con asientos incorrectos que requieren
-- ajuste manual antes de cerrar el período.
--
-- No corrige nada. Solo detecta.

WITH asiento_factura AS (
  SELECT
    je.source_id AS invoice_id_text,
    sum(jl.debit) AS debito_asiento,
    min(je.created_at) AS asiento_created
  FROM journal_entries je
  JOIN journal_lines jl ON jl.journal_entry_id = je.id
  WHERE je.source = 'invoice_sales' AND jl.debit > 0
  GROUP BY je.source_id
)
SELECT
  i.organization_id,
  i.number,
  i.id AS invoice_id,
  i.total,
  a.debito_asiento,
  i.total - a.debito_asiento AS divergencia,
  CASE
    WHEN a.debito_asiento > i.total THEN 'asiento_mayor'
    ELSE 'asiento_menor'
  END AS tipo_divergencia,
  i.created_at AS factura_created,
  i.updated_at AS factura_updated,
  a.asiento_created,
  i.updated_at - a.asiento_created AS lag,
  i.status,
  i.payment_method
FROM invoice_sales i
JOIN asiento_factura a ON a.invoice_id_text = i.id::text
WHERE i.status <> 'draft'
  AND COALESCE(i.document_type, 'invoice') <> 'credit_note'
  AND i.total > 0
  AND abs(i.total - a.debito_asiento) > 0.01
ORDER BY abs(i.total - a.debito_asiento) DESC;
