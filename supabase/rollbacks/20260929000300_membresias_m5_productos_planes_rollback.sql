-- Rollback de 20260929000300_membresias_m5_productos_planes.sql
--
-- Aplicada el 2026-09-29 sobre la org 106: planes 1-4 → productos 96917-96920 (sku MEM-1..MEM-4),
-- categoría 1630 («Membresías», slug «membresias»).
--
-- Solo se deshace lo que creó la migración: productos con sku MEM-<id del plan> ligados a su plan,
-- sin ventas ni membresías vendidas, y la categoría «membresias» si ya nadie la usa. Si un producto
-- ya se vendió (sale_items) o tiene membresías con línea de venta, se aborta: esos datos no se
-- pueden devolver al modelo viejo sin perder el vínculo con la venta.

do $$
begin
  if exists (select 1 from public.membership_plans mp
               join public.sale_items si on si.product_id = mp.product_id
              where mp.product_id is not null) then
    raise exception 'Hay ventas de productos de membresía: no se revierte M5';
  end if;
  if exists (select 1 from public.memberships where sale_item_id is not null) then
    raise exception 'Hay membresías vendidas: no se revierte M5';
  end if;
end $$;

update public.memberships
   set source = null, product_id = null, plan_snapshot = null
 where source = 'manual_legacy';

create temporary table _m5_productos on commit drop as
select mp.id as plan_id, mp.product_id
  from public.membership_plans mp
  join public.products p on p.id = mp.product_id
 where p.sku = 'MEM-' || mp.id or p.sku like 'MEM-' || mp.id || '-%';

update public.membership_plans mp set product_id = null
  from _m5_productos x where x.plan_id = mp.id;

delete from public.product_prices where product_id in (select product_id from _m5_productos);
delete from public.products where id in (select product_id from _m5_productos);

delete from public.categories c
 where c.slug = 'membresias'
   and not exists (select 1 from public.products p where p.category_id = c.id)
   and not exists (select 1 from public.categories h where h.parent_id = c.id);
