-- Rollback F-02: eliminar cuenta 5235 de orgs 137-144
-- Solo si no hay journal_lines que la referencien.

DELETE FROM chart_of_accounts
WHERE account_code = '5235'
  AND organization_id IN (137,138,139,140,141,142,143,144);
