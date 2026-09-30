-- Script de análisis SQL para identificar organizaciones con módulos fuera de su plan
-- (GO-156)
--
-- SOLO LECTURA: no modifica datos.
--
-- Ejecutar en el dashboard de Supabase o con psql.

WITH plan_modules AS (
  -- Extraer módulos permitidos por cada plan
  SELECT
    p.id AS plan_id,
    p.code AS plan_code,
    p.name AS plan_name,
    COALESCE(
      (p.module_config->>'core_modules')::jsonb,
      '[]'::jsonb
    ) || COALESCE(
      (p.module_config->>'available_modules')::jsonb,
      '[]'::jsonb
    ) AS allowed_modules
  FROM plans p
  WHERE p.is_active = true
),
active_org_modules AS (
  -- Módulos activos por organización
  SELECT
    om.organization_id,
    om.module_code,
    m.is_core
  FROM organization_modules om
  INNER JOIN modules m ON m.code = om.module_code
  WHERE om.is_active = true
),
org_subscriptions AS (
  -- Suscripciones activas con su plan
  SELECT DISTINCT ON (s.organization_id)
    s.organization_id,
    s.plan_id,
    s.status,
    pm.plan_code,
    pm.plan_name,
    pm.allowed_modules
  FROM subscriptions s
  INNER JOIN plan_modules pm ON pm.plan_id = s.plan_id
  WHERE s.status = 'active'
  ORDER BY s.organization_id, s.started_at DESC
)

-- Identificar violaciones: módulos activos que NO están en el plan
SELECT
  os.organization_id,
  os.plan_code,
  os.plan_name,
  os.status AS subscription_status,
  array_agg(aom.module_code ORDER BY aom.module_code) AS unauthorized_modules,
  count(*) AS violation_count
FROM org_subscriptions os
INNER JOIN active_org_modules aom
  ON aom.organization_id = os.organization_id
  AND aom.is_core = false  -- Solo módulos pagados
WHERE NOT (os.allowed_modules ? aom.module_code)
GROUP BY os.organization_id, os.plan_code, os.plan_name, os.status
ORDER BY violation_count DESC, os.organization_id;

-- Resumen por módulo
WITH plan_modules AS (
  SELECT
    p.id AS plan_id,
    p.code AS plan_code,
    COALESCE(
      (p.module_config->>'core_modules')::jsonb,
      '[]'::jsonb
    ) || COALESCE(
      (p.module_config->>'available_modules')::jsonb,
      '[]'::jsonb
    ) AS allowed_modules
  FROM plans p
  WHERE p.is_active = true
),
active_org_modules AS (
  SELECT
    om.organization_id,
    om.module_code,
    m.is_core
  FROM organization_modules om
  INNER JOIN modules m ON m.code = om.module_code
  WHERE om.is_active = true
),
org_subscriptions AS (
  SELECT DISTINCT ON (s.organization_id)
    s.organization_id,
    s.plan_id,
    pm.plan_code,
    pm.allowed_modules
  FROM subscriptions s
  INNER JOIN plan_modules pm ON pm.plan_id = s.plan_id
  WHERE s.status = 'active'
  ORDER BY s.organization_id, s.started_at DESC
)

SELECT
  aom.module_code,
  count(DISTINCT os.organization_id) AS org_count,
  array_agg(DISTINCT os.plan_code ORDER BY os.plan_code) AS found_in_plans
FROM org_subscriptions os
INNER JOIN active_org_modules aom
  ON aom.organization_id = os.organization_id
  AND aom.is_core = false
WHERE NOT (os.allowed_modules ? aom.module_code)
GROUP BY aom.module_code
ORDER BY org_count DESC;
