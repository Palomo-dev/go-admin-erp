-- Inventario B0 · 4/7 — Los escritores SQL de stock pasan por fn_inv_int_mover
-- docs/implementacion/INVENTARIO-PLAN.md §3.2 y §5.1 (migración 3, segunda mitad).
--
-- Misma firma, mismo resultado para quien las llama (POS, factura de venta y su
-- anulación, notas crédito, devoluciones, anulación POS, compras, alta e
-- importación de productos, stock masivo y de variantes, anulación de factura de
-- compra). Por dentro, una sola primitiva. Cambios de comportamiento, todos
-- justificados en el plan:
--
--   · decrement_stock_on_sale bloquea la fila (FOR UPDATE): dos ventas
--     simultáneas ya no pierden una resta. Con `products.track_lots` descuenta por
--     FEFO (hoy ningún producto lo tiene). Rechaza producto o sucursal de otra
--     organización (0 movimientos históricos así). Cantidad 0 → se omite.
--   · fn_register_stock_entry: el costo promedio pasa de «último costo» a
--     ponderado (INVENTARIO-PLAN §2 F1.4); bloquea la fila; entradas con cantidad
--     0 se omiten en vez de dejar un movimiento en 0; exige permiso de inventario
--     (crear, editar catálogo o ajustar) a la sesión, no solo pertenencia.
--   · fn_stock_entrada: salta productos con track_stock = false (antes les creaba
--     fila y movimiento; 15 movimientos históricos sobre productos hoy sin control).
--   · fn_void_purchase_invoice: si la fila de existencias no existía, ahora se crea
--     (en negativo) en vez de dejar un movimiento que el saldo no refleja.
--   · fn_kardex_entrada_compra_int: el lote de la línea tiene que ser del producto
--     y de la organización.
--   · Todas dejan created_by y avg_cost_after en el kardex.
--
-- Las funciones pequeñas se reescriben enteras; las dos grandes
-- (fn_kardex_entrada_compra_int, fn_void_purchase_invoice) se parchean sobre la
-- definición VIVA con marcadores que deben aparecer exactamente una vez. Antes de
-- tocar nada se comprueba que cada definición viva es la leída al escribir esta
-- migración (md5); si otra sesión la cambió, la migración falla sin aplicar.
-- La definición anterior de cada una queda en private.respaldo_funciones para el
-- rollback exacto.

-- ── 0. Respaldo de las definiciones vivas ────────────────────────────────────
create table if not exists private.respaldo_funciones (
  migracion text not null,
  firma text not null,
  definicion text not null,
  md5 text not null,
  guardado_en timestamptz not null default now(),
  primary key (migracion, firma)
);
revoke all on table private.respaldo_funciones from anon, authenticated, public;

do $$
declare
  v_esperado constant jsonb := jsonb_build_object(
    'decrement_stock_on_sale(integer,integer,integer,numeric,text,text,numeric,text,uuid)', '29ea99b7c3140416ae61cf955cab8a56',
    'fn_stock_entrada(integer,integer,integer,numeric,numeric,text,text,text,uuid)', 'ef4c4557da39e711e2168ca0a19174f0',
    'fn_stock_entrada_devolucion(integer,integer,integer,numeric,numeric,text,text,uuid)', '53fc61bacb345f76c7a9c77b7d8f0d5f',
    'fn_register_stock_entry(jsonb,text)', 'e41f1bb85fcea9dcf9cc3c726725ca1f',
    'fn_producto_int_ajustar_stock(integer,integer,integer,numeric,numeric,text)', '3bd57535c4bc6022f6bed3f1dab6c7eb',
    'fn_kardex_entrada_compra_int(integer,integer,text,text,jsonb,uuid,integer,boolean)', '699a85d347c44b8bf2ace653865d2e52',
    'fn_void_purchase_invoice(uuid,text,uuid)', '591e3b5cb61f430a4faf4fd39cf991de');
  v_firma text;
  v_def text;
begin
  for v_firma in select jsonb_object_keys(v_esperado) loop
    v_def := pg_get_functiondef(('public.' || v_firma)::regprocedure);
    if position('fn_inv_int_mover' in v_def) > 0 then
      continue; -- ya aplicada
    end if;
    if md5(v_def) <> v_esperado->>v_firma then
      raise exception 'La definición viva de % cambió desde que se escribió esta migración (md5 %). Releer y rehacer el parche.',
        v_firma, md5(v_def);
    end if;
    insert into private.respaldo_funciones (migracion, firma, definicion, md5)
    values ('20260929020300_inv_b0_4', v_firma, v_def, md5(v_def))
    on conflict (migracion, firma) do nothing;
  end loop;
end $$;

-- ── 1. decrement_stock_on_sale ───────────────────────────────────────────────
create or replace function public.decrement_stock_on_sale(
  p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric, p_source text,
  p_source_id text default null::text, p_unit_cost numeric default null::numeric, p_note text default null::text,
  p_updated_by uuid default null::uuid)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_r jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  if p_qty is null or p_qty = 0 then
    return json_build_object('success', true, 'skipped', true, 'reason', 'cantidad_cero');
  end if;

  -- Núcleo B0: bloqueo de la fila, costo de salida, FEFO y política de negativos.
  v_r := public.fn_inv_int_mover(p_organization_id, p_branch_id, p_product_id, null, 'out', p_qty, p_unit_cost,
                                 p_source, p_source_id, p_note, p_updated_by, '{}'::jsonb);
  if (v_r->>'omitido')::boolean then
    return json_build_object('success', true, 'skipped', true, 'reason', 'no_track_stock');
  end if;

  return json_build_object(
    'success', true,
    'skipped', false,
    'movement_id', (v_r->>'movement_id')::integer,
    'new_qty', (v_r->>'qty_after')::numeric,
    'movimientos', v_r->'movimientos'
  );
end;
$function$;

-- ── 2. fn_stock_entrada ──────────────────────────────────────────────────────
create or replace function public.fn_stock_entrada(
  p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric, p_unit_cost numeric,
  p_source text, p_source_id text, p_note text, p_updated_by uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_r jsonb;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  -- Entra al costo que trae; el promedio lo decide la regla única por origen
  -- (nota crédito y anulación de factura no lo recalculan).
  v_r := public.fn_inv_int_mover(p_organization_id, p_branch_id, p_product_id, null, 'in', p_qty,
                                 coalesce(p_unit_cost, 0), p_source, p_source_id, p_note, p_updated_by,
                                 jsonb_build_object('fefo', false));
  return (v_r->>'movement_id')::integer; -- NULL si el producto no lleva inventario
end;
$function$;

-- ── 3. fn_stock_entrada_devolucion ───────────────────────────────────────────
create or replace function public.fn_stock_entrada_devolucion(
  p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric, p_unit_cost numeric,
  p_source_id text, p_note text, p_updated_by uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_costo numeric;
  v_r jsonb;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  v_costo := public.fn_costo_unitario_producto(p_product_id, p_branch_id, p_unit_cost);
  if coalesce(p_unit_cost, 0) > 0 then
    v_costo := p_unit_cost;
  end if;
  -- Devolución: entra al costo de la salida, sin recalcular el promedio.
  v_r := public.fn_inv_int_mover(p_organization_id, p_branch_id, p_product_id, null, 'in', p_qty,
                                 coalesce(v_costo, 0), 'return', p_source_id, p_note, p_updated_by,
                                 jsonb_build_object('fefo', false));
  return (v_r->>'movement_id')::integer;
end;
$function$;

-- ── 4. fn_register_stock_entry ───────────────────────────────────────────────
create or replace function public.fn_register_stock_entry(p_entries jsonb, p_batch_id text default null::text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_entry jsonb;
  v_organization_id integer;
  v_branch_id integer;
  v_product_id integer;
  v_qty numeric;
  v_unit_cost numeric;
  v_source text;
  v_source_id text;
  v_note text;
  v_updated_by uuid;
  v_product_org integer;
  v_r jsonb;
  v_results jsonb := '[]'::jsonb;
  v_batch_exists boolean;
  v_idx integer := 0;
  v_orgs integer[] := array[]::integer[];
begin
  -- 1. Idempotencia: si batch_id ya existe, devolver resultado anterior
  if p_batch_id is not null then
    select exists (
      select 1 from stock_movements
       where note like '%' || p_batch_id || '%'
         and source = 'initial'
    ) into v_batch_exists;
    if v_batch_exists then
      return json_build_object('success', true, 'skipped', true, 'reason', 'batch_already_processed', 'batch_id', p_batch_id);
    end if;
  end if;

  -- 2. Validar costo > 0, PERTENENCIA y PERMISO en todas las entradas antes de escribir nada
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_qty := coalesce((v_entry->>'qty')::numeric, 0);
    v_unit_cost := coalesce((v_entry->>'unit_cost')::numeric, 0);
    if v_qty > 0 and v_unit_cost <= 0 then
      raise exception 'Entrada %: cantidad % sin costo. El costo es obligatorio cuando hay cantidad en inventario.', v_idx, v_qty;
    end if;

    v_organization_id := (v_entry->>'organization_id')::integer;
    v_branch_id := (v_entry->>'branch_id')::integer;
    v_product_id := (v_entry->>'product_id')::integer;
    perform public.fn_assert_acceso_org(v_organization_id);
    if not (v_organization_id = any(v_orgs)) then
      perform public.fn_inventario_exigir_permiso(v_organization_id, array['crear', 'editar_catalogo', 'ajustar']);
      v_orgs := v_orgs || v_organization_id;
    end if;
    select organization_id into v_product_org from products where id = v_product_id;
    if found and v_product_org is distinct from v_organization_id then
      raise exception 'Entrada %: el producto no pertenece a la organización', v_idx using errcode = '42501';
    end if;
    if not exists (select 1 from branches b where b.id = v_branch_id and b.organization_id = v_organization_id) then
      raise exception 'Entrada %: la sucursal no pertenece a la organización', v_idx using errcode = '42501';
    end if;
    v_idx := v_idx + 1;
  end loop;

  -- 3. Procesar todas las entradas en una transacción, por el núcleo B0
  --    (bloqueo de la fila y costo promedio ponderado; antes: «último costo»).
  v_idx := 0;
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_organization_id := (v_entry->>'organization_id')::integer;
    v_branch_id := (v_entry->>'branch_id')::integer;
    v_product_id := (v_entry->>'product_id')::integer;
    v_qty := coalesce((v_entry->>'qty')::numeric, 0);
    v_unit_cost := coalesce((v_entry->>'unit_cost')::numeric, 0);
    v_source := coalesce(v_entry->>'source', 'initial');
    v_source_id := v_entry->>'source_id';
    v_note := coalesce(v_entry->>'note', 'Stock inicial');
    v_updated_by := nullif(v_entry->>'updated_by', '')::uuid;

    if p_batch_id is not null then
      v_note := v_note || ' [batch:' || p_batch_id || ']';
    end if;

    if v_qty <= 0 then
      v_results := v_results || jsonb_build_object('idx', v_idx, 'skipped', true, 'reason', 'cantidad_cero');
      v_idx := v_idx + 1;
      continue;
    end if;

    v_r := public.fn_inv_int_mover(v_organization_id, v_branch_id, v_product_id, null, 'in', v_qty, v_unit_cost,
                                   v_source, v_source_id, v_note, v_updated_by,
                                   jsonb_build_object('recalcular_costo', true, 'fefo', false));
    if (v_r->>'omitido')::boolean then
      v_results := v_results || jsonb_build_object('idx', v_idx, 'skipped', true, 'reason', 'no_track_stock');
    else
      v_results := v_results || jsonb_build_object(
        'idx', v_idx, 'skipped', false,
        'movement_id', (v_r->>'movement_id')::integer, 'new_qty', (v_r->>'qty_after')::numeric);
    end if;
    v_idx := v_idx + 1;
  end loop;

  return json_build_object('success', true, 'results', v_results, 'batch_id', p_batch_id);
end;
$function$;

-- ── 5. fn_producto_int_ajustar_stock (fija la existencia a un valor) ────────
create or replace function public.fn_producto_int_ajustar_stock(
  p_org integer, p_product_id integer, p_branch_id integer, p_qty numeric, p_unit_cost numeric, p_nota text)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sl public.stock_levels;
  v_delta numeric;
begin
  if p_qty is null then
    return 0;
  end if;
  if p_qty < 0 then
    raise exception 'cantidad_negativa' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and organization_id = p_org) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  -- Bloquea (o crea con el costo dado) la fila antes de calcular la diferencia.
  v_sl := public.fn_inv_int_fila(p_product_id, p_branch_id, null, coalesce(p_unit_cost, 0));
  v_delta := p_qty - coalesce(v_sl.qty_on_hand, 0);
  if v_delta = 0 then
    return 0;
  end if;
  -- Ajuste al costo vigente, sin mover el promedio (como antes).
  perform public.fn_inv_int_mover(p_org, p_branch_id, p_product_id, null,
    case when v_delta > 0 then 'in' else 'out' end, abs(v_delta), coalesce(p_unit_cost, 0),
    'adjustment', null, p_nota, auth.uid(),
    jsonb_build_object('recalcular_costo', false, 'costo_fijo', true, 'fefo', false,
                       'permitir_negativo', true, 'forzar', true));
  return v_delta;
end;
$function$;

-- ── 6. Parches sobre la definición viva ──────────────────────────────────────
create or replace function pg_temp.inv_b0_parchar(p_def text, p_desde text, p_hasta text, p_nuevo text)
returns text
language plpgsql
as $$
declare
  v_ini integer;
  v_fin integer;
begin
  if (length(p_def) - length(replace(p_def, p_desde, ''))) / length(p_desde) <> 1 then
    raise exception 'El marcador de inicio no aparece exactamente una vez: %', left(p_desde, 80);
  end if;
  v_ini := strpos(p_def, p_desde);
  v_fin := strpos(substr(p_def, v_ini), p_hasta);
  if v_fin = 0 then
    raise exception 'Marcador de fin no encontrado: %', left(p_hasta, 80);
  end if;
  v_fin := v_ini + v_fin - 1 + length(p_hasta);
  return left(p_def, v_ini - 1) || p_nuevo || substr(p_def, v_fin);
end;
$$;

-- 6a. fn_kardex_entrada_compra_int: la fila y el movimiento, por la primitiva
--     (ponderado, bloqueo y lote validado). Idempotencia, advisory lock,
--     validaciones y costo con vigencia en product_costs no cambian.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_kardex_entrada_compra_int(integer,integer,text,text,jsonb,uuid,integer,boolean)'::regprocedure);
begin
  if position('fn_inv_int_mover' in v_def) > 0 then
    return;
  end if;
  v_def := pg_temp.inv_b0_parchar(v_def, 'v_mov integer;', 'v_mov integer;', E'v_mov integer;\n  v_r jsonb;');
  v_def := pg_temp.inv_b0_parchar(v_def,
    'select sl.id, sl.qty_on_hand, sl.avg_cost into v_sl',
    ') returning id into v_mov;',
    $nuevo$-- Núcleo B0: bloqueo, promedio ponderado y lote validado en una sola primitiva.
    v_r := public.fn_inv_int_mover(p_org, p_branch, v_prod.id, v_lote, 'in', v_qty, v_costo, p_source, p_source_id,
                                   nullif(v_linea->>'note', ''), v_user,
                                   jsonb_build_object('recalcular_costo', true));
    v_mov := (v_r->>'movement_id')::integer;
    v_prom := (v_r->>'avg_cost_after')::numeric;$nuevo$);
  execute v_def;
end $$;

-- 6b. fn_void_purchase_invoice: la reversión sale por la primitiva al costo
--     original, con su lote, sin FEFO y aunque deje la fila en negativo.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_void_purchase_invoice(uuid,text,uuid)'::regprocedure);
begin
  if position('fn_inv_int_mover' in v_def) > 0 then
    return;
  end if;
  v_def := pg_temp.inv_b0_parchar(v_def,
    'select sl.id into v_sl_id from public.stock_levels sl',
    E'''Anulación factura '' || coalesce(v_inv.number_ext, ''''), v_user\n    );',
    $nuevo$-- Núcleo B0: la reversión sale por la primitiva al costo con que entró.
    perform public.fn_inv_int_mover(v_inv.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.lot_id, 'out',
      v_mov.qty, v_mov.unit_cost, 'purchase_void', p_invoice_id::text,
      'Anulación factura ' || coalesce(v_inv.number_ext, ''), v_user,
      jsonb_build_object('costo_fijo', true, 'permitir_negativo', true, 'fefo', false, 'forzar', true));$nuevo$);
  execute v_def;
end $$;

-- ── 7. Permisos explícitos (DEFINER sin anon ni public) ─────────────────────
revoke all on function public.decrement_stock_on_sale(integer, integer, integer, numeric, text, text, numeric, text, uuid) from anon, public;
revoke all on function public.fn_stock_entrada(integer, integer, integer, numeric, numeric, text, text, text, uuid) from anon, public, authenticated;
revoke all on function public.fn_stock_entrada_devolucion(integer, integer, integer, numeric, numeric, text, text, uuid) from anon, public, authenticated;
revoke all on function public.fn_register_stock_entry(jsonb, text) from anon, public;
revoke all on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text) from anon, public, authenticated;
revoke all on function public.fn_kardex_entrada_compra_int(integer, integer, text, text, jsonb, uuid, integer, boolean) from anon, public, authenticated;
revoke all on function public.fn_void_purchase_invoice(uuid, text, uuid) from anon, public;
grant execute on function public.decrement_stock_on_sale(integer, integer, integer, numeric, text, text, numeric, text, uuid) to authenticated, service_role;
grant execute on function public.fn_register_stock_entry(jsonb, text) to authenticated, service_role;
grant execute on function public.fn_void_purchase_invoice(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.fn_stock_entrada(integer, integer, integer, numeric, numeric, text, text, text, uuid) to service_role;
grant execute on function public.fn_stock_entrada_devolucion(integer, integer, integer, numeric, numeric, text, text, uuid) to service_role;
grant execute on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text) to service_role;
grant execute on function public.fn_kardex_entrada_compra_int(integer, integer, text, text, jsonb, uuid, integer, boolean) to service_role;
