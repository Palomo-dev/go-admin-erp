-- Reversion de F-29: Quitar conditions de las reglas sale/created
--
-- Reversa la migracion 20260910140000_f29_fix_conditions_null_sale_rules.sql
-- ADVERTENCIA: al revertir se reintroduce el bug de F-29 (ventas de contado
-- debitando 1305 Clientes en vez de 1105 Caja en las 20 organizaciones).

UPDATE accounting_rules
SET conditions = NULL
WHERE source_type='sale' AND event_type='created' AND is_active=true
  AND debit_account_code IN ('1305','1105') AND credit_account_code='4105'
  AND organization_id IN (120,125,126,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144);
