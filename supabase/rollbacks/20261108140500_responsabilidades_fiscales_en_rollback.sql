-- Reversión de supabase/migrations/20261108140500_responsabilidades_fiscales_en.sql (H2).
-- La función es de solo lectura: no hay datos que restaurar. El servidor (src/lib/finanzas/tributario/
-- responsabilidadesVigentes.server.ts) cae solo a organizations.fiscal_responsibilities si la función no existe.

drop function if exists public.fn_responsabilidades_fiscales_en(integer, date);
