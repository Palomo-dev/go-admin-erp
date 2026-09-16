-- F-02: Crear cuenta 5235 (Gastos por Comisiones) en orgs 137-144
-- 8 reglas commission/accrued activas apuntan a 5235 pero esa cuenta no existe
-- en el chart_of_accounts de esas organizaciones. journal_lines tiene FK
-- RESTRICT a chart_of_accounts, así que la regla hace fallar la transacción.
-- Solución: crear la cuenta (la usan 84 orgs más con la misma regla).

INSERT INTO chart_of_accounts (account_code, organization_id, name, type, is_active)
SELECT '5235', g.org_id, 'Gastos por Comisiones', 'expense', true
FROM (VALUES (137),(138),(139),(140),(141),(142),(143),(144)) AS g(org_id)
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa.organization_id = g.org_id AND coa.account_code = '5235'
);
