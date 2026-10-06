-- ============================================================================
-- Sitio web · Dominios (Figma B/07-01…07-28, nota-código B/07-28)
--
-- PENDIENTE: no aplicada. Ensayada con un bloque do $$ … raise exception
-- 'ENSAYO_OK' $$ que se deshace solo. Reversión en
-- 20261007140000_sitio_web_dominios_rollback.sql.
--
-- DEPENDENCIA: se aplica DESPUÉS de 20261006150200_dominios_verificacion_servidor.sql
-- (P0-8): su disparador obliga a que el estado lo escriba el servidor con
-- service role, que es lo que hacen las rutas /api/sitio-web/dominios/**.
--
-- Aditiva. Columnas nuevas NULL-ables o con DEFAULT; sin DROP ni cambios de
-- tipo. Rellena las columnas nuevas de las filas compradas a partir de lo que
-- ya guardaba `metadata` y enlaza las compras con su dominio por host.
-- Verificado por MCP (solo SELECT) el 2026-10-06: 24 filas en
-- organization_domains (12 system_subdomain, 12 custom_domain, todas
-- verified); 13 compras completed en domain_purchases, todas con su fila de
-- dominio; permissions.code es UNIQUE (permissions_code_key).
--
-- 1. organization_domains: SSL, configuración DNS de la última verificación,
--    registrador (comprado aquí), vencimiento, renovación, último error y sede.
-- 2. domain_purchases: dominio, años, tipo (registro/renovación/transferencia),
--    costo y cobro, customer de Stripe, vencimiento, referencia legible
--    DOM-AAAA-NNNN y estado del reembolso.
-- 3. permissions: website.domains («Dominios del sitio») y website.domains.buy
--    («Comprar dominios»). No se asignan a roles: los administradores ya pasan
--    por hasOrgAdminOrPermission; los demás los reciben por cargo o rol.
-- 4. fn_sitio_web_dominio_principal: cambia el dominio principal en UNA
--    transacción (hoy la ruta hace tres UPDATE seguidos; ver hacerPrincipal).
--
-- Ensayo 2026-10-07 (do/raise, se deshace solo): ENSAYO_OK registrar=12
-- compras_enlazadas=12 permisos=2 referencia=DOM-2026-0001 principal_ok=t
-- estado_ok=t org_ajena_rechazada=t; además una sede de otra organización
-- queda RECHAZADA por el disparador. Hay 13 compras completed pero solo 12
-- enlazan con un dominio de su misma organización (la otra se revisa en la
-- conciliación con Vercel). La reversión no se pudo ensayar por MCP: el
-- servidor retiene para confirmación el SQL con DROP/DELETE.
-- ============================================================================

set lock_timeout = '5s';

-- 1. organization_domains ------------------------------------------------------
alter table public.organization_domains
  add column if not exists ssl_status text null,
  add column if not exists dns_config jsonb not null default '{}'::jsonb,
  add column if not exists misconfigured boolean not null default false,
  add column if not exists registrar text null,
  add column if not exists expires_at timestamptz null,
  add column if not exists auto_renew boolean null,
  add column if not exists renewal_price numeric null,
  add column if not exists renewal_currency text null,
  add column if not exists last_error text null,
  add column if not exists branch_id integer null references public.branches(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_organization_domains_ssl_status') then
    alter table public.organization_domains
      add constraint chk_organization_domains_ssl_status check (ssl_status is null or ssl_status in ('pending', 'issued', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_organization_domains_dns_config') then
    alter table public.organization_domains
      add constraint chk_organization_domains_dns_config check (jsonb_typeof(dns_config) = 'object' and pg_column_size(dns_config) <= 16384);
  end if;
end $$;

comment on column public.organization_domains.ssl_status is 'Certificado HTTPS: pending | issued | failed. Lo escribe la verificación del servidor (Vercel).';
comment on column public.organization_domains.dns_config is 'Registros esperados y encontrados en la última verificación, proveedor detectado y propagación ({vistos,total}).';
comment on column public.organization_domains.misconfigured is 'La última verificación encontró registros que apuntan a otro servidor.';
comment on column public.organization_domains.registrar is 'Registrador cuando el dominio se compró con GO Admin (vercel). NULL = dominio externo.';
comment on column public.organization_domains.expires_at is 'Vencimiento del registro (solo comprados aquí).';
comment on column public.organization_domains.auto_renew is 'Renovación automática en el registrador (solo comprados aquí).';
comment on column public.organization_domains.branch_id is 'Sede a la que pertenece el dominio (Sitio web › Sedes en la web). Debe ser de la misma organización.';

create index if not exists idx_organization_domains_org_branch
  on public.organization_domains (organization_id, branch_id) where branch_id is not null;
create index if not exists idx_organization_domains_vencimiento
  on public.organization_domains (expires_at) where registrar is not null;

-- La sede debe ser de la misma organización que el dominio.
create or replace function public.fn_organization_domains_sede_org()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.branch_id is not null and not exists (
       select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id) then
    raise exception 'dominios: la sede no es de esta organización' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

revoke all on function public.fn_organization_domains_sede_org() from public, anon, authenticated;

drop trigger if exists trg_organization_domains_sede_org on public.organization_domains;
create trigger trg_organization_domains_sede_org
  before insert or update of branch_id, organization_id on public.organization_domains
  for each row execute function public.fn_organization_domains_sede_org();

-- Relleno de los comprados: lo que ya guardaba metadata pasa a sus columnas.
update public.organization_domains d
   set registrar = 'vercel',
       auto_renew = case when d.metadata ? 'auto_renew' then (d.metadata->>'auto_renew')::boolean else d.auto_renew end,
       expires_at = case when (d.metadata->>'expires_at') ~ '^\d{4}-\d{2}-\d{2}' then (d.metadata->>'expires_at')::timestamptz else d.expires_at end,
       branch_id = case when (d.metadata->>'branch_id') ~ '^\d+$'
                         and exists (select 1 from public.branches b where b.id = (d.metadata->>'branch_id')::integer and b.organization_id = d.organization_id)
                        then (d.metadata->>'branch_id')::integer else d.branch_id end
 where d.registrar is null
   and (exists (select 1 from public.domain_purchases p where p.domain = d.host and p.organization_id = d.organization_id and p.status = 'completed')
        or d.metadata->>'purchased_via' in ('vercel', 'vercel_registrar')
        or d.metadata->>'source' = 'vercel_purchase');

-- 2. domain_purchases -----------------------------------------------------------
create sequence if not exists public.domain_purchases_reference_seq;

alter table public.domain_purchases
  add column if not exists domain_id uuid null references public.organization_domains(id) on delete set null,
  add column if not exists years integer not null default 1,
  add column if not exists kind text not null default 'register',
  add column if not exists price_cost numeric null,
  add column if not exists price_charged numeric null,
  add column if not exists stripe_customer_id text null,
  add column if not exists expires_at timestamptz null,
  add column if not exists reference text null,
  add column if not exists refund_status text null,
  add column if not exists refunded_at timestamptz null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_domain_purchases_kind') then
    alter table public.domain_purchases add constraint chk_domain_purchases_kind check (kind in ('register', 'renew', 'transfer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_domain_purchases_years') then
    alter table public.domain_purchases add constraint chk_domain_purchases_years check (years between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_domain_purchases_refund_status') then
    alter table public.domain_purchases add constraint chk_domain_purchases_refund_status check (refund_status is null or refund_status in ('refunded', 'pending_review', 'failed'));
  end if;
end $$;

comment on column public.domain_purchases.reference is 'Referencia legible para soporte (DOM-AAAA-NNNN, Figma B/07-20).';

-- Referencia legible por defecto para las compras nuevas.
create or replace function public.fn_domain_purchases_referencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.reference is null then
    new.reference := 'DOM-' || to_char(coalesce(new.created_at, now()) at time zone 'UTC', 'YYYY') || '-' ||
                     lpad(nextval('public.domain_purchases_reference_seq')::text, 4, '0');
  end if;
  return new;
end;
$fn$;

revoke all on function public.fn_domain_purchases_referencia() from public, anon, authenticated;

drop trigger if exists trg_domain_purchases_referencia on public.domain_purchases;
create trigger trg_domain_purchases_referencia
  before insert on public.domain_purchases
  for each row execute function public.fn_domain_purchases_referencia();

create unique index if not exists idx_domain_purchases_reference on public.domain_purchases (reference) where reference is not null;
create index if not exists idx_domain_purchases_domain_id on public.domain_purchases (domain_id) where domain_id is not null;

-- Enlazar las compras existentes con su dominio (todas lo tienen: verificado).
update public.domain_purchases p
   set domain_id = d.id
  from public.organization_domains d
 where p.domain_id is null
   and d.host = p.domain
   and d.organization_id = p.organization_id;

-- 3. permissions ------------------------------------------------------------------
insert into public.permissions (code, name, description, module, category)
values
  ('website.domains', 'Dominios del sitio', 'Ver, conectar, verificar y quitar los dominios del sitio web', 'website', 'website'),
  ('website.domains.buy', 'Comprar dominios', 'Comprar y renovar dominios con cobro a la tarjeta de la organización', 'website', 'website')
on conflict (code) do nothing;

-- 4. Dominio principal en una transacción ----------------------------------------
-- La llama SOLO el servidor (service role) después de validar la organización
-- de la sesión y el permiso website.domains.
create or replace function public.fn_sitio_web_dominio_principal(p_org integer, p_domain uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tipo text;
begin
  select d.domain_type::text into v_tipo
    from public.organization_domains d
   where d.id = p_domain and d.organization_id = p_org and d.is_active and d.status = 'verified'
   for update;
  if v_tipo is null then
    raise exception 'dominios: el dominio no existe, no es de la organización o no está verificado' using errcode = '22023';
  end if;
  if v_tipo = 'www_alias' then
    raise exception 'dominios: un alias www no puede ser el principal' using errcode = '22023';
  end if;

  update public.organization_domains set is_primary = false
   where organization_id = p_org and is_primary and id <> p_domain;
  update public.organization_domains set is_primary = true
   where organization_id = p_org and id = p_domain;
  update public.website_site_states
     set primary_domain_id = case when v_tipo = 'system_subdomain' then null else p_domain end
   where organization_id = p_org and branch_id is null;
end;
$fn$;

revoke all on function public.fn_sitio_web_dominio_principal(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_sitio_web_dominio_principal(integer, uuid) to service_role;

comment on function public.fn_sitio_web_dominio_principal(integer, uuid) is
  'Sitio web › Dominios: cambia el dominio principal (desmarca el anterior, marca este y fija website_site_states.primary_domain_id) en una transacción. Solo service role.';
