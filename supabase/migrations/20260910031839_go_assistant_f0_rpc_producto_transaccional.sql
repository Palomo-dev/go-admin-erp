-- GO Assistant F0 — ronda 3 (hallazgos 1 y 2 del qa-reviewer).
--
-- Las dos acciones del asistente que tocan varias tablas lo hacían con N
-- llamadas sueltas desde Node, contra el criterio §17 del plan ("toda operación
-- multi-tabla es transaccional"). Consecuencias reales:
--
--  * `update_product_price` cerraba el precio vigente (`effective_to = now()`) y
--    solo DESPUÉS insertaba el nuevo, sin mirar el error del primer paso. Si el
--    insert fallaba, el producto quedaba con CERO precios vigentes. Y
--    `posService.ts:2176` lee el precio con `product_prices!inner` filtrando
--    `effective_to = null`: sin fila, el producto no vuelve de la consulta y
--    deja de poder venderse.
--  * `create_product` escribía en 5 tablas y degradaba los fallos de precio,
--    costo y stock a una nota entre paréntesis, cerrando la acción como
--    `executed`. El usuario creía tener un producto completo y tenía uno sin
--    precio.
--
-- SECURITY INVOKER (el default) a propósito: así la RLS del usuario sigue
-- aplicando dentro de la función y no hay escalada posible. La atomicidad la da
-- el cuerpo de la función, que es una sola transacción.

create or replace function public.assistant_set_product_price(
  p_organization_id integer,
  p_product_id      integer,
  p_price           numeric
) returns jsonb
language plpgsql
as $$
declare
  v_name        text;
  v_prev_id     integer;
  v_prev_price  numeric;
  v_new_id      integer;
begin
  if p_price is null or p_price < 0 then
    raise exception 'PRICE_INVALID' using errcode = '22023';
  end if;

  select name into v_name
    from public.products
   where id = p_product_id and organization_id = p_organization_id;

  if v_name is null then
    raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
  end if;

  select id, price into v_prev_id, v_prev_price
    from public.product_prices
   where product_id = p_product_id and effective_to is null
   order by effective_from desc
   limit 1;

  if v_prev_id is not null then
    update public.product_prices set effective_to = now() where id = v_prev_id;
  end if;

  insert into public.product_prices (product_id, price, effective_from)
  values (p_product_id, p_price, now())
  returning id into v_new_id;

  return jsonb_build_object(
    'product_name',      v_name,
    'previous_price',    v_prev_price,
    'previous_price_id', v_prev_id,
    'new_price_id',      v_new_id
  );
end;
$$;

comment on function public.assistant_set_product_price(integer, integer, numeric) is
  'GO Assistant: cambia el precio vigente de un producto cerrando el anterior, en una sola transaccion.';


create or replace function public.assistant_create_product(
  p_organization_id integer,
  p_payload         jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_sku          text := nullif(trim(p_payload->>'sku'), '');
  v_sku_explicit boolean := nullif(trim(p_payload->>'sku'), '') is not null;
  v_name         text := nullif(trim(p_payload->>'name'), '');
  v_category_id  integer := nullif(p_payload->>'category_id', '')::integer;
  v_supplier_id  integer := nullif(p_payload->>'supplier_id', '')::integer;
  v_branch_id    integer := nullif(p_payload->>'branch_id', '')::integer;
  v_price        numeric := nullif(p_payload->>'price', '')::numeric;
  v_cost         numeric := nullif(p_payload->>'cost', '')::numeric;
  v_stock        numeric := nullif(p_payload->>'stock', '')::numeric;
  v_product_id   integer;
  v_attempt      integer := 0;
begin
  if v_name is null then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;

  -- Pertenencia de las referencias. Las claves foraneas de este esquema NO
  -- llevan organizacion (`products_category_id_fkey` referencia solo el id), asi
  -- que sin esto un producto podia colgar de una categoria de otro tenant.
  if v_category_id is not null and not exists (
    select 1 from public.categories
     where id = v_category_id and organization_id = p_organization_id
  ) then
    raise exception 'CATEGORY_NOT_IN_ORG' using errcode = 'P0002';
  end if;

  if v_supplier_id is not null and not exists (
    select 1 from public.suppliers
     where id = v_supplier_id and organization_id = p_organization_id
  ) then
    raise exception 'SUPPLIER_NOT_IN_ORG' using errcode = 'P0002';
  end if;

  if v_branch_id is not null and not exists (
    select 1 from public.branches
     where id = v_branch_id and organization_id = p_organization_id
  ) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;

  -- `products.sku` es NOT NULL y unico por organizacion. Si el usuario dio uno
  -- y choca, se le dice; si lo generamos nosotros, se reintenta. El bloque
  -- BEGIN/EXCEPTION abre una subtransaccion, asi que el reintento no aborta la
  -- transaccion entera.
  loop
    if v_sku is null then
      v_sku := upper(left(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'), 10));
      if v_sku = '' then v_sku := 'PROD'; end if;
      v_sku := v_sku || '-' || upper(substr(md5(random()::text), 1, 4));
    end if;

    begin
      insert into public.products (
        organization_id, sku, name, description, barcode, brand, category_id, status
      ) values (
        p_organization_id,
        v_sku,
        v_name,
        nullif(trim(p_payload->>'description'), ''),
        nullif(trim(p_payload->>'barcode'), ''),
        nullif(trim(p_payload->>'brand'), ''),
        v_category_id,
        coalesce(nullif(trim(p_payload->>'status'), ''), 'active')
      )
      returning id into v_product_id;
      exit;
    exception when unique_violation then
      if v_sku_explicit then
        raise exception 'SKU_TAKEN' using errcode = '23505';
      end if;
      v_attempt := v_attempt + 1;
      if v_attempt >= 5 then raise; end if;
      v_sku := null;
    end;
  end loop;

  if v_price is not null and v_price > 0 then
    insert into public.product_prices (product_id, price, effective_from)
    values (v_product_id, v_price, now());
  end if;

  if v_cost is not null and v_cost > 0 then
    insert into public.product_costs (product_id, cost, supplier_id, effective_from)
    values (v_product_id, v_cost, v_supplier_id, now());
  end if;

  if v_supplier_id is not null then
    -- `product_suppliers.cost` es NOT NULL; sin costo conocido, 0.
    insert into public.product_suppliers (product_id, supplier_id, cost, is_preferred)
    values (v_product_id, v_supplier_id, coalesce(v_cost, 0), true);
  end if;

  if v_stock is not null and v_stock > 0 then
    if v_branch_id is null then
      -- `stock_levels.branch_id` es NOT NULL: sin sucursal no hay stock, y
      -- crear el producto "casi entero" es justo lo que esta RPC viene a evitar.
      raise exception 'BRANCH_REQUIRED_FOR_STOCK' using errcode = '22023';
    end if;
    insert into public.stock_levels (product_id, branch_id, qty_on_hand)
    values (v_product_id, v_branch_id, v_stock);
  end if;

  return jsonb_build_object('product_id', v_product_id, 'sku', v_sku, 'name', v_name);
end;
$$;

comment on function public.assistant_create_product(integer, jsonb) is
  'GO Assistant: crea un producto con su precio, costo, proveedor y stock inicial en una sola transaccion.';

-- El rol `anon` no tiene nada que hacer aqui: estas funciones solo se invocan
-- con la sesion del usuario desde el servidor.
revoke all on function public.assistant_set_product_price(integer, integer, numeric) from anon;
revoke all on function public.assistant_create_product(integer, jsonb) from anon;
grant execute on function public.assistant_set_product_price(integer, integer, numeric) to authenticated;
grant execute on function public.assistant_create_product(integer, jsonb) to authenticated;