-- F-29: Poner conditions en reglas sale/created con conditions=null
--
-- 20 organizaciones (120-144) tienen 2 reglas sale/created sin conditions.
-- El filtro (conditions->>'is_credit')::boolean no matchea NULL, y el fallback
-- selecciona priority=10 (1305 Clientes) para ventas de contado.
-- Resultado: 109 facturas de contado debitando Clientes en vez de Caja.
--
-- Fix: poner {"is_credit": true} en la regla que debita 1305 (priority 10)
-- y {"is_credit": false} en la que debita 1105 (priority 11).
--
-- Cambio estrictamente no-peor: si acertamos, las ventas de contado pasan a
-- debitar 1105. Si nos equivocamos, siguen debitando 1305 (como hoy).
-- Reversible: ver supabase/rollbacks/20260910140000_f29_fix_conditions_null_sale_rules_rollback.sql
--
-- Excluye org 1 (plan de cuentas de 6 digitos, 1 sola regla, sin facturas).

UPDATE accounting_rules
SET conditions = '{"is_credit": true}'::jsonb
WHERE source_type='sale' AND event_type='created' AND is_active=true
  AND conditions IS NULL
  AND debit_account_code='1305' AND credit_account_code='4105'
  AND organization_id IN (120,125,126,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144);

UPDATE accounting_rules
SET conditions = '{"is_credit": false}'::jsonb
WHERE source_type='sale' AND event_type='created' AND is_active=true
  AND conditions IS NULL
  AND debit_account_code='1105' AND credit_account_code='4105'
  AND organization_id IN (120,125,126,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144);
