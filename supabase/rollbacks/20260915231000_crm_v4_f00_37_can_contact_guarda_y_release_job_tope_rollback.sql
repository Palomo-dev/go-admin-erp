-- Rollback de crm_v4_f00_37_can_contact_guarda_y_release_job_tope.
-- Restaura la VERSIÓN ANTERIOR de las dos funciones (no DROP: sendService,
-- voiceAgentService, whatsapp/consent y el runner de jobs las siguen llamando):
--   · fn_can_contact  -> cuerpo de crm_v4_f06_01 (sin guarda de pertenencia,
--                        sin lower/trim; ACL {postgres, authenticated, service_role}).
--   · fn_release_job  -> cuerpo de crm_v4_f00_16 (queued + attempts-1 + run_at = now()).
-- Retira la columna outbound_jobs.releases (aditiva, sin datos de clientes:
-- solo la escribe fn_release_job). El runner la lee de forma opcional, así que
-- quitarla no rompe el código.
-- No toca datos de negocio.

begin;

create or replace function public.fn_can_contact(
  p_org integer,
  p_customer uuid,
  p_channel text,
  p_purpose text default 'utility'::text
) returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  v_meta jsonb;
  v_dnc boolean;
  v_consent text;
  v_flag text;
BEGIN
  -- fail-closed: canal desconocido o NULL => no contactar
  IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN RETURN false; END IF;
  -- p_purpose se ignora explicitamente en F0 (reservado para reglas marketing/utility/transactional)
  SELECT metadata, do_not_call INTO v_meta, v_dnc
    FROM public.customers WHERE id = p_customer AND organization_id = p_org;
  IF NOT FOUND THEN RETURN false; END IF;

  -- F6: columna real de "no llamar" (solo aplica al canal de voz)
  IF p_channel = 'voice' AND COALESCE(v_dnc, false) THEN RETURN false; END IF;

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

comment on function public.fn_can_contact(integer, uuid, text, text) is null;

revoke all on function public.fn_can_contact(integer, uuid, text, text) from public, anon;
grant execute on function public.fn_can_contact(integer, uuid, text, text) to authenticated, service_role;

create or replace function public.fn_release_job(p_job_id uuid, p_worker text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_id uuid;
BEGIN
  UPDATE public.outbound_jobs
     SET status = 'queued',
         attempts = GREATEST(attempts - 1, 0),
         locked_at = NULL,
         locked_by = NULL,
         run_at = now()
   WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker
   RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END $function$;

revoke execute on function public.fn_release_job(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_release_job(uuid, text) to service_role;

alter table public.outbound_jobs drop column if exists releases;

commit;
