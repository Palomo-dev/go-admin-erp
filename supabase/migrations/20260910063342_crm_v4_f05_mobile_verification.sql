-- Aplicada el 2026-09-10 vía MCP (apply_migration) como `crm_v4_f05_mobile_verification`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 1ce51ba306473b554768cb6bff4fb4f5). No reformatear.
-- FASE-05 §3.1 — rate limit del OTP del celular y unicidad del celular verificado.
CREATE TABLE IF NOT EXISTS public.mobile_verification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('send','check')),
  success boolean NOT NULL DEFAULT false,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mva_user_recent ON public.mobile_verification_attempts (user_id, created_at DESC);
ALTER TABLE public.mobile_verification_attempts ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: solo service role escribe/lee (PII de intentos).
REVOKE ALL ON TABLE public.mobile_verification_attempts FROM PUBLIC, anon, authenticated;

-- Límite: 3 envíos y 6 comprobaciones por usuario y hora.
CREATE OR REPLACE FUNCTION public.fn_mobile_otp_allowed(p_user_id uuid, p_kind text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_count integer;
BEGIN
  -- Guarda de pertenencia: con sesión, un usuario solo consulta su propio
  -- límite; el rol anónimo no llega aquí (REVOKE de abajo) pero se comprueba
  -- igual porque la guarda por sí sola no basta (auth.uid() es NULL en anon).
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN false;
  END IF;
  IF p_kind NOT IN ('send','check') THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO v_count
    FROM public.mobile_verification_attempts
   WHERE user_id = p_user_id AND kind = p_kind AND created_at > now() - interval '1 hour';
  RETURN v_count < CASE p_kind WHEN 'send' THEN 3 ELSE 6 END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_mobile_otp_allowed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mobile_otp_allowed(uuid, text) TO authenticated, service_role;

-- Un celular verificado no puede pertenecer a dos usuarios de la misma org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ucp_org_verified_mobile
  ON public.user_comm_preferences (organization_id, mobile_phone_e164)
  WHERE mobile_verified_at IS NOT NULL;