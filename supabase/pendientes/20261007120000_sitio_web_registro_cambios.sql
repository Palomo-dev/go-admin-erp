-- ============================================================================
-- Sitio web · registro de cambios del sitio V2 («Cambios recientes» del Resumen)
-- Figma A/02a: «Editó «Carta destacada» en Inicio · Guardado en borrador»,
-- «Cambió el estilo a …», «Publicó 4 cambios».
--
-- PENDIENTE: no aplicada. Ensayada con un bloque do $$ … raise exception
-- 'ENSAYO_OK' $$ que se deshace solo. Reversión en
-- 20261007120000_sitio_web_registro_cambios_rollback.sql.
--
-- Aditiva: tabla nueva + dos disparadores. No toca filas existentes.
-- - Nadie inserta directo (sin grant de insert/update/delete a authenticated):
--   las filas las escriben los disparadores (security definer) al guardar el
--   borrador (AFTER UPDATE OF document en website_site_drafts) y al publicar
--   (AFTER INSERT en website_site_revisions).
-- - Lectura: miembros activos de la organización (mismo criterio que
--   website_site_revisions).
-- - Volumen acotado: los guardados del mismo autor en el mismo sitio dentro de
--   10 minutos se funden en una sola fila (el editor guarda a menudo).
-- ============================================================================

-- Los disparadores toman un lock sobre website_site_drafts/revisions: si el
-- editor está guardando, mejor fallar rápido que encolar el tráfico.
set lock_timeout = '5s';

create table if not exists public.website_site_change_events (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  site_state_id uuid not null references public.website_site_states(id) on delete cascade,
  tipo text not null check (tipo in ('borrador_guardado', 'publicado', 'restaurado')),
  -- { paginas: [{ id, titulo }], areas: ['tema','identidad',…], revision_number? }
  resumen jsonb not null default '{}'::jsonb check (jsonb_typeof(resumen) = 'object' and pg_column_size(resumen) <= 16384),
  actor uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.website_site_change_events is
  'Registro grueso de cambios del sitio V2 (qué páginas y áreas cambiaron en cada guardado o publicación). Lo escriben disparadores; alimenta «Cambios recientes» del Resumen del módulo Sitio web.';

create index if not exists idx_website_site_change_events_sitio
  on public.website_site_change_events (site_state_id, created_at desc);
create index if not exists idx_website_site_change_events_org
  on public.website_site_change_events (organization_id, created_at desc);

alter table public.website_site_change_events enable row level security;

drop policy if exists website_site_change_events_miembros_select on public.website_site_change_events;
create policy website_site_change_events_miembros_select on public.website_site_change_events
  for select to authenticated
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = website_site_change_events.organization_id
      and om.user_id = (select auth.uid())
      and om.is_active
  ));

revoke all on public.website_site_change_events from anon, authenticated;
grant select on public.website_site_change_events to authenticated;

-- Resumen grueso entre dos documentos: páginas cambiadas (id y título) y áreas globales.
create or replace function public.fn_website_resumen_cambios(p_antes jsonb, p_despues jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with antes as (
    select p->>'id' as id, p as pagina from jsonb_array_elements(coalesce(p_antes->'paginas', '[]'::jsonb)) p
  ), despues as (
    select p->>'id' as id, p->>'titulo' as titulo, p as pagina from jsonb_array_elements(coalesce(p_despues->'paginas', '[]'::jsonb)) p
  ), paginas as (
    select d.id, d.titulo from despues d left join antes a on a.id = d.id
    where a.id is null or a.pagina is distinct from d.pagina
    union all
    select a.id, a.pagina->>'titulo' from antes a left join despues d on d.id = a.id where d.id is null
  )
  select jsonb_build_object(
    'paginas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo)) from (select * from paginas limit 20) x), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(area) from unnest(array['tema', 'identidad', 'seo', 'contenido', 'menus', 'shell']) area
      where (p_antes -> area) is distinct from (p_despues -> area)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.trg_website_draft_registra_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resumen jsonb;
  v_actor uuid := coalesce(new.updated_by, auth.uid());
  v_ultimo uuid;
begin
  if new.document is not distinct from old.document then
    return new;
  end if;
  v_resumen := public.fn_website_resumen_cambios(old.document, new.document);
  if jsonb_array_length(v_resumen->'paginas') = 0 and jsonb_array_length(v_resumen->'areas') = 0 then
    return new;
  end if;

  -- Fundir con el último guardado del mismo autor en los últimos 10 minutos.
  select e.id into v_ultimo
  from public.website_site_change_events e
  where e.site_state_id = new.site_state_id
    and e.tipo = 'borrador_guardado'
    and e.actor is not distinct from v_actor
    and e.updated_at > now() - interval '10 minutes'
  order by e.updated_at desc
  limit 1;

  if v_ultimo is not null then
    update public.website_site_change_events
       set resumen = jsonb_build_object(
             'paginas', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
                 select jsonb_array_elements(resumen->'paginas') x
                 union select jsonb_array_elements(v_resumen->'paginas')) s),
             'areas', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
                 select jsonb_array_elements(resumen->'areas') x
                 union select jsonb_array_elements(v_resumen->'areas')) s)),
           updated_at = now()
     where id = v_ultimo;
  else
    insert into public.website_site_change_events (organization_id, site_state_id, tipo, resumen, actor)
    values (new.organization_id, new.site_state_id, 'borrador_guardado', v_resumen, v_actor);
  end if;
  return new;
end;
$$;

create or replace function public.trg_website_revision_registra_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior jsonb;
begin
  select r.document into v_anterior
  from public.website_site_revisions r
  where r.site_state_id = new.site_state_id and r.revision_number < new.revision_number
  order by r.revision_number desc
  limit 1;

  insert into public.website_site_change_events (organization_id, site_state_id, tipo, resumen, actor, created_at, updated_at)
  values (
    new.organization_id,
    new.site_state_id,
    'publicado',
    public.fn_website_resumen_cambios(coalesce(v_anterior, '{}'::jsonb), new.document)
      || jsonb_build_object('revision_number', new.revision_number),
    coalesce(new.published_by, auth.uid()),
    coalesce(new.published_at, now()),
    coalesce(new.published_at, now())
  );
  return new;
end;
$$;

revoke all on function public.trg_website_draft_registra_cambio() from public, anon, authenticated;
revoke all on function public.trg_website_revision_registra_cambio() from public, anon, authenticated;

drop trigger if exists website_site_drafts_registra_cambio on public.website_site_drafts;
create trigger website_site_drafts_registra_cambio
  after update of document on public.website_site_drafts
  for each row execute function public.trg_website_draft_registra_cambio();

drop trigger if exists website_site_revisions_registra_cambio on public.website_site_revisions;
create trigger website_site_revisions_registra_cambio
  after insert on public.website_site_revisions
  for each row execute function public.trg_website_revision_registra_cambio();
