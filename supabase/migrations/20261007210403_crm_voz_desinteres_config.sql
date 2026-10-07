-- CRM · agente de voz: qué hacer ante el desinterés definitivo (por organización)
--
-- Decisión del dueño (2026-10-07). Hasta hoy, ante el desinterés definitivo en
-- una llamada de venta (dos «no», sin baja) el agente marcaba la oportunidad
-- perdida directo. Ahora cada organización elige:
--   mode = 'mark_lost' (por defecto, el comportamiento anterior)
--        | 'task_only' (solo tarea al vendedor)
--        | 'log_only'  (no hace nada: solo queda la objeción en la actividad)
-- con dos excepciones opcionales que, al cumplirse, cambian «perdida» por
-- «tarea»: valor de la oportunidad >= monto (en su moneda) y etapa avanzada
-- (desde `advanced_stage_id` en adelante, en el pipeline de esa etapa).
-- Sin fila = 'mark_lost' sin excepciones (comportamiento anterior intacto).
--
-- Escritura: miembros con `crm.stages.manage` (o administradores, vía
-- fn_crm_tiene_permiso) — el mismo permiso que configura la política de la
-- etapa (`stage_agents.action_policy`). Lectura: miembros de la organización.
-- El route handler valida además en el servidor (defensa en profundidad).
--
-- Además, los avisos genéricos de cierre y de tarea asignada se omiten cuando
-- los produce el agente de voz (sin usuario), porque el agente emite su propio
-- aviso con motivo, resumen y enlaces. Cambio aditivo: sin columnas nuevas en
-- tablas existentes.

create table if not exists public.crm_voice_disinterest_settings (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  mode text not null default 'mark_lost',
  value_exception_enabled boolean not null default false,
  value_threshold numeric(18,2),
  value_currency character(3),
  stage_exception_enabled boolean not null default false,
  advanced_stage_id uuid references public.stages(id) on delete set null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_voice_disinterest_mode_check check (mode in ('mark_lost', 'task_only', 'log_only')),
  constraint crm_voice_disinterest_threshold_check check (value_threshold is null or value_threshold >= 0),
  constraint crm_voice_disinterest_currency_check check (value_currency is null or value_currency ~ '^[A-Z]{3}$'),
  constraint crm_voice_disinterest_value_complete check (not value_exception_enabled or (value_threshold is not null and value_currency is not null)),
  constraint crm_voice_disinterest_stage_complete check (not stage_exception_enabled or advanced_stage_id is not null)
);

comment on table public.crm_voice_disinterest_settings is
  'Qué hace el agente de voz del CRM ante el desinterés definitivo en una llamada de venta. Una fila por organización; sin fila = marcar perdida directo, sin excepciones.';
comment on column public.crm_voice_disinterest_settings.mode is
  'mark_lost: marca perdida (por defecto) · task_only: solo tarea al vendedor · log_only: solo registra la objeción.';
comment on column public.crm_voice_disinterest_settings.value_threshold is
  'Excepción por valor: si la oportunidad vale >= este monto (convertido a value_currency con exchange_rates de la organización), se deja tarea en vez de marcar perdida.';
comment on column public.crm_voice_disinterest_settings.advanced_stage_id is
  'Excepción por etapa: desde esta etapa (por position) en adelante, en su pipeline, se deja tarea en vez de marcar perdida.';

create index if not exists crm_voice_disinterest_settings_stage_idx
  on public.crm_voice_disinterest_settings (advanced_stage_id) where advanced_stage_id is not null;

alter table public.crm_voice_disinterest_settings enable row level security;

revoke all on public.crm_voice_disinterest_settings from anon;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_voice_disinterest_settings' and policyname = 'crm_voice_disinterest_select') then
    create policy crm_voice_disinterest_select on public.crm_voice_disinterest_settings
      for select to authenticated
      using (public.user_belongs_to_organization((select auth.uid()), organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_voice_disinterest_settings' and policyname = 'crm_voice_disinterest_insert') then
    create policy crm_voice_disinterest_insert on public.crm_voice_disinterest_settings
      for insert to authenticated
      with check (
        public.user_belongs_to_organization((select auth.uid()), organization_id)
        and public.fn_crm_tiene_permiso(organization_id, 'crm.stages.manage')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_voice_disinterest_settings' and policyname = 'crm_voice_disinterest_update') then
    create policy crm_voice_disinterest_update on public.crm_voice_disinterest_settings
      for update to authenticated
      using (
        public.user_belongs_to_organization((select auth.uid()), organization_id)
        and public.fn_crm_tiene_permiso(organization_id, 'crm.stages.manage')
      )
      with check (
        public.user_belongs_to_organization((select auth.uid()), organization_id)
        and public.fn_crm_tiene_permiso(organization_id, 'crm.stages.manage')
      );
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.fn_avisos_miembro_oportunidad()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid;
  v_actor text;
  v_etapa text;
  v_id uuid;
  v_aviso boolean := false;
  v_titulo text;
  v_cuerpo text;
  v_evento text;
  v_motivo text;
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

  if tg_op = 'UPDATE'
     and new.stage_id is distinct from old.stage_id
     and new.salesperson_id is not null
     and not (new.status is distinct from old.status and new.status in ('won', 'lost'))
  then
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

  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('won', 'lost')
     and new.salesperson_id is not null
     -- Cierre del agente de voz (service role, sin usuario) que trae su propio
     -- aviso con motivo, resumen y enlaces (voiceAgent/perdidaPorDesinteres.ts):
     -- no se duplica con el genérico «Alguien de la organización cerró…».
     and not (
       auth.uid() is null
       and new.status = 'lost'
       and (new.metadata -> 'cierre_agente_voz') is not null
       and (new.metadata -> 'cierre_agente_voz') is distinct from (old.metadata -> 'cierre_agente_voz')
     )
     and exists (
       select 1 from public.organization_modules m
       where m.organization_id = new.organization_id
         and m.module_code = 'crm'
         and m.is_active = true
     )
  then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    if new.status = 'won' then
      v_evento := 'oportunidad.ganada';
      v_titulo := 'Se ganó la oportunidad';
      v_cuerpo := v_actor || ' cerró como ganada la oportunidad «' || new.name || '».';
    else
      v_evento := 'oportunidad.perdida';
      v_titulo := 'Se perdió la oportunidad';
      v_cuerpo := v_actor || ' cerró como perdida la oportunidad «' || new.name || '».';
      v_motivo := nullif(btrim(coalesce(new.loss_reason, '')), '');
      if v_motivo is not null then
        v_cuerpo := v_cuerpo || ' Motivo: ' || v_motivo || '.';
      end if;
    end if;
    if new.amount is not null and nullif(btrim(coalesce(new.currency, '')), '') is not null then
      v_cuerpo := v_cuerpo || ' Importe: ' || trim(to_char(new.amount, 'FM999999999990.00')) || ' ' || upper(btrim(new.currency)) || '.';
    end if;
    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.salesperson_id, v_actor_id,
      v_evento, 'opportunity', new.id,
      v_titulo, v_cuerpo,
      '/app/crm/oportunidades/' || new.id::text,
      v_evento || ':' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_miembro_tarea()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid;
  v_actor text;
  v_dest uuid;
  v_id uuid;
  v_aviso boolean := false;
begin
  if tg_op = 'INSERT' then
    -- La tarea que deja el agente de voz ante el desinterés definitivo lleva su
    -- propio aviso (motivo, resumen y enlaces): sin el genérico de asignación.
    if new.assigned_to is not null
       and not (auth.uid() is null and 'agente_voz_desinteres' = any(coalesce(new.tags, '{}'::text[])))
    then
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
$function$;
