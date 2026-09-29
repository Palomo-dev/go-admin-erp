-- Inventario B1 · 4/4 — Lotes: listado, alta, ajuste de cantidad y baja
-- docs/implementacion/INVENTARIO-PLAN.md §5.2 y §2 F6; Figma «Lotes» 518:59165
-- (nuevo lote 522:62899, ajustar cantidad 522:63102, eliminar 520:66749).
--
-- Antes LotesService escribía `lots` y `stock_levels` desde el navegador, con
-- `stock_quantity: 0` cableado; el alta no pedía cantidad, sucursal ni costo.
--
-- fn_lotes_listado(p_org, p_filtros, p_desde, p_limite) → { filas, total, kpis, hoy, umbral }
--   Una fila por (lote, sucursal) con existencias; un lote sin ninguna fila de stock
--   sale una vez con la sucursal del lote y cantidad 0. Estado por vencimiento en el
--   día de la organización: vencido · por_vencer (≤ umbral días, 30 por defecto) ·
--   vigente · sin_vencimiento. Filtros: busqueda (código, producto, SKU), estados[],
--   sucursales[], producto (y sus variantes), proveedor, con_existencias, umbral,
--   orden ('vence' | 'lote' | 'cantidad' | 'creado'), direccion.
-- fn_lotes_de_producto(p_org, p_product, p_branch) → LoteDisponible[] (LotPicker):
--   todos los lotes del producto con su existencia en la sucursal.
-- fn_lote_guardar(p_org, p_lote jsonb) → { lot_id, lot_code, movimiento? }
--   Contrato ParamsLoteGuardar (+ cantidad_inicial, costo_unitario, motivo, nota).
--   Alta o edición; código único por (organización, producto) → 23505 `lote_repetido`;
--   sin código se propone L-AAAAMMDD(-n). Con cantidad inicial la entrada va por
--   fn_stock_registrar_movimiento (ajuste aplicado + kardex + asiento del documento).
--   Permiso `crear` o `editar_catalogo` (y `ajustar` si hay cantidad inicial).
-- fn_lote_ajustar(p_org, p_lot, p_branch, p_cantidad, p_motivo, p_nota) → nueva
--   cantidad del lote en la sucursal; la diferencia sale o entra por
--   fn_stock_registrar_movimiento (al costo promedio de la fila). Permiso `ajustar`.
-- fn_lote_eliminar(p_org, p_lot): solo sin existencias, sin reservas y sin historia
--   (movimientos, ajustes, traslados, seriales). Permiso `eliminar`.
--
-- Todas DEFINER con fn_inventario_exigir_permiso; REVOKE a anon y public.

-- ─── Listado ────────────────────────────────────────────────────────────────

create or replace function public.fn_lotes_listado(
  p_org integer,
  p_filtros jsonb default '{}'::jsonb,
  p_desde integer default 0,
  p_limite integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_costos boolean;
  v_suc integer[];
  v_hoy date := (now() at time zone coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota'))::date;
  v_umbral integer := 30;
  v_busq text := nullif(btrim(coalesce(v_f->>'busqueda', '')), '');
  v_patron text;
  v_estados text[];
  v_productos integer[];
  v_prov integer;
  v_con_exist boolean := coalesce((v_f->>'con_existencias')::boolean, false);
  v_orden text := coalesce(nullif(v_f->>'orden', ''), 'vence');
  v_desc boolean := lower(coalesce(v_f->>'direccion', 'asc')) = 'desc';
  v_lim integer := least(greatest(coalesce(p_limite, 25), 1), 500);
  v_off integer := greatest(coalesce(p_desde, 0), 0);
  v_res jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);

  if v_f->>'umbral' ~ '^\d{1,3}$' then v_umbral := least((v_f->>'umbral')::integer, 365); end if;
  if v_f->>'proveedor' ~ '^\d{1,9}$' then v_prov := (v_f->>'proveedor')::integer; end if;
  if v_f->>'producto' ~ '^\d{1,9}$' then
    select array_agg(p.id) into v_productos from public.products p
     where p.organization_id = p_org
       and (p.id = (v_f->>'producto')::integer or p.parent_product_id = (v_f->>'producto')::integer);
    v_productos := coalesce(v_productos, array[-1]);
  end if;
  if v_orden not in ('vence', 'lote', 'cantidad', 'creado') then v_orden := 'vence'; end if;
  if jsonb_typeof(v_f->'estados') = 'array' then
    select array_agg(x) into v_estados from jsonb_array_elements_text(v_f->'estados') x
     where x in ('vigente', 'por_vencer', 'vencido', 'sin_vencimiento');
  end if;
  select array_agg(b.id) into v_suc from public.branches b
   where b.organization_id = p_org
     and (jsonb_typeof(v_f->'sucursales') is distinct from 'array'
          or jsonb_array_length(v_f->'sucursales') = 0
          or b.id::text in (select jsonb_array_elements_text(v_f->'sucursales')));
  v_suc := coalesce(v_suc, array[]::integer[]);
  if v_busq is not null then
    v_patron := '%' || replace(replace(replace(left(v_busq, 120), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with l as (
    select l.*
      from public.lots l
      join public.products p on p.id = l.product_id and p.organization_id = p_org
     where l.organization_id = p_org
       and coalesce(p.status, 'active') <> 'deleted'
  ),
  base as (
    select l.id as lot_id, l.lot_code, l.created_at, l.expiry_date, l.supplier_id, l.product_id, l.notes,
           sl.branch_id, coalesce(sl.qty_on_hand, 0) as qty, coalesce(sl.qty_reserved, 0) as res,
           coalesce(sl.avg_cost, 0) as costo
      from l join public.stock_levels sl on sl.lot_id = l.id and sl.branch_id = any(v_suc)
    union all
    select l.id, l.lot_code, l.created_at, l.expiry_date, l.supplier_id, l.product_id, l.notes,
           l.branch_id, 0, 0, 0
      from l
     where not exists (select 1 from public.stock_levels sl where sl.lot_id = l.id and sl.branch_id = any(v_suc))
       and (l.branch_id is null or l.branch_id = any(v_suc))
  ),
  con_estado as (
    select b.*,
           case when b.expiry_date is not null then b.expiry_date - v_hoy end as dias,
           case
             when b.expiry_date is null then 'sin_vencimiento'
             when b.expiry_date < v_hoy then 'vencido'
             when b.expiry_date - v_hoy <= v_umbral then 'por_vencer'
             else 'vigente'
           end as estado
      from base b
  ),
  filtradas as (
    select c.* from con_estado c
     where (v_estados is null or c.estado = any(v_estados))
       and (v_productos is null or c.product_id = any(v_productos))
       and (v_prov is null or c.supplier_id = v_prov)
       and (not v_con_exist or c.qty <> 0)
       and (v_patron is null or c.lot_code ilike v_patron
            or exists (select 1 from public.products p where p.id = c.product_id
                         and (p.name ilike v_patron or p.sku ilike v_patron or p.barcode ilike v_patron)))
  ),
  pagina as (
    select f.* from filtradas f
     order by
       case when v_orden = 'vence' and not v_desc then f.expiry_date end asc nulls last,
       case when v_orden = 'vence' and v_desc then f.expiry_date end desc nulls last,
       case when v_orden = 'lote' and not v_desc then lower(f.lot_code) end asc,
       case when v_orden = 'lote' and v_desc then lower(f.lot_code) end desc,
       case when v_orden = 'cantidad' and not v_desc then f.qty end asc,
       case when v_orden = 'cantidad' and v_desc then f.qty end desc,
       case when v_orden = 'creado' and not v_desc then f.created_at end asc,
       case when v_orden = 'creado' and v_desc then f.created_at end desc,
       f.lot_id, f.branch_id
     offset v_off limit v_lim
  )
  select jsonb_build_object(
    'costos', v_costos,
    'hoy', v_hoy,
    'umbral', v_umbral,
    'total', (select count(*) from filtradas),
    'kpis', (select jsonb_build_object(
        'lotes', count(distinct c.lot_id),
        'vigentes', count(*) filter (where c.estado in ('vigente', 'sin_vencimiento') and c.qty > 0),
        'uds_vigentes', coalesce(sum(c.qty) filter (where c.estado in ('vigente', 'sin_vencimiento') and c.qty > 0), 0),
        'por_vencer', count(*) filter (where c.estado = 'por_vencer' and c.qty > 0),
        'uds_por_vencer', coalesce(sum(c.qty) filter (where c.estado = 'por_vencer' and c.qty > 0), 0),
        'vencidos', count(*) filter (where c.estado = 'vencido' and c.qty > 0),
        'uds_vencidas', coalesce(sum(c.qty) filter (where c.estado = 'vencido' and c.qty > 0), 0),
        'valor_vencido', case when v_costos then round(coalesce(sum(c.qty * c.costo) filter (where c.estado = 'vencido' and c.qty > 0), 0), 2) end,
        'valor_riesgo', case when v_costos then round(coalesce(sum(c.qty * c.costo) filter (where c.estado in ('vencido', 'por_vencer') and c.qty > 0), 0), 2) end,
        'uds', coalesce(sum(c.qty) filter (where c.qty > 0), 0))
      from con_estado c),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
          'lot_id', g.lot_id, 'lot_code', g.lot_code, 'creado', g.created_at, 'expiry_date', g.expiry_date,
          'dias', g.dias, 'estado', g.estado, 'notas', g.notes,
          'product_id', g.product_id, 'nombre', p.name, 'sku', p.sku, 'unidad', p.unit_code,
          'atributos', (select string_agg(e.value, ' / ' order by e.key)
                          from jsonb_each_text(case when jsonb_typeof(p.variant_data) = 'object' then p.variant_data else '{}'::jsonb end) e),
          'branch_id', g.branch_id, 'sucursal', b.name,
          'qty_on_hand', g.qty, 'qty_reserved', g.res,
          'costo_promedio', case when v_costos then g.costo end,
          'valor', case when v_costos then round(greatest(g.qty, 0) * g.costo, 2) end,
          'supplier_id', g.supplier_id, 'proveedor', s.name,
          'con_historia', exists (select 1 from public.stock_movements sm where sm.lot_id = g.lot_id))
        order by
          case when v_orden = 'vence' and not v_desc then g.expiry_date end asc nulls last,
          case when v_orden = 'vence' and v_desc then g.expiry_date end desc nulls last,
          case when v_orden = 'lote' and not v_desc then lower(g.lot_code) end asc,
          case when v_orden = 'lote' and v_desc then lower(g.lot_code) end desc,
          case when v_orden = 'cantidad' and not v_desc then g.qty end asc,
          case when v_orden = 'cantidad' and v_desc then g.qty end desc,
          case when v_orden = 'creado' and not v_desc then g.created_at end asc,
          case when v_orden = 'creado' and v_desc then g.created_at end desc,
          g.lot_id, g.branch_id)
        from pagina g
        join public.products p on p.id = g.product_id
        left join public.branches b on b.id = g.branch_id
        left join public.suppliers s on s.id = g.supplier_id), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- ─── Lotes de un producto (LotPicker) ───────────────────────────────────────

create or replace function public.fn_lotes_de_producto(p_org integer, p_product integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'lot_id', l.id, 'lot_code', l.lot_code, 'expiry_date', l.expiry_date,
             'qty_on_hand', coalesce((select sum(sl.qty_on_hand) from public.stock_levels sl
                                       where sl.lot_id = l.id and (p_branch is null or sl.branch_id = p_branch)), 0))
             order by l.expiry_date asc nulls last, l.id)
      from public.lots l
      join public.products p on p.id = l.product_id and p.organization_id = p_org
     where l.organization_id = p_org and l.product_id = p_product), '[]'::jsonb);
end;
$$;

-- ─── Alta y edición ─────────────────────────────────────────────────────────

create or replace function public.fn_lote_guardar(p_org integer, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_l jsonb := coalesce(p_lote, '{}'::jsonb);
  v_uid uuid := auth.uid();
  v_id integer;
  v_prod integer;
  v_code text := left(nullif(btrim(coalesce(v_l->>'lot_code', '')), ''), 60);
  v_expiry date;
  v_supplier integer;
  v_branch integer;
  v_notes text := left(nullif(btrim(coalesce(v_l->>'notes', '')), ''), 500);
  v_qty numeric := nullif(v_l->>'cantidad_inicial', '')::numeric;
  v_costo numeric := nullif(v_l->>'costo_unitario', '')::numeric;
  v_hoy date := (now() at time zone coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota'))::date;
  v_base text;
  v_n integer := 1;
  v_mov jsonb;
  v_actual public.lots;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['crear', 'editar_catalogo']);

  if v_l->>'id' ~ '^\d{1,9}$' then v_id := (v_l->>'id')::integer; end if;
  if v_l->>'product_id' ~ '^\d{1,9}$' then v_prod := (v_l->>'product_id')::integer; end if;
  if v_l->>'supplier_id' ~ '^\d{1,9}$' then v_supplier := (v_l->>'supplier_id')::integer; end if;
  if v_l->>'branch_id' ~ '^\d{1,9}$' then v_branch := (v_l->>'branch_id')::integer; end if;
  if nullif(v_l->>'expiry_date', '') is not null then
    if v_l->>'expiry_date' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'fecha_invalida' using errcode = '22023';
    end if;
    v_expiry := (v_l->>'expiry_date')::date;
  end if;

  if v_id is not null then
    select * into v_actual from public.lots where id = v_id and organization_id = p_org for update;
    if v_actual.id is null then
      raise exception 'lote_invalido' using errcode = '22023', detail = v_id::text;
    end if;
    v_prod := v_actual.product_id;
  end if;

  if v_prod is null or not exists (select 1 from public.products p where p.id = v_prod and p.organization_id = p_org
                                     and coalesce(p.status, 'active') <> 'deleted') then
    raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if v_supplier is not null and not exists (select 1 from public.suppliers s where s.id = v_supplier and s.organization_id = p_org) then
    raise exception 'proveedor_invalido' using errcode = '42501';
  end if;
  if v_branch is not null and not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if v_qty is not null and v_qty < 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  if coalesce(v_qty, 0) > 0 and v_branch is null then
    raise exception 'sucursal_requerida' using errcode = '22023';
  end if;

  if v_code is null then
    v_base := 'L-' || to_char(v_hoy, 'YYYYMMDD');
    v_code := v_base;
    while exists (select 1 from public.lots x where x.organization_id = p_org and x.product_id = v_prod and x.lot_code = v_code) loop
      v_n := v_n + 1;
      v_code := v_base || '-' || v_n;
    end loop;
  end if;

  begin
    if v_id is null then
      insert into public.lots (organization_id, product_id, lot_code, expiry_date, supplier_id, branch_id, notes, created_by)
      values (p_org, v_prod, v_code, v_expiry, v_supplier, v_branch, v_notes, v_uid)
      returning id into v_id;
    else
      update public.lots
         set lot_code = v_code, expiry_date = v_expiry, supplier_id = v_supplier,
             branch_id = coalesce(v_branch, branch_id), notes = v_notes, updated_at = now()
       where id = v_id;
    end if;
  exception when unique_violation then
    raise exception 'lote_repetido' using errcode = '23505', detail = v_code;
  end;

  if coalesce(v_qty, 0) > 0 then
    v_mov := public.fn_stock_registrar_movimiento(
      p_org, v_branch, v_prod, v_id, 'in', v_qty, coalesce(v_costo, 0),
      coalesce(nullif(btrim(v_l->>'motivo'), ''), 'Lote nuevo ' || v_code), nullif(btrim(v_l->>'nota'), ''));
  end if;

  return jsonb_build_object('lot_id', v_id, 'lot_code', v_code, 'movimiento', v_mov);
end;
$$;

-- ─── Ajustar la cantidad de un lote en una sucursal ─────────────────────────

create or replace function public.fn_lote_ajustar(
  p_org integer, p_lot integer, p_branch integer, p_cantidad numeric, p_motivo text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote public.lots;
  v_actual numeric := 0;
  v_costo numeric := 0;
  v_dif numeric;
  v_res jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar']);
  select * into v_lote from public.lots where id = p_lot and organization_id = p_org;
  if v_lote.id is null then
    raise exception 'lote_invalido' using errcode = '22023', detail = coalesce(p_lot::text, 'null');
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;

  -- Se bloquea la fila antes de calcular la diferencia (la primitiva la vuelve a bloquear).
  select coalesce(sl.qty_on_hand, 0), coalesce(sl.avg_cost, 0) into v_actual, v_costo
    from public.stock_levels sl
   where sl.product_id = v_lote.product_id and sl.branch_id = p_branch and sl.lot_id = p_lot
   order by sl.id limit 1
   for update;
  v_actual := coalesce(v_actual, 0);
  v_costo := coalesce(v_costo, 0);
  v_dif := round(p_cantidad, 3) - v_actual;
  if v_dif = 0 then
    return jsonb_build_object('sin_cambio', true, 'cantidad', v_actual);
  end if;
  if v_costo = 0 then
    v_costo := coalesce(public.fn_costo_unitario_producto(v_lote.product_id, p_branch, 0), 0);
  end if;

  v_res := public.fn_stock_registrar_movimiento(
    p_org, p_branch, v_lote.product_id, p_lot,
    case when v_dif > 0 then 'in' else 'out' end, abs(v_dif),
    case when v_dif > 0 then v_costo end, p_motivo, p_nota);
  return v_res || jsonb_build_object('sin_cambio', false, 'anterior', v_actual, 'cantidad', round(p_cantidad, 3), 'diferencia', v_dif);
end;
$$;

-- ─── Eliminar (solo sin existencias ni historia) ─────────────────────────────

create or replace function public.fn_lote_eliminar(p_org integer, p_lot integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote public.lots;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['eliminar']);
  select * into v_lote from public.lots where id = p_lot and organization_id = p_org for update;
  if v_lote.id is null then
    raise exception 'lote_invalido' using errcode = '22023', detail = coalesce(p_lot::text, 'null');
  end if;
  if exists (select 1 from public.stock_levels sl where sl.lot_id = p_lot
               and (coalesce(sl.qty_on_hand, 0) <> 0 or coalesce(sl.qty_reserved, 0) <> 0)) then
    raise exception 'lote_con_existencias' using errcode = '23514';
  end if;
  if exists (select 1 from public.stock_movements sm where sm.lot_id = p_lot)
     or exists (select 1 from public.adjustment_items ai where ai.lot_id = p_lot)
     or exists (select 1 from public.transfer_items ti where ti.lot_id = p_lot)
     or exists (select 1 from public.serial_numbers s where s.lot_id = p_lot) then
    raise exception 'lote_con_movimientos' using errcode = '23514';
  end if;
  -- Filas en 0 del lote: si quedaran, el ON DELETE SET NULL las convertiría en filas
  -- sin lote duplicadas. No mueven stock (ya están en 0).
  delete from public.stock_levels sl where sl.lot_id = p_lot;
  delete from public.lots where id = p_lot;
  return jsonb_build_object('eliminado', true, 'lot_id', p_lot, 'lot_code', v_lote.lot_code);
end;
$$;

comment on function public.fn_lotes_listado(integer, jsonb, integer, integer) is
  'B1 · Lotes por (lote, sucursal) paginados, con estado de vencimiento en el día de la organización. Permiso ver.';
comment on function public.fn_lotes_de_producto(integer, integer, integer) is
  'B1 · Lotes de un producto con su existencia en la sucursal (LotPicker). Permiso ver.';
comment on function public.fn_lote_guardar(integer, jsonb) is
  'B1 · Alta/edición de lote (código único por producto); la cantidad inicial entra por fn_stock_registrar_movimiento.';
comment on function public.fn_lote_ajustar(integer, integer, integer, numeric, text, text) is
  'B1 · Fija la cantidad de un lote en una sucursal; la diferencia va por fn_stock_registrar_movimiento. Permiso ajustar.';
comment on function public.fn_lote_eliminar(integer, integer) is
  'B1 · Elimina un lote sin existencias ni historia. Permiso eliminar.';

revoke all on function public.fn_lotes_listado(integer, jsonb, integer, integer) from anon, public;
revoke all on function public.fn_lotes_de_producto(integer, integer, integer) from anon, public;
revoke all on function public.fn_lote_guardar(integer, jsonb) from anon, public;
revoke all on function public.fn_lote_ajustar(integer, integer, integer, numeric, text, text) from anon, public;
revoke all on function public.fn_lote_eliminar(integer, integer) from anon, public;
grant execute on function public.fn_lotes_listado(integer, jsonb, integer, integer) to authenticated, service_role;
grant execute on function public.fn_lotes_de_producto(integer, integer, integer) to authenticated, service_role;
grant execute on function public.fn_lote_guardar(integer, jsonb) to authenticated, service_role;
grant execute on function public.fn_lote_ajustar(integer, integer, integer, numeric, text, text) to authenticated, service_role;
grant execute on function public.fn_lote_eliminar(integer, integer) to authenticated, service_role;
