-- Aviso al asignar un lead. Un lead es un cliente en etapa lead, no descartado.
-- El responsable es customers.owner_id. Entra en member_notices y sale por el
-- mismo correo que el resto de avisos al miembro. Sin credenciales.

alter table public.member_notices drop constraint if exists member_notices_event_check;
alter table public.member_notices add constraint member_notices_event_check check (event in (
  'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa',
  'tarea.completada', 'tarea.atrasada', 'tarea.vence',
  'oportunidad.vence', 'oportunidad.atrasada',
  'oportunidad.ganada', 'oportunidad.perdida', 'oportunidad.contacto',
  'caja.diferencia', 'cartera.resumen', 'inventario.cero', 'inventario.bajo',
  'lead.asignado'
));

alter table public.member_notices drop constraint if exists member_notices_entity_check;
alter table public.member_notices add constraint member_notices_entity_check check (
  entity_type in ('task', 'opportunity', 'cash_session', 'digest', 'stock', 'customer')
);

create or replace function public.fn_avisos_miembro_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor text;
  v_nombre text;
  v_id uuid;
begin
  if new.organization_id is null
     or new.lifecycle_stage is distinct from 'lead'
     or new.lead_discarded_at is not null
     or new.owner_id is null
  then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  v_actor_id := auth.uid();
  v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
  v_nombre := nullif(btrim(coalesce(new.full_name, '')), '');
  if v_nombre is null then
    v_nombre := 'Sin nombre';
  end if;

  v_id := public.fn_avisos_miembro_poner(
    new.organization_id, new.owner_id, v_actor_id,
    'lead.asignado', 'customer', new.id,
    'Te asignaron un lead',
    v_actor || ' te asignó el lead «' || v_nombre || '».',
    '/app/crm/leads?lead=' || new.id::text,
    'lead.asignado:' || new.organization_id::text || ':' || new.id::text || ':' || new.owner_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
  );

  if v_id is not null then
    begin
      perform public.fn_crm_cron_post('/api/cron/avisos-miembro', '{"solo":"correo"}'::jsonb);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

comment on function public.fn_avisos_miembro_lead() is
  'Escribe lead.asignado cuando un cliente en etapa lead, sin descartar, recibe o cambia de responsable.';

revoke all on function public.fn_avisos_miembro_lead() from public, anon, authenticated;

drop trigger if exists trg_avisos_miembro_lead on public.customers;
create trigger trg_avisos_miembro_lead
  after insert or update of owner_id on public.customers
  for each row execute function public.fn_avisos_miembro_lead();
