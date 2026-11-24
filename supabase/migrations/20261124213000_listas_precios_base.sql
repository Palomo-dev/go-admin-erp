-- Listas de precios por cliente — FASE 1, base (Figma «05 POS y ventas», sección ERP 3018:198730,
-- aprobada por el dueño el 2026-11-24; lámina 10 «Qué falta en la base», 3024:201473).
-- Aplicada con apply_migration (MCP). Todo aditivo: tablas nuevas con organization_id y RLS por
-- pertenencia; columnas nuevas NULL-ables o con DEFAULT.
--
--   1. price_lists               la lista: vigencia (fechas de la organización), regla general en %,
--                                redondeo, canales (POS, tienda web, cotizaciones y facturas), sedes y
--                                orden (gana la primera cuando un cliente está en dos grupos con lista).
--   2. price_list_rules          excepciones por categoría o marca (products.brand es texto): % propio o
--                                «sin descuento» (paga el precio normal).
--   3. price_list_items          precio fijo por producto, con escalones (min_qty).
--   4. price_list_assignments    cliente uno a uno (gana sobre el grupo) o grupo del CRM (segments).
--                                Una fila de cliente con price_list_id NULL = «sin lista» explícito
--                                (lo quitaron de la lista aunque siga en el grupo del CRM).
--   5. promotions.applies_with_price_lists (default true): false = el cliente con lista no la recibe y
--      paga su precio de lista (decisión 1 del dueño).
--   6. price_list_id / list_base_price en sales, sale_items, quotations, quotation_items e
--      invoice_items (en la factura solo price_list_id: a la DIAN va el precio de la lista como
--      unitario, decisión 4).
--   7. Permisos: pos.listas_precios.gestionar y pos.precios.cambiar_en_venta («Usar precio normal»).
--   8. El cálculo, en UN lugar:
--        fn_lista_precios_del_cliente   qué lista rige para un cliente (canal, sede, fecha).
--        fn_lista_precios_resolver      precio normal, escalones y regla de una lista para N productos.
--        fn_lista_precio_linea          precio de lista de una línea (producto + cantidad).
--        resolve_customer_prices        RPC pública (POS, cotizaciones, facturas y, en la fase 2, la
--                                       tienda con la sesión del cliente). SECURITY DEFINER con guarda
--                                       de pertenencia; cerrada a anon.
--      Las promociones se calculan DESPUÉS, sobre el precio que devuelve.
--
-- Idempotente. Rollback: supabase/rollbacks/20261124213000_listas_precios_base_rollback.sql

set lock_timeout = '10s';

-- ── 1. price_lists ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  name text not null,
  currency_code text null,
  effective_from date not null default current_date,
  effective_to date null,
  is_active boolean not null default true,
  base_mode text not null default 'percent',
  base_percent numeric(7,3) not null default 0,
  rounding_step numeric(14,2) not null default 0,
  rounding_mode text not null default 'down',
  applies_to_pos boolean not null default true,
  applies_to_web boolean not null default true,
  applies_to_documents boolean not null default true,
  branches jsonb null,
  sort_order integer not null default 0,
  web_login_notice boolean not null default false,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_lists_name_check check (length(btrim(name)) between 1 and 120),
  constraint price_lists_base_mode_check check (base_mode in ('percent', 'fixed_only')),
  constraint price_lists_base_percent_check check (base_percent >= -100 and base_percent <= 1000),
  constraint price_lists_rounding_step_check check (rounding_step >= 0),
  constraint price_lists_rounding_mode_check check (rounding_mode in ('down', 'nearest', 'up')),
  constraint price_lists_vigencia_check check (effective_to is null or effective_to >= effective_from),
  constraint price_lists_branches_check check (branches is null or jsonb_typeof(branches) = 'array')
);
create unique index if not exists price_lists_org_nombre_uq on public.price_lists (organization_id, lower(btrim(name)));
create index if not exists price_lists_org_orden_idx on public.price_lists (organization_id, sort_order, created_at);
comment on table public.price_lists is
  'Listas de precios por cliente. El precio de lista reemplaza al normal; las promociones se calculan encima. Cálculo único: fn_lista_precios_resolver / resolve_customer_prices.';
comment on column public.price_lists.currency_code is 'Moneda de la lista. Nula al insertar = moneda base de la organización (trigger). Por ahora solo COP en la interfaz.';
comment on column public.price_lists.effective_from is 'Primer día en que rige, en la zona horaria de la organización.';
comment on column public.price_lists.effective_to is 'Último día en que rige (incluido). Nulo = sin fecha de fin. Vencida: el cliente paga el precio normal.';
comment on column public.price_lists.base_mode is 'percent: regla general base_percent sobre el precio normal. fixed_only: solo precios fijos y excepciones.';
comment on column public.price_lists.base_percent is 'Ajuste general sobre el precio normal: negativo baja (-10 = 10 % menos), positivo sube (se permite, con aviso).';
comment on column public.price_lists.rounding_step is 'Redondeo de los precios calculados con %: 0 = no redondea; 50, 100, 1000… Los precios fijos se respetan.';
comment on column public.price_lists.branches is 'Sedes donde aplica (arreglo de branch_id, como promotions.branches). Nulo o vacío = todas.';
comment on column public.price_lists.sort_order is 'Orden de las listas. Cliente en dos grupos con lista: gana la de menor sort_order.';
comment on column public.price_lists.web_login_notice is 'Fase 2 (tienda): aviso «¿Eres mayorista? Inicia sesión para ver tus precios». Apagado por defecto.';

-- ── 2. price_list_rules ────────────────────────────────────────────────────────────────────────
create table if not exists public.price_list_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  scope text not null,
  category_id integer null references public.categories(id) on delete cascade,
  brand text null,
  adjust_percent numeric(7,3) null,
  no_discount boolean not null default false,
  created_at timestamptz not null default now(),
  constraint price_list_rules_scope_check check (
    (scope = 'category' and category_id is not null and brand is null)
    or (scope = 'brand' and brand is not null and length(btrim(brand)) > 0 and category_id is null)),
  constraint price_list_rules_valor_check check (no_discount or adjust_percent is not null),
  constraint price_list_rules_percent_check check (adjust_percent is null or (adjust_percent >= -100 and adjust_percent <= 1000))
);
create unique index if not exists price_list_rules_categoria_uq on public.price_list_rules (price_list_id, category_id) where scope = 'category';
create unique index if not exists price_list_rules_marca_uq on public.price_list_rules (price_list_id, lower(btrim(brand))) where scope = 'brand';
create index if not exists price_list_rules_org_idx on public.price_list_rules (organization_id);
comment on table public.price_list_rules is
  'Excepciones de una lista por categoría (incluye subcategorías: gana la más cercana) o por marca (products.brand, sin mayúsculas ni tildes). Marca gana sobre categoría.';

-- ── 3. price_list_items ────────────────────────────────────────────────────────────────────────
create table if not exists public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id integer not null references public.products(id) on delete cascade,
  min_qty numeric(14,3) not null default 1,
  price numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_list_items_min_qty_check check (min_qty > 0),
  constraint price_list_items_price_check check (price >= 0),
  constraint price_list_items_unico unique (price_list_id, product_id, min_qty)
);
create index if not exists price_list_items_producto_idx on public.price_list_items (product_id);
create index if not exists price_list_items_org_idx on public.price_list_items (organization_id);
comment on table public.price_list_items is
  'Precio fijo por producto en una lista. Escalones: desde min_qty unidades de la línea rige ese precio (el mayor min_qty que se cumpla). Sin escalón que se cumpla, la regla (marca › categoría › general).';

-- ── 4. price_list_assignments ──────────────────────────────────────────────────────────────────
create table if not exists public.price_list_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  price_list_id uuid null references public.price_lists(id) on delete cascade,
  customer_id uuid null references public.customers(id) on delete cascade,
  segment_id uuid null references public.segments(id) on delete cascade,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint price_list_assignments_uno_check check ((customer_id is null) <> (segment_id is null)),
  constraint price_list_assignments_grupo_con_lista check (segment_id is null or price_list_id is not null)
);
create unique index if not exists price_list_assignments_cliente_uq on public.price_list_assignments (organization_id, customer_id) where customer_id is not null;
create unique index if not exists price_list_assignments_grupo_uq on public.price_list_assignments (organization_id, segment_id) where segment_id is not null;
create index if not exists price_list_assignments_lista_idx on public.price_list_assignments (price_list_id);
comment on table public.price_list_assignments is
  'Quién tiene cada lista. Cliente uno a uno (gana sobre el grupo; price_list_id NULL = «sin lista» explícito) o grupo del CRM (segment_members: quien entra al grupo entra a la lista). Un cliente tiene una sola lista.';

-- ── RLS y permisos de tabla ────────────────────────────────────────────────────────────────────
-- Lectura: miembros activos de la organización. Escritura: con pos.listas_precios.gestionar (las
-- pantallas escriben por las RPC transaccionales de 20261124213200; la política es la red).
do $$
declare
  t text;
begin
  foreach t in array array['price_lists', 'price_list_rules', 'price_list_items', 'price_list_assignments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_lectura') then
      execute format($p$create policy %I on public.%I for select to authenticated
        using (organization_id in (select om.organization_id from public.organization_members om
                                    where om.user_id = (select auth.uid()) and om.is_active = true))$p$, t || '_lectura', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_escritura') then
      execute format($p$create policy %I on public.%I for all to authenticated
        using (organization_id in (select om.organization_id from public.organization_members om
                                    where om.user_id = (select auth.uid()) and om.is_active = true)
               and public.fn_tiene_permiso(organization_id, 'pos.listas_precios.gestionar'))
        with check (organization_id in (select om.organization_id from public.organization_members om
                                         where om.user_id = (select auth.uid()) and om.is_active = true)
               and public.fn_tiene_permiso(organization_id, 'pos.listas_precios.gestionar'))$p$, t || '_escritura', t);
    end if;
  end loop;
end $$;

-- ── Misma organización en todo lo que cuelga de la lista ───────────────────────────────────────
create or replace function public.fn_listas_precios_misma_org()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v jsonb := to_jsonb(new);
  v_org integer := (v->>'organization_id')::integer;
begin
  -- to_jsonb: la misma función sirve a las cuatro tablas sin nombrar columnas que una no tiene.
  if nullif(v->>'price_list_id', '') is not null
     and not exists (select 1 from public.price_lists l where l.id = (v->>'price_list_id')::uuid and l.organization_id = v_org) then
    raise exception 'La lista de precios no pertenece a la organización' using errcode = '42501';
  end if;
  if nullif(v->>'category_id', '') is not null
     and not exists (select 1 from public.categories c where c.id = (v->>'category_id')::integer and c.organization_id = v_org) then
    raise exception 'La categoría no pertenece a la organización' using errcode = '42501';
  end if;
  if tg_table_name = 'price_list_items'
     and not exists (select 1 from public.products p where p.id = (v->>'product_id')::integer and p.organization_id = v_org) then
    raise exception 'El producto no pertenece a la organización' using errcode = '42501';
  end if;
  if nullif(v->>'customer_id', '') is not null
     and not exists (select 1 from public.customers c where c.id = (v->>'customer_id')::uuid and c.organization_id = v_org) then
    raise exception 'El cliente no pertenece a la organización' using errcode = '42501';
  end if;
  if nullif(v->>'segment_id', '') is not null
     and not exists (select 1 from public.segments s where s.id = (v->>'segment_id')::uuid and s.organization_id = v_org) then
    raise exception 'El grupo no pertenece a la organización' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and v ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$;
revoke all on function public.fn_listas_precios_misma_org() from public, anon, authenticated;

drop trigger if exists trg_price_lists_misma_org on public.price_lists;
create trigger trg_price_lists_misma_org before update on public.price_lists
  for each row execute function public.fn_listas_precios_misma_org();
drop trigger if exists trg_price_list_rules_misma_org on public.price_list_rules;
create trigger trg_price_list_rules_misma_org before insert or update on public.price_list_rules
  for each row execute function public.fn_listas_precios_misma_org();
drop trigger if exists trg_price_list_items_misma_org on public.price_list_items;
create trigger trg_price_list_items_misma_org before insert or update on public.price_list_items
  for each row execute function public.fn_listas_precios_misma_org();
drop trigger if exists trg_price_list_assignments_misma_org on public.price_list_assignments;
create trigger trg_price_list_assignments_misma_org before insert or update on public.price_list_assignments
  for each row execute function public.fn_listas_precios_misma_org();

-- Moneda: la base de la organización si llega nula (mismo trigger que cotizaciones).
drop trigger if exists trg_00_moneda_base_por_defecto on public.price_lists;
create trigger trg_00_moneda_base_por_defecto before insert on public.price_lists
  for each row execute function public.fn_trg_moneda_base_por_defecto('currency_code');

-- ── 5. Promociones ─────────────────────────────────────────────────────────────────────────────
alter table public.promotions add column if not exists applies_with_price_lists boolean not null default true;
comment on column public.promotions.applies_with_price_lists is
  'false = «No aplica a clientes con lista de precios»: el cliente con lista no la recibe y paga su precio de lista.';

-- ── 6. Rastro en ventas y documentos ───────────────────────────────────────────────────────────
alter table public.sales add column if not exists price_list_id uuid null references public.price_lists(id) on delete set null;
alter table public.sale_items add column if not exists price_list_id uuid null references public.price_lists(id) on delete set null;
alter table public.sale_items add column if not exists list_base_price numeric(14,2) null;
alter table public.quotations add column if not exists price_list_id uuid null references public.price_lists(id) on delete set null;
alter table public.quotation_items add column if not exists price_list_id uuid null references public.price_lists(id) on delete set null;
alter table public.quotation_items add column if not exists list_base_price numeric(14,2) null;
alter table public.invoice_items add column if not exists price_list_id uuid null references public.price_lists(id) on delete set null;
create index if not exists sales_price_list_idx on public.sales (organization_id, price_list_id, sale_date) where price_list_id is not null;
create index if not exists sale_items_price_list_idx on public.sale_items (price_list_id) where price_list_id is not null;
comment on column public.sales.price_list_id is 'Lista de precios del cliente al momento de la venta (la marca el servidor).';
comment on column public.sale_items.price_list_id is 'La línea se cobró con el precio de esta lista (la marca el servidor).';
comment on column public.sale_items.list_base_price is 'Precio normal (con extras) de la línea con lista: para tacharlo y medir el ahorro.';
comment on column public.quotation_items.list_base_price is 'Precio normal de la línea con lista: para tacharlo y medir el ahorro.';
comment on column public.invoice_items.price_list_id is 'Solo para reportes: a la DIAN va el precio de la lista como unitario.';

-- ── 7. Permisos ────────────────────────────────────────────────────────────────────────────────
insert into public.permissions (code, module, name, description, category)
values
  ('pos.listas_precios.gestionar', 'pos', 'Gestionar listas de precios',
   'Crear, editar e importar listas de precios y asignarlas a clientes o grupos del CRM', 'pos'),
  ('pos.precios.cambiar_en_venta', 'pos', 'Cambiar precios en la venta',
   'Usar el precio normal en una venta de un cliente con lista de precios', 'pos')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id, allowed)
select r.id, p.id, true
  from public.roles r cross join public.permissions p
 where p.code in ('pos.listas_precios.gestionar', 'pos.precios.cambiar_en_venta')
   and r.organization_id is null and r.name in ('Admin de organización', 'Manager')
   and not exists (select 1 from public.role_permissions x where x.role_id = r.id and x.permission_id = p.id);

-- ── 8. Cálculo ─────────────────────────────────────────────────────────────────────────────────
-- Día de hoy en la zona de la organización (fallback America/Bogota).
create or replace function public.fn_lista_precios_hoy(p_org integer, p_at timestamptz default now())
returns date language sql stable security definer set search_path = public, pg_temp as $$
  select (coalesce(p_at, now()) at time zone coalesce(
            (select nullif(btrim(o.timezone), '') from public.organizations o where o.id = p_org), 'America/Bogota'))::date
$$;
revoke all on function public.fn_lista_precios_hoy(integer, timestamptz) from public, anon, authenticated;

-- ¿La lista rige hoy en este canal y sede?
create or replace function public.fn_lista_precios_aplica(p_list uuid, p_channel text, p_branch integer, p_at timestamptz default now())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.price_lists l
     where l.id = p_list
       and l.is_active
       and l.effective_from <= public.fn_lista_precios_hoy(l.organization_id, p_at)
       and (l.effective_to is null or l.effective_to >= public.fn_lista_precios_hoy(l.organization_id, p_at))
       and case p_channel when 'pos' then l.applies_to_pos when 'web' then l.applies_to_web
                          when 'documents' then l.applies_to_documents else false end
       and (p_branch is null or l.branches is null or jsonb_array_length(l.branches) = 0
            or l.branches @> to_jsonb(p_branch) or l.branches @> to_jsonb(p_branch::text)))
$$;
revoke all on function public.fn_lista_precios_aplica(uuid, text, integer, timestamptz) from public, anon, authenticated;

-- Lista que rige para un cliente. Uno a uno gana sobre el grupo (aunque no aplique ahora: vencida,
-- inactiva o canal apagado → precio normal). Por grupo: la primera en el orden de listas que aplique.
create or replace function public.fn_lista_precios_del_cliente(
  p_org integer, p_customer uuid, p_channel text, p_branch integer, p_at timestamptz default now())
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_lista uuid;
begin
  if p_customer is null then
    return null;
  end if;
  select a.price_list_id into v_lista
    from public.price_list_assignments a
   where a.organization_id = p_org and a.customer_id = p_customer;
  if found then
    if v_lista is not null and public.fn_lista_precios_aplica(v_lista, p_channel, p_branch, p_at) then
      return v_lista;
    end if;
    return null;
  end if;
  select l.id into v_lista
    from public.price_list_assignments a
    join public.segment_members sm on sm.segment_id = a.segment_id and sm.customer_id = p_customer
                                  and sm.organization_id = p_org
    join public.price_lists l on l.id = a.price_list_id
   where a.organization_id = p_org and a.segment_id is not null
     and public.fn_lista_precios_aplica(l.id, p_channel, p_branch, p_at)
   order by l.sort_order, l.created_at, l.id
   limit 1;
  return v_lista;
end;
$$;
revoke all on function public.fn_lista_precios_del_cliente(integer, uuid, text, integer, timestamptz) from public, anon, authenticated;

create or replace function public.fn_lista_precios_redondear(p_valor numeric, p_paso numeric, p_modo text)
returns numeric language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_valor is null then null
    when coalesce(p_paso, 0) <= 0 then round(p_valor, 2)
    when p_modo = 'up' then ceil(p_valor / p_paso) * p_paso
    when p_modo = 'nearest' then round(p_valor / p_paso) * p_paso
    else floor(p_valor / p_paso) * p_paso
  end
$$;

create or replace function public.fn_lista_precios_normalizar_marca(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select nullif(translate(lower(btrim(coalesce(p, ''))), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'), '')
$$;

-- Precio normal, escalones y regla de UNA lista para N productos.
--   tiers       precios fijos [{min_qty, price}] ascendentes (del producto; si no tiene, del padre).
--   rule_price  precio sin escalón: marca › categoría (la más cercana) › general (base_mode percent).
--               «Sin descuento» = precio normal. Lo que sale de un % se redondea.
create or replace function public.fn_lista_precios_resolver(
  p_org integer, p_list uuid, p_product_ids integer[], p_branch integer, p_at timestamptz default now())
returns table(product_id integer, normal_price numeric, tiers jsonb, rule_price numeric, rule_source text,
              rule_percent numeric, rule_label text, no_discount boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with recursive lista as (
    select l.* from public.price_lists l where l.id = p_list and l.organization_id = p_org
  ),
  prods as (
    select p.id, p.parent_product_id,
           coalesce(p.category_id, pp.category_id) as category_id,
           public.fn_lista_precios_normalizar_marca(coalesce(nullif(btrim(p.brand), ''), pp.brand)) as marca
      from public.products p
      left join public.products pp on pp.id = p.parent_product_id
     where p.organization_id = p_org and p.id = any(coalesce(p_product_ids, '{}'::integer[]))
  ),
  normales as (
    select v.product_id, v.precio
      from public.fn_precios_vigentes_lote(p_org, p_branch, coalesce(p_product_ids, '{}'::integer[]), coalesce(p_at, now()), false) v
  ),
  fijos as (
    select pr.id as product_id,
           coalesce(
             (select jsonb_agg(jsonb_build_object('min_qty', i.min_qty, 'price', i.price) order by i.min_qty)
                from public.price_list_items i where i.price_list_id = p_list and i.product_id = pr.id),
             (select jsonb_agg(jsonb_build_object('min_qty', i.min_qty, 'price', i.price) order by i.min_qty)
                from public.price_list_items i where i.price_list_id = p_list and i.product_id = pr.parent_product_id)
           ) as tiers
      from prods pr
  ),
  ancestros as (
    select pr.id as product_id, c.id as category_id, c.parent_id, c.name, 0 as nivel
      from prods pr join public.categories c on c.id = pr.category_id
    union all
    select a.product_id, c.id, c.parent_id, c.name, a.nivel + 1
      from ancestros a join public.categories c on c.id = a.parent_id
     where a.nivel < 10
  ),
  por_categoria as (
    select distinct on (a.product_id) a.product_id, r.adjust_percent, r.no_discount, a.name
      from ancestros a
      join public.price_list_rules r on r.price_list_id = p_list and r.scope = 'category' and r.category_id = a.category_id
     order by a.product_id, a.nivel
  ),
  por_marca as (
    select distinct on (pr.id) pr.id as product_id, r.adjust_percent, r.no_discount, r.brand
      from prods pr
      join public.price_list_rules r on r.price_list_id = p_list and r.scope = 'brand'
                                    and public.fn_lista_precios_normalizar_marca(r.brand) = pr.marca
     order by pr.id, r.created_at
  ),
  regla as (
    select pr.id as product_id,
           case when pm.product_id is not null then 'brand'
                when pc.product_id is not null then 'category'
                when l.base_mode = 'percent' then 'general' end as fuente,
           case when pm.product_id is not null then pm.adjust_percent
                when pc.product_id is not null then pc.adjust_percent
                when l.base_mode = 'percent' then l.base_percent end as pct,
           case when pm.product_id is not null then pm.no_discount
                when pc.product_id is not null then pc.no_discount
                else false end as sin_descuento,
           case when pm.product_id is not null then pm.brand
                when pc.product_id is not null then pc.name end as etiqueta,
           l.rounding_step, l.rounding_mode
      from prods pr
      cross join lista l
      left join por_marca pm on pm.product_id = pr.id
      left join por_categoria pc on pc.product_id = pr.id
  )
  select pr.id,
         n.precio,
         f.tiers,
         case when r.fuente is null or n.precio is null then null
              when r.sin_descuento then n.precio
              else greatest(0, public.fn_lista_precios_redondear(n.precio * (1 + coalesce(r.pct, 0) / 100), r.rounding_step, r.rounding_mode))
         end,
         case when r.fuente is null then null when r.sin_descuento then 'no_discount' else r.fuente end,
         case when r.sin_descuento then null else r.pct end,
         r.etiqueta,
         coalesce(r.sin_descuento, false)
    from prods pr
    left join normales n on n.product_id = pr.id
    left join fijos f on f.product_id = pr.id
    left join regla r on r.product_id = pr.id
$$;
revoke all on function public.fn_lista_precios_resolver(integer, uuid, integer[], integer, timestamptz) from public, anon, authenticated;

-- Precio por cantidad: el escalón de mayor min_qty que se cumple; si ninguno, la regla.
create or replace function public.fn_lista_precios_por_cantidad(p_tiers jsonb, p_rule_price numeric, p_qty numeric)
returns numeric language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    (select (t->>'price')::numeric
       from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) t
      where (t->>'min_qty')::numeric <= coalesce(p_qty, 1)
      order by (t->>'min_qty')::numeric desc
      limit 1),
    p_rule_price)
$$;

-- Precio de lista de UNA línea (o null si el cliente no tiene lista o la lista no la cambia).
create or replace function public.fn_lista_precio_linea(
  p_org integer, p_customer uuid, p_product integer, p_qty numeric, p_channel text, p_branch integer,
  p_at timestamptz default now())
returns numeric language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_lista uuid := public.fn_lista_precios_del_cliente(p_org, p_customer, p_channel, p_branch, p_at);
  v_r record;
begin
  if v_lista is null or p_product is null then
    return null;
  end if;
  select * into v_r from public.fn_lista_precios_resolver(p_org, v_lista, array[p_product], p_branch, p_at) limit 1;
  if not found then
    return null;
  end if;
  return public.fn_lista_precios_por_cantidad(v_r.tiers, case when v_r.no_discount then null else v_r.rule_price end, p_qty);
end;
$$;
revoke all on function public.fn_lista_precio_linea(integer, uuid, integer, numeric, text, integer, timestamptz) from public, anon, authenticated;

-- RPC pública. Quién puede preguntar:
--   · miembro activo de la organización (POS, cotizaciones, facturas): cualquier cliente de la org;
--   · el propio cliente con su sesión (tienda, fase 2: customers.user_id = auth.uid()): solo él y
--     solo el canal web;
--   · service_role (rutas del servidor con la organización ya validada).
-- anon: cerrada (revoke). Devuelve una fila por producto de la organización:
--   normal_price   precio normal vigente (el de la sede si tiene; si no, el general)
--   list_price     precio de la lista para 1 unidad (null = paga el normal)
--   tiers          escalones [{min_qty, price}]; el precio por cantidad = mayor min_qty que se cumpla
--   rule_price     precio sin escalón (null = normal); source/rule_percent/rule_label para la insignia
create or replace function public.resolve_customer_prices(
  p_org integer, p_customer uuid, p_product_ids integer[], p_channel text default 'pos', p_branch integer default null)
returns table(product_id integer, normal_price numeric, list_price numeric, price_list_id uuid, price_list_name text,
              source text, rule_percent numeric, rule_label text, rule_price numeric, tiers jsonb, no_discount boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_canal text := coalesce(nullif(p_channel, ''), 'pos');
  v_lista uuid;
  v_nombre text;
begin
  if v_canal not in ('pos', 'web', 'documents') then
    raise exception 'Canal inválido: %', v_canal using errcode = '22023';
  end if;
  if coalesce(array_length(p_product_ids, 1), 0) > 2000 then
    raise exception 'Demasiados productos (máximo 2000)' using errcode = '22023';
  end if;
  if v_uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Acceso denegado' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.organization_members om
                     where om.user_id = v_uid and om.organization_id = p_org and om.is_active) then
    if p_customer is null or not exists (select 1 from public.customers c
                                          where c.id = p_customer and c.organization_id = p_org and c.user_id = v_uid) then
      raise exception 'Acceso denegado' using errcode = '42501';
    end if;
    v_canal := 'web';
  end if;
  if p_customer is not null and not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = p_org) then
    raise exception 'El cliente no pertenece a la organización' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'La sede no pertenece a la organización' using errcode = '42501';
  end if;

  v_lista := public.fn_lista_precios_del_cliente(p_org, p_customer, v_canal, p_branch, now());
  if v_lista is null then
    return query
      select v.product_id, v.precio, null::numeric, null::uuid, null::text, null::text, null::numeric, null::text,
             null::numeric, null::jsonb, false
        from public.fn_precios_vigentes_lote(p_org, p_branch, coalesce(p_product_ids, '{}'::integer[]), now(), false) v
        join public.products p on p.id = v.product_id and p.organization_id = p_org;
    return;
  end if;
  select l.name into v_nombre from public.price_lists l where l.id = v_lista;
  return query
    select r.product_id, r.normal_price,
           public.fn_lista_precios_por_cantidad(r.tiers, case when r.no_discount then null else r.rule_price end, 1),
           v_lista, v_nombre,
           case when public.fn_lista_precios_por_cantidad(r.tiers, null, 1) is not null then 'item' else r.rule_source end,
           r.rule_percent, r.rule_label,
           case when r.no_discount then null else r.rule_price end,
           r.tiers, r.no_discount
      from public.fn_lista_precios_resolver(p_org, v_lista, p_product_ids, p_branch, now()) r;
end;
$$;
revoke all on function public.resolve_customer_prices(integer, uuid, integer[], text, integer) from public, anon;
grant execute on function public.resolve_customer_prices(integer, uuid, integer[], text, integer) to authenticated, service_role;
comment on function public.resolve_customer_prices(integer, uuid, integer[], text, integer) is
  'Precio normal y de lista por producto para un cliente (canal pos | web | documents). Única fuente del precio de lista: POS, cotizaciones, facturas y tienda. Las promociones se calculan después sobre este precio.';
