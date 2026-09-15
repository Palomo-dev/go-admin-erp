-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_05_consent_membership_y_libro_inmutable`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 25ccdb2471d7a5e2bf00b7ce363a4b47). No reformatear.
-- Dos hallazgos ALTOS del tester de F6 (ronda 3), ambos explotados en vivo.
--
-- R3-1. `fn_log_consent_opt_out` es SECURITY DEFINER y no comprueba la pertenencia
-- del llamante, así que un miembro de una organización podía marcar como dado de
-- baja a un cliente de OTRA, en los cuatro canales a la vez, rompiendo también
-- correo y WhatsApp. Es el mismo fallo que ya se cerró en la función que detiene
-- campañas: la guarda se pidió para las dos funciones que escriben y solo se
-- aplicó a una. Se corrige aquí el gemelo que faltaba.
--
-- R3-2. El "libro de intentos" es el que sostiene el tope de marcación, y estaba
-- declarado inmutable pero cualquier miembro autenticado podía borrar sus filas
-- (política de DELETE + permisos de tabla). Borrando tres filas el tope volvía a
-- cero, de modo que el freno de marcación se podía desactivar desde el cliente.
-- El libro solo lo escribe la función de reclamo, que corre con el rol de
-- servicio: se le quitan a `authenticated` la escritura y el borrado, y se le
-- conserva la lectura para que la interfaz pueda mostrar los intentos.

CREATE OR REPLACE FUNCTION public.fn_log_consent_opt_out(
  p_org integer, p_customer uuid, p_channel text,
  p_source text DEFAULT 'ai_voice_agent'::text, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_flag text;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN
    RAISE EXCEPTION 'canal invalido: %', p_channel USING ERRCODE = '22023';
  END IF;

  -- R3-1: con sesión, la organización deja de ser un parámetro en el que confiar.
  -- El rol de servicio (sin auth.uid()) pasa igual, que es como la invoca el agente.
  IF (select auth.uid()) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
     WHERE om.organization_id = p_org
       AND om.user_id = (select auth.uid())
       AND om.is_active
  ) THEN
    RAISE EXCEPTION 'no pertenece a la organizacion %', p_org USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer AND organization_id = p_org) THEN
    RETURN false;
  END IF;

  INSERT INTO public.contact_consents (organization_id, customer_id, channel, status, source, evidence, changed_at)
  VALUES (p_org, p_customer, p_channel, 'opted_out', p_source, COALESCE(p_evidence, '{}'::jsonb), now())
  ON CONFLICT (organization_id, customer_id, channel)
  DO UPDATE SET status = 'opted_out', source = EXCLUDED.source,
                evidence = EXCLUDED.evidence, changed_at = now();

  v_flag := CASE p_channel
              WHEN 'email' THEN 'do_not_email'
              WHEN 'whatsapp' THEN 'do_not_whatsapp'
              WHEN 'sms' THEN 'do_not_sms'
              WHEN 'voice' THEN 'do_not_call' END;

  UPDATE public.customers
     SET metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(v_flag, true, p_channel || '_optout_at', now()),
         do_not_call = CASE WHEN p_channel = 'voice' THEN true ELSE do_not_call END
   WHERE id = p_customer AND organization_id = p_org;

  RETURN true;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_log_consent_opt_out(integer, uuid, text, text, jsonb) FROM anon;

-- R3-2: el libro vuelve a ser de verdad inmutable para el cliente.
DROP POLICY IF EXISTS voice_agent_call_attempts_delete ON public.voice_agent_call_attempts;
DROP POLICY IF EXISTS voice_agent_call_attempts_update ON public.voice_agent_call_attempts;
DROP POLICY IF EXISTS voice_agent_call_attempts_insert ON public.voice_agent_call_attempts;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.voice_agent_call_attempts FROM anon, authenticated;