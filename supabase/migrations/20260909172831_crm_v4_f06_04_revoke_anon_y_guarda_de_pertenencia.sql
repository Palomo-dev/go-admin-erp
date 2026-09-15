-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_04_revoke_anon_y_guarda_de_pertenencia`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 b4f22b8df24c368f5908879aab7c387d). No reformatear.
-- HALLAZGO CRÍTICO del tester de F6 (ronda 2), explotado en vivo con la clave
-- pública sin sesión: las tres funciones nuevas de F6 son SECURITY DEFINER (saltan
-- RLS) y quedaron con EXECUTE para `anon`. La más grave devuelve SETOF de la tabla
-- de llamadas, de modo que un tercero podía leer filas completas de otra
-- organización (cliente, oportunidad, registro de conversación) además de sabotear
-- la cola; otra permitía marcar como dados de baja a los clientes de cualquier
-- organización en los cuatro canales, rompiendo también correo y WhatsApp.
--
-- Matiz importante para el registro: esto NO lo introdujo la ronda de F6. Es el
-- privilegio por defecto del esquema público en este proyecto: 339 de las 360
-- funciones SECURITY DEFINER tienen `anon=X`. Lo que hizo F6 fue añadir tres
-- funciones peligrosas sin revocar, siguiendo el default. La limpieza general de
-- las otras 336 es un trabajo aparte y arriesgado, y queda documentado como tal.
--
-- Los tres únicos llamadores viven en el servidor y usan el cliente de servicio
-- (verificado por búsqueda en el código antes de revocar).
REVOKE EXECUTE ON FUNCTION public.fn_claim_voice_agent_calls(integer, uuid, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_log_consent_opt_out(integer, uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_stop_voice_campaign(integer, uuid, text) FROM anon;

-- Defensa en profundidad para las dos que escriben y siguen alcanzables por un
-- usuario con sesión: la organización deja de ser un parámetro en el que confiar.
-- Si hay sesión, se exige pertenencia activa; el cliente de servicio (sin auth.uid())
-- pasa igual que antes, que es como las invoca el servidor.
CREATE OR REPLACE FUNCTION public.fn_stop_voice_campaign(p_org integer, p_campaign uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
     WHERE m.organization_id = p_org
       AND m.user_id = (select auth.uid())
       AND m.is_active
  ) THEN
    RAISE EXCEPTION 'no pertenece a la organizacion %', p_org USING ERRCODE = '42501';
  END IF;

  UPDATE public.voice_agent_campaigns
     SET emergency_stop = true, status = 'paused',
         stopped_reason = p_reason, stopped_at = now(), updated_at = now()
   WHERE id = p_campaign AND organization_id = p_org;
  RETURN FOUND;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_stop_voice_campaign(integer, uuid, text) FROM anon;