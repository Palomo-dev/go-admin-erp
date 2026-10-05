-- ============================================================================================
-- BORRADOR — NO APLICADO. Website builder V2, etapa 1: estado del sitio, borrador y revisiones
-- (ADR-002 D1, D3, D4, D6 · FASE-02 · FASE-03).
--
-- Antes de aplicar (ver docs/website-builder-v2/ETAPA-1-PROPUESTA.md):
--   1. Renombrar a <timestamp>_v2_sitios_borradores_revisiones.sql y su rollback igual.
--   2. Probar el bloque completo dentro de begin / rollback y correr las verificaciones del final.
--   3. Aplicar SOLO con apply_migration del MCP de Supabase, y commitear .sql + rollback juntos.
--
-- Qué hace (todo aditivo, ninguna tabla existente cambia):
--   - website_site_states: una fila por sitio (organización + sucursal, NULL = sitio principal).
--     Flag de adopción V2, puntero a la revisión publicada, onboarding y dominio principal.
--   - website_site_drafts: el borrador privado del sitio, con versión optimista.
--   - website_site_revisions: snapshots publicados inmutables.
--   - website_publication_outbox: eventos de invalidación que encola cada publicación
--     (verificado por MCP el 2026-10-05: no existe infraestructura de outbox reutilizable).
--   - Permisos website.sites.edit y website.sites.publish (más organization_settings como
--     equivalente para que los administradores actuales no pierdan acceso).
--   - RPC ensure_site_draft, publish_site_revision y set_site_v2_adoption (SECURITY DEFINER,
--     con revoke a anon y public y comprobación de organización y permiso dentro).
--
-- Qué NO hace: no toca website_settings, website_pages, website_page_sections ni menús, no crea
-- políticas anon (la lectura pública es del servidor con service role o, más adelante, de una
-- función que devuelva solo la revisión publicada), no modifica datos de clientes.
--
-- PostgREST: website_site_states y website_site_revisions quedan unidas por DOS FK (la revisión
-- apunta a su sitio y el sitio apunta a su revisión publicada). Cualquier embed entre ambas debe
-- nombrar la FK, por ejemplo website_site_revisions!website_site_revisions_sitio_fk. Ninguna FK
-- nueva duplica una relación existente entre tablas legacy.
-- ============================================================================================

-- ─── Permisos ────────────────────────────────────────────────────────────────────────────────
insert into public.permissions (code, module, name, description, category)
select 'website.sites.edit', 'website', 'Editar sitios web',
       'Crear sitios V2 y guardar su borrador', 'website'
where not exists (select 1 from public.permissions where code = 'website.sites.edit');

insert into public.permissions (code, module, name, description, category)
select 'website.sites.publish', 'website', 'Publicar sitios web',
       'Publicar revisiones y activar o desactivar V2 en un sitio', 'website'
where not exists (select 1 from public.permissions where code = 'website.sites.publish');

-- Comprueba organización y permiso. Mismo patrón que fn_crm_exigir_permiso: el service role
-- (auth.uid() nulo y rol distinto de anon o authenticated) pasa, porque el servidor ya validó
-- la organización con getServerOrgContext. organization_settings cuenta como equivalente.
create or replace function public.fn_website_tiene_permiso(p_org integer, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fn_tiene_permiso(p_org, p_code)
      or public.fn_tiene_permiso(p_org, 'organization_settings');
$$;

revoke all on function public.fn_website_tiene_permiso(integer, text) from public, anon;
grant execute on function public.fn_website_tiene_permiso(integer, text) to authenticated, service_role;

create or replace function public.fn_website_exigir_permiso(p_org integer, p_code text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  if auth.uid() is null then
    return;  -- solo service role llega aquí: fn_assert_acceso_org rechaza anon
  end if;
  if public.fn_website_tiene_permiso(p_org, p_code) then
    return;
  end if;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = jsonb_build_object('permiso', p_code)::text;
end;
$$;

revoke all on function public.fn_website_exigir_permiso(integer, text) from public, anon;
grant execute on function public.fn_website_exigir_permiso(integer, text) to authenticated, service_role;

-- ─── Estado del sitio ────────────────────────────────────────────────────────────────────────
create table if not exists public.website_site_states (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       integer not null references public.organizations(id) on delete cascade,
  branch_id             integer null references public.branches(id) on delete restrict,
  v2_adopted            boolean not null default false,
  v2_adopted_at         timestamptz null,
  published_revision_id uuid null,
  primary_domain_id     uuid null references public.organization_domains(id) on delete set null,
  onboarding            jsonb not null default '{}'::jsonb,
  created_by            uuid null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint website_site_states_org_uk unique (id, organization_id),
  constraint website_site_states_onboarding_objeto check (jsonb_typeof(onboarding) = 'object'),
  constraint website_site_states_onboarding_tamano check (octet_length(onboarding::text) <= 65536),
  constraint website_site_states_adopcion_con_revision
    check (not v2_adopted or published_revision_id is not null)
);

comment on table public.website_site_states is
  'V2: un sitio por organización y sucursal (branch_id NULL = sitio principal). v2_adopted decide si la respuesta pública sale de la revisión publicada o de legacy. Nunca se combinan.';

create unique index if not exists website_site_states_sitio_uk
  on public.website_site_states (organization_id, coalesce(branch_id, -1));

-- La sucursal debe ser de la misma organización: se reutiliza el validador de las tablas legacy.
create or replace trigger trg_website_site_states_branch_org
  before insert or update of branch_id, organization_id on public.website_site_states
  for each row execute function public.validate_branch_belongs_to_org();

-- El dominio principal también debe ser de la organización.
create or replace function public.fn_website_site_states_dominio_org()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.primary_domain_id is not null and not exists (
       select 1 from public.organization_domains d
       where d.id = new.primary_domain_id and d.organization_id = new.organization_id) then
    raise exception 'dominio_de_otra_organizacion' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger trg_website_site_states_dominio_org
  before insert or update on public.website_site_states
  for each row execute function public.fn_website_site_states_dominio_org();

-- ─── Borrador ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.website_site_drafts (
  site_state_id    uuid primary key,
  organization_id  integer not null,
  schema_version   integer not null default 1,
  document         jsonb not null default '{}'::jsonb,
  version          integer not null default 1,
  base_revision_id uuid null,
  updated_by       uuid null default auth.uid(),
  updated_at       timestamptz not null default now(),
  constraint website_site_drafts_sitio_fk foreign key (site_state_id, organization_id)
    references public.website_site_states (id, organization_id) on delete cascade,
  constraint website_site_drafts_documento_objeto check (jsonb_typeof(document) = 'object'),
  constraint website_site_drafts_documento_tamano check (octet_length(document::text) <= 2097152),
  constraint website_site_drafts_version_positiva check (version >= 1),
  constraint website_site_drafts_schema_positivo check (schema_version >= 1)
);

comment on table public.website_site_drafts is
  'V2: borrador privado del sitio. Guardar exige version = anterior + 1 (compare-and-swap). Sin lectura anónima.';

-- Concurrencia optimista: si cambia el documento, la versión sube exactamente en uno. El
-- escritor hace update ... set version = esperada + 1 where version = esperada, y una segunda
-- pestaña con la versión vieja actualiza 0 filas (conflicto visible, F03-01).
create or replace function public.fn_website_site_drafts_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.site_state_id is distinct from old.site_state_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'sitio_inmutable' using errcode = '23514';
  end if;
  if new.document is distinct from old.document or new.schema_version is distinct from old.schema_version then
    if new.version <> old.version + 1 then
      raise exception 'conflicto_version' using errcode = 'P0409',
        detail = jsonb_build_object('esperada', old.version + 1, 'recibida', new.version)::text;
    end if;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  elsif new.version <> old.version then
    raise exception 'version_sin_cambios' using errcode = 'P0409';
  end if;
  return new;
end;
$$;

create or replace trigger trg_website_site_drafts_version
  before update on public.website_site_drafts
  for each row execute function public.fn_website_site_drafts_version();

-- ─── Revisiones ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.website_site_revisions (
  id                   uuid primary key default gen_random_uuid(),
  site_state_id        uuid not null,
  organization_id      integer not null,
  revision_number      integer not null,
  schema_version       integer not null,
  document             jsonb not null,
  source_draft_version integer not null,
  note                 text null,
  published_by         uuid null,
  published_at         timestamptz not null default now(),
  constraint website_site_revisions_sitio_fk foreign key (site_state_id, organization_id)
    references public.website_site_states (id, organization_id) on delete cascade,
  constraint website_site_revisions_numero_uk unique (site_state_id, revision_number),
  constraint website_site_revisions_sitio_uk unique (id, site_state_id),
  constraint website_site_revisions_documento_objeto check (jsonb_typeof(document) = 'object'),
  constraint website_site_revisions_documento_tamano check (octet_length(document::text) <= 2097152),
  constraint website_site_revisions_nota check (note is null or char_length(note) <= 500)
);

comment on table public.website_site_revisions is
  'V2: snapshot publicado e inmutable del sitio. Solo lo escribe publish_site_revision. Restaurar crea un borrador nuevo, nunca edita una revisión.';

create index if not exists website_site_revisions_historial_idx
  on public.website_site_revisions (site_state_id, published_at desc);

create or replace function public.fn_website_site_revisions_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'revision_inmutable' using errcode = '23514';
end;
$$;

create or replace trigger trg_website_site_revisions_inmutable
  before update on public.website_site_revisions
  for each row execute function public.fn_website_site_revisions_inmutable();

-- Puntero a la revisión publicada: la FK compuesta garantiza que la revisión es del mismo sitio.
-- Si la revisión desaparece (solo por cascada del sitio) se anula únicamente el puntero.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'website_site_states_revision_publicada_fk') then
    alter table public.website_site_states
      add constraint website_site_states_revision_publicada_fk
      foreign key (published_revision_id, id)
      references public.website_site_revisions (id, site_state_id)
      on delete set null (published_revision_id);
  end if;
end;
$$;

-- ─── Outbox de invalidación ──────────────────────────────────────────────────────────────────
create table if not exists public.website_publication_outbox (
  id              bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  site_state_id   uuid not null references public.website_site_states(id) on delete cascade,
  revision_id     uuid not null references public.website_site_revisions(id) on delete cascade,
  status          text not null default 'pending',
  attempts        integer not null default 0,
  last_error      text null,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz null,
  constraint website_publication_outbox_estado check (status in ('pending', 'done', 'error')),
  constraint website_publication_outbox_revision_uk unique (revision_id)
);

create index if not exists website_publication_outbox_pendientes_idx
  on public.website_publication_outbox (created_at)
  where status <> 'done';

-- ─── RLS y privilegios ───────────────────────────────────────────────────────────────────────
alter table public.website_site_states        enable row level security;
alter table public.website_site_drafts        enable row level security;
alter table public.website_site_revisions     enable row level security;
alter table public.website_publication_outbox enable row level security;

revoke all on public.website_site_states        from anon, authenticated;
revoke all on public.website_site_drafts        from anon, authenticated;
revoke all on public.website_site_revisions     from anon, authenticated;
revoke all on public.website_publication_outbox from anon, authenticated;

-- Lectura: miembros activos de la organización. Escritura directa: solo onboarding y dominio en
-- el estado, y el documento en el borrador. Punteros, adopción y revisiones van por RPC.
grant select on public.website_site_states    to authenticated;
grant select on public.website_site_drafts    to authenticated;
grant select on public.website_site_revisions to authenticated;
grant update (onboarding, primary_domain_id) on public.website_site_states to authenticated;
grant update (document, schema_version, version) on public.website_site_drafts to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_site_states' and policyname = 'website_site_states_miembros_select') then
    create policy website_site_states_miembros_select on public.website_site_states
    for select to authenticated
    using (exists (select 1 from public.organization_members om
                   where om.organization_id = website_site_states.organization_id
                     and om.user_id = (select auth.uid()) and om.is_active));
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_site_states' and policyname = 'website_site_states_editores_update') then
    create policy website_site_states_editores_update on public.website_site_states
    for update to authenticated
    using (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'))
    with check (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'));
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_site_drafts' and policyname = 'website_site_drafts_miembros_select') then
    create policy website_site_drafts_miembros_select on public.website_site_drafts
    for select to authenticated
    using (exists (select 1 from public.organization_members om
                   where om.organization_id = website_site_drafts.organization_id
                     and om.user_id = (select auth.uid()) and om.is_active));
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_site_drafts' and policyname = 'website_site_drafts_editores_update') then
    create policy website_site_drafts_editores_update on public.website_site_drafts
    for update to authenticated
    using (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'))
    with check (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'));
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_site_revisions' and policyname = 'website_site_revisions_miembros_select') then
    create policy website_site_revisions_miembros_select on public.website_site_revisions
    for select to authenticated
    using (exists (select 1 from public.organization_members om
                   where om.organization_id = website_site_revisions.organization_id
                     and om.user_id = (select auth.uid()) and om.is_active));
  end if;
end;
$$;

-- website_publication_outbox: sin políticas. Solo service role (el despachador) la lee.

-- ─── RPC: crear sitio y borrador (idempotente) ───────────────────────────────────────────────
-- Crea el estado y el borrador inicial en una transacción. Si el sitio ya existe no toca su
-- borrador y devuelve creado = false. El documento lo arma y valida el servidor (importador
-- legacy o plantilla). p_org lo pasa el route handler desde getServerOrgContext, y aquí se
-- vuelve a comprobar contra la sesión.
create or replace function public.ensure_site_draft(
  p_org integer,
  p_branch integer,
  p_document jsonb,
  p_schema_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site uuid;
  v_draft_version integer;
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.edit');
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or coalesce(p_schema_version, 0) < 1
     or (p_document->>'schemaVersion') is distinct from p_schema_version::text then
    raise exception 'documento_invalido' using errcode = 'P0422';
  end if;
  if p_branch is not null and not exists (
       select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sucursal_de_otra_organizacion' using errcode = '42501';
  end if;

  select s.id into v_site
  from public.website_site_states s
  where s.organization_id = p_org and coalesce(s.branch_id, -1) = coalesce(p_branch, -1);

  if found then
    select d.version into v_draft_version from public.website_site_drafts d where d.site_state_id = v_site;
    return jsonb_build_object('site_id', v_site, 'creado', false, 'version', v_draft_version);
  end if;

  insert into public.website_site_states (organization_id, branch_id)
  values (p_org, p_branch)
  on conflict do nothing
  returning id into v_site;

  if v_site is null then
    -- Otra transacción lo creó a la vez: se devuelve el existente sin pisar su borrador.
    select s.id into v_site from public.website_site_states s
    where s.organization_id = p_org and coalesce(s.branch_id, -1) = coalesce(p_branch, -1);
    select d.version into v_draft_version from public.website_site_drafts d where d.site_state_id = v_site;
    return jsonb_build_object('site_id', v_site, 'creado', false, 'version', v_draft_version);
  end if;

  insert into public.website_site_drafts (site_state_id, organization_id, schema_version, document, version)
  values (v_site, p_org, p_schema_version, p_document, 1);

  return jsonb_build_object('site_id', v_site, 'creado', true, 'version', 1);
end;
$$;

revoke all on function public.ensure_site_draft(integer, integer, jsonb, integer) from public, anon;
grant execute on function public.ensure_site_draft(integer, integer, jsonb, integer) to authenticated, service_role;

-- ─── RPC: publicar ───────────────────────────────────────────────────────────────────────────
-- Copia el borrador a una revisión nueva y mueve el puntero, todo en una transacción:
--   - bloquea el estado del sitio (dos publicaciones del mismo sitio se serializan)
--   - valida organización y permiso contra la sesión, nunca contra un parámetro
--   - exige la versión esperada del borrador (409 si otra pestaña guardó después)
--   - idempotente: si la revisión publicada ya es esta misma versión del borrador, la devuelve
--   - encola la invalidación en website_publication_outbox
-- No cambia v2_adopted: publicar un sitio no adoptado deja lo público en legacy (D4).
create or replace function public.publish_site_revision(
  p_site uuid,
  p_expected_version integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.website_site_states%rowtype;
  v_draft public.website_site_drafts%rowtype;
  v_prev  public.website_site_revisions%rowtype;
  v_numero integer;
  v_revision uuid;
  v_publicada timestamptz;
begin
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'nota_invalida' using errcode = '22023';
  end if;

  select * into v_state from public.website_site_states where id = p_site for update;
  if not found then
    raise exception 'sitio_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_website_exigir_permiso(v_state.organization_id, 'website.sites.publish');

  select * into v_draft from public.website_site_drafts where site_state_id = p_site for update;
  if not found then
    raise exception 'borrador_no_encontrado' using errcode = 'P0002';
  end if;
  if p_expected_version is null or v_draft.version <> p_expected_version then
    raise exception 'conflicto_version' using errcode = 'P0409',
      detail = jsonb_build_object('esperada', p_expected_version, 'actual', v_draft.version)::text;
  end if;
  if (v_draft.document->>'schemaVersion') is distinct from v_draft.schema_version::text then
    raise exception 'documento_invalido' using errcode = 'P0422';
  end if;

  if v_state.published_revision_id is not null then
    select * into v_prev from public.website_site_revisions where id = v_state.published_revision_id;
    if v_prev.source_draft_version = v_draft.version and v_prev.document = v_draft.document then
      return jsonb_build_object('revision_id', v_prev.id, 'revision_number', v_prev.revision_number,
                                'published_at', v_prev.published_at, 'idempotente', true);
    end if;
  end if;

  select coalesce(max(r.revision_number), 0) + 1 into v_numero
  from public.website_site_revisions r where r.site_state_id = p_site;

  insert into public.website_site_revisions (
    site_state_id, organization_id, revision_number, schema_version, document,
    source_draft_version, note, published_by)
  values (
    p_site, v_state.organization_id, v_numero, v_draft.schema_version, v_draft.document,
    v_draft.version, nullif(trim(p_note), ''), auth.uid())
  returning id, published_at into v_revision, v_publicada;

  update public.website_site_states set published_revision_id = v_revision where id = p_site;
  update public.website_site_drafts set base_revision_id = v_revision where site_state_id = p_site;

  insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
  values (v_state.organization_id, p_site, v_revision);

  return jsonb_build_object('revision_id', v_revision, 'revision_number', v_numero,
                            'published_at', v_publicada, 'idempotente', false);
end;
$$;

revoke all on function public.publish_site_revision(uuid, integer, text) from public, anon;
grant execute on function public.publish_site_revision(uuid, integer, text) to authenticated, service_role;

-- ─── RPC: adopción explícita (D4) ────────────────────────────────────────────────────────────
-- Activar exige una revisión publicada. Desactivar devuelve el sitio principal a legacy y deja
-- un outlet solo V2 sin respuesta pública (404, ADR-001 §9). No borra borradores ni revisiones.
create or replace function public.set_site_v2_adoption(p_site uuid, p_adopted boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.website_site_states%rowtype;
begin
  select * into v_state from public.website_site_states where id = p_site for update;
  if not found then
    raise exception 'sitio_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_website_exigir_permiso(v_state.organization_id, 'website.sites.publish');
  if p_adopted is null then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_adopted and v_state.published_revision_id is null then
    raise exception 'sin_revision_publicada' using errcode = 'P0422';
  end if;

  update public.website_site_states
     set v2_adopted = p_adopted,
         v2_adopted_at = case when p_adopted then now() else v2_adopted_at end
   where id = p_site;

  if p_adopted is distinct from v_state.v2_adopted then
    insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
    values (v_state.organization_id, p_site, v_state.published_revision_id)
    on conflict (revision_id) do update set status = 'pending', attempts = 0, last_error = null,
      processed_at = null, created_at = now();
  end if;

  return jsonb_build_object('site_id', p_site, 'v2_adopted', p_adopted,
                            'published_revision_id', v_state.published_revision_id);
end;
$$;

revoke all on function public.set_site_v2_adoption(uuid, boolean) from public, anon;
grant execute on function public.set_site_v2_adoption(uuid, boolean) to authenticated, service_role;

-- Funciones de trigger: nadie las llama directamente.
revoke all on function public.fn_website_site_states_dominio_org() from public, anon, authenticated;
revoke all on function public.fn_website_site_drafts_version() from public, anon, authenticated;
revoke all on function public.fn_website_site_revisions_inmutable() from public, anon, authenticated;

-- ─── Verificaciones (correr tras aplicar, dentro del ensayo begin / rollback también) ────────
-- select count(*) from information_schema.tables where table_schema = 'public'
--   and table_name in ('website_site_states','website_site_drafts','website_site_revisions','website_publication_outbox')
--   -- esperado: 4
-- select tablename, policyname, roles from pg_policies where tablename like 'website_site_%'
--   -- esperado: ninguna política para anon
-- select has_table_privilege('anon', 'public.website_site_drafts', 'select')
--   -- esperado: false
-- select proname, prosecdef from pg_proc where proname in
--   ('ensure_site_draft','publish_site_revision','set_site_v2_adoption')
--   -- esperado: 3 filas, prosecdef = true
-- select has_function_privilege('anon', 'public.publish_site_revision(uuid,integer,text)', 'execute')
--   -- esperado: false
-- select count(*) from public.website_settings
--   -- esperado: el mismo conteo que antes de aplicar (91 el 2026-10-05)
