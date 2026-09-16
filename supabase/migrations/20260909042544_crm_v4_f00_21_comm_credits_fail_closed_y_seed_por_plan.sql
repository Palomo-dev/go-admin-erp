-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_21_comm_credits_fail_closed_y_seed_por_plan`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 37e03a5b5a3b5819c29148b6b3721a22). No reformatear.
-- P13 (F3): cerrar el "ilimitado por ausencia de datos" en créditos de comunicación.
--
-- Situación medida (2026-09-08):
--   * NO existe ninguna tabla `comm_credits`; el saldo vive en comm_settings
--     (sms_remaining / whatsapp_remaining / voice_minutes_remaining).
--   * comm_settings: 31 filas, todas activas y SIN NULLs (sms/wa 50..1000, voz 0..200).
--   * organizations: 83 -> 52 organizaciones NO tienen fila en comm_settings.
--   * deduct_comm_credits hacía `EXECUTE ... INTO v_remaining` y, al no encontrar
--     fila, v_remaining quedaba NULL, que la función interpreta como "ilimitado"
--     -> RETURN TRUE. Es decir: 52 orgs podían enviar SMS/WhatsApp y consumir
--     minutos de voz SIN NINGÚN control (org 2 ya tiene 11 comm_usage_logs así).
--   * telephonySettingsService.ts:81 inserta comm_settings sin las columnas de
--     saldo -> otra vía de entrada al mismo agujero (NULL = ilimitado).
--
-- Decisión (3 piezas, todas aditivas):
--   1. DEFAULT 0 en las tres columnas de saldo: cualquier INSERT que las omita
--      (p. ej. telephonySettingsService) deja 0, no NULL. NULL sigue siendo
--      "ilimitado", pero ahora solo si un administrador lo pone a propósito.
--   2. Sembrar las 52 orgs que faltan con el cupo de SU PLAN
--      (plans.comm_sms_monthly / comm_whatsapp_monthly / comm_voice_minutes_monthly,
--      COALESCE a 0 cuando el plan no lo define). Es exactamente el patrón que ya
--      siguen las 31 filas existentes (1000/1000/200 = ultimate, 200/200/30 =
--      business, 50/50/0 = pro), así que ninguna org queda mejor ni peor que las
--      de su mismo plan y ninguna integración viva se corta de golpe
--      (org 2 = business -> 200/200/30). Se elige el cupo del plan y no "0 para
--      todas" porque 0 dejaría sin comunicaciones a orgs de pago sin aviso, y no
--      "cortesía fija" porque el dato del plan ya existe y es el criterio del negocio.
--      No se toca ninguna de las 31 filas existentes.
--   3. deduct_comm_credits fail-closed: sin fila activa -> FALSE. Además FOR UPDATE
--      real (antes había race entre el SELECT y el UPDATE), search_path fijado
--      (era mutable en una SECURITY DEFINER con EXECUTE dinámico), canal validado
--      y p_amount negativo neutralizado (no se pueden "regalar" créditos).
--   4. Trigger AFTER INSERT ON organizations para que las orgs nuevas nazcan con
--      su cupo (mismo estilo que trg_seed_provider_configs_on_org, no bloqueante).

-- 1) Defaults
ALTER TABLE public.comm_settings ALTER COLUMN sms_remaining            SET DEFAULT 0;
ALTER TABLE public.comm_settings ALTER COLUMN whatsapp_remaining       SET DEFAULT 0;
ALTER TABLE public.comm_settings ALTER COLUMN voice_minutes_remaining  SET DEFAULT 0;

COMMENT ON COLUMN public.comm_settings.sms_remaining           IS 'Saldo de SMS. 0 = sin saldo (bloquea). NULL = ilimitado, solo si se pone a propósito.';
COMMENT ON COLUMN public.comm_settings.whatsapp_remaining      IS 'Saldo de mensajes WhatsApp. 0 = sin saldo (bloquea). NULL = ilimitado, solo si se pone a propósito.';
COMMENT ON COLUMN public.comm_settings.voice_minutes_remaining IS 'Minutos de voz. 0 = sin saldo (bloquea). NULL = ilimitado, solo si se pone a propósito.';

-- 2) Sembradora por plan
CREATE OR REPLACE FUNCTION public.fn_seed_comm_settings(p_org integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n integer := 0;
BEGIN
  INSERT INTO public.comm_settings (
    organization_id, sms_remaining, whatsapp_remaining, voice_minutes_remaining,
    is_active, credits_reset_at
  )
  SELECT o.id,
         COALESCE(pl.comm_sms_monthly, 0),
         COALESCE(pl.comm_whatsapp_monthly, 0),
         COALESCE(pl.comm_voice_minutes_monthly, 0),
         true,
         date_trunc('month', now()) + interval '1 month'
    FROM public.organizations o
    LEFT JOIN public.plans pl ON pl.id = o.plan_id
   WHERE o.id = p_org
  ON CONFLICT (organization_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

COMMENT ON FUNCTION public.fn_seed_comm_settings(integer) IS
  'Crea comm_settings para una org con el cupo de su plan (0 si el plan no lo define). No pisa filas existentes.';

REVOKE ALL ON FUNCTION public.fn_seed_comm_settings(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_seed_comm_settings(integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_seed_comm_settings(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seed_comm_settings(integer) TO service_role;

-- Backfill de las organizaciones sin fila
INSERT INTO public.comm_settings (
  organization_id, sms_remaining, whatsapp_remaining, voice_minutes_remaining,
  is_active, credits_reset_at
)
SELECT o.id,
       COALESCE(pl.comm_sms_monthly, 0),
       COALESCE(pl.comm_whatsapp_monthly, 0),
       COALESCE(pl.comm_voice_minutes_monthly, 0),
       true,
       date_trunc('month', now()) + interval '1 month'
  FROM public.organizations o
  LEFT JOIN public.plans pl ON pl.id = o.plan_id
  LEFT JOIN public.comm_settings cs ON cs.organization_id = o.id
 WHERE cs.id IS NULL
ON CONFLICT (organization_id) DO NOTHING;

-- 3) deduct_comm_credits fail-closed (misma firma y misma ACL: CREATE OR REPLACE la conserva)
CREATE OR REPLACE FUNCTION public.deduct_comm_credits(p_org_id integer, p_channel text, p_amount integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id        uuid;
  v_sms       integer;
  v_wa        integer;
  v_voice     integer;
  v_remaining integer;
  v_amount    integer := GREATEST(COALESCE(p_amount, 1), 0);
BEGIN
  IF p_org_id IS NULL OR p_channel IS NULL
     OR p_channel NOT IN ('sms', 'whatsapp', 'voice') THEN
    RETURN false; -- canal desconocido: fail-closed
  END IF;

  SELECT id, sms_remaining, whatsapp_remaining, voice_minutes_remaining
    INTO v_id, v_sms, v_wa, v_voice
    FROM public.comm_settings
   WHERE organization_id = p_org_id
     AND is_active = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false; -- sin configuración activa NO se envía (antes: "ilimitado")
  END IF;

  v_remaining := CASE p_channel
                   WHEN 'sms'      THEN v_sms
                   WHEN 'whatsapp' THEN v_wa
                   ELSE                 v_voice
                 END;

  IF v_remaining IS NULL THEN
    RETURN true; -- ilimitado explícito (Enterprise)
  END IF;

  IF v_remaining < v_amount THEN
    RETURN false;
  END IF;

  UPDATE public.comm_settings
     SET sms_remaining           = CASE WHEN p_channel = 'sms'      THEN sms_remaining - v_amount           ELSE sms_remaining           END,
         whatsapp_remaining      = CASE WHEN p_channel = 'whatsapp' THEN whatsapp_remaining - v_amount      ELSE whatsapp_remaining      END,
         voice_minutes_remaining = CASE WHEN p_channel = 'voice'    THEN voice_minutes_remaining - v_amount ELSE voice_minutes_remaining END,
         updated_at = now()
   WHERE id = v_id;

  RETURN true;
END $function$;

COMMENT ON FUNCTION public.deduct_comm_credits(integer, text, integer) IS
  'Debita saldo de comunicaciones de forma atómica (FOR UPDATE). Fail-closed: sin fila activa en comm_settings o canal desconocido -> false. NULL en la columna = ilimitado explícito. p_amount negativo se trata como 0.';

-- 4) Alta automática para organizaciones nuevas
CREATE OR REPLACE FUNCTION public.fn_seed_comm_settings_on_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.fn_seed_comm_settings(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_seed_comm_settings_on_org(%) falló: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.fn_seed_comm_settings_on_org() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_seed_comm_settings_on_org() FROM anon;
REVOKE ALL ON FUNCTION public.fn_seed_comm_settings_on_org() FROM authenticated;

DROP TRIGGER IF EXISTS trg_seed_comm_settings_on_org ON public.organizations;
CREATE TRIGGER trg_seed_comm_settings_on_org
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.fn_seed_comm_settings_on_org();
