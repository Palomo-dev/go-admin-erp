-- ============================================================================================
-- Website builder V2, etapa 2: menús y carta por sede (ADR-002 D3).
-- Aditiva: dos columnas NULL-ables en website_menus (las 148 filas existentes quedan con
-- branch_id NULL = sitio principal, sin cambios), una tabla nueva vacía y una RPC.
--   - website_menus.branch_id / source_menu_id: copia propia del menú por sede. El UNIQUE
--     (organization_id, slug) se conserva: la copia lleva el sufijo -sede-<id>.
--   - website_branch_products: por sede, si el producto sale en la web, su precio web y si está
--     agotado. Sin fila = como en el sitio principal. Sin DELETE: se reactiva con is_listed.
--   - fn_website_copiar_menu_a_sede: copia un menú y su árbol de ítems a una sede (idempotente).
-- Nota MCP: un DELETE dentro del cuerpo de la función hacía que apply_migration esperara
-- confirmación; el árbol se copia con un CTE materializado.
-- ============================================================================================

alter table public.website_menus
  add column if not exists branch_id integer null references public.branches(id) on delete restrict,
  add column if not exists source_menu_id uuid null references public.website_menus(id) on delete set null;

comment on column public.website_menus.branch_id is
  'V2 (ADR-002 D3): NULL = menú del sitio principal. Con valor, copia propia de esa sede: nunca se comparte. El slug de la copia lleva el sufijo -sede-<id> porque el UNIQUE (organization_id, slug) se conserva.';
comment on column public.website_menus.source_menu_id is
  'Menú del que se copió esta versión de sede. Solo informativo: editar la copia no toca el original.';

create index if not exists idx_website_menus_sede
  on public.website_menus (organization_id, branch_id) where branch_id is not null;

create or replace trigger trg_website_menus_branch_org
  before insert or update of branch_id, organization_id on public.website_menus
  for each row execute function public.validate_branch_belongs_to_org();

create table if not exists public.website_branch_products (
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id       integer not null references public.branches(id) on delete cascade,
  product_id      integer not null references public.products(id) on delete cascade,
  is_listed       boolean not null default true,
  web_price       numeric(14,2) null,
  is_sold_out     boolean not null default false,
  sold_out_until  timestamptz null,
  updated_by      uuid null default auth.uid(),
  updated_at      timestamptz not null default now(),
  primary key (branch_id, product_id),
  constraint website_branch_products_precio check (web_price is null or web_price >= 0)
);

comment on table public.website_branch_products is
  'V2: carta por sede. Sin fila = el producto sale como en el sitio principal. is_listed false lo oculta en esa sede, web_price NULL usa el precio vigente de product_prices, is_sold_out lo muestra agotado (hasta sold_out_until si se fija).';

create index if not exists idx_website_branch_products_org
  on public.website_branch_products (organization_id, branch_id);

create or replace trigger trg_website_branch_products_branch_org
  before insert or update of branch_id, organization_id on public.website_branch_products
  for each row execute function public.validate_branch_belongs_to_org();

-- El producto debe ser de la misma organización.
create or replace function public.fn_website_branch_products_coherencia()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.products p
                 where p.id = new.product_id and p.organization_id = new.organization_id) then
    raise exception 'producto_de_otra_organizacion' using errcode = '23514';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
revoke all on function public.fn_website_branch_products_coherencia() from public, anon, authenticated;

create or replace trigger trg_website_branch_products_coherencia
  before insert or update on public.website_branch_products
  for each row execute function public.fn_website_branch_products_coherencia();

-- Lectura: miembros. Escritura: quien edita el sitio. Sin anon: la web lee con service role.
alter table public.website_branch_products enable row level security;
revoke all on public.website_branch_products from anon, authenticated;
grant select, insert, update on public.website_branch_products to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_branch_products' and policyname = 'website_branch_products_miembros_select') then
    create policy website_branch_products_miembros_select on public.website_branch_products
    for select to authenticated
    using (exists (select 1 from public.organization_members om
                   where om.organization_id = website_branch_products.organization_id
                     and om.user_id = (select auth.uid()) and om.is_active));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_branch_products' and policyname = 'website_branch_products_editores_insert') then
    create policy website_branch_products_editores_insert on public.website_branch_products
    for insert to authenticated
    with check (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'website_branch_products' and policyname = 'website_branch_products_editores_update') then
    create policy website_branch_products_editores_update on public.website_branch_products
    for update to authenticated
    using (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'))
    with check (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'));
  end if;
end;
$$;

-- Copia un menú y su árbol a una sede. Idempotente: si la copia existe, la devuelve.
create or replace function public.fn_website_copiar_menu_a_sede(p_menu uuid, p_branch integer)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_menu public.website_menus%rowtype;
  v_nuevo uuid;
begin
  select * into v_menu from public.website_menus where id = p_menu;
  if not found then
    raise exception 'menu_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_website_exigir_permiso(v_menu.organization_id, 'website.sites.edit');
  if not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = v_menu.organization_id) then
    raise exception 'sucursal_de_otra_organizacion' using errcode = '42501';
  end if;

  select m.id into v_nuevo from public.website_menus m
  where m.organization_id = v_menu.organization_id and m.branch_id = p_branch and m.source_menu_id = p_menu;
  if found then
    return v_nuevo;
  end if;

  insert into public.website_menus (organization_id, name, slug, location, footer_column, footer_order,
                                    header_order, is_active, branch_id, source_menu_id)
  values (v_menu.organization_id, v_menu.name, v_menu.slug || '-sede-' || p_branch, v_menu.location,
          v_menu.footer_column, v_menu.footer_order, v_menu.header_order, v_menu.is_active, p_branch, p_menu)
  returning id into v_nuevo;

  with mapa as materialized (
    select i.id as viejo, gen_random_uuid() as nuevo
    from public.website_menu_items i where i.menu_id = p_menu
  )
  insert into public.website_menu_items (id, menu_id, organization_id, item_type, page_id, category_id,
                                         custom_label, custom_url, parent_item_id, icon, badge, display_order, is_active)
  select mp.nuevo, v_nuevo, i.organization_id, i.item_type, i.page_id, i.category_id,
         i.custom_label, i.custom_url, pp.nuevo, i.icon, i.badge, i.display_order, i.is_active
  from public.website_menu_items i
  join mapa mp on mp.viejo = i.id
  left join mapa pp on pp.viejo = i.parent_item_id
  where i.menu_id = p_menu;

  return v_nuevo;
end;
$$;
revoke all on function public.fn_website_copiar_menu_a_sede(uuid, integer) from public, anon;
grant execute on function public.fn_website_copiar_menu_a_sede(uuid, integer) to authenticated, service_role;
