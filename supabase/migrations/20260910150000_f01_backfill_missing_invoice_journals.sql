-- F-01 BACKFILL: Crear asientos contables faltantes para 161 facturas
--
-- 161 facturas (orgs 2, 113, 115) tenian asiento de CxC (accounts_receivable)
-- pero no tenian asiento de factura (invoice_sales). El backfill crea el
-- asiento de factura correcto via fn_create_journal_entry.
--
-- Marca de lote: memo = 'BACKFILL-F01-20260911 factura <number>'
-- Idempotente: verifica que no exista asiento source='invoice_sales' con ese source_id
-- Transaccion por lote (DO $$), no 161 transacciones sueltas
-- entry_date = issue_date de la factura (no created_at ni now())
-- Pasa por fn_create_journal_entry, no INSERT directo a journal_entries
--
-- Excluye:
--   - total <= 0 (fn_create_journal_entry rechaza monto <= 0)
--   - document_type != 'invoice' (fn_auto_journal_sale ignora credit_notes)
--   - org 120 (F-29: reglas sin conditions, pendiente de correccion)
--
-- NOTA: Este backfill aumenta los duplicados de 1.232 a 1.393 (+161) porque
-- las 161 facturas ya tenian asiento de CxC. Los contraasientos del Paso 3
-- revertiran los asientos de CxC, dejando solo los asientos de factura.
--
-- Reversible: ver supabase/rollbacks/20260910150000_f01_backfill_missing_invoice_journals_rollback.sql

DO $$
DECLARE
  r RECORD;
  v_entry_id integer;
  v_debit text;
  v_credit text;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT i.id, i.organization_id, i.number, i.payment_method, i.issue_date, i.total, i.branch_id
    FROM invoice_sales i
    WHERE i.status <> 'draft'
      AND i.total > 0
      AND i.document_type = 'invoice'
      AND i.organization_id NOT IN (120)
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.source = 'invoice_sales' AND je.source_id = i.id::text
      )
    ORDER BY i.organization_id, i.issue_date
  LOOP
    -- Resolver regla contable (misma logica que fn_auto_journal_sale)
    SELECT r2.debit_account_code INTO v_debit
    FROM accounting_rules r2
    WHERE r2.organization_id = r.organization_id
      AND r2.source_type = 'sale' AND r2.event_type = 'created' AND r2.is_active = true
      AND (r2.conditions->>'is_credit')::boolean = (r.payment_method = 'credit')
    ORDER BY r2.priority LIMIT 1;

    -- Fallback si no hay regla con conditions
    IF v_debit IS NULL THEN
      SELECT r2.debit_account_code INTO v_debit
      FROM accounting_rules r2
      WHERE r2.organization_id = r.organization_id
        AND r2.source_type = 'sale' AND r2.event_type = 'created' AND r2.is_active = true
      ORDER BY r2.priority LIMIT 1;
    END IF;

    SELECT r2.credit_account_code INTO v_credit
    FROM accounting_rules r2
    WHERE r2.organization_id = r.organization_id
      AND r2.source_type = 'sale' AND r2.event_type = 'created' AND r2.is_active = true
      AND (r2.conditions->>'is_credit')::boolean = (r.payment_method = 'credit')
    ORDER BY r2.priority LIMIT 1;

    IF v_credit IS NULL THEN
      SELECT r2.credit_account_code INTO v_credit
      FROM accounting_rules r2
      WHERE r2.organization_id = r.organization_id
        AND r2.source_type = 'sale' AND r2.event_type = 'created' AND r2.is_active = true
      ORDER BY r2.priority LIMIT 1;
    END IF;

    -- Crear asiento via fn_create_journal_entry
    v_entry_id := fn_create_journal_entry(
      p_organization_id := r.organization_id,
      p_branch_id := r.branch_id,
      p_entry_date := COALESCE(r.issue_date, now()),
      p_memo := 'BACKFILL-F01-20260911 factura ' || COALESCE(r.number, r.id::text),
      p_source := 'invoice_sales',
      p_source_id := r.id::text,
      p_debit_account := v_debit,
      p_credit_account := v_credit,
      p_amount := r.total
    );

    IF v_entry_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'BACKFILL-F01-20260911: % asientos creados', v_count;
END $$;
