-- Rollback de 20261007210403_crm_voz_desinteres_config.sql
--
-- Restaura las dos funciones de avisos tal como estaban antes (cuerpo de
-- pg_get_functiondef del 2026-10-07) y elimina la tabla de configuración.
-- ADVERTENCIA: no conserva datos. La configuración guardada por las
-- organizaciones se pierde; sin la tabla, el agente vuelve al comportamiento
-- anterior (marcar perdida directo, sin excepciones), que es también lo que
-- hace el código cuando no encuentra fila.

begin;

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
$function$;

DROP TABLE IF EXISTS public.crm_voice_disinterest_settings;

commit;
