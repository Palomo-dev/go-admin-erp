-- Suscriptores del boletín de los sitios públicos (goadmin-websites).
--
-- Hasta hoy la sección «Boletín» de los sitios le confirmaba al visitante la suscripción sin
-- guardar el correo en ningún lado, y el pie de los sitios con tema ni siquiera mostraba el
-- formulario (BOLETIN_DISPONIBLE = false). Esta tabla es donde se guardan.
--
-- Escritura: SOLO el route handler POST /api/newsletter de goadmin-websites, con la clave de
-- servicio y la organización resuelta desde el dominio (nunca desde el body). No hay política de
-- insert para anon ni para authenticated: la clave pública no puede escribir aquí.
-- Lectura: miembros activos de la organización (el ERP la lista con la sesión del usuario).
create table if not exists public.website_newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  -- En minúsculas (lo normaliza el sitio): así el índice único es por columnas y el upsert del
  -- route handler (`onConflict: 'organization_id,email'`) funciona.
  email text not null check (email = lower(email) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  name text check (name is null or char_length(name) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  birthday date,
  consent boolean not null default false,
  source text not null default 'section' check (source in ('section', 'footer', 'popup')),
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.website_newsletter_subscribers is
  'Correos suscritos al boletín desde el sitio público de cada organización. Escribe solo el route handler del sitio (service role); leen los miembros de la organización.';

-- Un correo por organización: volver a suscribirse actualiza la fila.
create unique index if not exists website_newsletter_subscribers_org_email_uk
  on public.website_newsletter_subscribers (organization_id, email);

create index if not exists website_newsletter_subscribers_org_created_idx
  on public.website_newsletter_subscribers (organization_id, created_at desc);

alter table public.website_newsletter_subscribers enable row level security;

drop policy if exists website_newsletter_subscribers_miembros_select on public.website_newsletter_subscribers;
create policy website_newsletter_subscribers_miembros_select
  on public.website_newsletter_subscribers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = website_newsletter_subscribers.organization_id
        and om.user_id = (select auth.uid())
        and om.is_active
    )
  );

revoke all on table public.website_newsletter_subscribers from anon;
revoke insert, update, delete, truncate on table public.website_newsletter_subscribers from authenticated;
grant select on table public.website_newsletter_subscribers to authenticated;
