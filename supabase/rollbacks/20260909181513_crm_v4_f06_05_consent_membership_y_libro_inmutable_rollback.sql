-- ============================================================
-- ROLLBACK de 20260909181513_crm_v4_f06_05_consent_membership_y_libro_inmutable
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Restaura fn_log_consent_opt_out a la versión de f06_01 (sin guarda de
-- pertenencia) y vuelve a abrir el libro de intentos al cliente (políticas
-- INSERT/UPDATE/DELETE + grants), como estaba tras f06_04.
--
-- SOBRE LOS DATOS: no toca datos. Reabre los dos hallazgos ALTOS de F6 r3 (opt-out entre organizaciones; el inquilino puede borrar su tope).
-- ============================================================

begin;
create or replace function public.fn_log_consent_opt_out(
  p_org integer, p_customer uuid, p_channel text, p_source text default 'ai_voice_agent', p_evidence jsonb default '{}'::jsonb
) returns boolean language plpgsql volatile security definer set search_path to 'public' as $function$
DECLARE v_flag text;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN
    RAISE EXCEPTION 'canal invalido: %', p_channel USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer AND organization_id = p_org) THEN RETURN false; END IF;
  INSERT INTO public.contact_consents (organization_id, customer_id, channel, status, source, evidence, changed_at)
  VALUES (p_org, p_customer, p_channel, 'opted_out', p_source, COALESCE(p_evidence, '{}'::jsonb), now())
  ON CONFLICT (organization_id, customer_id, channel)
  DO UPDATE SET status = 'opted_out', source = EXCLUDED.source, evidence = EXCLUDED.evidence, changed_at = now();
  v_flag := CASE p_channel WHEN 'email' THEN 'do_not_email' WHEN 'whatsapp' THEN 'do_not_whatsapp'
                           WHEN 'sms' THEN 'do_not_sms' WHEN 'voice' THEN 'do_not_call' END;
  UPDATE public.customers
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(v_flag, true, p_channel || '_optout_at', now()),
         do_not_call = CASE WHEN p_channel = 'voice' THEN true ELSE do_not_call END
   WHERE id = p_customer AND organization_id = p_org;
  RETURN true;
END $function$;

grant insert, update, delete, truncate on table public.voice_agent_call_attempts to anon, authenticated;
create policy voice_agent_call_attempts_insert on public.voice_agent_call_attempts for insert
  with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
create policy voice_agent_call_attempts_update on public.voice_agent_call_attempts for update
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true))
  with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
create policy voice_agent_call_attempts_delete on public.voice_agent_call_attempts for delete
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
commit;
