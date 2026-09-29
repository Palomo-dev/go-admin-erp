-- Inventario B1 · 5 — «Registrar entrada/salida» delega en el documento de ajuste de B2
-- docs/implementacion/INVENTARIO-PLAN.md §5.2 y §5.3; regla dura 7 (sin lógica duplicada).
--
-- La versión de 20260929100200 creaba el ajuste, su renglón y el movimiento por su
-- cuenta. B2 publicó entre tanto fn_ajuste_guardar / fn_ajuste_aplicar (código
-- AJ-0001, modo entrada/salida, «sistema al contar», costo aplicado, seriales,
-- idempotencia y asiento único): una segunda implementación divergiría. Desde aquí
-- fn_stock_registrar_movimiento es una fachada con la misma firma:
--   1. valida lo propio de Stock (motivo, cantidad, costo de entrada, producto padre
--      con variantes → P1, producto con lotes → lote obligatorio, producto con
--      seriales → se registra desde Ajustes, que pide los seriales);
--   2. fn_ajuste_guardar(org, {branch_id, mode: entrada|salida, reason, notes, items:[1]});
--   3. fn_ajuste_aplicar(org, id, clave) — el movimiento va por fn_inv_int_mover con
--      origen `adjustment` y source_id = id del ajuste; el documento asienta (P4).
-- Devuelve { ajuste_id, numero (code), aplicado }.

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
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 60);
  v_nota text := left(nullif(btrim(coalesce(p_nota, '')), ''), 1000);
  v_prod record;
  v_guardado jsonb;
  v_aplicado jsonb;
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
         coalesce(p.track_stock, true) as track_stock, coalesce(p.track_serial, false) as track_serial,
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
  if v_prod.track_serial then
    raise exception 'producto_con_seriales' using errcode = '22023';
  end if;
  if v_prod.track_lots and p_lot is null then
    raise exception 'lote_requerido' using errcode = '22023';
  end if;

  v_guardado := public.fn_ajuste_guardar(p_org, jsonb_build_object(
    'branch_id', p_branch,
    'mode', case when p_direccion = 'in' then 'entrada' else 'salida' end,
    'reason', v_motivo,
    'notes', v_nota,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', p_product,
      'lot_id', p_lot,
      'quantity', round(p_qty, 3),
      'unit_cost', case when p_direccion = 'in' then p_costo end))));

  v_aplicado := public.fn_ajuste_aplicar(p_org, (v_guardado->>'id')::integer,
                                         'b1-stock:' || (v_guardado->>'id'));

  return jsonb_build_object(
    'ajuste_id', (v_guardado->>'id')::integer,
    'numero', coalesce(v_guardado->>'code', v_aplicado->>'code'),
    'aplicado', v_aplicado);
end;
$$;

comment on function public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text) is
  'B1 · Registrar entrada/salida desde Stock: fachada de fn_ajuste_guardar + fn_ajuste_aplicar (B2), una línea. Permiso ajustar.';

revoke all on function public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text) from anon, public;
grant execute on function public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text) to authenticated, service_role;
