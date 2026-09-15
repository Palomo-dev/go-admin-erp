-- ============================================================
-- F11 · eliminar mv_customer_health y su función de refresco
-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR. La deja el constructor de F11 r2 para que la
-- aplique el orquestador por el MCP (`apply_migration`) cuando confirme que en
-- producción no queda ningún lector; el constructor NO la ha ejecutado.
--
-- Por qué (DoD de FASE-11 + tester r1, 2026-09-15):
--   - Vista materializada sin RLS (31 205 filas, 15 organizaciones) con
--     privilegios para `authenticated` (`anon` ya retirado el 2026-09-15 por
--     `20260915150000_f11_idempotencia_postventa_y_cerrar_mv_a_anon.sql`):
--     cualquier sesión leía compras 90 d, recencia, LTV y ticket de TODOS los
--     tenants con un GET a PostgREST. RLS no puede aplicarse a una MV.
--   - Además era un segundo origen de «salud» distinto de `fn_customer_health`
--     + `health_score_configs`, la causa de los «tres scores por cliente».
--   - `refresh_mv_customer_health()` es SECURITY DEFINER con EXECUTE para
--     `public`/`anon`/`authenticated`: cualquiera podía lanzar un REFRESH
--     CONCURRENTLY de 31 k filas contra la BD.
--
-- Verificado por MCP antes de escribir (2026-09-15):
--   - `pg_depend`: 0 vistas/reglas dependientes de la MV.
--   - `cron.job`: ningún comando la refresca.
--   - `pg_proc`: solo `refresh_mv_customer_health()` la referencia; nadie
--     llama a esa función desde otra función ni desde código de los 4 repos
--     (erp, sellers, super, websites) ni desde `supabase/functions`.
--   - Lectores en la aplicación: 0 tras F11 r2 (`healthScoreService` y
--     `expansionService` ya van por `fn_customer_health`).
--   - Índices: `idx_mvh_customer (organization_id, customer_id)` y
--     `mv_customer_health_customer_id_idx (customer_id)`; caen con la vista.
-- ============================================================

-- Primero la función (por claridad; la MV no depende de ella, pero así no
-- queda una función que falle con «relation does not exist»).
DROP FUNCTION IF EXISTS public.refresh_mv_customer_health();

-- Después la vista materializada (arrastra sus dos índices).
DROP MATERIALIZED VIEW IF EXISTS public.mv_customer_health;
