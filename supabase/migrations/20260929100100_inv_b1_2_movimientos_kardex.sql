-- Inventario B1 · 2/4 — Movimientos, kardex con saldo corrido y descuadres
-- docs/implementacion/INVENTARIO-PLAN.md §5.2; Figma «Existencias — Movimientos» 586:286574
-- y «Kardex» 516:270497 (descuadre 522:71624).
--
-- Antes: Movimientos y Kardex leían stock_movements desde el navegador; el kardex
-- sin .range() (el saldo mentía pasadas 1.000 filas), el saldo se calculaba en el
-- navegador y el kardex exigía ?producto=. Aquí todo se pagina y se calcula en el
-- servidor, en la zona horaria de la organización.
--
-- Filtros comunes (p_filtros jsonb):
--   sucursales int[] (sin lista = todas; las ajenas se descartan) · desde, hasta
--   (días YYYY-MM-DD en la zona de la organización, hasta inclusive) · direccion
--   ('in' | 'out') · origenes text[] · producto (el producto y sus variantes) ·
--   lote · usuario (uuid) · busqueda (producto, SKU, código de barras, lote, id del
--   documento o nota) · solo_ingredientes (salidas de productos que son ingrediente
--   de una receta activa) · sin_documento · orden 'fecha' + direccion_orden.
--
-- fn_movimientos_listado → { filas, total, kpis{entradas, salidas, valor_salidas,
--   sin_documento}, costos, desde, hasta }
-- fn_kardex_saldo_corrido → igual + `saldo` por fila: la suma corrida de entradas −
--   salidas de ese producto en el alcance de sucursales (y del lote si se filtra
--   por lote), sobre TODA la historia, no solo el período; y kpis{…, saldo_cierre,
--   existencias, valor, cuadre{…}}.
-- fn_kardex_descuadres → pares (producto, sucursal) con movimientos cuyo saldo de
--   kardex no coincide con la existencia (D2: 4.899 al 2026-09-29), y cuántas filas
--   de stock no tienen ningún movimiento (D3). Solo informa: no corrige (P2 es B10).
--
-- Costos (costo unitario, costo tras el movimiento, valor) solo con el permiso
-- `costos`. Permiso: `ver`. DEFINER, REVOKE a anon y public.

create or replace function public.fn_inv_int_filtro_movimientos(p_org integer, p_filtros jsonb)
returns table (
  sucursales integer[], desde_ts timestamptz, hasta_ts timestamptz, desde_dia date, hasta_dia date,
  direccion text, origenes text[], productos integer[], lote integer, usuario uuid, patron text,
  solo_ingredientes boolean, sin_documento boolean, ascendente boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_tz text := coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota');
  v_busq text := nullif(btrim(coalesce(v_f->>'busqueda', '')), '');
  v_prod integer;
begin
  select array_agg(b.id order by b.id) into sucursales
    from public.branches b
   where b.organization_id = p_org
     and (jsonb_typeof(v_f->'sucursales') is distinct from 'array'
          or jsonb_array_length(v_f->'sucursales') = 0
          or b.id::text in (select jsonb_array_elements_text(v_f->'sucursales')));
  sucursales := coalesce(sucursales, array[]::integer[]);

  if v_f->>'desde' ~ '^\d{4}-\d{2}-\d{2}$' then
    desde_dia := (v_f->>'desde')::date;
    desde_ts := desde_dia::timestamp at time zone v_tz;
  end if;
  if v_f->>'hasta' ~ '^\d{4}-\d{2}-\d{2}$' then
    hasta_dia := (v_f->>'hasta')::date;
    hasta_ts := (hasta_dia + 1)::timestamp at time zone v_tz;
  end if;

  direccion := case when v_f->>'direccion' in ('in', 'out') then v_f->>'direccion' end;
  if jsonb_typeof(v_f->'origenes') = 'array' and jsonb_array_length(v_f->'origenes') > 0 then
    select array_agg(x) into origenes from jsonb_array_elements_text(v_f->'origenes') x;
  end if;

  if v_f->>'producto' ~ '^\d{1,9}$' then
    v_prod := (v_f->>'producto')::integer;
    select array_agg(p.id) into productos
      from public.products p
     where p.organization_id = p_org and (p.id = v_prod or p.parent_product_id = v_prod);
    productos := coalesce(productos, array[-1]);
  end if;

  if v_f->>'lote' ~ '^\d{1,9}$' then lote := (v_f->>'lote')::integer; end if;
  if v_f->>'usuario' ~ '^[0-9a-fA-F-]{36}$' then usuario := (v_f->>'usuario')::uuid; end if;
  if v_busq is not null then
    patron := '%' || replace(replace(replace(left(v_busq, 120), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  solo_ingredientes := coalesce((v_f->>'solo_ingredientes')::boolean, false);
  sin_documento := coalesce((v_f->>'sin_documento')::boolean, false);
  ascendente := lower(coalesce(v_f->>'direccion_orden', 'desc')) = 'asc';
  return next;
end;
$$;

revoke all on function public.fn_inv_int_filtro_movimientos(integer, jsonb) from anon, public, authenticated;

-- ─── Movimientos (bitácora) ────────────────────────────────────────────────

create or replace function public.fn_movimientos_listado(
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
  v_costos boolean;
  q record;
  v_lim integer := least(greatest(coalesce(p_limite, 25), 1), 1000);
  v_off integer := greatest(coalesce(p_desde, 0), 0);
  v_res jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);
  select * into q from public.fn_inv_int_filtro_movimientos(p_org, p_filtros);

  with m as (
    select sm.*
      from public.stock_movements sm
     where sm.organization_id = p_org
       and sm.branch_id = any(q.sucursales)
       and (q.desde_ts is null or sm.created_at >= q.desde_ts)
       and (q.hasta_ts is null or sm.created_at < q.hasta_ts)
       and (q.direccion is null or sm.direction = q.direccion)
       and (q.origenes is null or sm.source = any(q.origenes))
       and (q.productos is null or sm.product_id = any(q.productos))
       and (q.lote is null or sm.lot_id = q.lote)
       and (q.usuario is null or coalesce(sm.created_by, sm.updated_by) = q.usuario)
       and (not q.sin_documento or sm.source_id is null)
       and (not q.solo_ingredientes or (sm.direction = 'out' and exists (
             select 1 from public.recipe_ingredients ri
               join public.product_recipes pr on pr.id = ri.recipe_id
              where ri.ingredient_product_id = sm.product_id and pr.organization_id = p_org and pr.is_active)))
       and (q.patron is null
            or sm.source_id ilike q.patron or sm.note ilike q.patron
            or exists (select 1 from public.products p where p.id = sm.product_id
                         and (p.name ilike q.patron or p.sku ilike q.patron or p.barcode ilike q.patron))
            or exists (select 1 from public.lots l where l.id = sm.lot_id and l.lot_code ilike q.patron))
  ),
  pagina as (
    select m.* from m
     order by case when q.ascendente then m.created_at end asc,
              case when q.ascendente then m.id end asc,
              case when not q.ascendente then m.created_at end desc,
              case when not q.ascendente then m.id end desc
     offset v_off limit v_lim
  )
  select jsonb_build_object(
    'costos', v_costos,
    'desde', q.desde_dia, 'hasta', q.hasta_dia,
    'total', (select count(*) from m),
    'kpis', (select jsonb_build_object(
        'entradas', coalesce(sum(m.qty) filter (where m.direction = 'in'), 0),
        'salidas', coalesce(sum(m.qty) filter (where m.direction = 'out'), 0),
        'movimientos_entrada', count(*) filter (where m.direction = 'in'),
        'movimientos_salida', count(*) filter (where m.direction = 'out'),
        'valor_salidas', case when v_costos then round(coalesce(sum(m.qty * coalesce(m.unit_cost, 0)) filter (where m.direction = 'out'), 0), 2) end,
        'sin_documento', count(*) filter (where m.source_id is null))
      from m),
    'filas', coalesce((
      select jsonb_agg(public.fn_inv_int_fila_movimiento(
                 row(g.id, g.organization_id, g.branch_id, g.product_id, g.lot_id, g.direction, g.qty, g.unit_cost,
                     g.source, g.source_id, g.note, g.created_at, g.updated_by, g.created_by, g.avg_cost_after)::public.stock_movements,
                 v_costos, null) order by
               case when q.ascendente then g.created_at end asc, case when q.ascendente then g.id end asc,
               case when not q.ascendente then g.created_at end desc, case when not q.ascendente then g.id end desc)
        from pagina g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- Una fila de kardex en JSON (la usan movimientos y kardex).
create or replace function public.fn_inv_int_fila_movimiento(p_m public.stock_movements, p_costos boolean, p_saldo numeric)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_m.id,
    'fecha', p_m.created_at,
    'product_id', p_m.product_id,
    'nombre', p.name,
    'sku', p.sku,
    'unidad', p.unit_code,
    'parent_id', p.parent_product_id,
    'atributos', (select string_agg(e.value, ' / ' order by e.key)
                    from jsonb_each_text(case when jsonb_typeof(p.variant_data) = 'object' then p.variant_data else '{}'::jsonb end) e),
    'branch_id', p_m.branch_id,
    'sucursal', b.name,
    'lot_id', p_m.lot_id,
    'lote', l.lot_code,
    'direccion', p_m.direction,
    'cantidad', p_m.qty,
    'costo_unitario', case when p_costos then p_m.unit_cost end,
    'costo_total', case when p_costos then round(p_m.qty * coalesce(p_m.unit_cost, 0), 2) end,
    'costo_promedio_tras', case when p_costos then p_m.avg_cost_after end,
    'source', p_m.source,
    'source_id', p_m.source_id,
    'nota', p_m.note,
    'usuario_id', coalesce(p_m.created_by, p_m.updated_by),
    'usuario', nullif(btrim(concat_ws(' ', pf.first_name, pf.last_name)), ''),
    'saldo', p_saldo)
    from (select 1) uno
    left join public.products p on p.id = p_m.product_id
    left join public.branches b on b.id = p_m.branch_id
    left join public.lots l on l.id = p_m.lot_id
    left join public.profiles pf on pf.id = coalesce(p_m.created_by, p_m.updated_by);
$$;

revoke all on function public.fn_inv_int_fila_movimiento(public.stock_movements, boolean, numeric) from anon, public, authenticated;

-- ─── Descuadres (D2) ────────────────────────────────────────────────────────

create or replace function public.fn_kardex_descuadres(
  p_org integer,
  p_filtros jsonb default '{}'::jsonb,
  p_limite integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  q record;
  v_lim integer := least(greatest(coalesce(p_limite, 100), 0), 1000);
  v_res jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  select * into q from public.fn_inv_int_filtro_movimientos(p_org, p_filtros);

  with k as (
    select sm.product_id, sm.branch_id, sum(case when sm.direction = 'in' then sm.qty else -sm.qty end) as saldo,
           max(sm.created_at) as ultimo
      from public.stock_movements sm
     where sm.organization_id = p_org
       and sm.branch_id = any(q.sucursales)
       and (q.productos is null or sm.product_id = any(q.productos))
     group by sm.product_id, sm.branch_id
  ),
  e as (
    select sl.product_id, sl.branch_id, sum(coalesce(sl.qty_on_hand, 0)) as existencia
      from public.stock_levels sl
      join public.products p on p.id = sl.product_id and p.organization_id = p_org
     where sl.branch_id = any(q.sucursales)
       and (q.productos is null or sl.product_id = any(q.productos))
     group by sl.product_id, sl.branch_id
  ),
  pares as (
    select k.product_id, k.branch_id, k.saldo, coalesce(e.existencia, 0) as existencia,
           coalesce(e.existencia, 0) - k.saldo as diferencia, k.ultimo
      from k left join e using (product_id, branch_id)
     where round(k.saldo, 3) <> round(coalesce(e.existencia, 0), 3)
  )
  select jsonb_build_object(
    'total', (select count(*) from pares),
    'diferencia_total', (select coalesce(sum(diferencia), 0) from pares),
    'saldo_kardex', (select coalesce(sum(saldo), 0) from k),
    'existencias', (select coalesce(sum(existencia), 0) from e),
    'sin_historia', (select count(*) from e where e.existencia <> 0
                      and not exists (select 1 from k where k.product_id = e.product_id and k.branch_id = e.branch_id)),
    'pares', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', x.product_id, 'nombre', p.name, 'sku', p.sku,
               'branch_id', x.branch_id, 'sucursal', b.name,
               'saldo_kardex', x.saldo, 'existencia', x.existencia, 'diferencia', x.diferencia,
               'ultimo_movimiento', x.ultimo) order by abs(x.diferencia) desc, x.product_id)
        from (select * from pares order by abs(diferencia) desc, product_id limit v_lim) x
        join public.products p on p.id = x.product_id
        join public.branches b on b.id = x.branch_id), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- ─── Kardex con saldo corrido ───────────────────────────────────────────────

create or replace function public.fn_kardex_saldo_corrido(
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
  v_costos boolean;
  q record;
  v_lim integer := least(greatest(coalesce(p_limite, 25), 1), 1000);
  v_off integer := greatest(coalesce(p_desde, 0), 0);
  v_res jsonb;
  v_cuadre jsonb;
  v_exist numeric;
  v_valor numeric;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);
  select * into q from public.fn_inv_int_filtro_movimientos(p_org, p_filtros);

  -- Existencias y valor actuales del mismo alcance (producto, sucursales, lote).
  select coalesce(sum(sl.qty_on_hand), 0),
         coalesce(sum(case when sl.qty_on_hand > 0 then sl.qty_on_hand * coalesce(sl.avg_cost, 0) else 0 end), 0)
    into v_exist, v_valor
    from public.stock_levels sl
    join public.products p on p.id = sl.product_id and p.organization_id = p_org
   where sl.branch_id = any(q.sucursales)
     and (q.productos is null or sl.product_id = any(q.productos))
     and (q.lote is null or sl.lot_id = q.lote);

  v_cuadre := public.fn_kardex_descuadres(p_org,
    jsonb_build_object('sucursales', to_jsonb(q.sucursales), 'producto', (coalesce(p_filtros, '{}'::jsonb))->>'producto'), 20);

  with base as (
    -- Toda la historia del alcance: el saldo corrido no depende del período.
    select sm.*,
           sum(case when sm.direction = 'in' then sm.qty else -sm.qty end)
             over (partition by sm.product_id order by sm.created_at, sm.id) as saldo
      from public.stock_movements sm
     where sm.organization_id = p_org
       and sm.branch_id = any(q.sucursales)
       and (q.productos is null or sm.product_id = any(q.productos))
       and (q.lote is null or sm.lot_id = q.lote)
  ),
  m as (
    select * from base
     where (q.desde_ts is null or base.created_at >= q.desde_ts)
       and (q.hasta_ts is null or base.created_at < q.hasta_ts)
       and (q.direccion is null or base.direction = q.direccion)
       and (q.origenes is null or base.source = any(q.origenes))
       and (q.usuario is null or coalesce(base.created_by, base.updated_by) = q.usuario)
       and (not q.sin_documento or base.source_id is null)
       and (q.patron is null
            or base.source_id ilike q.patron or base.note ilike q.patron
            or exists (select 1 from public.products p where p.id = base.product_id
                         and (p.name ilike q.patron or p.sku ilike q.patron or p.barcode ilike q.patron))
            or exists (select 1 from public.lots l where l.id = base.lot_id and l.lot_code ilike q.patron))
  ),
  cierre as (
    -- Saldo de cada producto al final del período (último movimiento antes de `hasta`).
    select distinct on (b.product_id) b.product_id, b.saldo
      from base b
     where q.hasta_ts is null or b.created_at < q.hasta_ts
     order by b.product_id, b.created_at desc, b.id desc
  ),
  pagina as (
    select m.* from m
     order by case when q.ascendente then m.created_at end asc,
              case when q.ascendente then m.id end asc,
              case when not q.ascendente then m.created_at end desc,
              case when not q.ascendente then m.id end desc
     offset v_off limit v_lim
  )
  select jsonb_build_object(
    'costos', v_costos,
    'desde', q.desde_dia, 'hasta', q.hasta_dia,
    'total', (select count(*) from m),
    'kpis', (select jsonb_build_object(
        'entradas', coalesce(sum(m.qty) filter (where m.direction = 'in'), 0),
        'salidas', coalesce(sum(m.qty) filter (where m.direction = 'out'), 0),
        'movimientos_entrada', count(*) filter (where m.direction = 'in'),
        'movimientos_salida', count(*) filter (where m.direction = 'out'),
        'valor_salidas', case when v_costos then round(coalesce(sum(m.qty * coalesce(m.unit_cost, 0)) filter (where m.direction = 'out'), 0), 2) end,
        'sin_documento', count(*) filter (where m.source_id is null),
        'saldo_cierre', (select coalesce(sum(c.saldo), 0) from cierre c),
        'existencias', v_exist,
        'valor', case when v_costos then round(v_valor, 2) end,
        'costo_promedio', case when v_costos and v_exist > 0 then round(v_valor / v_exist, 2) end)
      from m),
    'cuadre', v_cuadre,
    'filas', coalesce((
      select jsonb_agg(public.fn_inv_int_fila_movimiento(
                 row(g.id, g.organization_id, g.branch_id, g.product_id, g.lot_id, g.direction, g.qty, g.unit_cost,
                     g.source, g.source_id, g.note, g.created_at, g.updated_by, g.created_by, g.avg_cost_after)::public.stock_movements,
                 v_costos, g.saldo)
               order by
               case when q.ascendente then g.created_at end asc, case when q.ascendente then g.id end asc,
               case when not q.ascendente then g.created_at end desc, case when not q.ascendente then g.id end desc)
        from pagina g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

comment on function public.fn_movimientos_listado(integer, jsonb, integer, integer) is
  'B1 · Bitácora de movimientos paginada en el servidor, fechas en la zona de la organización. Permiso ver; costos con permiso costos.';
comment on function public.fn_kardex_saldo_corrido(integer, jsonb, integer, integer) is
  'B1 · Kardex paginado con saldo corrido por producto sobre toda la historia del alcance, y cuadre contra existencias. Permiso ver.';
comment on function public.fn_kardex_descuadres(integer, jsonb, integer) is
  'B1 · Pares producto-sucursal cuyo kardex no cuadra con la existencia (D2) y filas sin historia (D3). Solo informa.';

revoke all on function public.fn_movimientos_listado(integer, jsonb, integer, integer) from anon, public;
revoke all on function public.fn_kardex_saldo_corrido(integer, jsonb, integer, integer) from anon, public;
revoke all on function public.fn_kardex_descuadres(integer, jsonb, integer) from anon, public;
grant execute on function public.fn_movimientos_listado(integer, jsonb, integer, integer) to authenticated, service_role;
grant execute on function public.fn_kardex_saldo_corrido(integer, jsonb, integer, integer) to authenticated, service_role;
grant execute on function public.fn_kardex_descuadres(integer, jsonb, integer) to authenticated, service_role;
