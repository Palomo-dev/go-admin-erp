-- ROLLBACK de 20260915150000_f11_idempotencia_postventa_y_cerrar_mv_a_anon
-- Efecto: vuelven a poder duplicarse renovaciones e instancias de onboarding
-- por concurrencia, y `anon` recupera la lectura cross-tenant de
-- `mv_customer_health` (solo si de verdad hace falta; no se recomienda).
DROP INDEX IF EXISTS public.uq_opportunities_one_renewal_per_parent;
DROP INDEX IF EXISTS public.uq_opportunities_one_onboarding_child_per_parent;
DROP INDEX IF EXISTS public.uq_onboarding_instances_org_opportunity;
GRANT ALL ON public.mv_customer_health TO anon;
