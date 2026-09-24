-- ============================================================
-- Reversion de 20260924000500_aprovisionamiento_embudo_de_ventas_por_organizacion
-- ============================================================
-- La migracion es puramente aditiva: crea tres funciones nuevas y dos
-- disparadores nuevos. No modifica ninguna funcion ni disparador previo, asi
-- que revertirla devuelve el esquema al estado exacto anterior.
--
-- AVISO: esta reversion NO borra datos. Los embudos de ventas y sus etapas que
-- se hayan sembrado mientras los disparadores estuvieron vivos son datos de las
-- organizaciones y se conservan. Si se quisiera retirar alguno, se hace uno a
-- uno y a mano, con el dueño delante: borrar un `pipelines` arrastra sus
-- `stages` y sus `opportunities` por ON DELETE CASCADE.
--
-- Comprobacion de que no queda rastro en el esquema:
--   SELECT tgname FROM pg_trigger WHERE tgname IN
--     ('trg_seed_crm_pipeline_on_org','trg_seed_crm_pipeline_on_module');  -- 0 filas
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND proname IN
--     ('fn_crm_seed_pipeline_ventas','fn_seed_crm_pipeline_on_org','fn_seed_crm_pipeline_on_module');  -- 0 filas
-- ============================================================

DROP TRIGGER IF EXISTS trg_seed_crm_pipeline_on_module ON public.organization_modules;
DROP TRIGGER IF EXISTS trg_seed_crm_pipeline_on_org ON public.organizations;

DROP FUNCTION IF EXISTS public.fn_seed_crm_pipeline_on_module();
DROP FUNCTION IF EXISTS public.fn_seed_crm_pipeline_on_org();
DROP FUNCTION IF EXISTS public.fn_crm_seed_pipeline_ventas(integer);
