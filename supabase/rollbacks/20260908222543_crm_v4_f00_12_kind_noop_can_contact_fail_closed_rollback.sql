-- ============================================================
-- ROLLBACK de 20260908222543_crm_v4_f00_12_kind_noop_can_contact_fail_closed
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita 'noop' del CHECK de kind (si f08_01 ya añadió 'time_events', revertir
-- f08_01 antes) y restaura fn_can_contact a la versión de f00_05 (sin fail-closed
-- por canal inválido).
--
-- SOBRE LOS DATOS: no toca datos. Si hay jobs con kind='noop' el ADD CONSTRAINT falla: borrarlos antes.
-- ============================================================

begin;
alter table public.outbound_jobs drop constraint if exists outbound_jobs_kind_check;
alter table public.outbound_jobs add constraint outbound_jobs_kind_check check (kind in (
  'email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze',
  'recording_fetch','recording_cleanup','campaign_batch','crm_event','maintenance'));

create or replace function public.fn_can_contact(p_org integer, p_customer uuid, p_channel text, p_purpose text default 'utility')
returns boolean language plpgsql stable security definer set search_path = public as $$
DECLARE v_meta jsonb; v_consent text; v_flag text;
BEGIN
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
END $$;
revoke all on function public.fn_can_contact(integer, uuid, text, text) from public, anon;
grant execute on function public.fn_can_contact(integer, uuid, text, text) to authenticated, service_role;
commit;
