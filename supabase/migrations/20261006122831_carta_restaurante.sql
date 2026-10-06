-- ⚠️ SIN APLICAR (2026-10-08). Sitio web › Carta (Figma B/13-01…13-08).
-- Ensayo 2026-10-06 (integrador, execute_sql, do/raise que se deshace solo): tablas, índices,
-- triggers, RLS, product_tags.kind/icon, fn_carta_vigente, get_public_menu y crear_carta (más
-- las columnas de 20261008150200) → crear_carta en una organización de prueba y
-- get_public_menu devolvieron una carta vigente con sus secciones y productos: ENSAYO_OK.
-- Sin ensayar: guardar_carta y reordenar_cartas (el MCP retiene el SQL con «delete from»).
-- Los «drop … if exists» se omitieron en el ensayo (tablas nuevas). No se aplicó.
-- OJO rendimiento: con una organización de 338 categorías raíz la carta por defecto sale con
-- 338 secciones; get_public_menu arma todo en un solo jsonb por llamada.
--
-- Estado verificado por MCP antes de escribir esto:
-- - No existen restaurant_menus, restaurant_menu_sections ni restaurant_menu_items.
-- - product_tags tiene (id, organization_id, name, created_at, color): falta kind/icon.
--   Los productos se etiquetan por product_tag_relations (n:m) y products.tag_id.
-- - Precio vigente: product_branch_prices (sede) y product_prices (general), ambos con
--   effective_from/effective_to. Ajustes web por sede: website_branch_products
--   (is_listed, web_price, is_sold_out, sold_out_until).
-- - Zona horaria: branches.timezone → organizations.timezone → 'America/Bogota'.
--
-- Qué hace (aditivo):
-- 1. Tres tablas con organization_id y RLS por pertenencia (leer: miembros activos;
--    escribir: website.sites.edit). La carta NO tiene precios propios: solo qué
--    categorías salen, en qué orden y cuándo, más las excepciones por producto
--    (destacado, oculto en esta carta, orden).
-- 2. product_tags.kind ('dieta' | 'alergeno' | 'picante' | 'general') e icon.
-- 3. RPC:
--    - crear_carta(p_org, p_nombre, p_icono, p_duplicar_de, p_todas_las_categorias)
--    - guardar_carta(p_menu, p_patch): guarda todo el detalle en un solo lote.
--    - reordenar_cartas(p_org, p_ids)
--    - get_public_menu(p_org, p_branch, p_at): las cartas VIGENTES a esa hora en esa
--      sede, con precio vigente y agotados. La usan el sitio público (goadmin-websites,
--      PR separado) y la vista previa del ERP: una sola regla de vigencia.
--
-- Formato de `schedule`: {"1": [{"from": "07:00", "to": "11:00"}], …, "7": […]} con el
-- día ISO (1 = lunes … 7 = domingo). Un día ausente o con lista vacía = no se muestra.
-- Una franja con to <= from cruza la medianoche.

create table if not exists public.restaurant_menus (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  icon text null check (icon is null or icon in ('desayuno', 'almuerzo', 'cena', 'principal', 'bar', 'postres', 'general')),
  schedule jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule) = 'object'),
  branch_ids integer[] null,
  pdf_url text null check (pdf_url is null or char_length(pdf_url) <= 1000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists public.restaurant_menu_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null,
  menu_id uuid not null,
  category_id integer not null references public.categories(id) on delete cascade,
  sort_order integer not null default 0,
  unique (menu_id, category_id),
  foreign key (menu_id, organization_id) references public.restaurant_menus(id, organization_id) on delete cascade
);

create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null,
  menu_id uuid not null,
  product_id integer not null references public.products(id) on delete cascade,
  is_featured boolean not null default false,
  is_hidden boolean not null default false,
  sort_order integer null,
  unique (menu_id, product_id),
  foreign key (menu_id, organization_id) references public.restaurant_menus(id, organization_id) on delete cascade
);

create index if not exists idx_restaurant_menus_org on public.restaurant_menus (organization_id, sort_order);
create index if not exists idx_restaurant_menu_sections_menu on public.restaurant_menu_sections (menu_id, sort_order);
create index if not exists idx_restaurant_menu_sections_categoria on public.restaurant_menu_sections (category_id);
create index if not exists idx_restaurant_menu_items_menu on public.restaurant_menu_items (menu_id);
create index if not exists idx_restaurant_menu_items_producto on public.restaurant_menu_items (product_id);

comment on table public.restaurant_menus is
  'Cartas del sitio de un restaurante (Sitio web › Carta): nombre, horario por día (schedule), sedes (branch_ids NULL = todas), PDF y orden. Sin precios: salen de Inventario.';
comment on table public.restaurant_menu_sections is 'Categorías del inventario que salen en una carta, con su orden.';
comment on table public.restaurant_menu_items is 'Excepciones por producto en una carta: destacado, oculto en esta carta y orden. Sin precio.';

-- Coherencia de tenant: categoría, producto y sedes de la misma organización.
create or replace function public.fn_carta_mismo_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'restaurant_menus' then
    if new.branch_ids is not null and exists (
      select 1 from unnest(new.branch_ids) b(id)
      where not exists (select 1 from public.branches x where x.id = b.id and x.organization_id = new.organization_id)
    ) then
      raise exception 'sede_no_encontrada' using errcode = 'P0002';
    end if;
    new.updated_at := now();
  elsif tg_table_name = 'restaurant_menu_sections' then
    if not exists (select 1 from public.categories c where c.id = new.category_id and c.organization_id = new.organization_id) then
      raise exception 'categoria_no_encontrada' using errcode = 'P0002';
    end if;
  elsif tg_table_name = 'restaurant_menu_items' then
    if not exists (select 1 from public.products p where p.id = new.product_id and p.organization_id = new.organization_id) then
      raise exception 'producto_no_encontrado' using errcode = 'P0002';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurant_menus_tenant on public.restaurant_menus;
create trigger trg_restaurant_menus_tenant before insert or update on public.restaurant_menus
  for each row execute function public.fn_carta_mismo_tenant();
drop trigger if exists trg_restaurant_menu_sections_tenant on public.restaurant_menu_sections;
create trigger trg_restaurant_menu_sections_tenant before insert or update on public.restaurant_menu_sections
  for each row execute function public.fn_carta_mismo_tenant();
drop trigger if exists trg_restaurant_menu_items_tenant on public.restaurant_menu_items;
create trigger trg_restaurant_menu_items_tenant before insert or update on public.restaurant_menu_items
  for each row execute function public.fn_carta_mismo_tenant();

alter table public.restaurant_menus enable row level security;
alter table public.restaurant_menu_sections enable row level security;
alter table public.restaurant_menu_items enable row level security;

drop policy if exists restaurant_menus_miembros_select on public.restaurant_menus;
create policy restaurant_menus_miembros_select on public.restaurant_menus for select using (
  exists (select 1 from public.organization_members om
          where om.organization_id = restaurant_menus.organization_id and om.user_id = (select auth.uid()) and om.is_active)
);
drop policy if exists restaurant_menus_editar on public.restaurant_menus;
create policy restaurant_menus_editar on public.restaurant_menus for all
  using (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'))
  with check (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'));

drop policy if exists restaurant_menu_sections_miembros_select on public.restaurant_menu_sections;
create policy restaurant_menu_sections_miembros_select on public.restaurant_menu_sections for select using (
  exists (select 1 from public.organization_members om
          where om.organization_id = restaurant_menu_sections.organization_id and om.user_id = (select auth.uid()) and om.is_active)
);
drop policy if exists restaurant_menu_sections_editar on public.restaurant_menu_sections;
create policy restaurant_menu_sections_editar on public.restaurant_menu_sections for all
  using (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'))
  with check (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'));

drop policy if exists restaurant_menu_items_miembros_select on public.restaurant_menu_items;
create policy restaurant_menu_items_miembros_select on public.restaurant_menu_items for select using (
  exists (select 1 from public.organization_members om
          where om.organization_id = restaurant_menu_items.organization_id and om.user_id = (select auth.uid()) and om.is_active)
);
drop policy if exists restaurant_menu_items_editar on public.restaurant_menu_items;
create policy restaurant_menu_items_editar on public.restaurant_menu_items for all
  using (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'))
  with check (public.fn_website_tiene_permiso(organization_id, 'website.sites.edit'));

revoke all on public.restaurant_menus, public.restaurant_menu_sections, public.restaurant_menu_items from anon;
grant select, insert, update, delete on public.restaurant_menus, public.restaurant_menu_sections, public.restaurant_menu_items to authenticated;

-- Etiquetas de dieta y alérgenos (Figma B/13-02 leyenda).
alter table public.product_tags
  add column if not exists kind text null,
  add column if not exists icon text null;
alter table public.product_tags
  add constraint product_tags_kind_valido check (kind is null or kind in ('dieta', 'alergeno', 'picante', 'general')) not valid;
alter table public.product_tags validate constraint product_tags_kind_valido;
comment on column public.product_tags.kind is 'dieta | alergeno | picante | general. La carta del sitio muestra solo dieta, alérgeno y picante.';
comment on column public.product_tags.icon is 'Icono lucide opcional de la etiqueta.';

-- ---------------------------------------------------------------------------
-- ¿La franja del horario cubre este instante local? (día ISO y hora HH:MI)
-- ---------------------------------------------------------------------------
create or replace function public.fn_carta_vigente(p_schedule jsonb, p_dow integer, p_hora text)
returns boolean
language sql
immutable
as $$
  select exists (
    -- Franjas de hoy: normales (from <= h < to) o que cruzan la medianoche (h >= from).
    select 1 from jsonb_array_elements(coalesce(p_schedule -> p_dow::text, '[]'::jsonb)) f
    where case when (f ->> 'to') > (f ->> 'from')
               then p_hora >= (f ->> 'from') and p_hora < (f ->> 'to')
               else p_hora >= (f ->> 'from') end
  ) or exists (
    -- Franjas de ayer que cruzan la medianoche y aún no terminan.
    select 1 from jsonb_array_elements(coalesce(p_schedule -> (case when p_dow = 1 then 7 else p_dow - 1 end)::text, '[]'::jsonb)) f
    where (f ->> 'to') <= (f ->> 'from') and p_hora < (f ->> 'to')
  );
$$;

-- ---------------------------------------------------------------------------
-- get_public_menu: cartas vigentes de una sede a una hora, con productos.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_menu(p_org integer, p_branch integer, p_at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_local timestamp;
  v_dow integer;
  v_hora text;
  v_cartas jsonb;
begin
  select coalesce(nullif(b.timezone, ''), nullif(o.timezone, ''), 'America/Bogota')
    into v_tz
    from public.organizations o
    left join public.branches b on b.id = p_branch and b.organization_id = o.id
   where o.id = p_org;
  if v_tz is null then
    raise exception 'organizacion_no_encontrada' using errcode = 'P0002';
  end if;
  v_local := p_at at time zone v_tz;
  v_dow := extract(isodow from v_local)::integer;
  v_hora := to_char(v_local, 'HH24:MI');

  select coalesce(jsonb_agg(c order by (c ->> 'orden')::int), '[]'::jsonb) into v_cartas
  from (
    select jsonb_build_object(
      'id', m.id, 'nombre', m.name, 'icono', m.icon, 'pdfUrl', m.pdf_url, 'orden', m.sort_order,
      'secciones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'categoriaId', cat.id, 'nombre', cat.name,
          'productos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id, 'nombre', p.name, 'descripcion', p.description,
              'precio', coalesce(wbp.web_price, pbp.price, pp.price),
              'destacado', coalesce(mi.is_featured, false),
              'agotado', coalesce(wbp.is_sold_out and (wbp.sold_out_until is null or wbp.sold_out_until > p_at), false),
              'etiquetas', coalesce((
                select jsonb_agg(jsonb_build_object('nombre', t.name, 'tipo', t.kind, 'color', t.color) order by t.name)
                from public.product_tags t
                where t.organization_id = p_org and t.kind in ('dieta', 'alergeno', 'picante')
                  and (t.id = p.tag_id or exists (select 1 from public.product_tag_relations r where r.product_id = p.id and r.tag_id = t.id))
              ), '[]'::jsonb)
            ) order by mi.sort_order nulls last, p.name)
            from public.products p
            left join public.restaurant_menu_items mi on mi.menu_id = m.id and mi.product_id = p.id
            left join public.website_branch_products wbp on wbp.branch_id = p_branch and wbp.product_id = p.id and wbp.organization_id = p_org
            left join lateral (
              select x.price from public.product_branch_prices x
               where x.product_id = p.id and x.branch_id = p_branch and x.organization_id = p_org
                 and x.effective_from <= p_at and (x.effective_to is null or x.effective_to > p_at)
               order by x.effective_from desc limit 1
            ) pbp on true
            left join lateral (
              select x.price from public.product_prices x
               where x.product_id = p.id and x.effective_from <= p_at and (x.effective_to is null or x.effective_to > p_at)
               order by x.effective_from desc limit 1
            ) pp on true
            where p.organization_id = p_org and p.category_id = cat.id and p.status = 'active' and p.parent_product_id is null
              and coalesce(mi.is_hidden, false) = false
              and coalesce(wbp.is_listed, true) = true
          ), '[]'::jsonb)
        ) order by s.sort_order)
        from public.restaurant_menu_sections s
        join public.categories cat on cat.id = s.category_id and cat.organization_id = p_org
        where s.menu_id = m.id
      ), '[]'::jsonb)
    ) c
    from public.restaurant_menus m
    where m.organization_id = p_org and m.is_active
      and (m.branch_ids is null or p_branch = any (m.branch_ids))
      and public.fn_carta_vigente(m.schedule, v_dow, v_hora)
  ) x;

  return jsonb_build_object('zonaHoraria', v_tz, 'dia', v_dow, 'hora', v_hora, 'cartas', v_cartas);
end;
$$;

revoke all on function public.get_public_menu(integer, integer, timestamptz) from public;
grant execute on function public.get_public_menu(integer, integer, timestamptz) to anon, authenticated, service_role;
comment on function public.get_public_menu(integer, integer, timestamptz) is
  'Cartas vigentes de una sede a una hora (zona de la sede o de la organización), con precio vigente, agotados y etiquetas de dieta. La usan el sitio público y la vista previa del ERP.';

-- ---------------------------------------------------------------------------
-- crear_carta: nueva carta (con todas las categorías raíz o copiando otra).
-- ---------------------------------------------------------------------------
create or replace function public.crear_carta(
  p_org integer, p_nombre text, p_icono text default null, p_duplicar_de uuid default null, p_todas_las_categorias boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_origen public.restaurant_menus%rowtype;
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.edit');
  if p_duplicar_de is not null then
    select * into v_origen from public.restaurant_menus where id = p_duplicar_de and organization_id = p_org;
    if not found then
      raise exception 'carta_no_encontrada' using errcode = 'P0002';
    end if;
  end if;

  insert into public.restaurant_menus (organization_id, name, icon, schedule, branch_ids, pdf_url, sort_order)
  values (
    p_org, btrim(p_nombre), coalesce(p_icono, v_origen.icon),
    coalesce(v_origen.schedule, '{"1":[{"from":"00:00","to":"00:00"}],"2":[{"from":"00:00","to":"00:00"}],"3":[{"from":"00:00","to":"00:00"}],"4":[{"from":"00:00","to":"00:00"}],"5":[{"from":"00:00","to":"00:00"}],"6":[{"from":"00:00","to":"00:00"}],"7":[{"from":"00:00","to":"00:00"}]}'::jsonb),
    v_origen.branch_ids, null,
    coalesce((select max(sort_order) + 1 from public.restaurant_menus where organization_id = p_org), 0)
  )
  returning id into v_id;

  if p_duplicar_de is not null then
    insert into public.restaurant_menu_sections (organization_id, menu_id, category_id, sort_order)
      select p_org, v_id, category_id, sort_order from public.restaurant_menu_sections where menu_id = p_duplicar_de;
    insert into public.restaurant_menu_items (organization_id, menu_id, product_id, is_featured, is_hidden, sort_order)
      select p_org, v_id, product_id, is_featured, is_hidden, sort_order from public.restaurant_menu_items where menu_id = p_duplicar_de;
  elsif p_todas_las_categorias then
    insert into public.restaurant_menu_sections (organization_id, menu_id, category_id, sort_order)
      select p_org, v_id, c.id, row_number() over (order by c.display_order nulls last, c.name)
        from public.categories c
       where c.organization_id = p_org and c.parent_id is null and coalesce(c.is_active, true);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- guardar_carta: el detalle de una carta en un solo lote.
-- p_patch = { name?, icon?, schedule?, branch_ids? (null = todas), pdf_url?, is_active?,
--             secciones?: [{category_id, sort_order}],                (reemplaza)
--             items?: [{product_id, is_featured, is_hidden, sort_order}] } (reemplaza)
-- ---------------------------------------------------------------------------
create or replace function public.guardar_carta(p_menu uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
begin
  select organization_id into v_org from public.restaurant_menus where id = p_menu for update;
  if not found then
    raise exception 'carta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_website_exigir_permiso(v_org, 'website.sites.edit');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'peticion_invalida' using errcode = '22023';
  end if;

  update public.restaurant_menus set
    name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    icon = case when p_patch ? 'icon' then p_patch ->> 'icon' else icon end,
    schedule = case when p_patch ? 'schedule' then p_patch -> 'schedule' else schedule end,
    branch_ids = case when p_patch ? 'branch_ids' then
                   case when jsonb_typeof(p_patch -> 'branch_ids') = 'array'
                        then array(select (jsonb_array_elements_text(p_patch -> 'branch_ids'))::integer)
                        else null end
                 else branch_ids end,
    pdf_url = case when p_patch ? 'pdf_url' then nullif(p_patch ->> 'pdf_url', '') else pdf_url end,
    is_active = case when p_patch ? 'is_active' then (p_patch ->> 'is_active')::boolean else is_active end
  where id = p_menu;

  if p_patch ? 'secciones' then
    delete from public.restaurant_menu_sections s
     where s.menu_id = p_menu
       and not exists (select 1 from jsonb_array_elements(p_patch -> 'secciones') e where (e ->> 'category_id')::integer = s.category_id);
    insert into public.restaurant_menu_sections (organization_id, menu_id, category_id, sort_order)
      select v_org, p_menu, (e ->> 'category_id')::integer, coalesce((e ->> 'sort_order')::integer, 0)
        from jsonb_array_elements(p_patch -> 'secciones') e
    on conflict (menu_id, category_id) do update set sort_order = excluded.sort_order;
  end if;

  if p_patch ? 'items' then
    delete from public.restaurant_menu_items i
     where i.menu_id = p_menu
       and not exists (select 1 from jsonb_array_elements(p_patch -> 'items') e where (e ->> 'product_id')::integer = i.product_id);
    insert into public.restaurant_menu_items (organization_id, menu_id, product_id, is_featured, is_hidden, sort_order)
      select v_org, p_menu, (e ->> 'product_id')::integer,
             coalesce((e ->> 'is_featured')::boolean, false), coalesce((e ->> 'is_hidden')::boolean, false),
             (e ->> 'sort_order')::integer
        from jsonb_array_elements(p_patch -> 'items') e
    on conflict (menu_id, product_id) do update
      set is_featured = excluded.is_featured, is_hidden = excluded.is_hidden, sort_order = excluded.sort_order;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- reordenar_cartas: el orden de la lista decide el de las pestañas del sitio.
-- ---------------------------------------------------------------------------
create or replace function public.reordenar_cartas(p_org integer, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.edit');
  update public.restaurant_menus m
     set sort_order = x.orden - 1
    from unnest(p_ids) with ordinality as x(id, orden)
   where m.id = x.id and m.organization_id = p_org;
end;
$$;

revoke all on function public.crear_carta(integer, text, text, uuid, boolean) from public, anon;
revoke all on function public.guardar_carta(uuid, jsonb) from public, anon;
revoke all on function public.reordenar_cartas(integer, uuid[]) from public, anon;
grant execute on function public.crear_carta(integer, text, text, uuid, boolean) to authenticated, service_role;
grant execute on function public.guardar_carta(uuid, jsonb) to authenticated, service_role;
grant execute on function public.reordenar_cartas(integer, uuid[]) to authenticated, service_role;
