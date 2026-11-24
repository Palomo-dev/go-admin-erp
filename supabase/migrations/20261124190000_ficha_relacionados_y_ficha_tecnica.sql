-- Ficha de producto de la tienda: relacionados elegidos a mano, «Comprados juntos» calculado con
-- las ventas y filas propias de la ficha técnica (Figma «16 Sitio web», sección 2983:72501,
-- aprobada por el dueño el 2026-11-24).
--
-- 1. `product_relations`: productos que el dueño elige a mano para la ficha de un producto, con
--    su orden. `kind = 'related'` alimenta «Productos relacionados» con la fuente «Elegidos a
--    mano»; `kind = 'bought_together'` va primero en «Comprados juntos» (el dueño quiere los dos:
--    lo elegido a mano tiene prioridad y se completa con lo calculado). RLS por pertenencia a la
--    organización; un trigger impide colgar un producto de otra organización.
-- 2. `fn_comprados_juntos`: cuenta, por organización, los productos que salieron en la misma
--    venta (`sales` + `sale_items`, sin anuladas) que el producto de la ficha en los últimos N
--    días. Las variantes cuentan como su padre (la tienda muestra el padre). Acotada: lee como
--    mucho las 500 ventas más recientes que contienen el producto y devuelve como mucho 24 filas.
--    SECURITY INVOKER: la tienda la llama con service role desde el servidor (con caché); un
--    usuario del ERP solo ve sus organizaciones por RLS. Cerrada a anon.
-- 3. `products.specifications`: filas propias de la ficha técnica (`[{ "nombre": "Capacidad",
--    "valor": "251 L" }, ...]`), NULL-able. Se leen con el `select *` de la ficha (sin consulta
--    nueva) y se editan en Inventario › Producto › Tienda.
--
-- Rollback: supabase/rollbacks/20261124190000_ficha_relacionados_y_ficha_tecnica_rollback.sql

-- ── 1. Relacionados elegidos a mano ─────────────────────────────────────────

create table if not exists public.product_relations (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  product_id integer not null references public.products(id) on delete cascade,
  related_product_id integer not null references public.products(id) on delete cascade,
  kind text not null default 'related' check (kind in ('related', 'bought_together')),
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint product_relations_distintos check (product_id <> related_product_id),
  constraint product_relations_unica unique (product_id, related_product_id, kind)
);

create index if not exists product_relations_producto_idx
  on public.product_relations (organization_id, product_id, kind, position);
create index if not exists product_relations_relacionado_idx
  on public.product_relations (related_product_id);

comment on table public.product_relations is
  'Ficha de la tienda: productos elegidos a mano para la ficha de un producto. kind related = «Productos relacionados» (fuente «Elegidos a mano»); bought_together = primero en «Comprados juntos», que se completa con fn_comprados_juntos. position = orden elegido.';

create or replace function public.fn_product_relations_antes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Los dos productos tienen que ser de la organización de la fila.
  if not exists (select 1 from public.products p where p.id = new.product_id and p.organization_id = new.organization_id)
     or not exists (select 1 from public.products p where p.id = new.related_product_id and p.organization_id = new.organization_id) then
    raise exception 'product_relations: el producto no es de la organización' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.fn_product_relations_antes() from public, anon, authenticated;

drop trigger if exists trg_product_relations_antes on public.product_relations;
create trigger trg_product_relations_antes
  before insert or update on public.product_relations
  for each row execute function public.fn_product_relations_antes();

alter table public.product_relations enable row level security;

drop policy if exists product_relations_select on public.product_relations;
create policy product_relations_select on public.product_relations
  for select to authenticated
  using (organization_id = any ((select public.fn_mis_orgs(true))::integer[]));

drop policy if exists product_relations_insert on public.product_relations;
create policy product_relations_insert on public.product_relations
  for insert to authenticated
  with check (organization_id = any ((select public.fn_mis_orgs(false))::integer[]));

drop policy if exists product_relations_update on public.product_relations;
create policy product_relations_update on public.product_relations
  for update to authenticated
  using (organization_id = any ((select public.fn_mis_orgs(false))::integer[]))
  with check (organization_id = any ((select public.fn_mis_orgs(false))::integer[]));

drop policy if exists product_relations_delete on public.product_relations;
create policy product_relations_delete on public.product_relations
  for delete to authenticated
  using (organization_id = any ((select public.fn_mis_orgs(false))::integer[]));

revoke all on table public.product_relations from anon;
grant select, insert, update, delete on table public.product_relations to authenticated;
grant all on table public.product_relations to service_role;

-- ── 2. «Comprados juntos» calculado con las ventas ──────────────────────────

create or replace function public.fn_comprados_juntos(
  p_organization_id integer,
  p_product_id integer,
  p_dias integer default 90,
  p_limite integer default 8
)
returns table (product_id integer, veces integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with objetivo as (
    -- El producto y sus variantes (en la venta sale la variante; la tienda muestra el padre).
    select p.id
      from public.products p
     where p.organization_id = p_organization_id
       and (p.id = p_product_id or p.parent_product_id = p_product_id)
  ),
  ventas as (
    -- Ventas con el producto (índice de sale_items por producto), de la organización y vigentes.
    select s.id
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
     where si.product_id in (select id from objetivo)
       and s.organization_id = p_organization_id
       and s.status <> 'void'
       and s.sale_date >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 365)))
     group by s.id, s.sale_date
     order by s.sale_date desc
     limit 500
  )
  select coalesce(p.parent_product_id, p.id) as product_id,
         count(distinct si.sale_id)::integer as veces
    from ventas v
    join public.sale_items si on si.sale_id = v.id
    join public.products p on p.id = si.product_id
   where p.organization_id = p_organization_id
     and si.product_id not in (select id from objetivo)
     and coalesce(p.parent_product_id, p.id) <> p_product_id
   group by 1
   order by veces desc, 1
   limit greatest(1, least(coalesce(p_limite, 8), 24));
$$;

comment on function public.fn_comprados_juntos(integer, integer, integer, integer) is
  'Ficha de la tienda: productos vendidos en la misma venta que p_product_id (variantes = su padre) en los últimos p_dias, por organización. Acotada a las 500 ventas más recientes con el producto y a 24 filas. La tienda la llama con service role y la cachea.';

revoke all on function public.fn_comprados_juntos(integer, integer, integer, integer) from public, anon;
grant execute on function public.fn_comprados_juntos(integer, integer, integer, integer) to authenticated, service_role;

-- ── 3. Filas propias de la ficha técnica ────────────────────────────────────

alter table public.products add column if not exists specifications jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_specifications_es_lista') then
    alter table public.products
      add constraint products_specifications_es_lista
      check (specifications is null or jsonb_typeof(specifications) = 'array');
  end if;
end;
$$;

comment on column public.products.specifications is
  'Filas propias de la ficha técnica de la tienda: [{"nombre": "...", "valor": "..."}], en orden. NULL = sin filas propias. Se editan en Inventario › Producto › Tienda; la ficha pública las muestra en «Especificaciones».';
