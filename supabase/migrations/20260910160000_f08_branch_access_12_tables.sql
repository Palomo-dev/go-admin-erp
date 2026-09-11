-- F-08: Aplicar politica branch_access_restrictive a 12 tablas faltantes
--
-- 7 tablas ya tenian la politica: accounts_receivable, accounts_payable,
-- bank_transactions, bank_transfers, cash_movements, cash_counts, credit_notes.
--
-- 12 tablas con branch_id que faltaban:
-- invoice_sales, invoice_purchase, payments, journal_entries, cash_sessions,
-- bank_accounts, invoice_sequences, quotations, support_documents,
-- commissions, payment_qr_sessions, branch_account_mappings.
--
-- Patron identico al existente: AS RESTRICTIVE FOR ALL TO authenticated
-- USING (app_branch_access(branch_id)) WITH CHECK (app_branch_access(branch_id))
--
-- Registros con branch_id NULL: 7 total (6 payments + 1 commission).
-- app_branch_access(NULL) devuelve true -> visibles para todos. Correcto.

DROP POLICY IF EXISTS branch_access_restrictive ON invoice_sales;
CREATE POLICY branch_access_restrictive ON invoice_sales
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON invoice_purchase;
CREATE POLICY branch_access_restrictive ON invoice_purchase
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON payments;
CREATE POLICY branch_access_restrictive ON payments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON journal_entries;
CREATE POLICY branch_access_restrictive ON journal_entries
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON cash_sessions;
CREATE POLICY branch_access_restrictive ON cash_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON bank_accounts;
CREATE POLICY branch_access_restrictive ON bank_accounts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON invoice_sequences;
CREATE POLICY branch_access_restrictive ON invoice_sequences
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON quotations;
CREATE POLICY branch_access_restrictive ON quotations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON support_documents;
CREATE POLICY branch_access_restrictive ON support_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON commissions;
CREATE POLICY branch_access_restrictive ON commissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON payment_qr_sessions;
CREATE POLICY branch_access_restrictive ON payment_qr_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));

DROP POLICY IF EXISTS branch_access_restrictive ON branch_account_mappings;
CREATE POLICY branch_access_restrictive ON branch_account_mappings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_branch_access(branch_id))
  WITH CHECK (app_branch_access(branch_id));
