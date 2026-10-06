-- ⚠️ SIN APLICAR (2026-10-07). Editor del sitio web · «Publicar cambios › Programar»
-- (Figma A/05g y D/05-24: «Programar · Ej.: el lunes antes de abrir»).
--
-- Estado verificado por MCP antes de escribir esto:
-- - No existe tabla ni columna para programar publicaciones (0 objetos).
-- - `publish_site_revision(p_site uuid, p_expected_version int, p_note text)` es SECURITY
--   DEFINER y exige `website.sites.publish` con `fn_website_exigir_permiso` contra auth.uid().
-- - pg_cron 1.6 y pg_net 0.14 están instalados.
-- - website_site_states / drafts / revisions: 0 filas (ningún sitio V2 todavía).
--
-- Qué hace:
-- 1. Tabla `website_site_scheduled_publications` con RLS (lectura: miembros; escribir: permiso
--    `website.sites.publish` de la organización). Una sola pendiente por sitio.
-- 2. `fn_website_ejecutar_programadas()`: publica las vencidas con la MISMA RPC
--    `publish_site_revision` (no hay una segunda lógica de publicación), EN NOMBRE de quien
--    programó: fija `request.jwt.claims` con su id, así `fn_website_exigir_permiso` comprueba
--    que esa persona sigue siendo miembro activo con permiso de publicar. Si el borrador cambió
--    después de programar (versión distinta), la RPC responde `conflicto_version` y la
--    programación queda `fallida` con ese motivo: lo nuevo nunca se publica sin revisarlo.
-- 3. Job de pg_cron cada minuto.
--
-- Nota del ensayo: `drop policy/trigger if exists` sobre la tabla recién creada se queda
-- esperando en este proyecto (más de 60 s); como las tablas son nuevas, no se usan.
--
-- Para activarla: aplicar con `apply_migration`, quitar este aviso, mover el archivo a
-- supabase/migrations/ con su rollback. El editor ya llama a
-- /api/website/v2/sites/[siteId]/programaciones y enciende «Programar» cuando deja de recibir 503.

create table if not exists public.website_site_scheduled_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  site_state_id uuid not null references public.website_site_states(id) on delete cascade,
  expected_version integer not null check (expected_version >= 1),
  note text check (note is null or char_length(note) <= 500),
  run_at timestamptz not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'publicada', 'cancelada', 'fallida')),
  error text,
  revision_id uuid references public.website_site_revisions(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.website_site_scheduled_publications is
  'Publicaciones programadas del borrador V2 (editor del sitio web, «Programar»). Las ejecuta fn_website_ejecutar_programadas con publish_site_revision en nombre de created_by.';

create unique index if not exists idx_website_programadas_una_pendiente
  on public.website_site_scheduled_publications (site_state_id) where status = 'pendiente';
create index if not exists idx_website_programadas_vencen
  on public.website_site_scheduled_publications (run_at) where status = 'pendiente';
create index if not exists idx_website_programadas_org
  on public.website_site_scheduled_publications (organization_id, site_state_id);

-- El sitio debe ser de la misma organización (nada de cruzar tenants por el body).
create or replace function public.fn_website_programada_mismo_tenant()
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

create trigger trg_website_programada_mismo_tenant
  before insert or update of site_state_id, organization_id on public.website_site_scheduled_publications
  for each row execute function public.fn_website_programada_mismo_tenant();

alter table public.website_site_scheduled_publications enable row level security;

create policy website_programadas_miembros_select on public.website_site_scheduled_publications
  for select using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = website_site_scheduled_publications.organization_id
        and om.user_id = (select auth.uid()) and om.is_active
    )
  );

create policy website_programadas_publicar_insert on public.website_site_scheduled_publications
  for insert with check (
    public.fn_website_tiene_permiso(organization_id, 'website.sites.publish')
    and status = 'pendiente'
    and created_by = (select auth.uid())
  );

-- Desde la app solo se cancela una pendiente; el resto de transiciones las hace el job.
create policy website_programadas_publicar_update on public.website_site_scheduled_publications
  for update using (
    public.fn_website_tiene_permiso(organization_id, 'website.sites.publish') and status = 'pendiente'
  ) with check (
    public.fn_website_tiene_permiso(organization_id, 'website.sites.publish') and status in ('pendiente', 'cancelada')
  );

revoke all on public.website_site_scheduled_publications from anon;
grant select, insert, update on public.website_site_scheduled_publications to authenticated;

create or replace function public.fn_website_ejecutar_programadas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila public.website_site_scheduled_publications%rowtype;
  v_resultado jsonb;
  v_hechas integer := 0;
begin
  for v_fila in
    select * from public.website_site_scheduled_publications
    where status = 'pendiente' and run_at <= now()
    order by run_at
    limit 50
    for update skip locked
  loop
    begin
      if v_fila.created_by is null then
        raise exception 'sin_autor' using errcode = '42501';
      end if;
      -- Se publica en nombre de quien programó: la RPC vuelve a comprobar su permiso.
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', v_fila.created_by::text, 'role', 'authenticated')::text,
        true
      );
      v_resultado := public.publish_site_revision(v_fila.site_state_id, v_fila.expected_version, v_fila.note);
      update public.website_site_scheduled_publications
         set status = 'publicada', processed_at = now(), revision_id = (v_resultado ->> 'revision_id')::uuid, error = null
       where id = v_fila.id;
      v_hechas := v_hechas + 1;
    exception when others then
      update public.website_site_scheduled_publications
         set status = 'fallida', processed_at = now(),
             error = case
               when sqlerrm like '%conflicto_version%' then 'conflicto_version'
               when sqlstate = '42501' then 'sin_permiso'
               else left(sqlerrm, 200)
             end
       where id = v_fila.id;
    end;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  return v_hechas;
end;
$$;

revoke all on function public.fn_website_ejecutar_programadas() from public, anon, authenticated;

select cron.schedule(
  'website-publicaciones-programadas',
  '* * * * *',
  $cron$select public.fn_website_ejecutar_programadas()$cron$
);

-- Ensayo 2026-10-07 (execute_sql, bloque do $$ … raise exception 'ENSAYO_OK …' $$, se deshace
-- solo), junto con 20261007150100: tablas, índices, triggers, RLS (4 políticas), grants y job
-- creados sin error; una programación vencida sin autor quedó «fallida:sin_permiso»; un insert
-- con otra organización quedó bloqueado (P0002); cron.schedule registró 1 job.
