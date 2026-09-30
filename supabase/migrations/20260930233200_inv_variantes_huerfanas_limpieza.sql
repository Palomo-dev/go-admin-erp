-- Inventario · variantes huérfanas 3/3 — Limpieza de datos (10 organizaciones)
-- docs/inventario/VARIANTES-HUERFANAS.md
--
-- Da de baja (status = 'deleted') las variantes vivas cuyo padre está eliminado,
-- SOLO si no tienen nada abierto. Clasificación hecha antes por MCP en solo
-- lectura (2026-09-30) sobre las 43 FK a products.id:
--
--   2.084 variantes vivas bajo 398 padres eliminados, en 10 organizaciones.
--   Se quedan (no se tocan) las que tienen cualquiera de:
--     · stock_levels con qty_on_hand <> 0 o qty_reserved <> 0  → 888 (882 con
--       existencias positivas, 6 negativas): inventario real sin padre visible.
--     · receta activa de un producto vivo que la usa de ingrediente → 6
--     · regla de una promoción activa → 2
--     · y, por si aparecen entre el dry-run y la aplicación: ventas, pedidos web,
--       órdenes de compra, traslados, recepciones, cotizaciones, facturas, envíos,
--       devoluciones, producción, membresías, folios, reservas de stock activas,
--       carritos vigentes, ajustes sin publicar, conteos cíclicos, seriales,
--       servicios u oportunidades que la referencien.
--   No bloquean (son historia o atributos propios): stock_movements (kardex),
--   ajustes ya publicados, precios, costos, imágenes, etiquetas, proveedores.
--
--   Por organización (limpiables esperadas; si no coinciden, la migración aborta):
--     120: 35 · 128: 242 · 129: 1 · 132: 430 · 134: 0 · 135: 27 · 137: 225
--     144: 116 · 145: 27 · 198: 92  → 1.195 en total.
--
-- Rastro exacto para el rollback: cada id tocado queda en
-- private.inv_variantes_baja_en_cascada (origen 'limpieza_20260930') con su
-- status y updated_at anteriores. Si después alguien restaura el padre, el
-- disparador de 20260930233000 devuelve esas variantes a su estado anterior.
--
-- Rollback: supabase/rollbacks/20260930233200_inv_variantes_huerfanas_limpieza_rollback.sql

do $limpieza$
declare
  v_esperado constant jsonb :=
    '{"120":35,"128":242,"129":1,"132":430,"134":0,"135":27,"137":225,"144":116,"145":27,"198":92}';
  v_real jsonb;
  v_ya integer;
  v_n integer;
  v_total integer;
begin
  select count(*) into v_ya from private.inv_variantes_baja_en_cascada where origen = 'limpieza_20260930';
  if v_ya > 0 then
    raise notice 'inv_variantes_huerfanas_limpieza ya aplicada (% variantes): nada que hacer', v_ya;
    return;
  end if;

  perform 1
     from public.products v
     join public.products p on p.id = v.parent_product_id
    where p.status = 'deleted' and coalesce(v.status, 'active') <> 'deleted'
    order by v.id
      for update of v;

  with huerfanas as (
    select v.id, v.organization_id, v.parent_product_id, v.status, v.updated_at
      from public.products v
      join public.products p on p.id = v.parent_product_id
     where p.status = 'deleted' and coalesce(v.status, 'active') <> 'deleted'
  ),
  bloqueadas as (
    select h.id from huerfanas h
     where exists (select 1 from public.stock_levels x where x.product_id = h.id
                    and (coalesce(x.qty_on_hand, 0) <> 0 or coalesce(x.qty_reserved, 0) <> 0))
        or exists (select 1 from public.sale_items x where x.product_id = h.id)
        or exists (select 1 from public.web_order_items x where x.product_id = h.id)
        or exists (select 1 from public.po_items x where x.product_id = h.id)
        or exists (select 1 from public.purchase_order_items x where x.product_id = h.id)
        or exists (select 1 from public.purchase_receipt_items x where x.product_id = h.id)
        or exists (select 1 from public.transfer_items x where x.product_id = h.id)
        or exists (select 1 from public.quotation_items x where x.product_id = h.id)
        or exists (select 1 from public.invoice_items x where x.product_id = h.id)
        or exists (select 1 from public.shipment_items x where x.product_id = h.id)
        or exists (select 1 from public.return_lines x where x.product_id = h.id)
        or exists (select 1 from public.production_orders x where x.product_id = h.id)
        or exists (select 1 from public.production_order_consumptions x where x.ingredient_product_id = h.id)
        or exists (select 1 from public.membership_plans x where x.product_id = h.id)
        or exists (select 1 from public.memberships x where x.product_id = h.id)
        or exists (select 1 from public.folio_items x where x.product_id = h.id)
        or exists (select 1 from public.organization_services x where x.linked_product_id = h.id)
        or exists (select 1 from public.stage_agents x where x.product_id = h.id)
        or exists (select 1 from public.opportunity_products x where x.product_id = h.id)
        or exists (select 1 from public.serial_numbers x where x.product_id = h.id)
        or exists (select 1 from public.cycle_count_lines x where x.product_id = h.id)
        or exists (select 1 from public.product_save_requests x where x.product_id = h.id)
        or exists (select 1 from public.stock_reservations x where x.product_id = h.id and x.released_at is null)
        or exists (select 1 from public.adjustment_items x
                     join public.inventory_adjustments a on a.id = x.inventory_adjustment_id
                    where x.product_id = h.id and a.status <> 'posted')
        or exists (select 1 from public.recipe_ingredients x
                     join public.product_recipes r on r.id = x.recipe_id
                     join public.products rp on rp.id = r.product_id
                    where x.ingredient_product_id = h.id and r.is_active
                      and coalesce(rp.status, 'active') <> 'deleted')
        or exists (select 1 from public.product_recipes x where x.product_id = h.id and x.is_active)
        or exists (select 1 from public.promotion_rules x
                     join public.promotions pr on pr.id = x.promotion_id
                    where x.product_id = h.id and pr.is_active
                      and (pr.end_date is null or pr.end_date >= now()))
        or exists (select 1 from public.carts c
                    where c.organization_id = h.organization_id
                      and (c.expires_at is null or c.expires_at > now())
                      and c.cart_data::text ~ ('"(product_id|productId|id)"\s*:\s*"?' || h.id || '([^0-9]|$)'))
  )
  insert into private.inv_variantes_baja_en_cascada
    (variant_id, parent_id, organization_id, status_previo, updated_at_previo, origen)
  select h.id, h.parent_product_id, h.organization_id, h.status, h.updated_at, 'limpieza_20260930'
    from huerfanas h
   where h.id not in (select b.id from bloqueadas b);

  select coalesce(jsonb_object_agg(k.org::text, coalesce(c.n, 0)), '{}'::jsonb) into v_real
    from (select jsonb_object_keys(v_esperado)::integer as org) k
    left join (select organization_id, count(*)::integer as n
                 from private.inv_variantes_baja_en_cascada
                where origen = 'limpieza_20260930'
                group by organization_id) c on c.organization_id = k.org;
  select count(*) into v_total from private.inv_variantes_baja_en_cascada where origen = 'limpieza_20260930';
  if v_real <> v_esperado or v_total <> 1195 then
    raise exception 'inv_variantes_huerfanas_limpieza: los datos cambiaron desde el dry-run. Esperado %, real % (total %)',
      v_esperado, v_real, v_total;
  end if;

  update public.products v
     set status = 'deleted', updated_at = now()
    from private.inv_variantes_baja_en_cascada r
   where r.origen = 'limpieza_20260930'
     and v.id = r.variant_id
     and coalesce(v.status, 'active') <> 'deleted';
  get diagnostics v_n = row_count;
  if v_n <> 1195 then
    raise exception 'inv_variantes_huerfanas_limpieza: se esperaban 1195 bajas y hubo %', v_n;
  end if;
end;
$limpieza$;
