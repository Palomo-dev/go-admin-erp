-- Entradas serializadas sin seriales, y serial_ids en el cobro del POS.
--
-- Un producto con track_serial podía recibir existencia (inicial, ajuste del
-- producto o compra) sin la misma cantidad de seriales in_stock. La recepción
-- de factura y el documento de ajuste ya los exigían; la primitiva no.
-- Este parche no inventa seriales para el hueco que ya existe: solo impide
-- agrandarlo y deja un reporte de lectura.
--
-- pos_checkout_v1: si el insert de sale_items aún no guarda serial_ids, lo
-- añade. Si ya los escribe (otra migración), no toca la función.

-- ── 1. fn_inv_int_mover: entrada inicial, ajuste o compra con serial ────────
do $mover$
declare
  v_def text := pg_get_functiondef('public.fn_inv_int_mover(integer,integer,integer,integer,text,numeric,numeric,text,text,text,uuid,jsonb)'::regprocedure);
  v_sel_old text := 'select p.id, p.organization_id, p.track_stock, p.track_lots into v_prod';
  v_sel_new text := 'select p.id, p.organization_id, p.track_stock, p.track_lots, p.track_serial into v_prod';
  v_old text := $old$    if v_n <> array_length(v_seriales, 1) then
      raise exception 'serial_no_disponible' using errcode = '22023';
    end if;
  end if;$old$;
  v_new text := $new$    if v_n <> array_length(v_seriales, 1) then
      raise exception 'serial_no_disponible' using errcode = '22023';
    end if;
  end if;

  -- stock_serializado_sin_seriales: la entrada inicial, el ajuste y la compra
  -- de un producto con serial exigen tantos seriales como unidades. No se inventan.
  if p_direction = 'in'
     and p_source in ('initial', 'adjustment', 'purchase', 'purchase_order', 'purchase_invoice')
     and coalesce(v_prod.track_serial, false)
  then
    if v_qty <> trunc(v_qty)
       or coalesce(array_length(v_seriales, 1), 0) <> v_qty::integer
    then
      raise exception 'seriales_no_cuadran' using errcode = '22023',
        detail = jsonb_build_object(
          'product_id', p_product,
          'cantidad', v_qty,
          'seriales', coalesce(array_length(v_seriales, 1), 0),
          'source', p_source
        )::text;
    end if;
  end if;$new$;
begin
  if position('stock_serializado_sin_seriales' in v_def) > 0 then
    raise notice 'fn_inv_int_mover ya exige seriales en la entrada';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_sel_old, ''))) / length(v_sel_old) <> 1 then
    raise exception 'fn_inv_int_mover: el select del producto no aparece exactamente una vez';
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_inv_int_mover: el cierre de seriales no aparece exactamente una vez';
  end if;
  execute replace(replace(v_def, v_sel_old, v_sel_new), v_old, v_new);
end;
$mover$;

-- ── 2. Reporte de lectura: existencia mayor que los seriales que la ocupan ──
create or replace function public.fn_reporte_stock_sin_seriales(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas jsonb;
begin
  if p_org is null then
    raise exception 'organizacion_requerida' using errcode = '22023';
  end if;
  perform public.fn_seriales_int_exigir(p_org, false);
  -- Solo lee. No inserta serial_numbers.
  select coalesce((
    select jsonb_agg(to_jsonb(q) order by q.sin_serial desc, q.product_id, q.branch_id)
      from (
        select st.product_id,
               p.sku,
               p.name as nombre,
               st.branch_id,
               b.name as sucursal,
               st.qty as qty_on_hand,
               coalesce(se.ocupando, 0) as seriales,
               coalesce(se.disponibles, 0) as seriales_disponibles,
               (st.qty - coalesce(se.ocupando, 0)) as sin_serial
          from (
            select sl.product_id, sl.branch_id, sum(sl.qty_on_hand) as qty
              from public.stock_levels sl
              join public.products p2 on p2.id = sl.product_id
             where p2.organization_id = p_org
               and p2.track_serial is true
               and coalesce(p2.track_stock, false) is true
             group by sl.product_id, sl.branch_id
          ) st
          join public.products p on p.id = st.product_id and p.organization_id = p_org
          join public.branches b on b.id = st.branch_id and b.organization_id = p_org
          left join (
            select s.product_id,
                   coalesce(s.current_branch_id, s.branch_id) as branch_id,
                   count(*) filter (where s.status in ('in_stock', 'reserved'))::integer as ocupando,
                   count(*) filter (where s.status = 'in_stock')::integer as disponibles
              from public.serial_numbers s
             where s.organization_id = p_org
             group by s.product_id, coalesce(s.current_branch_id, s.branch_id)
          ) se on se.product_id = st.product_id and se.branch_id = st.branch_id
         where st.qty > coalesce(se.ocupando, 0)
      ) q
  ), '[]'::jsonb)
    into v_filas;
  return v_filas;
end;
$$;

comment on function public.fn_reporte_stock_sin_seriales(integer) is
  'Existencia de productos con serial mayor que los seriales in_stock o reserved de esa sucursal. Solo lectura: no crea seriales.';

revoke all on function public.fn_reporte_stock_sin_seriales(integer) from public, anon;
grant execute on function public.fn_reporte_stock_sin_seriales(integer) to authenticated, service_role;

-- ── 3. pos_checkout_v1 guarda serial_ids en sale_items ──────────────────
do $pos$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_ins integer;
  v_trozo text;
  v_old text := $old$      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included
    )
    select
      v_sale_id,
      nullif(i.value->>'product_id', '')::integer,
      (i.value->>'quantity')::numeric,
      coalesce((i.value->>'unit_price')::numeric, 0),
      coalesce((i.value->>'total')::numeric, 0),
      coalesce((i.value->>'tax_amount')::numeric, 0),
      coalesce((i.value->>'tax_rate')::numeric, 0),
      coalesce((i.value->>'discount_amount')::numeric, 0),
      case when jsonb_typeof(i.value->'notes') = 'object' then i.value->'notes' else null end,
      (i.value->>'tax_included')::boolean
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;$old$;
  v_new text := $new$      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included, serial_ids
    )
    select
      v_sale_id,
      nullif(i.value->>'product_id', '')::integer,
      (i.value->>'quantity')::numeric,
      coalesce((i.value->>'unit_price')::numeric, 0),
      coalesce((i.value->>'total')::numeric, 0),
      coalesce((i.value->>'tax_amount')::numeric, 0),
      coalesce((i.value->>'tax_rate')::numeric, 0),
      coalesce((i.value->>'discount_amount')::numeric, 0),
      case when jsonb_typeof(i.value->'notes') = 'object' then i.value->'notes' else null end,
      (i.value->>'tax_included')::boolean,
      -- stock_serializado_sin_seriales_pos
      coalesce((
        select array_agg(x::integer)
          from jsonb_array_elements_text(coalesce(i.value->'serial_ids', '[]'::jsonb)) x
      ), '{}'::integer[])
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;$new$;
begin
  if position('stock_serializado_sin_seriales_pos' in v_def) > 0 then
    raise notice 'pos_checkout_v1 ya guarda serial_ids por este parche';
    return;
  end if;
  v_ins := position('insert into public.sale_items' in v_def);
  if v_ins = 0 then
    raise exception 'pos_checkout_v1: no inserta sale_items';
  end if;
  v_trozo := substring(v_def from v_ins for 700);
  if position('serial_ids' in v_trozo) > 0 then
    raise notice 'pos_checkout_v1 ya escribe serial_ids en sale_items';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'pos_checkout_v1: el insert de sale_items no coincide con el de main';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$pos$;
