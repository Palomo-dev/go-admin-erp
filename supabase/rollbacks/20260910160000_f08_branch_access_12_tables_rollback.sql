-- Reversion de F-08: Quitar la politica branch_access_restrictive de las 12 tablas
--
-- ADVERTENCIA: al revertir se elimina el aislamiento por sucursal en las
-- 12 tablas. Un usuario limitado a la sucursal A vuelve a poder ver y
-- modificar facturas, pagos, asientos, cajas y cuentas bancarias de la
-- sucursal B.

DROP POLICY IF EXISTS branch_access_restrictive ON invoice_sales;
DROP POLICY IF EXISTS branch_access_restrictive ON invoice_purchase;
DROP POLICY IF EXISTS branch_access_restrictive ON payments;
DROP POLICY IF EXISTS branch_access_restrictive ON journal_entries;
DROP POLICY IF EXISTS branch_access_restrictive ON cash_sessions;
DROP POLICY IF EXISTS branch_access_restrictive ON bank_accounts;
DROP POLICY IF EXISTS branch_access_restrictive ON invoice_sequences;
DROP POLICY IF EXISTS branch_access_restrictive ON quotations;
DROP POLICY IF EXISTS branch_access_restrictive ON support_documents;
DROP POLICY IF EXISTS branch_access_restrictive ON commissions;
DROP POLICY IF EXISTS branch_access_restrictive ON payment_qr_sessions;
DROP POLICY IF EXISTS branch_access_restrictive ON branch_account_mappings;
