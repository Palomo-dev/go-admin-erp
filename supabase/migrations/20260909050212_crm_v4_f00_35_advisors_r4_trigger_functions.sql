-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_35_advisors_r4_trigger_functions`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 b61282f68d49f0680c6b213242adc098). No reformatear.
-- F0 r4 · Tarea 4: advisors atribuibles a las migraciones 29-33.
--
-- (a) anon_security_definer_function_executable / authenticated_...: las tres
--     funciones de trigger SECURITY DEFINER que reescribí en esta ronda están
--     expuestas por PostgREST como /rest/v1/rpc/<nombre>. Son RETURNS trigger
--     (Postgres rechaza la llamada directa con 0A000), pero el GRANT sobra.
--     Revocarlo NO afecta a los triggers: PostgreSQL comprueba EXECUTE sobre la
--     función al CREAR el trigger, no al dispararlo.
-- (b) function_search_path_mutable en fn_opportunities_set_closed_at: es la
--     otra mitad del par que gobierna el cierre de oportunidades; se fija el
--     search_path sin cambiar una línea de su lógica.
REVOKE EXECUTE ON FUNCTION public.fn_update_customer_channel_identity()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_status_from_stage()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_create_commission_on_opportunity_won() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_journal_commission()              FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_opportunities_set_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('won','lost') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  ELSIF NEW.status NOT IN ('won','lost') THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_opportunities_set_closed_at() FROM PUBLIC, anon, authenticated;