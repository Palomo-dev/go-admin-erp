-- Avisos siguientes: cierre de oportunidad, seguimiento, caja con diferencia,
-- cartera de la mañana y stock (variante o producto simple, no el padre).
-- Sigue en member_notices. Caja, producto y sucursal son enteros: subject_key
-- guarda esa identidad y entity_id es un uuid derivado de la llave.
-- Sin credenciales.

alter table public.member_notices
  add column if not exists subject_key text;

comment on column public.member_notices.subject_key is
  'Identidad cuando la entidad no es uuid: cash_session:{id}, stock:{producto}:{sucursal} o el día del resumen.';

alter table public.member_notices drop constraint if exists member_notices_event_check;
alter table public.member_notices add constraint member_notices_event_check check (event in (
  'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa',
  'tarea.completada', 'tarea.atrasada', 'tarea.vence',
  'oportunidad.vence', 'oportunidad.atrasada',
  'oportunidad.ganada', 'oportunidad.perdida', 'oportunidad.contacto',
  'caja.diferencia', 'cartera.resumen', 'inventario.cero', 'inventario.bajo'
));

alter table public.member_notices drop constraint if exists member_notices_entity_check;
alter table public.member_notices add constraint member_notices_entity_check check (
  entity_type in ('task', 'opportunity', 'cash_session', 'digest', 'stock')
);

create or replace function public.fn_avisos_miembro_uuid(p_key text)
returns uuid
language sql
immutable
as $$
  select (
    substr(md5(p_key), 1, 8) || '-' ||
    substr(md5(p_key), 9, 4) || '-' ||
    substr(md5(p_key), 13, 4) || '-' ||
    substr(md5(p_key), 17, 4) || '-' ||
    substr(md5(p_key), 21, 12)
  )::uuid;
$$;

create or replace function public.fn_avisos_miembro_puede(p_org integer, p_user uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and exists (
       select 1
       from public.organization_members om
       where om.user_id = p_user
         and om.organization_id = p_org
         and om.is_active = true
         and (
           coalesce(om.is_super_admin, false)
           or om.role_id in (1, 2)
           or public.check_user_permission(p_user, p_org, p_code)
           or public.check_user_permission(p_user, p_org, 'admin.full_access')
         )
     );
$$;

comment on function public.fn_avisos_miembro_puede(integer, uuid, text) is
  'Mismo criterio que fn_caja_puede, para un miembro concreto: administración o el permiso. No usa el nombre del rol.';

create or replace function public.fn_avisos_miembro_destinatarios(p_org integer, p_code text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select om.user_id
  from public.organization_members om
  where om.organization_id = p_org
    and om.is_active = true
    and public.fn_avisos_miembro_puede(p_org, om.user_id, p_code);
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
  p_key text,
  p_subject_key text
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
    title, body, href, idempotency_key, subject_key
  ) values (
    p_org, p_recipient, p_event, p_entity_type, p_entity_id,
    p_title, p_body, p_href, p_key, p_subject_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;
