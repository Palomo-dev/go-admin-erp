-- Facturación electrónica como servicio: «Solicitar activación» (lado del cliente).
-- Finanzas R3 · Frente D. Aplicada por el MCP el 2026-11-07 con orden del dueño
-- (docs/POLITICA-MIGRACIONES.md).
--
-- Hoy el botón «Solicitar activación» de Configuración › Facturación electrónica ›
-- Servicio (Figma 1018:89805) está deshabilitado con su motivo: no hay dónde guardar
-- la solicitud. Esta migración la deja registrada (quién y cuándo) para que el equipo
-- de GO Admin la atienda desde la consola de la plataforma (go-admin-super, otra ronda).
--
-- Aditiva: tabla nueva + función. Sin datos de clientes que migrar.
-- Escritura SOLO por la función (SECURITY DEFINER): la organización y el usuario salen
-- de la sesión (auth.uid() + pertenencia), el permiso es administrador o
-- finance.approve, igual que POST /api/factus/config.

create table if not exists public.einvoicing_activation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_proceso', 'atendida', 'rechazada', 'cancelada')),
  notes text,
  resolved_at timestamptz,
  resolved_by uuid
);

comment on table public.einvoicing_activation_requests is
  'Solicitudes de activación del servicio de facturación electrónica de GO Admin, hechas por la organización. Las atiende la plataforma.';

-- Una sola solicitud abierta por organización.
create unique index if not exists uq_einvoicing_activation_requests_abierta
  on public.einvoicing_activation_requests (organization_id)
  where status in ('pendiente', 'en_proceso');

alter table public.einvoicing_activation_requests enable row level security;

-- Lectura para los miembros de la organización (la pantalla muestra «Solicitud: enviada el …»).
drop policy if exists einvoicing_activation_requests_select_miembros on public.einvoicing_activation_requests;
create policy einvoicing_activation_requests_select_miembros
  on public.einvoicing_activation_requests
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

revoke insert, update, delete, truncate, references, trigger on public.einvoicing_activation_requests from anon, authenticated;
revoke all on public.einvoicing_activation_requests from anon;

-- Crear la solicitud. Idempotente: si ya hay una abierta, la devuelve.
create or replace function public.fn_fe_solicitar_activacion(p_organization_id integer, p_notas text default null)
returns public.einvoicing_activation_requests
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_fila public.einvoicing_activation_requests;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.approve')
    or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')
  ) then
    raise exception 'Sin permiso para solicitar la activación' using errcode = '42501';
  end if;

  select * into v_fila
  from public.einvoicing_activation_requests
  where organization_id = p_organization_id and status in ('pendiente', 'en_proceso')
  limit 1;
  if found then
    return v_fila;
  end if;

  insert into public.einvoicing_activation_requests (organization_id, requested_by, notes)
  values (p_organization_id, auth.uid(), nullif(left(coalesce(p_notas, ''), 1000), ''))
  returning * into v_fila;
  return v_fila;
end;
$$;

revoke all on function public.fn_fe_solicitar_activacion(integer, text) from public, anon;
grant execute on function public.fn_fe_solicitar_activacion(integer, text) to authenticated;
