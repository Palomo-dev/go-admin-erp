-- org_vocabulario (vista materializada que usa palabras_de_catalogo para reconocer de qué
-- productos habla el cliente) quedó vacía en el proyecto restaurado: se refrescó antes de
-- cargar los productos y nunca más. El chat de atención (ai-auto-response) respondía
-- «no tengo productos» en todas las tiendas. La función decía «pensada para pg_cron» pero
-- ninguna migración lo programaba.
-- Ensayo (ENSAYO_OK): 37.333 palabras de 25 organizaciones; «polos», «camisetas» y «buzos»
-- reconocidas en org 338.
-- Rollback: supabase/rollbacks/20261104004829_vocabulario_catalogo_refresco_programado_rollback.sql
refresh materialized view public.org_vocabulario;

-- Igual a la definición de 20260909150000: CONCURRENTLY no bloquea lecturas (hay índice único).
create or replace function public.refrescar_org_vocabulario()
returns void
language sql
security definer
set search_path = public
as $fn$
  refresh materialized view concurrently public.org_vocabulario;
$fn$;

select cron.schedule('org-vocabulario-refresco', '17 * * * *', $$select public.refrescar_org_vocabulario()$$);
