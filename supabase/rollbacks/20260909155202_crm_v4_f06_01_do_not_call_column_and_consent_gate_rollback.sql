-- ============================================================
-- ROLLBACK de 20260909155202_crm_v4_f06_01_do_not_call_column_and_consent_gate
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina fn_log_consent_opt_out (si se aplicaron f06_04/f06_05, revertirlas
-- antes), restaura fn_can_contact a la versión de f00_12 (sin do_not_call) y
-- quita la columna e índice.
--
-- SOBRE LOS DATOS: restaura la estructura, no los datos: la columna do_not_call se pierde. El
-- flag histórico metadata->>'do_not_call' (que el backfill leyó y que
-- fn_log_consent_opt_out siguió escribiendo) se conserva, así que la baja de voz
-- sigue vigente por esa vía.
-- ============================================================

begin;
drop function if exists public.fn_log_consent_opt_out(integer, uuid, text, text, jsonb);

create or replace function public.fn_can_contact(p_org integer, p_customer uuid, p_channel text, p_purpose text default 'utility'::text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE v_meta jsonb; v_consent text; v_flag text;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN RETURN false; END IF;
  SELECT metadata INTO v_meta FROM public.customers WHERE id = p_customer AND organization_id = p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT status INTO v_consent FROM public.contact_consents
   WHERE organization_id = p_org AND customer_id = p_customer AND channel = p_channel;
  IF v_consent = 'opted_out' THEN RETURN false; END IF;
  v_flag := CASE p_channel
              WHEN 'email' THEN 'do_not_email'
              WHEN 'whatsapp' THEN 'do_not_whatsapp'
              WHEN 'sms' THEN 'do_not_sms'
              WHEN 'voice' THEN 'do_not_call'
              ELSE NULL END;
  IF v_flag IS NOT NULL AND COALESCE(v_meta ->> v_flag, 'false') IN ('true','1') THEN RETURN false; END IF;
  RETURN true;
END $function$;
revoke execute on function public.fn_can_contact(integer, uuid, text, text) from public, anon;
grant execute on function public.fn_can_contact(integer, uuid, text, text) to authenticated, service_role;

drop index if exists public.idx_customers_do_not_call;
alter table public.customers drop column if exists do_not_call;
commit;
