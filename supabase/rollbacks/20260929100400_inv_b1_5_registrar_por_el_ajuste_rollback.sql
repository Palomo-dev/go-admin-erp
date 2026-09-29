-- Reversión de 20260929100400_inv_b1_5_registrar_por_el_ajuste.sql
-- Devuelve fn_stock_registrar_movimiento a la versión de 20260929100200 (ajuste de
-- una línea escrito por la propia función, sin pasar por fn_ajuste_guardar /
-- fn_ajuste_aplicar). No revierte datos: los ajustes aplicados se quedan.

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
