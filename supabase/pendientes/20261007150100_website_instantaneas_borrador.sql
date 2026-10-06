-- ⚠️ SIN APLICAR (2026-10-07). Editor del sitio web · historial de versiones y conflicto.
-- Figma A/05h («Guardado automático · Guardado en borrador» en el historial) y A/05i
-- («Descartar mis cambios y cargar la versión nueva · Tus cambios quedan en el historial como
-- guardado automático»).
--
-- Estado verificado por MCP antes de escribir esto:
-- - Solo existen el borrador único (`website_site_drafts`, una fila por sitio) y las revisiones
--   publicadas (`website_site_revisions`): no hay dónde guardar un borrador anterior.
-- - `website_site_drafts.document` tiene CHECK de objeto jsonb y ≤ 2 MB; aquí se repiten.
-- - 0 filas en las tablas V2 (seguro de crear).
--
-- Qué hace: tabla `website_site_draft_snapshots` con RLS (leer: miembros; crear:
-- `website.sites.edit`), y un trigger que conserva solo las 20 más recientes por sitio.
-- Restaurar una instantánea usa el mismo guardado con compare-and-swap del borrador
-- (`guardarBorrador`), así que no hay una segunda escritura del borrador.
--
-- Nota del ensayo: `drop policy/trigger if exists` sobre la tabla recién creada se queda
-- esperando en este proyecto (más de 60 s); como las tablas son nuevas, no se usan.
--
-- Para activarla: aplicar con `apply_migration`, quitar este aviso y mover el archivo a
-- supabase/migrations/ con su rollback. El editor ya llama a
-- /api/website/v2/sites/[siteId]/instantaneas y las muestra en cuanto deja de recibir 503.

create table if not exists public.website_site_draft_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  site_state_id uuid not null references public.website_site_states(id) on delete cascade,
  version integer not null check (version >= 1),
  document jsonb not null
    check (jsonb_typeof(document) = 'object')
    check (pg_column_size(document) <= 2 * 1024 * 1024),
  reason text not null check (reason in ('autoguardado', 'descartado', 'antes_de_restaurar')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.website_site_draft_snapshots is
  'Instantáneas del borrador V2 («Guardado automático» del historial del editor y copia al descartar en un conflicto). Se conservan las 20 más recientes por sitio.';

create index if not exists idx_website_instantaneas_sitio
  on public.website_site_draft_snapshots (site_state_id, created_at desc);

create or replace function public.fn_website_instantanea_mismo_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.website_site_states s
    where s.id = new.site_state_id and s.organization_id = new.organization_id
  ) then
    raise exception 'sitio_no_encontrado' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create trigger trg_website_instantanea_mismo_tenant
  before insert on public.website_site_draft_snapshots
  for each row execute function public.fn_website_instantanea_mismo_tenant();

-- Retención: deja las 20 más recientes del sitio.
create or replace function public.fn_website_instantaneas_retencion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.website_site_draft_snapshots
  where site_state_id = new.site_state_id
    and id not in (
      select id from public.website_site_draft_snapshots
      where site_state_id = new.site_state_id
      order by created_at desc
      limit 20
    );
  return null;
end;
$$;

create trigger trg_website_instantaneas_retencion
  after insert on public.website_site_draft_snapshots
  for each row execute function public.fn_website_instantaneas_retencion();

alter table public.website_site_draft_snapshots enable row level security;

create policy website_instantaneas_miembros_select on public.website_site_draft_snapshots
  for select using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = website_site_draft_snapshots.organization_id
        and om.user_id = (select auth.uid()) and om.is_active
    )
  );

create policy website_instantaneas_editores_insert on public.website_site_draft_snapshots
  for insert with check (
    public.fn_website_tiene_permiso(organization_id, 'website.sites.edit')
    and created_by = (select auth.uid())
  );

revoke all on public.website_site_draft_snapshots from anon;
grant select, insert on public.website_site_draft_snapshots to authenticated;
