-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_22_deduct_comm_credits_reembolso_acotado`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 da2ebe84260fe6be06357e9c9b55f7a1). No reformatear.
-- Corrección de crm_v4_f00_21 (P13).
-- `src/lib/services/crm/whatsapp/campaignService.ts:111` devuelve los créditos
-- reservados y no usados de una campaña llamando a
--   deduct_comm_credits(org, 'whatsapp', -n)
-- La versión de la migración 21 neutralizaba los importes negativos
-- (GREATEST(...,0)), lo que habría hecho desaparecer ese reembolso y cobrado de
-- más al cliente. Se restaura el reembolso, pero ACOTADO al cupo del plan:
--   * p_amount > 0  -> débito (fail-closed igual que en la 21).
--   * p_amount < 0  -> abono, con techo = plans.comm_<canal>_monthly.
--                      Si el plan no define cupo (NULL / org sin plan) se abona
--                      íntegro, como hasta ahora. Nunca reduce un saldo que ya
--                      esté por encima del cupo.
--   * p_amount = 0  -> no-op.
-- Esto además acota (no elimina) el agujero conocido: `deduct_comm_credits`
-- tiene EXECUTE para anon/authenticated, así que cualquier usuario podía
-- inflar el saldo de cualquier org con un importe negativo arbitrario.
-- La revocación completa exige antes tocar TS (ver informe DB-0-r3 §Necesito).

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
  v_amount    integer := COALESCE(p_amount, 1);
  v_cap       integer;
  v_new       integer;
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
    RETURN true; -- ilimitado explícito (Enterprise): ni se debita ni se abona
  END IF;

  IF v_amount = 0 THEN
    RETURN true;
  END IF;

  IF v_amount > 0 THEN
    IF v_remaining < v_amount THEN
      RETURN false;
    END IF;
    v_new := v_remaining - v_amount;
  ELSE
    -- Reembolso acotado al cupo del plan
    SELECT CASE p_channel
             WHEN 'sms'      THEN pl.comm_sms_monthly
             WHEN 'whatsapp' THEN pl.comm_whatsapp_monthly
             ELSE                 pl.comm_voice_minutes_monthly
           END
      INTO v_cap
      FROM public.organizations o
      JOIN public.plans pl ON pl.id = o.plan_id
     WHERE o.id = p_org_id;

    v_new := v_remaining + (-v_amount);
    IF v_cap IS NOT NULL THEN
      v_new := LEAST(v_new, GREATEST(v_cap, v_remaining));
    END IF;
  END IF;

  UPDATE public.comm_settings
     SET sms_remaining           = CASE WHEN p_channel = 'sms'      THEN v_new ELSE sms_remaining           END,
         whatsapp_remaining      = CASE WHEN p_channel = 'whatsapp' THEN v_new ELSE whatsapp_remaining      END,
         voice_minutes_remaining = CASE WHEN p_channel = 'voice'    THEN v_new ELSE voice_minutes_remaining END,
         updated_at = now()
   WHERE id = v_id;

  RETURN true;
END $function$;

COMMENT ON FUNCTION public.deduct_comm_credits(integer, text, integer) IS
  'Debita (p_amount>0) o reembolsa (p_amount<0) saldo de comunicaciones de forma atómica (FOR UPDATE). Fail-closed: sin fila activa en comm_settings o canal desconocido -> false. NULL en la columna = ilimitado explícito. El reembolso nunca supera plans.comm_<canal>_monthly cuando la org tiene plan.';
