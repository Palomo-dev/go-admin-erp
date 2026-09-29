-- Inventario B1 · 3/4 — Registrar entrada / salida y stock mínimo
-- docs/implementacion/INVENTARIO-PLAN.md §5.2 y §3.2; Figma 586:73716 (Registrar entrada),
-- 586:73820 (Registrar salida) y 586:73911 (Definir stock mínimo).
--
-- fn_stock_registrar_movimiento(p_org, p_branch, p_product, p_lot, p_direccion, p_qty,
--   p_costo, p_motivo, p_nota) → jsonb { ajuste_id, numero, movimiento }
--   Contrato de src/lib/inventario/nucleo/tipos.ts (ParamsRegistrarMovimiento) más la
--   nota opcional. Como dibuja Figma («Se guarda como ajuste AJ-… (aplicado) y el
--   kardex lo enlaza»), cada registro es un documento de ajuste de UNA línea:
--     1. inventory_adjustments (gain = entrada, loss = salida; reason = motivo) y su
--        adjustment_items;
--     2. el movimiento SOLO por fn_inv_int_mover con origen `adjustment` y
--        source_id = id del ajuste (EnlaceDocumento lo abre); entrada con
--        recalcular_costo (promedio ponderado al costo que llega), salida al costo
--        promedio de la fila y sin dejarla en negativo (stock_insuficiente);
--     3. el ajuste pasa a `posted`: su disparador hace el ÚNICO asiento (P4; el
--        movimiento de un ajuste gain/loss ya no asienta, B0 7/8).
--   Reglas: permiso `ajustar`; motivo obligatorio; cantidad > 0; entrada con costo
--   ≥ 0; un producto padre con variantes no recibe movimientos (P1: el stock vive
--   en las variantes); producto con lotes: la entrada exige lote (la salida sin lote
--   reparte por FEFO en la primitiva).
--
-- update_product_min_stock(p_items jsonb): misma firma (el plan dice «reutiliza»),
--   endurecida: search_path fijo, la sucursal y el producto deben ser de la misma
--   organización, exige permiso `ajustar` o `editar_catalogo` (antes bastaba ser
--   miembro, incluso inactivo), mínimo ≥ 0. Crea la fila en 0 si no existe (no mueve
--   stock). El original queda en el rollback.

create or replace function public.fn_stock_registrar_movimiento(
  p_org integer,
  p_branch integer,
  p_product integer,
  p_lot integer,
  p_direccion text,
  p_qty numeric,
  p_costo numeric,
  p_motivo text,
  p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 200);
  v_nota text := left(nullif(btrim(coalesce(p_nota, '')), ''), 500);
  v_prod record;
  v_adj integer;
  v_mov jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar']);

  if p_direccion is null or p_direccion not in ('in', 'out') then
    raise exception 'direccion_invalida' using errcode = '22023';
  end if;
  if v_motivo is null then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  if p_qty is null or round(p_qty, 3) <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023', detail = coalesce(p_qty::text, 'null');
  end if;
  if p_direccion = 'in' and (p_costo is null or p_costo < 0) then
    raise exception 'costo_invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;

  select p.id, p.organization_id, p.status, coalesce(p.track_lots, false) as track_lots,
         coalesce(p.track_stock, true) as track_stock,
         exists (select 1 from public.products c where c.parent_product_id = p.id and coalesce(c.status, 'active') <> 'deleted') as con_variantes
    into v_prod
    from public.products p where p.id = p_product;
  if v_prod.id is null or v_prod.organization_id is distinct from p_org then
    raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if v_prod.status = 'deleted' then
    raise exception 'producto_eliminado' using errcode = '22023';
  end if;
  if v_prod.con_variantes then
    raise exception 'producto_con_variantes' using errcode = '22023';
  end if;
  if not v_prod.track_stock then
    raise exception 'producto_sin_seguimiento' using errcode = '22023';
  end if;
  if p_direccion = 'in' and v_prod.track_lots and p_lot is null then
    raise exception 'lote_requerido' using errcode = '22023';
  end if;

  insert into public.inventory_adjustments (organization_id, branch_id, type, reason, status, created_by, notes)
  values (p_org, p_branch, case when p_direccion = 'in' then 'gain' else 'loss' end, v_motivo, 'draft', v_uid, v_nota)
  returning id into v_adj;

  insert into public.adjustment_items (inventory_adjustment_id, product_id, quantity, lot_id, unit_cost)
  values (v_adj, p_product, round(p_qty, 3), p_lot, case when p_direccion = 'in' then p_costo end);

  v_mov := public.fn_inv_int_mover(
    p_org, p_branch, p_product, p_lot, p_direccion, p_qty,
    case when p_direccion = 'in' then p_costo end,
    'adjustment', v_adj::text, concat_ws(' · ', v_motivo, v_nota), v_uid,
    case when p_direccion = 'in'
         then jsonb_build_object('recalcular_costo', true)
         else jsonb_build_object('permitir_negativo', false) end);

  if coalesce((v_mov->>'omitido')::boolean, false) then
    raise exception 'producto_sin_seguimiento' using errcode = '22023';
  end if;

  if p_direccion = 'out' then
    update public.adjustment_items ai
       set unit_cost = (v_mov->'movimientos'->0->>'unit_cost')::numeric, updated_at = now()
     where ai.inventory_adjustment_id = v_adj;
  end if;

  -- Aplicado: el disparador del documento hace el asiento (P4).
  update public.inventory_adjustments set status = 'posted', updated_at = now() where id = v_adj;

  return jsonb_build_object(
    'ajuste_id', v_adj,
    'numero', public.fn_documento_de_movimiento(p_org, 'adjustment', v_adj::text, p_product)->>'numero',
    'movimiento', v_mov);
end;
$$;

comment on function public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text) is
  'B1 · Registrar entrada/salida desde Stock: ajuste aplicado de una línea + movimiento por fn_inv_int_mover (origen adjustment). Permiso ajustar.';

revoke all on function public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text) from anon, public;
grant execute on function public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text) to authenticated, service_role;

-- ─── Stock mínimo (misma firma, endurecida) ──────────────────────────────────

create or replace function public.update_product_min_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_product integer;
  v_branch integer;
  v_min numeric;
  v_org integer;
  v_orgs_validadas integer[] := array[]::integer[];
begin
  if auth.uid() is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items_invalidos' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := (v_item->>'product_id')::integer;
    v_branch := (v_item->>'branch_id')::integer;
    v_min := round(coalesce((v_item->>'min_level')::numeric, 0), 3);
    if v_min < 0 then
      raise exception 'cantidad_invalida' using errcode = '22023', detail = v_min::text;
    end if;

    select b.organization_id into v_org from public.branches b where b.id = v_branch;
    if v_org is null then
      raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
    end if;
    if not (v_org = any(v_orgs_validadas)) then
      perform public.fn_inventario_exigir_permiso(v_org, array['ajustar', 'editar_catalogo']);
      v_orgs_validadas := v_orgs_validadas || v_org;
    end if;
    if not exists (select 1 from public.products p where p.id = v_product and p.organization_id = v_org) then
      raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
    end if;

    -- El mínimo es por (producto, sucursal): se escribe en todas sus filas (lotes
    -- incluidos) y, si no hay ninguna, se crea la fila sin lote en 0 (no mueve stock).
    update public.stock_levels
       set min_level = v_min, updated_at = now()
     where product_id = v_product and branch_id = v_branch;
    if not found then
      insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
      values (v_product, v_branch, null, 0, 0, 0, v_min)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

comment on function public.update_product_min_stock(jsonb) is
  'Stock mínimo por (producto, sucursal). B1: endurecida (misma organización, permiso ajustar o editar_catalogo, search_path fijo).';

revoke all on function public.update_product_min_stock(jsonb) from anon, public;
grant execute on function public.update_product_min_stock(jsonb) to authenticated, service_role;
