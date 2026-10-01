-- Avisos al miembro: campana y correo cuando se asigna, cambia la etapa,
-- se completa, se atrasa o vence una tarea u oportunidad.
-- La fila nace en el trigger del guardado. El correo lo manda la app
-- (sendEmail). Sin credenciales en este archivo.

create table if not exists public.member_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id),
  recipient_user_id uuid not null,
  event text not null,
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  body text not null,
  href text not null,
  idempotency_key text not null,
  email_status text not null default 'pendiente',
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_notices_event_check check (event in (
    'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa',
    'tarea.completada', 'tarea.atrasada', 'tarea.vence',
    'oportunidad.vence', 'oportunidad.atrasada'
  )),
  constraint member_notices_entity_check check (entity_type in ('task', 'opportunity')),
  constraint member_notices_email_status_check check (email_status in (
    'pendiente', 'enviando', 'enviado', 'omitido', 'fallido'
  )),
  constraint member_notices_idempotency_key unique (idempotency_key)
);

comment on table public.member_notices is
  'Aviso personal de un miembro. La campana lee la fila; el correo sale por la app. allowed_types vacio significa todos los eventos; el centinela ninguno apaga el correo.';

create index if not exists member_notices_recipient_created_idx
  on public.member_notices (organization_id, recipient_user_id, created_at desc);

create index if not exists member_notices_email_pendiente_idx
  on public.member_notices (created_at)
  where email_status = 'pendiente';

alter table public.member_notices enable row level security;
alter table public.member_notices replica identity full;

revoke all on public.member_notices from public, anon, authenticated;
grant select, update (read_at, dismissed_at) on public.member_notices to authenticated;

drop policy if exists member_notices_select on public.member_notices;
create policy member_notices_select on public.member_notices
  for select to authenticated
  using (
    recipient_user_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = member_notices.organization_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
  );

drop policy if exists member_notices_update on public.member_notices;
create policy member_notices_update on public.member_notices
  for update to authenticated
  using (
    recipient_user_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = member_notices.organization_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
  )
  with check (
    recipient_user_id = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = member_notices.organization_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
  );

create or replace function public.fn_avisos_miembro_es_miembro(p_org integer, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = p_user
      and m.is_active = true
  );
$$;

create or replace function public.fn_avisos_miembro_nombre(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(concat_ws(' ', nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), ''))), ''),
    'Alguien de la organización'
  )
  from public.profiles p
  where p.id = p_user;
$$;

create or replace function public.fn_avisos_miembro_poner(
  p_org integer,
  p_recipient uuid,
  p_actor uuid,
  p_event text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_body text,
  p_href text,
  p_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_recipient is null then
    return null;
  end if;
  if p_actor is not null and p_recipient = p_actor then
    return null;
  end if;
  if not public.fn_avisos_miembro_es_miembro(p_org, p_recipient) then
    return null;
  end if;

  insert into public.member_notices (
    organization_id, recipient_user_id, event, entity_type, entity_id,
    title, body, href, idempotency_key
  ) values (
    p_org, p_recipient, p_event, p_entity_type, p_entity_id,
    p_title, p_body, p_href, p_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.fn_avisos_miembro_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor text;
  v_dest uuid;
  v_id uuid;
  v_aviso boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      v_actor_id := auth.uid();
      v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
      v_id := public.fn_avisos_miembro_poner(
        new.organization_id, new.assigned_to, v_actor_id,
        'tarea.asignada', 'task', new.id,
        'Te asignaron una tarea',
        v_actor || ' te asignó la tarea «' || new.title || '».',
        '/app/pm/tareas?taskId=' || new.id::text,
        'tarea.asignada:' || new.organization_id::text || ':' || new.id::text || ':' || new.assigned_to::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
      );
      v_aviso := v_aviso or v_id is not null;
    end if;
  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.assigned_to, v_actor_id,
      'tarea.asignada', 'task', new.id,
      'Te asignaron una tarea',
      v_actor || ' te asignó la tarea «' || new.title || '».',
      '/app/pm/tareas?taskId=' || new.id::text,
      'tarea.asignada:' || new.organization_id::text || ':' || new.id::text || ':' || new.assigned_to::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    );
    v_aviso := v_aviso or v_id is not null;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'done' then
      v_actor_id := coalesce(auth.uid(), new.completed_by);
      v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
      for v_dest in
        select distinct u
        from unnest(array[new.created_by, new.assigned_to]) as u
        where u is not null
      loop
        v_id := public.fn_avisos_miembro_poner(
          new.organization_id, v_dest, v_actor_id,
          'tarea.completada', 'task', new.id,
          'Se completó una tarea',
          v_actor || ' completó la tarea «' || new.title || '».',
          '/app/pm/tareas?taskId=' || new.id::text,
          'tarea.completada:' || new.organization_id::text || ':' || new.id::text || ':' || v_dest::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
        );
        v_aviso := v_aviso or v_id is not null;
      end loop;
    end if;
  elsif new.status = 'done' and old.status is distinct from 'done' then
    v_actor_id := coalesce(auth.uid(), new.completed_by);
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    for v_dest in
      select distinct u
      from unnest(array[new.created_by, new.assigned_to]) as u
      where u is not null
    loop
      v_id := public.fn_avisos_miembro_poner(
        new.organization_id, v_dest, v_actor_id,
        'tarea.completada', 'task', new.id,
        'Se completó una tarea',
        v_actor || ' completó la tarea «' || new.title || '».',
        '/app/pm/tareas?taskId=' || new.id::text,
        'tarea.completada:' || new.organization_id::text || ':' || new.id::text || ':' || v_dest::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
      );
      v_aviso := v_aviso or v_id is not null;
    end loop;
  end if;

  if v_aviso then
    begin
      perform public.fn_crm_cron_post('/api/cron/avisos-miembro', '{"solo":"correo"}'::jsonb);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

create or replace function public.fn_avisos_miembro_oportunidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor text;
  v_etapa text;
  v_id uuid;
  v_aviso boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.salesperson_id is not null then
      v_actor_id := auth.uid();
      v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
      v_id := public.fn_avisos_miembro_poner(
        new.organization_id, new.salesperson_id, v_actor_id,
        'oportunidad.asignada', 'opportunity', new.id,
        'Te asignaron una oportunidad',
        v_actor || ' te asignó la oportunidad «' || new.name || '».',
        '/app/crm/oportunidades/' || new.id::text,
        'oportunidad.asignada:' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
      );
      v_aviso := v_aviso or v_id is not null;
    end if;
  elsif new.salesperson_id is distinct from old.salesperson_id and new.salesperson_id is not null then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.salesperson_id, v_actor_id,
      'oportunidad.asignada', 'opportunity', new.id,
      'Te asignaron una oportunidad',
      v_actor || ' te asignó la oportunidad «' || new.name || '».',
      '/app/crm/oportunidades/' || new.id::text,
      'oportunidad.asignada:' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    );
    v_aviso := v_aviso or v_id is not null;
  end if;

  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id and new.salesperson_id is not null then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    select s.name into v_etapa from public.stages s where s.id = new.stage_id;
    if v_etapa is null or btrim(v_etapa) = '' then
      v_etapa := 'la nueva etapa';
    end if;
    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.salesperson_id, v_actor_id,
      'oportunidad.etapa', 'opportunity', new.id,
      'La oportunidad cambió de etapa',
      '«' || new.name || '» pasó a ' || v_etapa || '. Lo movió ' || v_actor || '.',
      '/app/crm/oportunidades/' || new.id::text,
      'oportunidad.etapa:' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    );
    v_aviso := v_aviso or v_id is not null;
  end if;

  if v_aviso then
    begin
      perform public.fn_crm_cron_post('/api/cron/avisos-miembro', '{"solo":"correo"}'::jsonb);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

create or replace function public.fn_avisos_miembro_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user = 'service_role' then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.recipient_user_id is distinct from old.recipient_user_id
     or new.event is distinct from old.event
     or new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.href is distinct from old.href
     or new.idempotency_key is distinct from old.idempotency_key
     or new.email_status is distinct from old.email_status
     or new.created_at is distinct from old.created_at
  then
    raise exception 'member_notices: solo se pueden marcar como leido o descartado';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_avisos_miembro_es_miembro(integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_nombre(uuid) from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_poner(integer, uuid, uuid, text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_tarea() from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_oportunidad() from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_proteger() from public, anon;
grant execute on function public.fn_avisos_miembro_proteger() to authenticated;

drop trigger if exists trg_avisos_miembro_proteger on public.member_notices;
create trigger trg_avisos_miembro_proteger
  before update on public.member_notices
  for each row execute function public.fn_avisos_miembro_proteger();

drop trigger if exists trg_avisos_miembro_tarea on public.tasks;
create trigger trg_avisos_miembro_tarea
  after insert or update of assigned_to, status, completed_at on public.tasks
  for each row execute function public.fn_avisos_miembro_tarea();

drop trigger if exists trg_avisos_miembro_oportunidad on public.opportunities;
create trigger trg_avisos_miembro_oportunidad
  after insert or update of salesperson_id, stage_id on public.opportunities
  for each row execute function public.fn_avisos_miembro_oportunidad();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'member_notices'
  ) then
    alter publication supabase_realtime add table public.member_notices;
  end if;
end $$;

do $$
declare
  j record;
  v_id bigint;
begin
  for j in select jobid from cron.job where jobname = 'avisos-miembro' loop
    perform cron.unschedule(j.jobid);
  end loop;
  v_id := cron.schedule(
    'avisos-miembro',
    '*/5 * * * *',
    $cmd$select public.fn_crm_cron_post('/api/cron/avisos-miembro')$cmd$
  );
end $$;
