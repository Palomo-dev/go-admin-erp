-- ============================================================================
-- Agente de voz: requisitos legales antes de llamar (2026-09-30)
--
-- 1. comm_settings.data_policy_url: URL de la política de tratamiento de datos
--    de la organización (Ley 1581 de 2012). Sin ella la cola de campañas del
--    agente de voz no marca, y el agente la cita si el prospecto pregunta.
-- 2. crm_excluded_numbers: números excluidos por organización (lista del
--    Registro de Números Excluidos de la CRC, o alta manual). El despachador no
--    marca un número que esté aquí.
-- 3. voice_campaign_rne_checks: constancia de cada verificación de una campaña
--    contra el RNE, con su vigencia. La cola no marca una campaña sin una
--    verificación vigente.
-- 4. fn_rne_registrar_verificacion: registra la verificación, los números y
--    omite las llamadas pendientes de los objetivos excluidos, en una sola
--    transacción. Solo service_role (la ruta valida sesión, organización y
--    permiso antes de llamarla).
-- 5. fn_contactos_efectivos_semana: contactos EFECTIVOS a un cliente en un
--    intervalo, por canal (Ley 2300 de 2023: tope semanal). Un buzón de voz, una
--    llamada sin contestar o un fax no cuentan.
--
-- Aditiva: columnas NULL-ables, tablas nuevas, funciones nuevas. Idempotente.
-- ============================================================================

-- 1. Política de tratamiento de datos ---------------------------------------
alter table public.comm_settings add column if not exists data_policy_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'comm_settings_data_policy_url_https'
       and conrelid = 'public.comm_settings'::regclass
  ) then
    alter table public.comm_settings
      add constraint comm_settings_data_policy_url_https
      check (data_policy_url is null or (data_policy_url ~ '^https://[^[:space:]]+$' and length(data_policy_url) <= 500));
  end if;
end $$;

comment on column public.comm_settings.data_policy_url is
  'URL (https) de la política de tratamiento de datos de la organización. Sin ella la cola de campañas del agente de voz no marca; el agente la cita si el prospecto pregunta.';

-- 2. Números excluidos ------------------------------------------------------
create table if not exists public.crm_excluded_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  phone_e164 text not null,
  source text not null default 'rne',
  rne_check_id uuid null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_excluded_numbers_phone_e164 check (phone_e164 ~ '^\+[1-9][0-9]{9,14}$'),
  constraint crm_excluded_numbers_source check (source in ('rne', 'manual')),
  constraint crm_excluded_numbers_unico unique (organization_id, phone_e164, source)
);

comment on table public.crm_excluded_numbers is
  'Números que la organización no puede contactar con fines comerciales (Registro de Números Excluidos de la CRC o alta manual). Se acumulan: una carga nueva no borra las anteriores.';

create index if not exists idx_crm_excluded_numbers_org_phone
  on public.crm_excluded_numbers (organization_id, phone_e164);

alter table public.crm_excluded_numbers enable row level security;

drop policy if exists crm_excluded_numbers_select on public.crm_excluded_numbers;
create policy crm_excluded_numbers_select on public.crm_excluded_numbers
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true
  ));

revoke insert, update, delete on public.crm_excluded_numbers from anon, authenticated;
revoke all on public.crm_excluded_numbers from anon;

-- 3. Verificaciones de campaña contra el RNE ---------------------------------
create table if not exists public.voice_campaign_rne_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.voice_agent_campaigns(id) on delete cascade,
  checked_at timestamptz not null default now(),
  valid_until timestamptz not null,
  file_name text null,
  file_sha256 text null,
  numbers_in_file integer not null default 0,
  checked_targets integer not null default 0,
  excluded_targets integer not null default 0,
  skipped_calls integer not null default 0,
  checked_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint voice_campaign_rne_checks_vigencia check (valid_until > checked_at),
  constraint voice_campaign_rne_checks_file_name check (file_name is null or length(file_name) <= 255),
  constraint voice_campaign_rne_checks_sha check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint voice_campaign_rne_checks_conteos check (
    numbers_in_file >= 0 and checked_targets >= 0 and excluded_targets >= 0 and skipped_calls >= 0
  )
);

comment on table public.voice_campaign_rne_checks is
  'Constancia de cada verificación de una campaña de voz contra el Registro de Números Excluidos (CRC). La cola no marca una campaña sin una verificación vigente (valid_until > now()).';

create index if not exists idx_voice_campaign_rne_checks_campaign
  on public.voice_campaign_rne_checks (organization_id, campaign_id, valid_until desc);

alter table public.voice_campaign_rne_checks enable row level security;

drop policy if exists voice_campaign_rne_checks_select on public.voice_campaign_rne_checks;
create policy voice_campaign_rne_checks_select on public.voice_campaign_rne_checks
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true
  ));

revoke insert, update, delete on public.voice_campaign_rne_checks from anon, authenticated;
revoke all on public.voice_campaign_rne_checks from anon;

-- 4. Registro transaccional de la verificación -------------------------------
create or replace function public.fn_rne_registrar_verificacion(
  p_org integer,
  p_campaign uuid,
  p_numeros text[],
  p_clientes_excluidos uuid[],
  p_objetivos_revisados integer,
  p_archivo text,
  p_sha256 text,
  p_usuario uuid,
  p_vigencia_dias integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_check_id uuid;
  v_ahora timestamptz := now();
  v_numeros integer;
  v_omitidas integer;
  v_excluidos integer := coalesce(array_length(p_clientes_excluidos, 1), 0);
begin
  if p_vigencia_dias is null or p_vigencia_dias < 1 or p_vigencia_dias > 30 then
    raise exception 'vigencia inválida: % (1 a 30 días)', p_vigencia_dias using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.voice_agent_campaigns c
     where c.id = p_campaign and c.organization_id = p_org
  ) then
    raise exception 'La campaña no pertenece a la organización' using errcode = '42501';
  end if;

  select count(*) into v_numeros
    from (select distinct n from unnest(coalesce(p_numeros, '{}'::text[])) as n
           where n ~ '^\+[1-9][0-9]{9,14}$') s;

  insert into public.voice_campaign_rne_checks (
    organization_id, campaign_id, checked_at, valid_until, file_name, file_sha256,
    numbers_in_file, checked_targets, excluded_targets, checked_by
  ) values (
    p_org, p_campaign, v_ahora, v_ahora + make_interval(days => p_vigencia_dias),
    left(p_archivo, 255), p_sha256,
    v_numeros, greatest(coalesce(p_objetivos_revisados, 0), 0), v_excluidos, p_usuario
  ) returning id into v_check_id;

  insert into public.crm_excluded_numbers (organization_id, phone_e164, source, rne_check_id, created_by)
  select distinct p_org, n, 'rne', v_check_id, p_usuario
    from unnest(coalesce(p_numeros, '{}'::text[])) as n
   where n ~ '^\+[1-9][0-9]{9,14}$'
  on conflict (organization_id, phone_e164, source) do nothing;

  update public.voice_agent_calls v
     set status = 'skipped',
         error_message = 'Número inscrito en el Registro de Números Excluidos (RNE)',
         last_error_code = 'RNE',
         completed_at = v_ahora,
         locked_by = null,
         updated_at = v_ahora
   where v.organization_id = p_org
     and v.campaign_id = p_campaign
     and v.status in ('pending', 'queued')
     and v.customer_id = any(coalesce(p_clientes_excluidos, '{}'::uuid[]));
  get diagnostics v_omitidas = row_count;

  update public.voice_campaign_rne_checks set skipped_calls = v_omitidas where id = v_check_id;

  return jsonb_build_object(
    'check_id', v_check_id,
    'checked_at', v_ahora,
    'valid_until', v_ahora + make_interval(days => p_vigencia_dias),
    'numbers_in_file', v_numeros,
    'checked_targets', greatest(coalesce(p_objetivos_revisados, 0), 0),
    'excluded_targets', v_excluidos,
    'skipped_calls', v_omitidas
  );
end $$;

revoke all on function public.fn_rne_registrar_verificacion(integer, uuid, text[], uuid[], integer, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_rne_registrar_verificacion(integer, uuid, text[], uuid[], integer, text, text, uuid, integer) to service_role;

comment on function public.fn_rne_registrar_verificacion(integer, uuid, text[], uuid[], integer, text, text, uuid, integer) is
  'Registra una verificación RNE de una campaña: constancia con vigencia, números excluidos y omisión de las llamadas pendientes de los objetivos excluidos. Solo service_role, tras validar sesión, organización y permiso en la ruta.';

-- 5. Contactos efectivos por canal (Ley 2300 de 2023) ------------------------
create or replace function public.fn_contactos_efectivos_semana(
  p_org integer,
  p_customer uuid,
  p_desde timestamptz,
  p_hasta timestamptz
) returns table (canal text, contactos integer)
language sql
stable
security invoker
set search_path = public
as $$
  -- Voz: llamadas salientes CONTESTADAS por una persona (humanas o del agente).
  select 'voice'::text, count(*)::integer
    from public.calls c
   where c.organization_id = p_org
     and c.customer_id = p_customer
     and c.direction = 'outbound'
     and c.answered_at is not null
     and c.answered_at >= p_desde and c.answered_at < p_hasta
     and c.status in ('in_progress', 'completed')
     and coalesce(c.answered_by, 'human') not like 'machine%'
     and coalesce(c.answered_by, '') <> 'fax'
  union all
  -- Correo: enviados (los fallidos o rebotados no llegaron).
  select 'email'::text, count(*)::integer
    from public.email_messages e
   where e.organization_id = p_org
     and e.to_customer_id = p_customer
     and e.sent_at >= p_desde and e.sent_at < p_hasta
     and e.status in ('sent', 'delivered', 'opened', 'clicked')
  union all
  -- Mensajería: mensajes salientes que inicia la empresa. Una respuesta dentro
  -- de las 24 h siguientes a un mensaje del cliente no es un contacto nuevo:
  -- la conversación la abrió él. Un contacto por conversación y día.
  select case when ch.type = 'whatsapp' then 'whatsapp' else 'mensajeria' end,
         count(distinct (m.conversation_id, floor(extract(epoch from (m.created_at - p_desde)) / 86400)))::integer
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id and cv.organization_id = p_org
    left join public.channels ch on ch.id = cv.channel_id
   where m.organization_id = p_org
     and cv.customer_id = p_customer
     and m.direction = 'outbound'
     and m.created_at >= p_desde and m.created_at < p_hasta
     and not exists (
       select 1 from public.messages mi
        where mi.conversation_id = m.conversation_id
          and mi.direction = 'inbound'
          and mi.created_at <= m.created_at
          and mi.created_at > m.created_at - interval '24 hours'
     )
   group by 1
$$;

revoke all on function public.fn_contactos_efectivos_semana(integer, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.fn_contactos_efectivos_semana(integer, uuid, timestamptz, timestamptz) to authenticated, service_role;

comment on function public.fn_contactos_efectivos_semana(integer, uuid, timestamptz, timestamptz) is
  'Contactos efectivos a un cliente en [p_desde, p_hasta) por canal (voice, email, whatsapp, mensajeria). Base del tope semanal de la Ley 2300 de 2023. SECURITY INVOKER: con sesión de usuario aplica la RLS de cada tabla.';
