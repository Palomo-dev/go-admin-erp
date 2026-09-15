-- ============================================================
-- F11 · idempotencia de post-venta e inicio del cierre de mv_customer_health
-- ============================================================
-- Hallazgos del tester de F11 r1 (2026-09-15):
--   1. `scheduleRenewal` y `startOnboardingForWonOpportunity` son idempotentes
--      por lectura previa, pero dos llamadas concurrentes crean dos renovaciones
--      / dos instancias: no había índice único que lo impidiera. Hoy las tres
--      condiciones tienen 0 filas, así que los índices parciales son aditivos y
--      sin riesgo. El código debe tratar el 23505 como `already_existed`.
--   2. `mv_customer_health` (vista materializada, 31 205 filas, 15 organizaciones)
--      no puede tener RLS y tenía TODOS los privilegios para `anon` y
--      `authenticated`: cualquier petición anónima a PostgREST leía compras,
--      recencia y LTV de todos los tenants. Se retira `anon` ya; `authenticated`
--      se retira cuando la ronda 2 elimine los lectores de la aplicación
--      (`healthScoreService.getCustomerHealth`, `expansionService`), y después
--      se elimina la vista con `refresh_mv_customer_health()` (DoD de FASE-11).
-- ============================================================

-- Una renovación por oportunidad padre y organización.
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_one_renewal_per_parent
  ON public.opportunities (organization_id, parent_opportunity_id)
  WHERE deal_type = 'renewal' AND parent_opportunity_id IS NOT NULL;

-- Una oportunidad hija de onboarding por padre, organización y pipeline.
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_one_onboarding_child_per_parent
  ON public.opportunities (organization_id, parent_opportunity_id, pipeline_id)
  WHERE (metadata->>'type') = 'onboarding' AND parent_opportunity_id IS NOT NULL;

-- Una instancia de onboarding por oportunidad y organización.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_instances_org_opportunity
  ON public.onboarding_instances (organization_id, opportunity_id)
  WHERE opportunity_id IS NOT NULL;

-- Cierre a anon de la vista materializada sin RLS.
REVOKE ALL ON public.mv_customer_health FROM anon;
