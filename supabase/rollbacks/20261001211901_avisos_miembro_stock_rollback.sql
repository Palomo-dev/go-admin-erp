-- Revierte la serie de avisos de cierre, caja, stock y cartera
-- (20261001211353, 20261001211551, 20261001211814, 20261001211901 y 20261001211941).
-- Borra los avisos de esos eventos. No los restaura.
-- La campana y el correo de tareas y de etapa se quedan.

drop trigger if exists trg_avisos_miembro_caja on public.cash_sessions;
drop trigger if exists trg_avisos_miembro_stock on public.stock_levels;

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

drop trigger if exists trg_avisos_miembro_oportunidad on public.opportunities;
create trigger trg_avisos_miembro_oportunidad
  after insert or update of salesperson_id, stage_id on public.opportunities
  for each row execute function public.fn_avisos_miembro_oportunidad();

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

delete from public.member_notices
where event in (
  'oportunidad.ganada', 'oportunidad.perdida', 'oportunidad.contacto',
  'caja.diferencia', 'cartera.resumen', 'inventario.cero', 'inventario.bajo'
);

alter table public.member_notices drop constraint if exists member_notices_event_check;
alter table public.member_notices add constraint member_notices_event_check check (event in (
  'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa',
  'tarea.completada', 'tarea.atrasada', 'tarea.vence',
  'oportunidad.vence', 'oportunidad.atrasada'
));

alter table public.member_notices drop constraint if exists member_notices_entity_check;
alter table public.member_notices add constraint member_notices_entity_check check (
  entity_type in ('task', 'opportunity')
);

drop function if exists public.fn_avisos_miembro_poner(integer, uuid, uuid, text, text, uuid, text, text, text, text, text);
drop function if exists public.fn_avisos_miembro_caja();
drop function if exists public.fn_avisos_miembro_stock();
drop function if exists public.fn_avisos_miembro_stock_cero();
drop function if exists public.fn_avisos_miembro_cartera();
drop function if exists public.fn_avisos_miembro_destinatarios(integer, text);
drop function if exists public.fn_avisos_miembro_puede(integer, uuid, text);
drop function if exists public.fn_avisos_miembro_uuid(text);

alter table public.member_notices drop column if exists subject_key;
