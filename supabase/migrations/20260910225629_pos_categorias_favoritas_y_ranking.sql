-- ============================================================
-- POS: categorías favoritas y ranking por uso
-- ============================================================
-- Los productos del POS ya tienen estrella de favorito (product_favorites) y
-- badge "Top" por ventas de 90 días (pos_product_ranking). Esta migración da
-- a las categorías el mismo mecanismo, calcado del de productos:
--   · `category_favorites`      — favoritos por organización
--   · `pos_category_ranking()`  — favorito + unidades vendidas en 90 días
--
-- SEGURIDAD — dos cosas que el mecanismo de productos NO hace y aquí sí:
--   1. La RPC comprueba que quien llama es miembro activo de la organización.
--      `pos_product_ranking` es SECURITY DEFINER, recibe `p_org_id` y no lo
--      comprueba: cualquiera con la clave anon puede leer favoritos y ventas
--      de cualquier organización. Ese agujero queda anotado para cerrarlo
--      aparte; aquí no se replica.
--   2. `anon` no tiene ningún privilegio ni sobre la tabla ni sobre la RPC.
--
-- RENDIMIENTO: la política RLS usa la forma `IN (SELECT ...)` con
-- `(select auth.uid())`, que el planner hashea y evalúa una vez. No `EXISTS`
-- anidado (ver el timeout de product_images del 2026-09-10).
-- ============================================================

begin;

set local lock_timeout = '3s';

-- ------------------------------------------------------------
-- Tabla de favoritos, espejo de product_favorites
-- ------------------------------------------------------------
create table if not exists public.category_favorites (
  id              bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  category_id     integer not null references public.categories(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint category_favorites_org_category_key unique (organization_id, category_id)
);

create index if not exists idx_category_favorites_org
  on public.category_favorites (organization_id);

alter table public.category_favorites enable row level security;

drop policy if exists category_favorites_miembros on public.category_favorites;
create policy category_favorites_miembros on public.category_favorites
  for all
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

revoke all on public.category_favorites from anon, public;
grant select, insert, delete on public.category_favorites to authenticated;
grant all on public.category_favorites to service_role;

-- ------------------------------------------------------------
-- Ranking: favorito primero, luego unidades vendidas en 90 días.
-- Las ventas de una categoría son las de sus productos (sale_items →
-- products.category_id); las variantes cuentan para la categoría del padre.
-- ------------------------------------------------------------
create or replace function public.pos_category_ranking(p_org_id integer)
returns table (
  category_id     integer,
  is_favorite     boolean,
  sales_count_90d bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventana timestamptz := now() - interval '90 days';
begin
  -- Guarda de pertenencia. Afirmación positiva incondicional: con `anon`
  -- auth.uid() es NULL y el EXISTS falla cerrado (no se salta como en la
  -- forma `IF auth.uid() IS NOT NULL AND NOT EXISTS`).
  if not exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = p_org_id
      and om.is_active
  ) then
    raise exception 'No perteneces a esta organización'
      using errcode = '42501';
  end if;

  return query
  with ventas as (
    select
      coalesce(padre.category_id, p.category_id) as category_id,
      sum(si.quantity)::bigint                    as unidades
    from public.sale_items si
    join public.sales s        on s.id = si.sale_id
    join public.products p     on p.id = si.product_id
    left join public.products padre on padre.id = p.parent_product_id
    where s.organization_id = p_org_id
      and s.status <> 'cancelled'
      and si.created_at >= v_ventana
    group by 1
  )
  select
    c.id                                  as category_id,
    (cf.category_id is not null)          as is_favorite,
    coalesce(v.unidades, 0)::bigint       as sales_count_90d
  from public.categories c
  left join public.category_favorites cf
    on cf.category_id = c.id and cf.organization_id = c.organization_id
  left join ventas v on v.category_id = c.id
  where c.organization_id = p_org_id;
end;
$$;

revoke execute on function public.pos_category_ranking(integer) from public, anon;
grant  execute on function public.pos_category_ranking(integer) to authenticated, service_role;

commit;
