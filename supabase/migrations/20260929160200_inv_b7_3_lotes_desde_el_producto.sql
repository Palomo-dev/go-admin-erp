-- Inventario B7 · 3/3 — Manejo de lotes desde el formulario del producto
-- docs/implementacion/INVENTARIO-PLAN.md §5.8 y anexo B1 («ningún producto
-- tiene track_lots = true y ningún formulario lo activa»).
--
-- 1. fn_producto_guardar acepta `producto.track_lots` (parche sobre la
--    definición viva: la función la editan a la vez recetas, membresías y
--    venta por peso; se inserta UNA línea tras un ancla única y queda un
--    marcador). Si el payload no trae la clave se conserva lo que había (el
--    alta rápida y el GO Assistant no la mandan). Sin control de existencias
--    no hay lotes.
-- 2. Las variantes heredan `track_lots` del padre (disparador): al crear una
--    variante y al cambiar el padre. La venta descuenta por FEFO sobre la
--    variante, así que padre y variantes van juntos.
-- 3. fn_producto_int_stock_inicial: si el producto maneja lotes, cada entrada
--    con cantidad entra a un lote (el de `lot_code` si ya existe; si no, se
--    crea con fn_lote_guardar de B1, con `expiry_date` opcional y código
--    propuesto L-AAAAMMDD si viene vacío) y el movimiento va por la primitiva
--    fn_inv_int_mover con origen `initial` (el mismo que fn_register_stock_entry).
--    Sin lotes, el camino de siempre (fn_register_stock_entry).
--
-- Todas DEFINER con search_path fijo; las internas sin EXECUTE para nadie.

-- ─── 1. fn_producto_guardar: track_lots ─────────────────────────────────────
do $$
declare
  v_def text;
  -- Con el salto de línea delante: la copia a las variantes lleva otra sangría.
  v_ancla text := E'\n      track_serial = coalesce((v_pr->>''track_serial'')::boolean, false),\n';
  v_linea text := E'      track_lots = case when not v_track then false when v_pr ? ''track_lots'' then coalesce((v_pr->>''track_lots'')::boolean, false) else track_lots end, -- inv_b7_3 track_lots\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_producto_guardar';
  if v_def is null then
    raise exception 'inv_b7_3: fn_producto_guardar no existe';
  end if;
  if position('inv_b7_3 track_lots' in v_def) > 0 then
    return; -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'inv_b7_3: el ancla de track_serial no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, v_ancla || v_linea);
end;
$$;

-- ─── 2. Variantes heredan track_lots ────────────────────────────────────────
create or replace function public.fn_producto_int_lotes_de_variantes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.track_lots is distinct from old.track_lots then
    update public.products c
       set track_lots = new.track_lots, updated_at = now()
     where c.parent_product_id = new.id
       and c.track_lots is distinct from new.track_lots;
  end if;
  return null;
end;
$$;

create or replace function public.fn_producto_int_lotes_hereda_padre()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_product_id is not null then
    select coalesce(p.track_lots, false) into new.track_lots
      from public.products p where p.id = new.parent_product_id;
    new.track_lots := coalesce(new.track_lots, false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_producto_lotes_hereda_padre on public.products;
create trigger trg_producto_lotes_hereda_padre
  before insert or update of parent_product_id on public.products
  for each row execute function public.fn_producto_int_lotes_hereda_padre();

drop trigger if exists trg_producto_lotes_variantes on public.products;
create trigger trg_producto_lotes_variantes
  after update of track_lots on public.products
  for each row execute function public.fn_producto_int_lotes_de_variantes();

revoke all on function public.fn_producto_int_lotes_de_variantes() from public, anon, authenticated;
revoke all on function public.fn_producto_int_lotes_hereda_padre() from public, anon, authenticated;

-- ─── 3. Stock inicial con lote ──────────────────────────────────────────────
create or replace function public.fn_producto_int_stock_inicial(
  p_org integer, p_product_id integer, p_entradas jsonb, p_nota text default 'Stock inicial')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_e jsonb;
  v_branch integer;
  v_entries jsonb := '[]'::jsonb;
  v_lotes boolean;
  v_lot integer;
  v_code text;
  v_permiso boolean := false;
begin
  select p.track_lots into v_lotes
    from public.products p where p.id = p_product_id and p.organization_id = p_org and p.track_stock;
  if not found then
    return;
  end if;
  -- Filas en 0 para las sucursales activas (y las que traiga la entrada) sin fila propia.
  insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
  select p_product_id, b.id, null, 0, 0, 0, 0
    from public.branches b
   where b.organization_id = p_org
     and (b.is_active or b.id in (select (x->>'branch_id')::int from jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) x))
     and not exists (select 1 from public.stock_levels sl
                      where sl.product_id = p_product_id and sl.branch_id = b.id and sl.lot_id is null);

  for v_e in select * from jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) loop
    v_branch := (v_e->>'branch_id')::int;
    if not exists (select 1 from public.branches where id = v_branch and organization_id = p_org) then
      raise exception 'sucursal_invalida' using errcode = '22023';
    end if;
    if v_e ? 'min_level' then
      update public.stock_levels set min_level = greatest(coalesce((v_e->>'min_level')::numeric, 0), 0), updated_at = now()
       where product_id = p_product_id and branch_id = v_branch and lot_id is null;
    end if;
    if coalesce((v_e->>'qty')::numeric, 0) > 0 then
      if coalesce((v_e->>'unit_cost')::numeric, 0) <= 0 then
        raise exception 'stock_sin_costo' using errcode = '22023', detail = v_branch::text;
      end if;
      if coalesce(v_lotes, false) then
        -- Con lotes: el lote (existente o nuevo) y la entrada por la primitiva.
        if not v_permiso then
          perform public.fn_inventario_exigir_permiso(p_org, array['crear', 'editar_catalogo', 'ajustar']);
          v_permiso := true;
        end if;
        v_code := left(nullif(btrim(coalesce(v_e->>'lot_code', '')), ''), 60);
        v_lot := null;
        if v_code is not null then
          select l.id into v_lot from public.lots l
           where l.organization_id = p_org and l.product_id = p_product_id and l.lot_code = v_code;
        end if;
        if v_lot is null then
          v_lot := (public.fn_lote_guardar(p_org, jsonb_build_object(
            'product_id', p_product_id, 'lot_code', coalesce(v_code, ''),
            'expiry_date', nullif(v_e->>'expiry_date', ''), 'branch_id', v_branch))->>'lot_id')::integer;
        end if;
        perform public.fn_inv_int_mover(p_org, v_branch, p_product_id, v_lot, 'in',
          (v_e->>'qty')::numeric, (v_e->>'unit_cost')::numeric,
          'initial', null, coalesce(p_nota, 'Stock inicial'), auth.uid(),
          jsonb_build_object('recalcular_costo', true, 'fefo', false));
      else
        v_entries := v_entries || jsonb_build_object(
          'organization_id', p_org, 'branch_id', v_branch, 'product_id', p_product_id,
          'qty', (v_e->>'qty')::numeric, 'unit_cost', coalesce((v_e->>'unit_cost')::numeric, 0),
          'source', 'initial', 'source_id', null, 'note', coalesce(p_nota, 'Stock inicial'),
          'updated_by', auth.uid());
      end if;
    elsif coalesce((v_e->>'qty')::numeric, 0) < 0 then
      raise exception 'cantidad_negativa' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(v_entries) > 0 then
    -- Exige costo > 0 con cantidad (regla del kardex y la contabilidad).
    perform public.fn_register_stock_entry(v_entries, null);
  end if;
end;
$$;

revoke all on function public.fn_producto_int_stock_inicial(integer, integer, jsonb, text) from public, anon, authenticated;
