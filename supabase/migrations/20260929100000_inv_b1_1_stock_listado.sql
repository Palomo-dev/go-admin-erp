-- Inventario B1 · 1/4 — Listado de stock paginado en el servidor
-- docs/implementacion/INVENTARIO-PLAN.md §5.2 (bloque B1) y §1.2; Figma «Existencias — Stock» 581:276750.
--
-- Antes la pantalla leía stock_levels + products desde el navegador, con estas brechas:
-- «Disponible» = qty_on_hand sin restar lo reservado, variantes sin agrupar por su
-- producto, lote invisible, KPI que contaban filas y no productos, y todo el catálogo
-- traído de una vez (23.644 filas en la org 137).
--
-- fn_stock_listado(p_org, p_filtros, p_desde, p_limite) → jsonb
--   { filas: [...], total, kpis: {...}, costos: bool }
--
-- Una fila por producto del listado:
--   · agrupar = true (defecto, P1 del 2026-09-28): las variantes se suman bajo su
--     producto padre; la fila propia del padre NO se suma: sale aparte en
--     `sin_asignar` («sin asignar a variante») hasta que cada organización la reparta.
--   · agrupar = false: cada producto por separado (lo usan los diálogos para elegir
--     el producto exacto que se mueve); un padre con variantes solo aparece si su
--     fila propia tiene existencias, marcado `sin_asignar_fila`.
--   disponible = existencia − reservado. El mínimo es por (producto, sucursal): el
--   mayor de sus filas (vive en la fila sin lote).
--   estado: negativo (alguna sucursal o variante bajo cero) · agotado (disponible ≤ 0)
--           · bajo_minimo (disponible < mínimo) · disponible.
--
-- Filtros (p_filtros): busqueda (nombre, SKU, código de barras o código de lote),
-- sucursales int[] (sin lista = todas las de la organización; las ajenas se
-- descartan), estados text[], categoria, seguimiento ('lotes' | 'seriales' | 'sin'),
-- proveedor, producto (el producto y sus variantes), agrupar, orden
-- ('producto' | 'disponible' | 'existencia'), direccion ('asc' | 'desc').
--
-- Costos (costo promedio y valor) solo con el permiso `costos`; si no, llegan null.
-- KPI: sobre todo el alcance de sucursales, sin búsqueda ni filtros (como Figma).
-- Permiso: `ver`. DEFINER con fn_inventario_exigir_permiso (que pasa por
-- fn_assert_acceso_org); REVOKE a anon y public.

create or replace function public.fn_stock_listado(
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
  v_busq text := nullif(btrim(coalesce(v_f->>'busqueda', '')), '');
  v_patron text;
  v_estados text[];
  v_cat integer;
  v_seg text := nullif(v_f->>'seguimiento', '');
  v_prov integer;
  v_producto integer;
  v_agrupar boolean := coalesce((v_f->>'agrupar')::boolean, true);
  v_orden text := coalesce(nullif(v_f->>'orden', ''), 'producto');
  v_desc boolean := lower(coalesce(v_f->>'direccion', 'asc')) = 'desc';
  v_lim integer := least(greatest(coalesce(p_limite, 25), 1), 500);
  v_off integer := greatest(coalesce(p_desde, 0), 0);
  v_res jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);

  if v_f->>'categoria' ~ '^\d{1,9}$' then v_cat := (v_f->>'categoria')::integer; end if;
  if v_f->>'proveedor' ~ '^\d{1,9}$' then v_prov := (v_f->>'proveedor')::integer; end if;
  if v_f->>'producto' ~ '^\d{1,9}$' then v_producto := (v_f->>'producto')::integer; end if;
  if v_seg is not null and v_seg not in ('lotes', 'seriales', 'sin') then v_seg := null; end if;
  if v_orden not in ('producto', 'disponible', 'existencia') then v_orden := 'producto'; end if;

  if jsonb_typeof(v_f->'estados') = 'array' then
    select array_agg(x) into v_estados
      from jsonb_array_elements_text(v_f->'estados') x
     where x in ('disponible', 'bajo_minimo', 'agotado', 'negativo');
  end if;

  select array_agg(b.id order by b.id) into v_suc
    from public.branches b
   where b.organization_id = p_org
     and (jsonb_typeof(v_f->'sucursales') is distinct from 'array'
          or jsonb_array_length(v_f->'sucursales') = 0
          or b.id::text in (select jsonb_array_elements_text(v_f->'sucursales')));
  v_suc := coalesce(v_suc, array[]::integer[]);

  if v_busq is not null then
    v_patron := '%' || replace(replace(replace(left(v_busq, 120), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with prod as (
    select p.id, p.name, p.sku, p.barcode, p.parent_product_id, p.category_id, p.unit_code,
           coalesce(p.track_lots, false) as track_lots, coalesce(p.track_serial, false) as track_serial,
           coalesce(p.track_stock, true) as track_stock, p.variant_data
      from public.products p
     where p.organization_id = p_org
       and coalesce(p.status, 'active') <> 'deleted'
  ),
  hijos as (
    select c.parent_product_id as pid, count(*) as n
      from prod c
     where c.parent_product_id is not null
       and exists (select 1 from prod pp where pp.id = c.parent_product_id)
     group by c.parent_product_id
  ),
  miembros as (
    select pr.id as product_id,
           case when v_agrupar and h_padre.pid is not null then pr.parent_product_id else pr.id end as fila_id,
           (v_agrupar and h.pid is not null) as aparte,
           pr.track_stock, pr.track_lots, pr.track_serial
      from prod pr
      left join hijos h on h.pid = pr.id
      left join hijos h_padre on h_padre.pid = pr.parent_product_id
  ),
  niv as (
    -- Por (producto, sucursal): una variante con lotes tiene varias filas.
    select sl.product_id, sl.branch_id,
           sum(coalesce(sl.qty_on_hand, 0)) as qty,
           sum(coalesce(sl.qty_reserved, 0)) as res,
           max(coalesce(sl.min_level, 0)) as minimo,
           sum(case when sl.qty_on_hand > 0 then sl.qty_on_hand * coalesce(sl.avg_cost, 0) else 0 end) as valor,
           sum(case when sl.qty_on_hand > 0 then sl.qty_on_hand else 0 end) as qty_pos,
           max(coalesce(sl.avg_cost, 0)) as avg_max,
           count(distinct sl.lot_id) filter (where sl.lot_id is not null and sl.qty_on_hand > 0) as lotes,
           bool_or(coalesce(sl.qty_on_hand, 0) < 0) as neg
      from public.stock_levels sl
      join prod on prod.id = sl.product_id
     where sl.branch_id = any(v_suc)
     group by sl.product_id, sl.branch_id
  ),
  por_suc as (
    select m.fila_id, n.branch_id,
           coalesce(sum(n.qty) filter (where not m.aparte), 0) as qty,
           coalesce(sum(n.res) filter (where not m.aparte), 0) as res,
           coalesce(sum(n.minimo) filter (where not m.aparte), 0) as minimo,
           coalesce(sum(n.valor) filter (where not m.aparte), 0) as valor,
           coalesce(sum(n.qty_pos) filter (where not m.aparte), 0) as qty_pos,
           max(n.avg_max) filter (where not m.aparte) as avg_max,
           coalesce(sum(n.lotes) filter (where not m.aparte), 0) as lotes,
           coalesce(sum(n.qty) filter (where m.aparte), 0) as sin_asignar,
           coalesce(bool_or(n.neg) filter (where not m.aparte), false) as neg
      from miembros m
      join niv n on n.product_id = m.product_id
     group by m.fila_id, n.branch_id
  ),
  agg as (
    select m.fila_id,
           bool_or(m.track_stock and not m.aparte) as sigue_stock,
           bool_or(m.track_lots) as con_lotes,
           bool_or(m.track_serial) as con_seriales
      from miembros m
     group by m.fila_id
  ),
  filas as (
    select f.id as product_id, f.name, f.sku, f.barcode, f.category_id, f.unit_code, f.parent_product_id,
           f.variant_data, a.con_lotes, a.con_seriales, a.sigue_stock,
           coalesce(h.n, 0) as variantes,
           (not v_agrupar and h.pid is not null) as sin_asignar_fila,
           coalesce(sum(s.qty), 0) as existencia,
           coalesce(sum(s.res), 0) as reservado,
           coalesce(sum(s.minimo), 0) as minimo,
           coalesce(sum(s.valor), 0) as valor,
           coalesce(sum(s.qty_pos), 0) as qty_pos,
           max(s.avg_max) as avg_max,
           coalesce(sum(s.lotes), 0) as lotes,
           coalesce(sum(s.sin_asignar), 0) as sin_asignar,
           coalesce(bool_or(s.neg), false) as neg,
           coalesce(jsonb_agg(jsonb_build_object(
               'branch_id', s.branch_id, 'existencia', s.qty, 'reservado', s.res,
               'disponible', s.qty - s.res, 'minimo', s.minimo, 'negativo', s.neg,
               'sin_asignar', s.sin_asignar) order by s.branch_id)
             filter (where s.branch_id is not null), '[]'::jsonb) as por_sucursal
      from prod f
      join agg a on a.fila_id = f.id
      left join hijos h on h.pid = f.id
      left join por_suc s on s.fila_id = f.id
     group by f.id, f.name, f.sku, f.barcode, f.category_id, f.unit_code, f.parent_product_id, f.variant_data,
              a.con_lotes, a.con_seriales, a.sigue_stock, h.n, h.pid
  ),
  visibles as (
    select x.*,
           x.existencia - x.reservado as disponible,
           case
             when x.neg or x.existencia < 0 then 'negativo'
             when x.existencia - x.reservado <= 0 then 'agotado'
             when x.minimo > 0 and x.existencia - x.reservado < x.minimo then 'bajo_minimo'
             else 'disponible'
           end as estado
      from filas x
     where case
             when x.sin_asignar_fila then x.existencia <> 0
             when v_seg = 'sin' then not x.sigue_stock
             else x.sigue_stock or x.existencia <> 0 or x.sin_asignar <> 0
           end
  ),
  filtradas as (
    select v.*
      from visibles v
     where (v_estados is null or v.estado = any(v_estados))
       and (v_cat is null or v.category_id = v_cat
            or v.category_id in (select c.id from public.categories c where c.parent_id = v_cat and c.organization_id = p_org))
       and (v_seg is null or v_seg = 'sin' or (v_seg = 'lotes' and v.con_lotes) or (v_seg = 'seriales' and v.con_seriales))
       and (v_producto is null or v.product_id = v_producto
            or v.product_id in (select m.fila_id from miembros m where m.product_id = v_producto)
            or v.product_id in (select c.id from prod c where c.parent_product_id = v_producto))
       and (v_prov is null or exists (
             select 1 from public.product_suppliers ps
               join miembros m on m.product_id = ps.product_id
              where m.fila_id = v.product_id and ps.supplier_id = v_prov))
       and (v_patron is null or exists (
             select 1 from miembros m join prod p on p.id = m.product_id
              where m.fila_id = v.product_id
                and (p.name ilike v_patron or p.sku ilike v_patron or p.barcode ilike v_patron))
            or exists (
             select 1 from miembros m join public.lots l on l.product_id = m.product_id
              where m.fila_id = v.product_id and l.lot_code ilike v_patron))
  ),
  pagina as (
    select q.*
      from filtradas q
     order by
       case when v_orden = 'disponible' and not v_desc then q.disponible end asc nulls last,
       case when v_orden = 'disponible' and v_desc then q.disponible end desc nulls last,
       case when v_orden = 'existencia' and not v_desc then q.existencia end asc nulls last,
       case when v_orden = 'existencia' and v_desc then q.existencia end desc nulls last,
       case when v_orden = 'producto' and v_desc then lower(q.name) end desc,
       lower(q.name) asc, q.product_id asc
     offset v_off limit v_lim
  )
  select jsonb_build_object(
    'costos', v_costos,
    'sucursales', to_jsonb(v_suc),
    'total', (select count(*) from filtradas),
    'kpis', (select jsonb_build_object(
        'productos', count(*),
        'con_existencias', count(*) filter (where v.existencia > 0),
        'valor', case when v_costos then round(coalesce(sum(v.valor), 0), 2) end,
        'bajo_minimo', count(*) filter (where v.estado = 'bajo_minimo'),
        'agotados', count(*) filter (where v.estado = 'agotado'),
        'negativos', count(*) filter (where v.estado = 'negativo'),
        'sin_asignar', count(*) filter (where v.sin_asignar <> 0))
      from visibles v),
    'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', g.product_id,
        'nombre', g.name,
        'sku', g.sku,
        'barcode', g.barcode,
        'parent_id', g.parent_product_id,
        'atributos', (select string_agg(e.value, ' / ' order by e.key)
                        from jsonb_each_text(case when jsonb_typeof(g.variant_data) = 'object' then g.variant_data else '{}'::jsonb end) e),
        'categoria', (select c.name from public.categories c where c.id = g.category_id),
        'unidad', g.unit_code,
        'con_lotes', g.con_lotes,
        'con_seriales', g.con_seriales,
        'sigue_stock', g.sigue_stock,
        'variantes', g.variantes,
        'sin_asignar_fila', g.sin_asignar_fila,
        'existencia', g.existencia,
        'reservado', g.reservado,
        'disponible', g.disponible,
        'minimo', g.minimo,
        'lotes', g.lotes,
        'sin_asignar', g.sin_asignar,
        'estado', g.estado,
        'costo_promedio', case when v_costos then
            round(case when g.qty_pos > 0 then g.valor / g.qty_pos else coalesce(g.avg_max, 0) end, 2) end,
        'valor', case when v_costos then round(g.valor, 2) end,
        'por_sucursal', (select coalesce(jsonb_agg(ps.e || jsonb_build_object('sucursal', b.name) order by b.is_main desc nulls last, b.name), '[]'::jsonb)
                           from jsonb_array_elements(g.por_sucursal) ps(e)
                           join public.branches b on b.id = (ps.e->>'branch_id')::integer)
      )) from pagina g), '[]'::jsonb)
  ) into v_res;

  -- El orden de `filas` es el de `pagina` (jsonb_agg sin ORDER BY no lo garantiza).
  select jsonb_set(v_res, '{filas}', coalesce((
    select jsonb_agg(e order by
      case when v_orden = 'disponible' and not v_desc then (e->>'disponible')::numeric end asc nulls last,
      case when v_orden = 'disponible' and v_desc then (e->>'disponible')::numeric end desc nulls last,
      case when v_orden = 'existencia' and not v_desc then (e->>'existencia')::numeric end asc nulls last,
      case when v_orden = 'existencia' and v_desc then (e->>'existencia')::numeric end desc nulls last,
      case when v_orden = 'producto' and v_desc then lower(e->>'nombre') end desc,
      lower(e->>'nombre') asc, (e->>'product_id')::integer asc)
      from jsonb_array_elements(v_res->'filas') e), '[]'::jsonb))
    into v_res;

  return v_res;
end;
$$;

comment on function public.fn_stock_listado(integer, jsonb, integer, integer) is
  'B1 · Stock paginado en el servidor, agrupado por producto padre (P1), disponible = existencia − reservado. Permiso ver; costos solo con permiso costos.';

revoke all on function public.fn_stock_listado(integer, jsonb, integer, integer) from anon, public;
grant execute on function public.fn_stock_listado(integer, jsonb, integer, integer) to authenticated, service_role;
