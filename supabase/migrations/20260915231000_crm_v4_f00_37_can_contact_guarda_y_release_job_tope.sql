-- =============================================================================
-- crm_v4_f00_37_can_contact_guarda_y_release_job_tope
-- F0-DB ronda 3 (QA r2: problemas 5, 7 y 8).
--
-- A) fn_can_contact (problemas 5 y 8)
--    · Era un oráculo entre organizaciones para `authenticated`: ACL
--      {postgres, authenticated, service_role} y `p_org` arbitrario. Un usuario
--      de la org A podía preguntar por un uuid de la org B. No se puede revocar
--      `authenticated` sin más: sendService.ts:86, voiceAgentService.ts:634 y
--      whatsapp/consent.ts reciben el cliente inyectado y no está garantizado
--      que sea service_role. La corrección es la guarda DENTRO de la función:
--      con rol `authenticated` (auth.role(), que lee request.jwt.claim.role o
--      request.jwt.claims según la versión de PostgREST) se exige pertenencia
--      activa a `p_org`; service_role / postgres pasan igual que antes.
--    · Distinguía mayúsculas (`'EMAIL'` -> false). Fail-closed correcto pero
--      silencioso: ahora `lower(trim(p_channel))` antes de validar, así que
--      'EMAIL', ' email ' y 'email' se comportan igual. NULL sigue -> false.
--    Se conserva firma, STABLE, SECURITY DEFINER, search_path=public y la ACL
--    (CREATE OR REPLACE no la toca). El resto del cuerpo es el de
--    crm_v4_f06_01 (columna do_not_call para 'voice').
--
-- B) fn_release_job (problema 7) — opción completa del QA: columna
--    `outbound_jobs.releases` (int NOT NULL DEFAULT 0, aditiva) + tope + backoff.
--    · Antes: queued + attempts-1 + run_at = now(). Un handler que liberara
--      siempre por deadline giraba indefinidamente sin agotar max_attempts ni
--      dejar rastro en last_error.
--    · Ahora, por cada liberación: releases += 1; run_at = now() + backoff
--      (30 s * 2^(releases-1), tope 900 s: 30, 60, 120, 240, 480, 900, 900…);
--      si releases >= max_attempts * 2 (10 con el default 5) el job pasa a
--      `dead` con last_error = 'released_limit: N liberaciones por deadline'.
--      Devuelve true si la fila estaba running con ese worker (igual que antes),
--      tanto si quedó queued como si quedó dead. `attempts` se sigue devolviendo
--      (GREATEST(attempts-1,0)): liberar no consume intento; el tope vive en
--      `releases`, que nunca se decrementa.
--    · El runner (src/lib/jobs/runner.ts) aplica el mismo backoff/tope en su
--      fallback UPDATE cuando la RPC no existe, y solo escribe `releases` si la
--      fila reclamada trae la columna (RETURNING j.* de fn_claim_jobs).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE. Sin DML.
-- Rollback: supabase/rollbacks/20260915231000_crm_v4_f00_37_can_contact_guarda_y_release_job_tope_rollback.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A) fn_can_contact: normalización + guarda de pertenencia para authenticated
-- ---------------------------------------------------------------------------
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
declare
  v_channel text := lower(btrim(p_channel));
  v_meta    jsonb;
  v_dnc     boolean;
  v_consent text;
  v_flag    text;
begin
  -- fail-closed: canal desconocido o NULL => no contactar (normalizado: 'EMAIL' == 'email')
  if v_channel is null or v_channel not in ('email','whatsapp','sms','voice') then return false; end if;

  -- F0-DB r3 (QA problema 5): con sesión de usuario la organización deja de ser
  -- un parámetro en el que confiar. service_role / postgres no pasan por aquí.
  if auth.role() = 'authenticated' and not exists (
    select 1 from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.organization_id = p_org
       and om.is_active = true
  ) then
    return false;
  end if;

  -- p_purpose se ignora explicitamente en F0 (reservado para reglas marketing/utility/transactional)
  select metadata, do_not_call into v_meta, v_dnc
    from public.customers where id = p_customer and organization_id = p_org;
  if not found then return false; end if;

  -- F6: columna real de "no llamar" (solo aplica al canal de voz)
  if v_channel = 'voice' and coalesce(v_dnc, false) then return false; end if;

  select status into v_consent from public.contact_consents
   where organization_id = p_org and customer_id = p_customer and channel = v_channel;
  if v_consent = 'opted_out' then return false; end if;

  v_flag := case v_channel
              when 'email'    then 'do_not_email'
              when 'whatsapp' then 'do_not_whatsapp'
              when 'sms'      then 'do_not_sms'
              when 'voice'    then 'do_not_call'
              else null end;
  if v_flag is not null and coalesce(v_meta ->> v_flag, 'false') in ('true','1') then return false; end if;
  return true;
end $function$;

comment on function public.fn_can_contact(integer, uuid, text, text) is
  'Puerta única de contacto (F0). Fail-closed. p_channel se normaliza con lower(trim). Con rol authenticated exige pertenencia activa a p_org (no es oráculo entre organizaciones); service_role pasa. p_purpose reservado. SUPUESTO: la guarda de pertenencia depende de request.jwt.claims (auth.role()), no del rol de sesión: una conexión con rol authenticated sin JWT no pasa por ella. Válido bajo PostgREST/Supabase, donde los claims siempre viajan; no aplica a conexiones sin claims (service_role, pg_cron, sesión directa).';

-- ACL explícita (idéntica a la actual; se repite por idempotencia y por la política de migraciones).
revoke all on function public.fn_can_contact(integer, uuid, text, text) from public, anon;
grant execute on function public.fn_can_contact(integer, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B) fn_release_job: contador de liberaciones, backoff y tope
-- ---------------------------------------------------------------------------
alter table public.outbound_jobs add column if not exists releases integer not null default 0;

comment on column public.outbound_jobs.releases is
  'Veces que un worker devolvió el job a la cola por deadline sin ejecutarlo (fn_release_job). No consume attempts. Al llegar a max_attempts*2 el job pasa a dead.';

create or replace function public.fn_release_job(p_job_id uuid, p_worker text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  update public.outbound_jobs j
     set releases  = j.releases + 1,
         attempts  = greatest(j.attempts - 1, 0),
         locked_at = null,
         locked_by = null,
         status    = case when j.releases + 1 >= j.max_attempts * 2 then 'dead' else 'queued' end,
         -- backoff 30 s * 2^(releases-1), tope 15 min. Nunca run_at = now().
         run_at    = now() + make_interval(secs => least(30 * power(2, j.releases)::numeric, 900)::integer),
         last_error = case
                        when j.releases + 1 >= j.max_attempts * 2
                          then left('released_limit: ' || (j.releases + 1)::text || ' liberaciones por deadline (worker ' || coalesce(p_worker, '?') || ')', 4000)
                        else j.last_error
                      end
   where j.id = p_job_id and j.status = 'running' and j.locked_by = p_worker
   returning j.id into v_id;
  return v_id is not null;
end $function$;

revoke execute on function public.fn_release_job(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_release_job(uuid, text) to service_role;

commit;

-- Verificación (solo lectura, tras aplicar):
--   select proacl from pg_proc where proname='fn_can_contact';  -> {postgres,authenticated,service_role}
--   como authenticated de la org A: select fn_can_contact(B, <uuid de B>, 'email') -> false
--   como authenticated de la org A: select fn_can_contact(A, <uuid de A>, 'EMAIL') = fn_can_contact(A, <uuid de A>, 'email')
--   select column_name from information_schema.columns where table_name='outbound_jobs' and column_name='releases' -> 1 fila
