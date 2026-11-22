-- Favoritos de la tienda (Figma «16 Sitio web» 2762:61067, aprobado por el dueño el 2026-11-22).
--
-- Hasta hoy los favoritos con sesión vivían en customers.metadata.favorites (lista de ids). Para
-- ordenar por «Recientes», saber si un producto «Bajó de precio» (precio al guardar) y compartir la
-- lista con un enlace corto hacen falta dos tablas:
--
-- 1. store_favorites: un favorito por (organización, cliente, producto, variante). variant_id
--    admite NULL (favorito del producto, no de una variante): el índice único usa
--    NULLS NOT DISTINCT (Postgres 15+; el proyecto está en 17) para que el NULL sí deduplique.
-- 2. store_favorite_lists: «Compartir lista» con enlace corto (/favoritos?lista=<token>). El token
--    es aleatorio, la lista caduca a los 90 días y guarda solo ids de productos.
--
-- Quién escribe: la tienda (goadmin-websites), con service role, DESPUÉS de resolver la
-- organización por el host y el cliente por la sesión de la tienda (auth.uid() → customers de esa
-- organización). Nunca con la organización del body. Por eso no hay políticas de escritura: anon
-- y authenticated no escriben; los miembros activos de la organización solo leen (CRM, reportes).
--
-- Datos: copia idempotente de customers.metadata.favorites a store_favorites (solo ids numéricos
-- de productos que existen en la misma organización), con el precio vigente de product_prices
-- (effective_to IS NULL, el de mayor id: la misma regla de la tienda, lib/get-current-price.ts).
-- metadata NO se borra: la tienda la lee de respaldo mientras tanto.
-- Verificado por MCP (taqjemqjtumhwptchcxk, 2026-11-22): customers.id uuid, organization_id int,
-- metadata jsonb; products.id int, parent_product_id int (las variantes son productos hijos, no
-- hay tabla product_variants); product_prices(product_id, price, effective_to, id). 0 clientes con
-- metadata.favorites hoy.

create table if not exists public.store_favorites (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  product_id integer not null references public.products (id) on delete cascade,
  variant_id integer null references public.products (id) on delete cascade,
  price_at_save numeric null check (price_at_save is null or price_at_save >= 0),
  created_at timestamptz not null default now()
);

comment on table public.store_favorites is
  'Favoritos de la tienda pública por cliente con sesión. Escribe la tienda con service role tras validar host y sesión; miembros de la organización solo leen.';
comment on column public.store_favorites.variant_id is
  'Variante (producto hijo) guardada; NULL = el producto. El índice único usa NULLS NOT DISTINCT.';
comment on column public.store_favorites.price_at_save is
  'Precio vigente (product_prices) al guardar: permite mostrar «Bajó de precio».';

create unique index if not exists store_favorites_unico
  on public.store_favorites (organization_id, customer_id, product_id, variant_id) nulls not distinct;
create index if not exists store_favorites_cliente_reciente
  on public.store_favorites (customer_id, created_at desc);
create index if not exists store_favorites_producto
  on public.store_favorites (product_id);
create index if not exists store_favorites_variante
  on public.store_favorites (variant_id) where variant_id is not null;

create table if not exists public.store_favorite_lists (
  id bigint generated always as identity primary key,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{12,32}$'),
  organization_id integer not null references public.organizations (id) on delete cascade,
  customer_id uuid null references public.customers (id) on delete set null,
  product_ids integer[] not null check (cardinality(product_ids) between 1 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

comment on table public.store_favorite_lists is
  'Listas de favoritos compartidas (enlace corto /favoritos?lista=<token>). Solo ids de productos; caduca a los 90 días.';

create index if not exists store_favorite_lists_organizacion
  on public.store_favorite_lists (organization_id, created_at desc);
create index if not exists store_favorite_lists_caducidad
  on public.store_favorite_lists (expires_at);
create index if not exists store_favorite_lists_cliente
  on public.store_favorite_lists (customer_id) where customer_id is not null;

-- RLS: sin políticas de escritura (solo service role). Lectura para miembros activos.
alter table public.store_favorites enable row level security;
alter table public.store_favorite_lists enable row level security;

revoke all on public.store_favorites from anon;
revoke all on public.store_favorite_lists from anon;
revoke insert, update, delete, truncate on public.store_favorites from authenticated;
revoke insert, update, delete, truncate on public.store_favorite_lists from authenticated;
grant select on public.store_favorites to authenticated;
grant select on public.store_favorite_lists to authenticated;

drop policy if exists store_favorites_miembros_leen on public.store_favorites;
create policy store_favorites_miembros_leen on public.store_favorites
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active is not false
    )
  );

drop policy if exists store_favorite_lists_miembros_leen on public.store_favorite_lists;
create policy store_favorite_lists_miembros_leen on public.store_favorite_lists
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active is not false
    )
  );

-- Copia de customers.metadata.favorites (idempotente: el índice único descarta lo repetido).
insert into public.store_favorites (organization_id, customer_id, product_id, price_at_save)
select
  c.organization_id,
  c.id,
  p.id,
  (
    select pp.price
    from public.product_prices pp
    where pp.product_id = p.id and pp.effective_to is null
    order by pp.id desc
    limit 1
  )
from public.customers c
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(c.metadata -> 'favorites') = 'array' then c.metadata -> 'favorites' else '[]'::jsonb end
) as e (valor)
join public.products p
  on p.id = case when e.valor ~ '^[0-9]{1,9}$' then e.valor::integer end
 and p.organization_id = c.organization_id
where c.organization_id is not null
on conflict do nothing;


-- Verificación (después de aplicar):
--   select count(*) from public.store_favorites;                       -- = ids válidos de metadata
--   select indexdef from pg_indexes where indexname = 'store_favorites_unico';  -- «NULLS NOT DISTINCT»
--   select relrowsecurity from pg_class where oid = 'public.store_favorites'::regclass;  -- true
--   set role anon; select * from public.store_favorites limit 1;        -- permission denied
