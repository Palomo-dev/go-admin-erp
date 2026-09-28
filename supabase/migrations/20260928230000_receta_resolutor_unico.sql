-- Receta: un solo resolutor y un solo cálculo (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2.4, §2.5 B1, B4, B6, B9)
--
-- Antes, «¿cuál es la receta de este producto y cuánto se descuenta?» se
-- respondía en cinco sitios (SQL de venta, SQL de producción, dos servicios del
-- navegador y el reporte de costo), cada uno con su versión. Desde aquí:
--
--   fn_receta_int_factor      conversión de unidades (organización → global, y la inversa si solo existe esa)
--   fn_receta_efectiva        receta activa del producto; si no tiene y es variante, la del padre
--   fn_receta_int_a_jsonb     una receta guardada en el mismo formato que el borrador del formulario
--   fn_receta_int_calcular    EL cálculo: cantidad × (producido ÷ rinde) ÷ (1 − merma) × conversión
--   fn_receta_int_expandir    qué sale del inventario al vender N unidades de un producto
--
-- y quienes descuentan los usan:
--   decrement_stock_with_recipe  (POS, factura de venta, pedidos web, consumos del PMS)
--   complete_production_order    (se corrige que el factor de conversión pisaba la proporción)
--
-- Cambios de comportamiento, medidos el 2026-09-28 con el MCP:
--   * Rinde: las 57 recetas tienen yield_qty = 1 → dividir por el rinde no cambia nada existente.
--   * Merma (columna nueva, default 0) → no cambia nada existente.
--   * Herencia padre → variante: 0 padres con receta → no cambia nada existente.
--   * Conversión obligatoria: 0 ingredientes con unidad distinta a la de su producto → nada se bloquea hoy.
--   * Opcionales: 2 ingredientes marcados opcionales dejan de descontarse al vender (decisión 6 del
--     dueño: «se omiten al vender en esta fase»). Antes se descontaban porque nadie leía is_optional.
--     Los dos son de la receta del producto 51669; el resto de las 55 recetas activas expande igual
--     que antes (comparado fila a fila: 118 de 120 filas idénticas, las 2 que faltan son esas).
--   * «Al producir» (production_type = 'preparation', decisión 1): 0 productos lo usan hoy.
--   * Un compuesto «al vender» que además lleva inventario sigue descontando ingredientes y producto,
--     como hasta hoy (3 productos). No se cambia sin datos que lo justifiquen.
--
-- Costos (B9, decisión 4): permiso nuevo inventory.costs.view. Lo reciben, de forma aditiva, los roles
-- y cargos que ya tienen inventory_management (Super Admin, Admin de organización, Manager y 3 cargos),
-- así que quien hoy administra inventario sigue viendo costos. El dueño de la organización y el
-- super admin lo ven siempre (check_user_permission / owner_user_id).

-- ── B1. Merma por ingrediente ────────────────────────────────────────────────
alter table public.recipe_ingredients
  add column if not exists waste_pct numeric(5,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipe_ingredients_waste_pct_rango') then
    alter table public.recipe_ingredients
      add constraint recipe_ingredients_waste_pct_rango check (waste_pct >= 0 and waste_pct < 100);
  end if;
end $$;

comment on column public.recipe_ingredients.waste_pct is
  'Merma en % sobre la cantidad neta: cantidad bruta = neta / (1 - merma/100). 0 = sin merma.';

-- ── B9. Permiso de costos ───────────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select 'inventory.costs.view', 'View costs', 'Ver costos y márgenes de productos y recetas', 'inventory', 'Sistema'
 where not exists (select 1 from public.permissions where code = 'inventory.costs.view');

insert into public.role_permissions (role_id, permission_id, allowed)
select distinct rp.role_id, pc.id, true
  from public.role_permissions rp
  join public.permissions pm on pm.id = rp.permission_id and pm.code = 'inventory_management'
 cross join (select id from public.permissions where code = 'inventory.costs.view') pc
 where rp.allowed
   and not exists (select 1 from public.role_permissions x where x.role_id = rp.role_id and x.permission_id = pc.id);

insert into public.job_position_permissions (job_position_id, permission_id, allowed)
select distinct jp.job_position_id, pc.id, true
  from public.job_position_permissions jp
  join public.permissions pm on pm.id = jp.permission_id and pm.code = 'inventory_management'
 cross join (select id from public.permissions where code = 'inventory.costs.view') pc
 where jp.allowed
on conflict (job_position_id, permission_id) do nothing;

create or replace function public.fn_receta_int_puede_ver_costos(p_org integer)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return coalesce(auth.role(), '') not in ('anon', 'authenticated');
  end if;
  return exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid)
      or public.check_user_permission(v_uid, p_org, 'inventory.costs.view');
end;
$$;

revoke all on function public.fn_receta_int_puede_ver_costos(integer) from public, anon;
grant execute on function public.fn_receta_int_puede_ver_costos(integer) to authenticated, service_role;

create or replace function public.fn_productos_permisos(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return jsonb_build_object('crear', true, 'editar', true, 'eliminar', true, 'ajustar', true, 'costos', true);
  end if;
  select exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) into v_owner;
  return jsonb_build_object(
    'crear', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.create')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'editar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.edit')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'eliminar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.delete')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'ajustar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.adjust')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'costos', public.fn_receta_int_puede_ver_costos(p_org)
  );
end;
$function$;

-- ── B4. Conversión de unidades ──────────────────────────────────────────────
-- Misma unidad → 1. Si no, la conversión de la organización y luego la global;
-- si solo existe la inversa, 1 / factor. NULL = no hay conversión.
-- (Las conversiones por producto, B2, quedan para la pestaña Unidades, §3.5.)
create or replace function public.fn_receta_int_factor(p_org integer, p_de text, p_a text)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when upper(btrim(coalesce(p_de, ''))) = upper(btrim(coalesce(p_a, ''))) then 1::numeric
    else coalesce(
      (select uc.factor from public.unit_conversions uc
        where upper(btrim(uc.from_unit_code)) = upper(btrim(p_de))
          and upper(btrim(uc.to_unit_code)) = upper(btrim(p_a))
          and uc.factor > 0
          and (uc.organization_id = p_org or uc.organization_id is null)
        order by uc.organization_id nulls last, uc.id
        limit 1),
      (select 1 / uc.factor from public.unit_conversions uc
        where upper(btrim(uc.from_unit_code)) = upper(btrim(p_a))
          and upper(btrim(uc.to_unit_code)) = upper(btrim(p_de))
          and uc.factor > 0
          and (uc.organization_id = p_org or uc.organization_id is null)
        order by uc.organization_id nulls last, uc.id
        limit 1))
  end;
$$;

-- ── B4. Resolutor único ─────────────────────────────────────────────────────
-- al_producir: el producto vendido o el dueño de la receta son 'preparation'.
create or replace function public.fn_receta_efectiva(p_product_id integer)
returns table (recipe_id integer, product_id integer, yield_qty numeric, heredada boolean, al_producir boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  select r.id,
         r.product_id,
         coalesce(nullif(r.yield_qty, 0), 1),
         r.product_id <> p.id,
         coalesce(p.production_type = 'preparation' or d.production_type = 'preparation', false)
    from public.products p
    join lateral (
      select pr.id, pr.product_id, pr.yield_qty
        from public.product_recipes pr
       where pr.is_active
         and (pr.product_id = p.id or (p.parent_product_id is not null and pr.product_id = p.parent_product_id))
       order by (pr.product_id = p.id) desc, pr.id desc
       limit 1
    ) r on true
    join public.products d on d.id = r.product_id
   where p.id = p_product_id;
$$;

create or replace function public.fn_receta_int_a_jsonb(p_recipe_id integer)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'recipe_id', r.id,
    'product_id', r.product_id,
    'organization_id', r.organization_id,
    'name', r.name,
    'yield_qty', coalesce(r.yield_qty, 1),
    'yield_unit_code', nullif(btrim(r.yield_unit_code), ''),
    'notes', r.notes,
    'version', coalesce(r.version, 1),
    'is_active', coalesce(r.is_active, false),
    'created_at', r.created_at,
    'ingredientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ingredient_product_id', ri.ingredient_product_id,
               'quantity', ri.quantity,
               'unit_code', btrim(ri.unit_code),
               'waste_pct', coalesce(ri.waste_pct, 0),
               'is_optional', coalesce(ri.is_optional, false),
               'notes', ri.notes)
             order by ri.sort_order, ri.id)
        from public.recipe_ingredients ri
       where ri.recipe_id = r.id), '[]'::jsonb))
    from public.product_recipes r
   where r.id = p_recipe_id;
$$;

-- ── B4. El cálculo ──────────────────────────────────────────────────────────
-- p_receta: {yield_qty, ingredientes:[{ingredient_product_id, quantity, unit_code, waste_pct, is_optional}]}
-- p_cantidad: unidades del producto que se venden o producen.
--   neta     = quantity × p_cantidad ÷ rinde           (en la unidad de la receta)
--   bruta    = neta ÷ (1 − merma/100)                   (decisión 3: merma sobre la neta)
--   cantidad = bruta × factor(unidad receta → unidad del ingrediente)
-- error: 'ingrediente_invalido' (no existe en la organización) | 'conversion_faltante'.
create or replace function public.fn_receta_int_calcular(p_org integer, p_receta jsonb, p_cantidad numeric)
returns table (
  orden integer,
  ingredient_product_id integer,
  nombre text,
  sku text,
  estado text,
  track_stock boolean,
  es_servicio boolean,
  es_padre boolean,
  unidad_receta text,
  unidad_ingrediente text,
  cantidad_neta numeric,
  merma_pct numeric,
  cantidad_bruta numeric,
  factor numeric,
  cantidad numeric,
  opcional boolean,
  error text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_rinde numeric := coalesce(nullif(nullif(p_receta->>'yield_qty', '')::numeric, 0), 1);
  v_l jsonb;
  v_i integer := 0;
  v_p record;
  v_merma numeric;
begin
  for v_l in select value from jsonb_array_elements(coalesce(p_receta->'ingredientes', '[]'::jsonb)) loop
    v_i := v_i + 1;
    select pr.id, pr.name, pr.sku, pr.status, pr.track_stock, pr.product_type, pr.is_parent, pr.unit_code
      into v_p
      from public.products pr
     where pr.id = nullif(v_l->>'ingredient_product_id', '')::integer
       and pr.organization_id = p_org;
    orden := v_i;
    ingredient_product_id := nullif(v_l->>'ingredient_product_id', '')::integer;
    nombre := v_p.name;
    sku := v_p.sku;
    estado := v_p.status;
    track_stock := coalesce(v_p.track_stock, false);
    es_servicio := coalesce(v_p.product_type = 'service', false);
    es_padre := coalesce(v_p.is_parent, false);
    unidad_ingrediente := upper(btrim(coalesce(v_p.unit_code, 'UN')));
    unidad_receta := upper(btrim(coalesce(nullif(v_l->>'unit_code', ''), v_p.unit_code, 'UN')));
    v_merma := least(greatest(coalesce(nullif(v_l->>'waste_pct', '')::numeric, 0), 0), 99.99);
    merma_pct := v_merma;
    cantidad_neta := coalesce(nullif(v_l->>'quantity', '')::numeric, 0) * coalesce(p_cantidad, 0) / v_rinde;
    cantidad_bruta := cantidad_neta / (1 - v_merma / 100);
    factor := public.fn_receta_int_factor(p_org, unidad_receta, unidad_ingrediente);
    cantidad := cantidad_bruta * coalesce(factor, 1);
    opcional := coalesce((v_l->>'is_optional')::boolean, false);
    error := case
      when v_p.id is null then 'ingrediente_invalido'
      when factor is null then 'conversion_faltante'
    end;
    return next;
  end loop;
end;
$$;

-- ── B4. Qué sale del inventario al vender ───────────────────────────────────
-- Filas: los ingredientes (es_ingrediente) y/o el producto mismo.
--   sin receta                 → el producto
--   «al producir»              → el producto (los ingredientes salieron al producir)
--   «al vender»                → los ingredientes con inventario, sin el propio producto (F-68)
--                                ni los opcionales (decisión 6); y el producto si lleva inventario
-- p_estricto: una conversión faltante en un ingrediente con inventario es error
-- (venta) o solo una marca en la fila (reservas y avisos previos).
create or replace function public.fn_receta_int_expandir(p_org integer, p_product_id integer, p_qty numeric, p_estricto boolean default true)
returns table (
  product_id integer,
  qty numeric,
  es_ingrediente boolean,
  track_stock boolean,
  recipe_id integer,
  nombre text,
  unidad text,
  error text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ef record;
  v_prod record;
  v_l record;
begin
  select p.id, p.name, p.track_stock, p.unit_code into v_prod from public.products p where p.id = p_product_id;
  select * into v_ef from public.fn_receta_efectiva(p_product_id);

  if v_ef.recipe_id is not null and not v_ef.al_producir then
    for v_l in
      select c.* from public.fn_receta_int_calcular(p_org, public.fn_receta_int_a_jsonb(v_ef.recipe_id), p_qty) c
    loop
      continue when v_l.ingredient_product_id = p_product_id;
      continue when v_l.opcional;
      continue when v_l.ingredient_product_id is null or v_l.error = 'ingrediente_invalido';
      if v_l.error = 'conversion_faltante' and v_l.track_stock and p_estricto then
        raise exception 'conversion_faltante' using errcode = '22023',
          detail = jsonb_build_object('ingrediente_id', v_l.ingredient_product_id, 'de', v_l.unidad_receta,
                                      'a', v_l.unidad_ingrediente)::text;
      end if;
      product_id := v_l.ingredient_product_id;
      qty := v_l.cantidad;
      es_ingrediente := true;
      track_stock := v_l.track_stock;
      recipe_id := v_ef.recipe_id;
      nombre := v_l.nombre;
      unidad := v_l.unidad_ingrediente;
      error := v_l.error;
      return next;
    end loop;
    if coalesce(v_prod.track_stock, false) then
      product_id := p_product_id; qty := p_qty; es_ingrediente := false; track_stock := true;
      recipe_id := v_ef.recipe_id; nombre := v_prod.name; unidad := upper(btrim(coalesce(v_prod.unit_code, 'UN')));
      error := null;
      return next;
    end if;
    return;
  end if;

  product_id := p_product_id; qty := p_qty; es_ingrediente := false; track_stock := coalesce(v_prod.track_stock, false);
  recipe_id := v_ef.recipe_id; nombre := v_prod.name; unidad := upper(btrim(coalesce(v_prod.unit_code, 'UN')));
  error := null;
  return next;
end;
$$;

-- Helpers de invocador: los ejecuta quien descuenta (RLS aplica si es el navegador).
revoke all on function public.fn_receta_int_factor(integer, text, text) from public, anon;
revoke all on function public.fn_receta_efectiva(integer) from public, anon;
revoke all on function public.fn_receta_int_a_jsonb(integer) from public, anon;
revoke all on function public.fn_receta_int_calcular(integer, jsonb, numeric) from public, anon;
revoke all on function public.fn_receta_int_expandir(integer, integer, numeric, boolean) from public, anon;
grant execute on function public.fn_receta_int_factor(integer, text, text) to authenticated, service_role;
grant execute on function public.fn_receta_efectiva(integer) to authenticated, service_role;
grant execute on function public.fn_receta_int_a_jsonb(integer) to authenticated, service_role;
grant execute on function public.fn_receta_int_calcular(integer, jsonb, numeric) to authenticated, service_role;
grant execute on function public.fn_receta_int_expandir(integer, integer, numeric, boolean) to authenticated, service_role;

-- ── B6. Venta ───────────────────────────────────────────────────────────────
create or replace function public.decrement_stock_with_recipe(
  p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric, p_source text,
  p_source_id text default null::text, p_unit_cost numeric default null::numeric,
  p_updated_by uuid default null::uuid, p_note text default null::text)
returns json
language plpgsql
as $function$
declare
  v_ef record;
  v_row record;
  v_nombre text;
  v_n integer := 0;
  v_prod boolean := false;
begin
  select * into v_ef from public.fn_receta_efectiva(p_product_id);
  if v_ef.recipe_id is null then
    return public.decrement_stock_on_sale(p_organization_id, p_branch_id, p_product_id, p_qty, p_source, p_source_id,
                                          p_unit_cost, p_note, p_updated_by);
  end if;
  select coalesce(r.name, 'receta') into v_nombre from public.product_recipes r where r.id = v_ef.recipe_id;

  for v_row in select * from public.fn_receta_int_expandir(p_organization_id, p_product_id, p_qty, true) loop
    continue when not v_row.track_stock;
    if v_row.es_ingrediente then
      perform public.decrement_stock_on_sale(p_organization_id, p_branch_id, v_row.product_id, v_row.qty, p_source,
        p_source_id, null, concat('Ingrediente de receta: ', v_nombre, ' - ', v_row.nombre, coalesce(' | ' || p_note, '')),
        p_updated_by);
      v_n := v_n + 1;
    else
      perform public.decrement_stock_on_sale(p_organization_id, p_branch_id, p_product_id, p_qty, p_source, p_source_id,
                                             p_unit_cost, p_note, p_updated_by);
      v_prod := true;
    end if;
  end loop;

  return json_build_object('success', true,
    'mode', case when v_ef.al_producir then 'preparation' else 'recipe' end,
    'recipe_id', v_ef.recipe_id, 'inherited', v_ef.heredada,
    'ingredients_processed', v_n, 'product_stock_deducted', v_prod);
end;
$function$;

revoke all on function public.decrement_stock_with_recipe(integer, integer, integer, numeric, text, text, numeric, uuid, text) from public, anon;
grant execute on function public.decrement_stock_with_recipe(integer, integer, integer, numeric, text, text, numeric, uuid, text) to authenticated, service_role;

-- ── B6. Producción ──────────────────────────────────────────────────────────
-- Mismo cálculo que la venta: se corrige que v_conv_factor servía a la vez de
-- proporción (producido ÷ rinde) y de conversión, así que tras el primer
-- ingrediente con otra unidad los siguientes salían mal. Merma y conversión
-- obligatoria incluidas; los opcionales no se consumen. La fila de stock se
-- busca con FOUND (antes «record IS NOT NULL» era falso si avg_cost venía NULL
-- y se insertaba una segunda fila). El costo del terminado
-- y el paso por el kardex común quedan para la pestaña Producción (§3.3).
create or replace function public.complete_production_order(p_order_id integer, p_produced_qty numeric, p_updated_by uuid default null::uuid)
returns json
language plpgsql
as $function$
declare
  v_order record;
  v_ing record;
  v_movement_id integer;
  v_ingredients_processed integer := 0;
  v_existing_stock record;
  v_hay_stock boolean;
  v_new_qty numeric;
  v_prod_track_stock boolean;
begin
  select * into v_order from production_orders where id = p_order_id for update;
  if not found then raise exception 'Orden de producción % no encontrada', p_order_id; end if;
  if v_order.status not in ('in_progress', 'confirmed') then
    raise exception 'La orden % no se puede completar desde estado %', p_order_id, v_order.status;
  end if;
  if not exists (select 1 from product_recipes where id = v_order.recipe_id and is_active = true) then
    raise exception 'La receta % de la orden no está activa', v_order.recipe_id;
  end if;

  for v_ing in
    select c.* from public.fn_receta_int_calcular(v_order.organization_id, public.fn_receta_int_a_jsonb(v_order.recipe_id), p_produced_qty) c
  loop
    continue when v_ing.error = 'ingrediente_invalido' or not v_ing.track_stock or v_ing.opcional;
    if v_ing.error = 'conversion_faltante' then
      raise exception 'conversion_faltante' using errcode = '22023',
        detail = jsonb_build_object('ingrediente_id', v_ing.ingredient_product_id, 'de', v_ing.unidad_receta,
                                    'a', v_ing.unidad_ingrediente)::text;
    end if;
    select id, qty_on_hand, avg_cost into v_existing_stock from stock_levels
     where product_id = v_ing.ingredient_product_id and branch_id = v_order.branch_id and lot_id is null limit 1;
    v_hay_stock := found;
    if v_hay_stock then
      v_new_qty := coalesce(v_existing_stock.qty_on_hand, 0) - v_ing.cantidad;
      update stock_levels set qty_on_hand = v_new_qty, updated_at = now() where id = v_existing_stock.id;
    else
      v_new_qty := -v_ing.cantidad;
      insert into stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
      values (v_ing.ingredient_product_id, v_order.branch_id, null, v_new_qty, 0, 0, 0);
    end if;
    insert into stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by)
    values (v_order.organization_id, v_order.branch_id, v_ing.ingredient_product_id, null, 'out', v_ing.cantidad,
            coalesce(v_existing_stock.avg_cost, 0), 'production', p_order_id::text,
            concat('Consumo producción #', p_order_id, ' - ', v_ing.nombre), p_updated_by)
    returning id into v_movement_id;
    insert into production_order_consumptions (production_order_id, ingredient_product_id, quantity_consumed, unit_code, stock_movement_id)
    values (p_order_id, v_ing.ingredient_product_id, v_ing.cantidad, v_ing.unidad_ingrediente, v_movement_id);
    v_ingredients_processed := v_ingredients_processed + 1;
  end loop;

  select track_stock into v_prod_track_stock from products where id = v_order.product_id;
  if v_prod_track_stock = true then
    select id, qty_on_hand, avg_cost into v_existing_stock from stock_levels
     where product_id = v_order.product_id and branch_id = v_order.branch_id and lot_id is null limit 1;
    v_hay_stock := found;
    if v_hay_stock then
      v_new_qty := coalesce(v_existing_stock.qty_on_hand, 0) + p_produced_qty;
      update stock_levels set qty_on_hand = v_new_qty, updated_at = now() where id = v_existing_stock.id;
    else
      insert into stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
      values (v_order.product_id, v_order.branch_id, null, p_produced_qty, 0, 0, 0);
    end if;
    insert into stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by)
    values (v_order.organization_id, v_order.branch_id, v_order.product_id, null, 'in', p_produced_qty, 0, 'production',
            p_order_id::text, concat('Producción #', p_order_id, ' - ingreso producto terminado'), p_updated_by)
    returning id into v_movement_id;
  end if;

  update production_orders set status = 'completed', produced_qty = p_produced_qty, completed_at = now(), updated_at = now()
   where id = p_order_id;
  return json_build_object('success', true, 'order_id', p_order_id, 'produced_qty', p_produced_qty,
    'ingredients_processed', v_ingredients_processed, 'product_stock_added', v_prod_track_stock = true);
end;
$function$;

revoke all on function public.complete_production_order(integer, numeric, uuid) from public, anon;
grant execute on function public.complete_production_order(integer, numeric, uuid) to authenticated, service_role;
