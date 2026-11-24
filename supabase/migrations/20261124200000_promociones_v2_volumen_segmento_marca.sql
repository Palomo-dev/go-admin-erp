-- Promociones V2 (Figma «05 POS y ventas», sección 2998:192939, aprobada el 2026-11-24).
-- Aplicada con apply_migration (MCP). Todo aditivo:
--
--   1. promotion_type admite 'volume_tiers' (precio por volumen). 'free_shipping' se QUEDA en el
--      CHECK aunque la pantalla ya no lo ofrezca (el envío gratis vive en Logística › Tarifas).
--   2. promotion_tiers: escalones por cantidad (precio fijo por unidad O % de descuento).
--   3. promotions.tiers_count_mode: cómo se cuentan las unidades para el escalón:
--        same_product   → cada producto aparte (sus variantes suman juntas);
--        promotion_mix  → todo lo que entra en la promoción suma junto (3 cola + 3 limón = 6);
--        same_variant   → cada variante exacta aparte;
--        product_group  → solo los productos marcados con promotion_rules.tier_group; cada grupo suma aparte.
--      El cálculo es el módulo puro precioVolumen.ts (ERP src/lib/promotions/, tienda lib/promociones/),
--      idéntico byte a byte en los dos repos.
--   4. promotion_rules.brand (texto, como products.brand) y promotion_rules.tier_group.
--   5. promotions.customer_segment_id → segments(id): «Solo para clientes del grupo». ON DELETE
--      RESTRICT: borrar el segmento no puede abrir la promoción a todo el mundo.
--   6. promotions.usage_limit_per_customer + promotion_customer_uses + register_promotion_customer_use,
--      y pos_checkout_v1 la llama junto a increment_promotion_usage (reemplazo textual de UNA línea).
--
-- La organización del segmento y de los escalones debe ser la de la promoción (trigger).
-- Idempotente. Rollback: supabase/rollbacks/20261124200000_promociones_v2_volumen_segmento_marca_rollback.sql

set lock_timeout = '10s';

-- 1. Tipo nuevo ---------------------------------------------------------------------------------
alter table public.promotions drop constraint if exists promotions_promotion_type_check;
alter table public.promotions add constraint promotions_promotion_type_check
  check (promotion_type = any (array['percentage'::text, 'fixed_amount'::text, 'buy_x_get_y'::text,
                                     'bundle'::text, 'free_shipping'::text, 'volume_tiers'::text]));

-- 3. Modo de conteo ------------------------------------------------------------------------------
alter table public.promotions add column if not exists tiers_count_mode text not null default 'promotion_mix';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promotions_tiers_count_mode_check') then
    alter table public.promotions add constraint promotions_tiers_count_mode_check
      check (tiers_count_mode in ('same_product', 'promotion_mix', 'same_variant', 'product_group'));
  end if;
end $$;
comment on column public.promotions.tiers_count_mode is
  'Precio por volumen: cómo se cuentan las unidades. same_product (variantes juntas), promotion_mix (todo junto), same_variant (cada variante aparte), product_group (solo promotion_rules.tier_group; cada grupo aparte).';

-- 5. Grupo de clientes --------------------------------------------------------------------------
alter table public.promotions add column if not exists customer_segment_id uuid null
  references public.segments(id) on delete restrict;
create index if not exists promotions_customer_segment_idx
  on public.promotions(customer_segment_id) where customer_segment_id is not null;
comment on column public.promotions.customer_segment_id is
  'Solo clientes de este segmento del CRM. POS: el cliente de la venta. Tienda: solo con sesión, verificado en el servidor. Sin cliente, no aplica.';

-- 6. Usos por cliente ---------------------------------------------------------------------------
alter table public.promotions add column if not exists usage_limit_per_customer integer null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promotions_usage_limit_per_customer_check') then
    alter table public.promotions add constraint promotions_usage_limit_per_customer_check
      check (usage_limit_per_customer is null or usage_limit_per_customer > 0);
  end if;
end $$;
comment on column public.promotions.usage_limit_per_customer is
  'Máximo de ventas/pedidos por cliente (promotion_customer_uses). Sin cliente identificado, la promoción no aplica.';

-- 4. Marca y grupo de conteo en las reglas ------------------------------------------------------
alter table public.promotion_rules add column if not exists brand text null;
alter table public.promotion_rules add column if not exists tier_group smallint null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promotion_rules_tier_group_check') then
    alter table public.promotion_rules add constraint promotion_rules_tier_group_check
      check (tier_group is null or tier_group between 1 and 20);
  end if;
end $$;
comment on column public.promotion_rules.brand is
  'include_brand / exclude_brand: marca (products.brand), sin distinguir mayúsculas ni tildes. Nulo = regla antigua por product_id.';
comment on column public.promotion_rules.tier_group is
  'Precio por volumen con tiers_count_mode = product_group: las líneas de un mismo grupo suman unidades juntas.';

-- 2. Escalones ----------------------------------------------------------------------------------
create table if not exists public.promotion_tiers (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  min_quantity integer not null check (min_quantity > 0),
  unit_price numeric(14,2) null check (unit_price is null or unit_price >= 0),
  discount_percent numeric(5,2) null check (discount_percent is null or (discount_percent > 0 and discount_percent <= 100)),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint promotion_tiers_un_valor check ((unit_price is null) <> (discount_percent is null)),
  constraint promotion_tiers_unico unique (promotion_id, min_quantity)
);
create index if not exists promotion_tiers_org_idx on public.promotion_tiers(organization_id);
comment on table public.promotion_tiers is
  'Escalones de una promoción volume_tiers: desde min_quantity unidades, precio fijo por unidad (unit_price) o % (discount_percent). Aplica a todas las unidades de la línea.';

alter table public.promotion_tiers enable row level security;
revoke all on public.promotion_tiers from public, anon;
grant select, insert, update, delete on public.promotion_tiers to authenticated;
grant all on public.promotion_tiers to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_tiers'
                  and policyname = 'promotion_tiers_org_isolation') then
    create policy promotion_tiers_org_isolation on public.promotion_tiers for all to authenticated
      using (organization_id in (select om.organization_id from public.organization_members om
                                  where om.user_id = (select auth.uid()) and om.is_active = true))
      with check (organization_id in (select om.organization_id from public.organization_members om
                                       where om.user_id = (select auth.uid()) and om.is_active = true));
  end if;
end $$;

-- Misma organización que la promoción (escalón) y que el segmento (promoción).
create or replace function public.fn_promotion_tiers_misma_org()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.promotions p where p.id = new.promotion_id and p.organization_id = new.organization_id) then
    raise exception 'El escalón no pertenece a la organización de la promoción' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_promotion_tiers_misma_org() from public, anon, authenticated;

drop trigger if exists trg_promotion_tiers_misma_org on public.promotion_tiers;
create trigger trg_promotion_tiers_misma_org before insert or update on public.promotion_tiers
  for each row execute function public.fn_promotion_tiers_misma_org();
-- El permiso pos.promociones.gestionar: la misma guarda de promotion_rules (lee promotion_id).
drop trigger if exists trg_promotion_tiers_guarda on public.promotion_tiers;
create trigger trg_promotion_tiers_guarda before insert or update or delete on public.promotion_tiers
  for each row execute function public.fn_promotion_rules_guarda();

create or replace function public.fn_promotions_segmento_misma_org()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.customer_segment_id is not null
     and not exists (select 1 from public.segments s where s.id = new.customer_segment_id and s.organization_id = new.organization_id) then
    raise exception 'El grupo de clientes no pertenece a la organización' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_promotions_segmento_misma_org() from public, anon, authenticated;
drop trigger if exists trg_promotions_segmento_misma_org on public.promotions;
create trigger trg_promotions_segmento_misma_org before insert or update of customer_segment_id on public.promotions
  for each row execute function public.fn_promotions_segmento_misma_org();

-- Realtime: el carrito del POS se suscribe a promociones; los escalones también cambian el cálculo.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = 'promotion_tiers') then
    alter publication supabase_realtime add table public.promotion_tiers;
  end if;
end $$;
alter table public.promotion_tiers replica identity full;

-- 6. Registro de uso por cliente ----------------------------------------------------------------
create table if not exists public.promotion_customer_uses (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  uses integer not null default 0 check (uses >= 0),
  last_used_at timestamptz not null default now(),
  primary key (promotion_id, customer_id)
);
create index if not exists promotion_customer_uses_org_customer_idx
  on public.promotion_customer_uses(organization_id, customer_id);
comment on table public.promotion_customer_uses is
  'Ventas y pedidos por cliente y promoción. Lo escriben pos_checkout_v1 y /api/orders de la tienda con register_promotion_customer_use.';

alter table public.promotion_customer_uses enable row level security;
revoke all on public.promotion_customer_uses from public, anon;
grant select, insert, update on public.promotion_customer_uses to authenticated;
grant all on public.promotion_customer_uses to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_customer_uses'
                  and policyname = 'promotion_customer_uses_org_isolation') then
    create policy promotion_customer_uses_org_isolation on public.promotion_customer_uses for all to authenticated
      using (organization_id in (select om.organization_id from public.organization_members om
                                  where om.user_id = (select auth.uid()) and om.is_active = true))
      with check (organization_id in (select om.organization_id from public.organization_members om
                                       where om.user_id = (select auth.uid()) and om.is_active = true));
  end if;
end $$;

-- SECURITY INVOKER, como increment_promotion_usage: con sesión aplica RLS. Solo cuenta promociones
-- y clientes de p_organization_id; sin cliente (null) no escribe nada.
create or replace function public.register_promotion_customer_use(
  p_organization_id integer, p_promotion_ids uuid[], p_customer_id uuid)
returns integer language sql set search_path = public as $$
  with validas as (
    select pr.id
      from public.promotions pr
     where pr.organization_id = p_organization_id
       and pr.id = any(p_promotion_ids)
       and p_customer_id is not null
       and exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id)
  ), escritas as (
    insert into public.promotion_customer_uses (promotion_id, customer_id, organization_id, uses, last_used_at)
    select v.id, p_customer_id, p_organization_id, 1, now() from validas v
    on conflict (promotion_id, customer_id)
      do update set uses = public.promotion_customer_uses.uses + 1, last_used_at = now()
    returning 1
  )
  select count(*)::integer from escritas;
$$;
revoke all on function public.register_promotion_customer_use(integer, uuid[], uuid) from public, anon;
grant execute on function public.register_promotion_customer_use(integer, uuid[], uuid) to authenticated, service_role;

-- pos_checkout_v1: registra el uso por cliente donde ya suma usage_count (paso 5, dentro del mismo
-- begin … exception, así un fallo queda como aviso y no tumba la venta). Reemplazo textual de UNA
-- línea sobre la definición viva; si la línea no está tal cual, la migración falla. Si alguien
-- reescribe pos_checkout_v1 desde una migración anterior, debe conservar esta llamada.
do $$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_viejo text := 'perform public.increment_promotion_usage(v_org, v_promos);';
  v_nuevo text := 'perform public.increment_promotion_usage(v_org, v_promos);' || chr(10)
               || '      perform public.register_promotion_customer_use(v_org, v_promos, v_customer);';
begin
  if position('register_promotion_customer_use' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'pos_checkout_v1 no tiene exactamente una llamada a increment_promotion_usage';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
