-- GO Assistant — Fase 2 (continuación): orden de compra y traslado.
--
-- Mismo criterio que venta y ajuste: RPC transaccional, SECURITY INVOKER (la RLS
-- del usuario sigue aplicando), y pertenencia de cada referencia comprobada a
-- mano porque las FK de este esquema no llevan organización.
--
-- DECISIÓN DE ALCANCE, deliberada:
--
--  * La orden de compra nace en `draft`. NO recibe mercancía ni mueve stock: la
--    recepción es un paso aparte en el ERP, con conteo físico, y saltárselo es
--    justo como se descuadra un inventario.
--  * El traslado nace en `pending`. NO mueve stock: la sucursal destino confirma
--    lo que recibe. Sí se valida que el origen tenga stock suficiente.
--
-- Trampa encontrada al probar: `purchase_order_items.subtotal` es GENERATED
-- ALWAYS (quantity * unit_cost). No se escribe.
--
-- Bug del ERP encontrado al probar: el disparador `audit_ops_changes()` leía
-- `NEW.branch_id`, que `inventory_transfers` no tiene, y abortaba TODO insert.
-- Se corrige en la migración 20260914100000, que debe aplicarse ANTES que esta.

create or replace function public.assistant_create_purchase_order(
  p_organization_id integer,
  p_branch_id       integer,
  p_user_id         uuid,
  p_payload         jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item        jsonb;
  v_product_id  integer;
  v_qty         numeric;
  v_cost        numeric;
  v_name        text;
  v_supplier_id integer := nullif(p_payload->>'supplier_id','')::integer;
  v_supplier    text;
  v_expected    date := nullif(p_payload->>'expected_date','')::date;
  v_total       numeric := 0;
  v_po_id       integer;
  v_lineas      integer := 0;
  v_resumen     jsonb := '[]'::jsonb;
begin
  if v_supplier_id is null then
    raise exception 'SUPPLIER_REQUIRED' using errcode = '22023';
  end if;
  select name into v_supplier from public.suppliers
   where id = v_supplier_id and organization_id = p_organization_id;
  if v_supplier is null then
    raise exception 'SUPPLIER_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.branches
                  where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_product_id := nullif(v_item->>'product_id','')::integer;
    v_qty        := nullif(v_item->>'quantity','')::numeric;
    if v_product_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;
    select name into v_name from public.products
     where id = v_product_id and organization_id = p_organization_id;
    if v_name is null then
      raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
    end if;

    -- El costo: el que diga el usuario; si no, el último registrado con ese
    -- proveedor; si no, el último del producto; si no, 0 y se avisa.
    v_cost := nullif(v_item->>'unit_cost','')::numeric;
    if v_cost is null then
      select cost into v_cost from public.product_costs
       where product_id = v_product_id and supplier_id = v_supplier_id
       order by effective_from desc limit 1;
    end if;
    if v_cost is null then
      select cost into v_cost from public.product_costs
       where product_id = v_product_id
       order by effective_from desc limit 1;
    end if;
    v_cost := coalesce(v_cost, 0);
    if v_cost < 0 then
      raise exception 'COST_INVALID' using errcode = '22023';
    end if;

    v_total := v_total + (v_cost * v_qty);
    v_lineas := v_lineas + 1;
    v_resumen := v_resumen || jsonb_build_object(
      'product_id', v_product_id, 'nombre', v_name,
      'cantidad', v_qty, 'costo', v_cost, 'subtotal', v_cost * v_qty,
      'sin_costo', (v_cost = 0));
  end loop;

  insert into public.purchase_orders (
    organization_id, branch_id, supplier_id, status, expected_date, total, created_by, notes
  ) values (
    p_organization_id, p_branch_id, v_supplier_id, 'draft', v_expected, v_total, p_user_id,
    nullif(trim(p_payload->>'notes'), '')
  ) returning id into v_po_id;

  -- `subtotal` es GENERATED ALWAYS (quantity * unit_cost): no se escribe.
  for v_item in select * from jsonb_array_elements(v_resumen) loop
    insert into public.purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
    values (v_po_id, (v_item->>'product_id')::integer, (v_item->>'cantidad')::numeric,
            (v_item->>'costo')::numeric);
  end loop;

  return jsonb_build_object(
    'purchase_order_id', v_po_id, 'proveedor', v_supplier, 'estado', 'draft',
    'lineas', v_lineas, 'total', v_total, 'fecha_esperada', v_expected,
    'lineas_sin_costo', (select count(*) from jsonb_array_elements(v_resumen) e where (e->>'sin_costo')::boolean),
    'detalle', v_resumen
  );
end;
$$;

comment on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) is
  'GO Assistant: crea una orden de compra en borrador con sus lineas. NO recibe mercancia.';


create or replace function public.assistant_create_transfer(
  p_organization_id integer,
  p_user_id         uuid,
  p_payload         jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item        jsonb;
  v_product_id  integer;
  v_qty         numeric;
  v_name        text;
  v_available   numeric;
  v_origin      integer := nullif(p_payload->>'origin_branch_id','')::integer;
  v_dest        integer := nullif(p_payload->>'dest_branch_id','')::integer;
  v_origin_name text;
  v_dest_name   text;
  v_transfer_id integer;
  v_lineas      integer := 0;
  v_resumen     jsonb := '[]'::jsonb;
begin
  if v_origin is null or v_dest is null then
    raise exception 'BRANCHES_REQUIRED' using errcode = '22023';
  end if;
  if v_origin = v_dest then
    raise exception 'SAME_BRANCH' using errcode = '22023';
  end if;
  select name into v_origin_name from public.branches
   where id = v_origin and organization_id = p_organization_id;
  select name into v_dest_name from public.branches
   where id = v_dest and organization_id = p_organization_id;
  if v_origin_name is null or v_dest_name is null then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_product_id := nullif(v_item->>'product_id','')::integer;
    v_qty        := nullif(v_item->>'quantity','')::numeric;
    if v_product_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;
    select name into v_name from public.products
     where id = v_product_id and organization_id = p_organization_id;
    if v_name is null then
      raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
    end if;

    -- El origen tiene que tener lo que se quiere mover. Un traslado de lo que
    -- no existe es un documento imposible que alguien tendrá que cancelar.
    select coalesce(sum(qty_on_hand - coalesce(qty_reserved,0)), 0) into v_available
      from public.stock_levels
     where product_id = v_product_id and branch_id = v_origin;
    if v_available < v_qty then
      raise exception 'INSUFFICIENT_STOCK:%:%:%', v_name, v_available, v_qty using errcode = '22023';
    end if;

    v_lineas := v_lineas + 1;
    v_resumen := v_resumen || jsonb_build_object(
      'product_id', v_product_id, 'nombre', v_name, 'cantidad', v_qty);
  end loop;

  insert into public.inventory_transfers (
    organization_id, origin_branch_id, dest_branch_id, status, created_by, notes
  ) values (
    p_organization_id, v_origin, v_dest, 'pending', p_user_id,
    nullif(trim(p_payload->>'notes'), '')
  ) returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(v_resumen) loop
    insert into public.transfer_items (inventory_transfer_id, product_id, quantity, status)
    values (v_transfer_id, (v_item->>'product_id')::integer, (v_item->>'cantidad')::numeric, 'pending');
  end loop;

  return jsonb_build_object(
    'transfer_id', v_transfer_id, 'origen', v_origin_name, 'destino', v_dest_name,
    'estado', 'pending', 'lineas', v_lineas, 'detalle', v_resumen
  );
end;
$$;

comment on function public.assistant_create_transfer(integer, uuid, jsonb) is
  'GO Assistant: crea un traslado entre sucursales en estado pendiente. NO mueve stock: lo confirma el destino.';

revoke all on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) from public;
revoke all on function public.assistant_create_transfer(integer, uuid, jsonb) from public;
grant execute on function public.assistant_create_purchase_order(integer, integer, uuid, jsonb) to authenticated, service_role;
grant execute on function public.assistant_create_transfer(integer, uuid, jsonb) to authenticated, service_role;
