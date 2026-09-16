-- ============================================================
-- ROLLBACK de 20260909042657_crm_v4_f00_22_deduct_comm_credits_reembolso_acotado
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Restaura deduct_comm_credits a la versión de f00_21 (importes negativos neutralizados, sin reembolso).
--
-- SOBRE LOS DATOS: no toca datos. OJO: el reembolso de campañas WhatsApp (campaignService.ts:111) vuelve a ser un no-op.
-- ============================================================

begin;
create or replace function public.deduct_comm_credits(p_org_id integer, p_channel text, p_amount integer default 1)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_id uuid; v_sms integer; v_wa integer; v_voice integer; v_remaining integer;
  v_amount integer := GREATEST(COALESCE(p_amount, 1), 0);
BEGIN
  IF p_org_id IS NULL OR p_channel IS NULL OR p_channel NOT IN ('sms', 'whatsapp', 'voice') THEN RETURN false; END IF;
  SELECT id, sms_remaining, whatsapp_remaining, voice_minutes_remaining INTO v_id, v_sms, v_wa, v_voice
    FROM public.comm_settings WHERE organization_id = p_org_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_remaining := CASE p_channel WHEN 'sms' THEN v_sms WHEN 'whatsapp' THEN v_wa ELSE v_voice END;
  IF v_remaining IS NULL THEN RETURN true; END IF;
  IF v_remaining < v_amount THEN RETURN false; END IF;
  UPDATE public.comm_settings
     SET sms_remaining           = CASE WHEN p_channel = 'sms'      THEN sms_remaining - v_amount           ELSE sms_remaining           END,
         whatsapp_remaining      = CASE WHEN p_channel = 'whatsapp' THEN whatsapp_remaining - v_amount      ELSE whatsapp_remaining      END,
         voice_minutes_remaining = CASE WHEN p_channel = 'voice'    THEN voice_minutes_remaining - v_amount ELSE voice_minutes_remaining END,
         updated_at = now()
   WHERE id = v_id;
  RETURN true;
END $function$;
comment on function public.deduct_comm_credits(integer, text, integer) is
  'Debita saldo de comunicaciones de forma atómica (FOR UPDATE). Fail-closed: sin fila activa en comm_settings o canal desconocido -> false. NULL en la columna = ilimitado explícito. p_amount negativo se trata como 0.';
commit;
