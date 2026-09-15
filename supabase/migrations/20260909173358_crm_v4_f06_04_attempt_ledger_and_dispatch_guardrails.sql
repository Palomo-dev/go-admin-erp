-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_04_attempt_ledger_and_dispatch_guardrails`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 256bdc658f06de9db1832958613100b6). No reformatear.
-- FASE 06 · ronda 2
-- 1) Libro de intentos de marcación: el tope diario/horario se contaba por
--    `voice_agent_calls.claimed_at`, que el reintento y el rechazo por franja
--    horaria ponían a NULL, borrando el intento del conteo (F-NEW-2 del tester:
--    3 filas producían 15 marcaciones contadas como 3).
--    Ahora cada reserva escribe una fila inmutable aquí y el conteo la usa.
-- 2) Conciliación de créditos: `credits_reserved` / `credits_settled_at`.
-- 3) Topes propios del agente para el despacho puntual (camino sin campaña).
-- 4) Toda función SECURITY DEFINER lleva su REVOKE en esta misma migración.

create table if not exists public.voice_agent_call_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  voice_agent_call_id uuid not null references public.voice_agent_calls(id) on delete cascade,
  voice_agent_id uuid not null references public.voice_agents(id) on delete cascade,
  campaign_id uuid references public.voice_agent_campaigns(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  attempt_no integer not null default 1,
  source text not null default 'campaign' check (source in ('campaign','manual','job')),
  worker text,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_vaca_campaign_at on public.voice_agent_call_attempts (campaign_id, attempted_at desc);
create index if not exists idx_vaca_org_agent_at on public.voice_agent_call_attempts (organization_id, voice_agent_id, attempted_at desc);
create index if not exists idx_vaca_org_customer_at on public.voice_agent_call_attempts (organization_id, customer_id, attempted_at desc);
create index if not exists idx_vaca_call on public.voice_agent_call_attempts (voice_agent_call_id);

alter table public.voice_agent_call_attempts enable row level security;

drop policy if exists voice_agent_call_attempts_select on public.voice_agent_call_attempts;
create policy voice_agent_call_attempts_select on public.voice_agent_call_attempts for select
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = auth.uid() and om.is_active = true));

drop policy if exists voice_agent_call_attempts_insert on public.voice_agent_call_attempts;
create policy voice_agent_call_attempts_insert on public.voice_agent_call_attempts for insert
  with check (organization_id in (select om.organization_id from public.organization_members om
                                   where om.user_id = auth.uid() and om.is_active = true));

drop policy if exists voice_agent_call_attempts_update on public.voice_agent_call_attempts;
create policy voice_agent_call_attempts_update on public.voice_agent_call_attempts for update
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = auth.uid() and om.is_active = true))
  with check (organization_id in (select om.organization_id from public.organization_members om
                                   where om.user_id = auth.uid() and om.is_active = true));

drop policy if exists voice_agent_call_attempts_delete on public.voice_agent_call_attempts;
create policy voice_agent_call_attempts_delete on public.voice_agent_call_attempts for delete
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = auth.uid() and om.is_active = true));

comment on table public.voice_agent_call_attempts is
  'FASE 06 r2: un intento REAL de marcación por fila. El tope diario/horario se cuenta aquí porque claimed_at se reescribe/anula en los reintentos.';

-- Conciliación de créditos (F-NEW-6: se reservaba 1 y al colgar se cobraba el total sin restar).
alter table public.voice_agent_calls add column if not exists credits_reserved integer not null default 0;
alter table public.voice_agent_calls add column if not exists credits_settled_at timestamptz;

-- Topes del despacho puntual, que no tiene campaña (F-NEW-5).
alter table public.voice_agents add column if not exists max_calls_per_day integer not null default 50;
alter table public.voice_agents add column if not exists max_calls_per_hour integer not null default 20;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'voice_agents_max_calls_per_day_check') then
    alter table public.voice_agents add constraint voice_agents_max_calls_per_day_check check (max_calls_per_day between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'voice_agents_max_calls_per_hour_check') then
    alter table public.voice_agents add constraint voice_agents_max_calls_per_hour_check check (max_calls_per_hour between 1 and 500);
  end if;
end $$;

-- El claim de campaña deja constancia del intento en el libro.
create or replace function public.fn_claim_voice_agent_calls(p_org integer, p_campaign uuid, p_limit integer, p_worker text)
returns setof public.voice_agent_calls
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN RETURN; END IF;
  RETURN QUERY
  WITH candidatos AS (
    SELECT vac.id
      FROM public.voice_agent_calls vac
     WHERE vac.organization_id = p_org
       AND vac.campaign_id = p_campaign
       AND vac.status IN ('pending','queued')
       AND (vac.scheduled_at IS NULL OR vac.scheduled_at <= now())
     ORDER BY vac.scheduled_at NULLS FIRST, vac.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  ), reclamadas AS (
    UPDATE public.voice_agent_calls v
       SET status = 'in_progress',
           claimed_at = now(),
           locked_by = p_worker,
           attempts = v.attempts + 1,
           updated_at = now()
      FROM candidatos c
     WHERE v.id = c.id
    RETURNING v.*
  ), registradas AS (
    INSERT INTO public.voice_agent_call_attempts
      (organization_id, voice_agent_call_id, voice_agent_id, campaign_id, customer_id, attempt_no, source, worker)
    SELECT r.organization_id, r.id, r.voice_agent_id, r.campaign_id, r.customer_id, r.attempts, 'campaign', p_worker
      FROM reclamadas r
    RETURNING voice_agent_call_id
  )
  SELECT r.* FROM reclamadas r
   WHERE r.id IN (SELECT voice_agent_call_id FROM registradas);
END $function$;

revoke all on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) from public;
revoke all on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) from anon;
revoke all on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) from authenticated;
grant execute on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) to service_role;

-- Reserva atómica de UNA llamada suelta (despacho puntual, sin campaña).
-- Devuelve la fila reclamada y deja el intento en el libro, igual que la campaña.
create or replace function public.fn_claim_voice_agent_call_one(p_org integer, p_call uuid, p_worker text)
returns setof public.voice_agent_calls
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  RETURN QUERY
  WITH candidato AS (
    SELECT vac.id
      FROM public.voice_agent_calls vac
     WHERE vac.organization_id = p_org
       AND vac.id = p_call
       AND vac.status IN ('pending','queued')
     FOR UPDATE SKIP LOCKED
  ), reclamada AS (
    UPDATE public.voice_agent_calls v
       SET status = 'in_progress',
           claimed_at = now(),
           locked_by = p_worker,
           attempts = v.attempts + 1,
           updated_at = now()
      FROM candidato c
     WHERE v.id = c.id
    RETURNING v.*
  ), registrada AS (
    INSERT INTO public.voice_agent_call_attempts
      (organization_id, voice_agent_call_id, voice_agent_id, campaign_id, customer_id, attempt_no, source, worker)
    SELECT r.organization_id, r.id, r.voice_agent_id, r.campaign_id, r.customer_id, r.attempts, 'manual', p_worker
      FROM reclamada r
    RETURNING voice_agent_call_id
  )
  SELECT r.* FROM reclamada r
   WHERE r.id IN (SELECT voice_agent_call_id FROM registrada);
END $function$;

revoke all on function public.fn_claim_voice_agent_call_one(integer, uuid, text) from public;
revoke all on function public.fn_claim_voice_agent_call_one(integer, uuid, text) from anon;
revoke all on function public.fn_claim_voice_agent_call_one(integer, uuid, text) from authenticated;
grant execute on function public.fn_claim_voice_agent_call_one(integer, uuid, text) to service_role;