-- GO Assistant — Fase 2 (§6.3): carga masiva de productos.
--
-- Una sola RPC transaccional: o entran todas las filas o no entra ninguna.
-- No duplica lógica de negocio: cada fila nueva pasa por
-- `assistant_create_product` (mismo SKU generado, mismas validaciones de
-- pertenencia) y el stock de los productos que ya existían entra como un
-- AJUSTE documentado por `assistant_create_adjustment` (con su movimiento y su
-- asiento), no como un UPDATE a `stock_levels` que nadie podría rastrear.
--
-- Filas (`p_payload->'rows'`), cada una con `op`:
--   create : name, sku?, barcode?, brand?, description?, category_id?, price?, cost?, stock?
--   update : product_id, stock?, price?
--
-- `stock_mode` (por defecto `add`):
--   add : lo que dice la fila ENTRA al inventario (llegó mercancía).
--   set : lo que dice la fila es lo que HAY (conteo); se ajusta la diferencia.
--
-- Tope duro: `p_max_rows` (viene de `ai_assistant_settings.bulk_max_rows`).
-- Devuelve lo necesario para deshacer: productos creados, ajustes generados y
-- precios cambiados con su precio anterior.

create or replace function public.assistant_bulk_load_products(
  p_organization_id integer,
  p_branch_id       integer,
  p_user_id         uuid,
  p_payload         jsonb,
  p_max_rows        integer default 500
) returns jsonb
language plpgsql
as $$
declare
  v_row         jsonb;
  v_op          text;
  v_mode        text := coalesce(nullif(lower(trim(p_payload->>'stock_mode')), ''), 'add');
  v_reason      text := coalesce(nullif(trim(p_payload->>'reason'), ''), 'Carga masiva desde el asistente');
  v_total       integer;
  v_creados     jsonb := '[]'::jsonb;
  v_precios     jsonb := '[]'::jsonb;
  v_gain_items  jsonb := '[]'::jsonb;
  v_loss_items  jsonb := '[]'::jsonb;
  v_ajustes     jsonb := '[]'::jsonb;
  v_product_id  integer;
  v_stock       numeric;
  v_price       numeric;
  v_actual      numeric;
  v_delta       numeric;
  v_res         jsonb;
  v_actualizados integer := 0;
begin
  if v_mode not in ('add', 'set') then
    raise exception 'STOCK_MODE_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches
                  where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_payload->'rows') <> 'array' then
    raise exception 'ROWS_REQUIRED' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_payload->'rows');
  if v_total = 0 then
    raise exception 'ROWS_REQUIRED' using errcode = '22023';
  end if;
  if v_total > coalesce(p_max_rows, 500) then
    raise exception 'TOO_MANY_ROWS:%:%', v_total, coalesce(p_max_rows, 500) using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_payload->'rows') loop
    v_op := lower(coalesce(v_row->>'op', ''));

    if v_op = 'create' then
      -- Mismo camino que crear un producto suelto: SKU generado si no viene,
      -- pertenencia de categoría/proveedor, precio y costo con vigencia,
      -- stock inicial en la sucursal. Si el SKU dado choca → SKU_TAKEN y se
      -- aborta TODA la carga: es lo que el usuario espera de "todo o nada".
      v_res := public.assistant_create_product(
        p_organization_id,
        (v_row - 'op') || jsonb_build_object('branch_id', p_branch_id)
      );
      v_creados := v_creados || jsonb_build_object(
        'product_id', (v_res->>'product_id')::integer,
        'sku', v_res->>'sku',
        'name', v_res->>'name');

    elsif v_op = 'update' then
      v_product_id := nullif(v_row->>'product_id', '')::integer;
      if v_product_id is null or not exists (
        select 1 from public.products
         where id = v_product_id and organization_id = p_organization_id) then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
      v_actualizados := v_actualizados + 1;

      v_stock := nullif(v_row->>'stock', '')::numeric;
      if v_stock is not null then
        if v_stock < 0 then
          raise exception 'STOCK_INVALID' using errcode = '22023';
        end if;
        if v_mode = 'add' then
          v_delta := v_stock;
        else
          select coalesce(sum(qty_on_hand), 0) into v_actual
            from public.stock_levels
           where product_id = v_product_id and branch_id = p_branch_id;
          v_delta := v_stock - v_actual;
        end if;
        if v_delta > 0 then
          v_gain_items := v_gain_items || jsonb_build_object('product_id', v_product_id, 'quantity', v_delta);
        elsif v_delta < 0 then
          v_loss_items := v_loss_items || jsonb_build_object('product_id', v_product_id, 'quantity', -v_delta);
        end if;
      end if;

      v_price := nullif(v_row->>'price', '')::numeric;
      if v_price is not null then
        v_res := public.assistant_set_product_price(p_organization_id, v_product_id, v_price);
        v_precios := v_precios || jsonb_build_object(
          'product_id', v_product_id,
          'previous_price_id', v_res->'previous_price_id',
          'new_price_id', v_res->'new_price_id');
      end if;

    else
      raise exception 'OP_INVALID' using errcode = '22023';
    end if;
  end loop;

  -- El stock de los existentes: un ajuste de entrada y, si es conteo, uno de
  -- salida. Documentados, con movimiento y asiento, como cualquier ajuste.
  if jsonb_array_length(v_gain_items) > 0 then
    v_res := public.assistant_create_adjustment(
      p_organization_id, p_branch_id, p_user_id,
      jsonb_build_object('type', 'gain', 'reason', v_reason, 'items', v_gain_items));
    v_ajustes := v_ajustes || jsonb_build_object(
      'adjustment_id', (v_res->>'adjustment_id')::integer, 'type', 'gain', 'items', v_gain_items);
  end if;
  if jsonb_array_length(v_loss_items) > 0 then
    v_res := public.assistant_create_adjustment(
      p_organization_id, p_branch_id, p_user_id,
      jsonb_build_object('type', 'loss', 'reason', v_reason, 'items', v_loss_items));
    v_ajustes := v_ajustes || jsonb_build_object(
      'adjustment_id', (v_res->>'adjustment_id')::integer, 'type', 'loss', 'items', v_loss_items);
  end if;

  return jsonb_build_object(
    'total', v_total,
    'creados', jsonb_array_length(v_creados),
    'actualizados', v_actualizados,
    'stock_mode', v_mode,
    'productos_creados', v_creados,
    'ajustes', v_ajustes,
    'precios', v_precios
  );
end;
$$;

comment on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) is
  'GO Assistant: carga masiva de productos en una transaccion. Crea via assistant_create_product y ajusta stock via assistant_create_adjustment.';

revoke all on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) from public;
grant execute on function public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer) to authenticated, service_role;
