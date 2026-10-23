-- Devolución de un producto con receta.
--
-- La venta descuenta los ingredientes (decrement_stock_with_recipe) aunque el
-- producto vendido no lleve existencias. procesar_devolucion solo reponía ese
-- producto cuando track_stock era verdadero, y la salida del ingrediente se
-- quedaba fuera. Tampoco quedaba guardada la receta usada.
--
-- Desde aquí:
--   * sale_items.recipe_id conserva la receta efectiva al vender y no se pisa.
--   * La nota del ingrediente termina en «| vendido:<producto>» para saber de
--     qué línea salió. Las notas viejas, sin esa marca, solo se atribuyen si la
--     venta tiene una sola mercancía.
--   * Al devolver, se reponen esas salidas reales con fn_stock_entrada_devolucion,
--     en proporción a lo devuelto y al costo de cada salida. No se vuelve a
--     expandir la receta: si cambió después, vuelve lo que se consumió.
--   * Manda el mismo criterio que ya resolvió la línea: affects_inventory y, si
--     hay seriales, los marcados in_stock. Cantidad 0 no repone.
--   * La misma salida de la misma línea no se repone dos veces en la devolución.
--   * Una devolución normal, de variante o de modificador no entra: su nota no
--     empieza por «Ingrediente de receta:» y el producto sigue el camino de siempre.
--
-- Backfill (idempotente): devoluciones ya procesadas, motivo que afecta
-- inventario, producto por unidad y sin serial, una sola mercancía en la venta
-- y salidas de ingrediente sin etiqueta. La vista previa anterior a aplicar
-- encontró una. El asiento lo crea el disparador que ya contabiliza cualquier
-- entrada de devolución. Reversión: el rollback del mismo nombre.

alter table public.sale_items
  add column if not exists recipe_id integer;

comment on column public.sale_items.recipe_id is
  'Receta efectiva al vender. No se reescribe si la receta cambia después: la devolución repone las salidas reales de ingredientes.';

do $fk$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'sale_items_recipe_id_fkey'
       and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_recipe_id_fkey
      foreign key (recipe_id) references public.product_recipes (id) on delete set null;
  end if;
end
$fk$;

create or replace function public.fn_devolucion_reponer_ingredientes(
  p_organization_id integer,
  p_branch_id integer,
  p_sale_id uuid,
  p_sale_item_id uuid,
  p_product_id integer,
  p_sold_qty numeric,
  p_return_qty numeric,
  p_return_id integer,
  p_updated_by uuid
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total numeric;
  v_out record;
  v_qty numeric;
  v_mov integer;
  v_primero integer;
  v_sola boolean;
begin
  if p_sale_item_id is null
     or coalesce(p_return_qty, 0) <= 0
     or coalesce(p_sold_qty, 0) <= 0
     or p_return_id is null then
    return null;
  end if;
  if not exists (
    select 1
      from public.sales s
     where s.id = p_sale_id
       and s.organization_id = p_organization_id
  ) then
    return null;
  end if;
  if not exists (
    select 1
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
     where si.id = p_sale_item_id
       and s.id = p_sale_id
       and s.organization_id = p_organization_id
       and si.product_id = p_product_id
  ) then
    return null;
  end if;

  select coalesce(sum(si.quantity), 0)
    into v_total
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
   where si.sale_id = p_sale_id
     and s.organization_id = p_organization_id
     and si.product_id = p_product_id
     and si.quantity > 0;
  if v_total <= 0 then
    v_total := p_sold_qty;
  end if;

  -- Sin etiqueta «vendido», la salida solo es de este producto si no había otro.
  select not exists (
    select 1
      from public.sale_items o
      join public.sales os on os.id = o.sale_id
     where o.sale_id = p_sale_id
       and os.organization_id = p_organization_id
       and o.product_id is distinct from p_product_id
       and o.quantity > 0
  ) into v_sola;

  for v_out in
    select sm.id, sm.product_id, sm.qty, sm.unit_cost, sm.note
      from public.stock_movements sm
     where sm.organization_id = p_organization_id
       and sm.branch_id = p_branch_id
       and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
       and sm.source_id = p_sale_id::text
       and sm.direction = 'out'
       and sm.qty > 0
       and sm.note like 'Ingrediente de receta:%'
       and (
         sm.note ~ ('\| vendido:' || p_product_id::text || '( \||$)')
         or (sm.note not like '%| vendido:%' and v_sola)
       )
     order by sm.id
  loop
    if exists (
      select 1
        from public.stock_movements inn
       where inn.organization_id = p_organization_id
         and inn.source = 'return'
         and inn.source_id = p_return_id::text
         and inn.direction = 'in'
         and inn.product_id = v_out.product_id
         and inn.note like 'Reposición de ingrediente:%'
         and position('| salida:' || v_out.id::text || ' | linea:' || p_sale_item_id::text in inn.note) > 0
    ) then
      continue;
    end if;

    -- El kardex guarda tres decimales (fn_inv_int_mover).
    v_qty := round(v_out.qty * p_return_qty / v_total, 3);
    if v_qty <= 0 then
      continue;
    end if;

    v_mov := public.fn_stock_entrada_devolucion(
      p_organization_id, p_branch_id, v_out.product_id, v_qty, v_out.unit_cost,
      p_return_id::text,
      'Reposición de ingrediente: ' || coalesce(v_out.note, '')
        || ' | salida:' || v_out.id::text
        || ' | linea:' || p_sale_item_id::text,
      p_updated_by);
    if v_primero is null then
      v_primero := v_mov;
    end if;
  end loop;

  return v_primero;
end;
$function$;

comment on function public.fn_devolucion_reponer_ingredientes(integer, integer, uuid, uuid, integer, numeric, numeric, integer, uuid) is
  'Repone, en proporción a la cantidad devuelta, las salidas de ingredientes de una venta. Usa el costo de cada salida y no la receta vigente.';

revoke all on function public.fn_devolucion_reponer_ingredientes(integer, integer, uuid, uuid, integer, numeric, numeric, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_devolucion_reponer_ingredientes(integer, integer, uuid, uuid, integer, numeric, numeric, integer, uuid) to service_role;

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

  if p_source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
     and p_source_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    update public.sale_items si
       set recipe_id = v_ef.recipe_id
      from public.sales s
     where si.sale_id = s.id
       and s.organization_id = p_organization_id
       and s.id = p_source_id::uuid
       and si.product_id = p_product_id
       and si.recipe_id is null;
  end if;

  for v_row in select * from public.fn_receta_int_expandir(p_organization_id, p_product_id, p_qty, true) loop
    continue when not v_row.track_stock;
    if v_row.es_ingrediente then
      perform public.decrement_stock_on_sale(p_organization_id, p_branch_id, v_row.product_id, v_row.qty, p_source,
        p_source_id, null,
        concat('Ingrediente de receta: ', v_nombre, ' - ', v_row.nombre,
               ' | vendido:', p_product_id::text, coalesce(' | ' || p_note, '')),
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

-- Parche sobre la definición viva, como 20260929120300. No se reescribe el
-- cuerpo: seriales, peso y membresías siguen donde estaban.
do $parche$
declare
  v_def text := pg_get_functiondef('public.procesar_devolucion(integer,uuid,jsonb,text,text,text,text)'::regprocedure);
  v_old_decl text := '  v_mov_stock integer;';
  v_new_decl text := $decl$  v_mov_stock integer;
  v_mov_ing integer;$decl$;
  v_old_serial text := '    -- Seriales: vuelven a stock si el motivo repone; si no, quedan «returned».';
  v_new_serial text := $frag$
    -- Ingredientes (devolucion_receta_ingredientes): repone las salidas reales
    -- de esa venta, en proporción a lo devuelto y al costo de cada salida.
    v_mov_ing := public.fn_devolucion_reponer_ingredientes(
      p_organization_id, v_sale.branch_id, v_sale.id,
      (v_linea->>'sale_item_id')::uuid,
      (v_linea->>'product_id')::integer,
      (v_linea->>'sold_quantity')::numeric,
      case
        when jsonb_typeof(v_linea->'serial_dispositions') = 'object'
             and v_linea->'serial_dispositions' <> '{}'::jsonb then
          coalesce((
            select count(*) filter (where d.value = 'in_stock')
              from jsonb_each_text(v_linea->'serial_dispositions') d
          ), 0)::numeric
        when coalesce((v_linea->>'affects_inventory')::boolean, false) then
          (v_linea->>'quantity')::numeric
        else 0
      end,
      v_return_id, v_uid);
    if v_mov_stock is null then
      v_mov_stock := v_mov_ing;
    end if;

    -- Seriales: vuelven a stock si el motivo repone; si no, quedan «returned».$frag$;
  v_nueva text;
begin
  if position('fn_devolucion_reponer_ingredientes' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old_decl, ''))) / length(v_old_decl) <> 1
     or (length(v_def) - length(replace(v_def, v_old_serial, ''))) / length(v_old_serial) <> 1 then
    raise exception 'procesar_devolucion cambió: un fragmento del parche no aparece una sola vez';
  end if;
  execute replace(replace(v_def, v_old_decl, v_new_decl), v_old_serial, v_new_serial);

  v_nueva := pg_get_functiondef('public.procesar_devolucion(integer,uuid,jsonb,text,text,text,text)'::regprocedure);
  if position('fn_devolucion_reponer_ingredientes' in v_nueva) = 0
     or position('(v_linea->>''track_stock'')::boolean and v_entra > 0' in v_nueva) = 0
     or position('fn_membresias_revertir_linea' in v_nueva) = 0
     or position('fn_stock_entrada_devolucion' in v_nueva) = 0 then
    raise exception 'el parche de procesar_devolucion no dejó el producto, los ingredientes y las membresías';
  end if;
end
$parche$;

-- Backfill de lo ya devuelto y no repuesto. Si no cuadra con la vista previa
-- (una pendiente, ninguna hecha), no toca existencias.
do $backfill$
declare
  v_pending integer;
  v_done integer;
  v_n integer := 0;
  v_linea record;
  v_mov integer;
  v_total numeric;
  v_antes numeric;
  v_despues numeric;
  v_entradas numeric;
begin
  create temporary table tmp_dev_receta_candidatos on commit drop as
  select r.id as return_id,
         r.organization_id,
         r.branch_id,
         r.sale_id,
         r.user_id,
         rl.id as return_line_id,
         rl.sale_item_id,
         rl.product_id,
         rl.quantity,
         exists (
           select 1
             from public.stock_movements ya
            where ya.organization_id = r.organization_id
              and ya.source = 'return'
              and ya.source_id = r.id::text
              and ya.direction = 'in'
              and ya.note like 'Reposición de ingrediente:%'
         ) as ya
    from public.returns r
    join public.return_lines rl
      on rl.return_id = r.id
     and rl.organization_id = r.organization_id
    join public.return_reasons rr
      on rr.id = rl.reason_id
     and rr.organization_id = r.organization_id
    join public.products p
      on p.id = rl.product_id
     and p.organization_id = r.organization_id
   where r.status = 'processed'
     and rl.quantity > 0
     and rl.sale_item_id is not null
     and rr.affects_inventory
     and coalesce(p.track_serial, false) = false
     and coalesce(p.sale_mode, 'unit') = 'unit'
     and (
       select count(distinct si.product_id)
         from public.sale_items si
        where si.sale_id = r.sale_id
          and si.quantity > 0
     ) = 1
     and exists (
       select 1
         from public.stock_movements sm
        where sm.organization_id = r.organization_id
          and sm.branch_id = r.branch_id
          and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
          and sm.source_id = r.sale_id::text
          and sm.direction = 'out'
          and sm.qty > 0
          and sm.note like 'Ingrediente de receta:%'
          and sm.note not like '%| vendido:%'
     );

  select count(*) filter (where not ya), count(*) filter (where ya)
    into v_pending, v_done
    from tmp_dev_receta_candidatos;

  if v_pending = 0 and v_done > 0 then
    return;
  end if;
  if v_pending <> 1 or v_done <> 0 then
    raise exception 'La vista previa del backfill no coincide: pendientes %, ya repuestas %', v_pending, v_done;
  end if;

  for v_linea in
    select * from tmp_dev_receta_candidatos where not ya
  loop
    v_n := v_n + 1;

    select coalesce(sum(si.quantity), 0)
      into v_total
      from public.sale_items si
     where si.sale_id = v_linea.sale_id
       and si.product_id = v_linea.product_id
       and si.quantity > 0;

    perform sl.qty_on_hand
      from public.stock_levels sl
     where sl.lot_id is null
       and sl.branch_id = v_linea.branch_id
       and sl.product_id in (
         select sm.product_id
           from public.stock_movements sm
          where sm.organization_id = v_linea.organization_id
            and sm.branch_id = v_linea.branch_id
            and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
            and sm.source_id = v_linea.sale_id::text
            and sm.direction = 'out'
            and sm.note like 'Ingrediente de receta:%'
       )
       for update;

    select coalesce(sum(sl.qty_on_hand), 0)
      into v_antes
      from public.stock_levels sl
     where sl.lot_id is null
       and sl.branch_id = v_linea.branch_id
       and sl.product_id in (
         select sm.product_id
           from public.stock_movements sm
          where sm.organization_id = v_linea.organization_id
            and sm.branch_id = v_linea.branch_id
            and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
            and sm.source_id = v_linea.sale_id::text
            and sm.direction = 'out'
            and sm.note like 'Ingrediente de receta:%'
       );

    v_mov := public.fn_devolucion_reponer_ingredientes(
      v_linea.organization_id, v_linea.branch_id, v_linea.sale_id,
      v_linea.sale_item_id, v_linea.product_id, v_total,
      v_linea.quantity, v_linea.return_id, v_linea.user_id);
    if v_mov is null then
      raise exception 'El backfill no creó la entrada de la devolución %', v_linea.return_id;
    end if;

    if exists (
      select 1
        from public.stock_movements inn
        join public.stock_movements outs
          on outs.id = substring(inn.note from 'salida:([0-9]+)')::integer
       where inn.organization_id = v_linea.organization_id
         and inn.source = 'return'
         and inn.source_id = v_linea.return_id::text
         and inn.direction = 'in'
         and inn.note like 'Reposición de ingrediente:%'
         and position('| linea:' || v_linea.sale_item_id::text in inn.note) > 0
         and (
           inn.product_id is distinct from outs.product_id
           or inn.unit_cost is distinct from outs.unit_cost
           or inn.qty is distinct from round(outs.qty * v_linea.quantity / v_total, 3)
           or inn.product_id = v_linea.product_id
         )
    ) then
      raise exception 'La reposición de la devolución % no cuadra con la salida', v_linea.return_id;
    end if;

    if exists (
      select 1
        from public.stock_movements inn
       where inn.organization_id = v_linea.organization_id
         and inn.source = 'return'
         and inn.source_id = v_linea.return_id::text
         and inn.direction = 'in'
         and inn.note like 'Reposición de ingrediente:%'
         and not exists (
           select 1
             from public.journal_entries je
            where je.organization_id = inn.organization_id
              and je.fact_key = 'stock_movement:' || inn.id::text
              and je.posted
         )
    ) then
      raise exception 'La reposición de la devolución % quedó sin asiento', v_linea.return_id;
    end if;

    select coalesce(sum(inn.qty), 0)
      into v_entradas
      from public.stock_movements inn
     where inn.organization_id = v_linea.organization_id
       and inn.source = 'return'
       and inn.source_id = v_linea.return_id::text
       and inn.direction = 'in'
       and inn.note like 'Reposición de ingrediente:%';

    select coalesce(sum(sl.qty_on_hand), 0)
      into v_despues
      from public.stock_levels sl
     where sl.lot_id is null
       and sl.branch_id = v_linea.branch_id
       and sl.product_id in (
         select sm.product_id
           from public.stock_movements sm
          where sm.organization_id = v_linea.organization_id
            and sm.branch_id = v_linea.branch_id
            and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
            and sm.source_id = v_linea.sale_id::text
            and sm.direction = 'out'
            and sm.note like 'Ingrediente de receta:%'
       );
    if v_despues is distinct from v_antes + v_entradas then
      raise exception 'El stock de la devolución % no subió lo reposicionado (antes %, entradas %, ahora %)',
        v_linea.return_id, v_antes, v_entradas, v_despues;
    end if;

    update public.return_lines
       set restocked = true,
           stock_movement_id = coalesce(stock_movement_id, v_mov)
     where id = v_linea.return_line_id
       and organization_id = v_linea.organization_id;

    update public.sale_items si
       set recipe_id = (
         select pr.id
           from public.product_recipes pr
          where pr.product_id = si.product_id
            and pr.organization_id = v_linea.organization_id
       )
     where si.id = v_linea.sale_item_id
       and si.recipe_id is null
       and (
         select count(*)
           from public.product_recipes pr
          where pr.product_id = si.product_id
            and pr.organization_id = v_linea.organization_id
       ) = 1;

    if not exists (
      select 1
        from public.sale_items si
       where si.id = v_linea.sale_item_id
         and si.recipe_id is not null
    ) then
      raise exception 'La venta de la devolución % no quedó con su receta', v_linea.return_id;
    end if;
  end loop;

  if v_n <> 1 then
    raise exception 'El backfill procesó % líneas y la vista previa era una', v_n;
  end if;
end
$backfill$;
