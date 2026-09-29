-- Inventario B2 · 3/3 — Lectura de ajustes: listado, detalle y productos para contar
-- docs/implementacion/INVENTARIO-PLAN.md §5.3; Figma «Existencias — Ajustes» 586:303290
-- (listado 586:303291, detalle 586:308354 / 586:309538, nuevo 586:312944, móvil 975:186644).
--
--   fn_ajustes_listado(org, filtros jsonb)   → página + total + KPI + permisos (paginado en el servidor)
--   fn_ajuste_detalle(org, id)               → cabecera, renglones, movimientos del kardex y asiento
--   fn_ajuste_productos(org, sucursal, texto, ids[], limite)
--                                            → productos con su existencia por lote en la sucursal
--
-- Todas: SECURITY DEFINER, STABLE, fn_assert_acceso_org + fn_inventario_exigir_permiso
-- (`ver`; productos también con `ajustar`). Los importes (costo, impacto) solo
-- salen si la sesión tiene `costos`; si no, van en null.
--
-- Fechas: los filtros de día y los KPI «del mes» se evalúan en la zona de la
-- organización (fn_timezone_for), nunca en UTC.
--
-- fn_inv_documentos (núcleo B0): el número del ajuste pasa a ser su `code`
-- (AJ-0081) en vez de 'AJ-' || id. Parche por marcador sobre la definición viva
-- (B4 ya la parcheó; no se compara md5 para no pisar su cambio).

create or replace function public.fn_ajuste_int_nombre(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
                  nullif(split_part(coalesce(pr.email, ''), '@', 1), ''))
    from public.profiles pr
   where pr.id = p_user;
$$;

revoke all on function public.fn_ajuste_int_nombre(uuid) from public, anon, authenticated;

-- ── Listado ─────────────────────────────────────────────────────────────────
create or replace function public.fn_ajustes_listado(p_org integer, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_perm jsonb;
  v_costos boolean;
  v_tz text := public.fn_timezone_for(p_org, null);
  v_hoy date;
  v_mes date;
  v_suc integer := case when (v_f->>'sucursal') ~ '^[0-9]{1,9}$' then (v_f->>'sucursal')::integer end;
  v_busq text := nullif(btrim(v_f->>'busqueda'), '');
  v_patron text;
  v_estados text[];
  v_tipo text := case when v_f->>'tipo' in ('entrada', 'salida') then v_f->>'tipo' end;
  v_razon text := nullif(btrim(v_f->>'razon'), '');
  v_desde date;
  v_hasta date;
  v_off integer := case when (v_f->>'desde') ~ '^[0-9]{1,7}$' then (v_f->>'desde')::integer else 0 end;
  v_lim integer := least(greatest(case when (v_f->>'limite') ~ '^[0-9]{1,4}$' then (v_f->>'limite')::integer else 25 end, 1), 500);
  v_orden text := case when v_f->>'orden' in ('codigo', 'fecha', 'impacto') then v_f->>'orden' else 'fecha' end;
  v_asc boolean := lower(coalesce(v_f->>'direccion', 'desc')) = 'asc';
  v_ids integer[];
  v_filas jsonb;
  v_kpis jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_perm := public.fn_inventario_permisos(p_org);
  v_costos := coalesce((v_perm->>'costos')::boolean, false);
  v_hoy := (now() at time zone v_tz)::date;
  v_mes := date_trunc('month', v_hoy)::date;

  if v_suc is not null and not exists (select 1 from public.branches b where b.id = v_suc and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  select array_agg(x) into v_estados
    from jsonb_array_elements_text(case when jsonb_typeof(v_f->'estados') = 'array' then v_f->'estados' else '[]'::jsonb end) x
   where x in ('draft', 'posted', 'cancelled');
  begin
    v_desde := nullif(btrim(v_f->>'fecha_desde'), '')::date;
    v_hasta := nullif(btrim(v_f->>'fecha_hasta'), '')::date;
  exception when others then
    raise exception 'fecha_invalida' using errcode = '22023';
  end;
  if v_busq is not null then
    v_patron := '%' || replace(replace(replace(left(v_busq, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select array_agg(ia.id) into v_ids
    from public.inventory_adjustments ia
   where ia.organization_id = p_org
     and (v_suc is null or ia.branch_id = v_suc)
     and (v_estados is null or ia.status = any(v_estados))
     and (v_tipo is null or (v_tipo = 'entrada' and ia.type = 'gain') or (v_tipo = 'salida' and ia.type = 'loss'))
     and (v_razon is null or ia.reason = v_razon)
     and (v_desde is null or (coalesce(ia.counted_at, ia.created_at) at time zone v_tz)::date >= v_desde)
     and (v_hasta is null or (coalesce(ia.counted_at, ia.created_at) at time zone v_tz)::date <= v_hasta)
     and (v_patron is null
          or ia.code ilike v_patron
          or ia.notes ilike v_patron
          or exists (select 1 from public.adjustment_items ai join public.products p on p.id = ai.product_id
                      where ai.inventory_adjustment_id = ia.id
                        and (p.name ilike v_patron or p.sku ilike v_patron or p.barcode ilike v_patron)));

  with agg as (
    select ia.id, ia.code, ia.status, ia.type, ia.mode, ia.reason, ia.notes, ia.branch_id, ia.created_by,
           ia.created_at, coalesce(ia.counted_at, ia.created_at) as fecha, ia.posted_at,
           b.name as sucursal,
           r.n, r.dif, r.unidad, r.impacto
      from public.inventory_adjustments ia
      join public.branches b on b.id = ia.branch_id
      cross join lateral (
        select count(*)::integer as n,
               sum(ai.difference) as dif,
               case when count(distinct btrim(p.unit_code)) = 1 then min(btrim(p.unit_code)) end as unidad,
               sum(ai.difference * coalesce(ai.applied_cost, 0)) as impacto
          from public.adjustment_items ai
          join public.products p on p.id = ai.product_id
         where ai.inventory_adjustment_id = ia.id
      ) r
     where ia.id = any(coalesce(v_ids, array[]::integer[]))
  ), ordenado as (
    select agg.*, row_number() over (order by
       case when v_orden = 'fecha' and v_asc then fecha end asc,
       case when v_orden = 'fecha' and not v_asc then fecha end desc,
       case when v_orden = 'codigo' and v_asc then id end asc,
       case when v_orden = 'codigo' and not v_asc then id end desc,
       case when v_orden = 'impacto' and v_asc then impacto end asc nulls last,
       case when v_orden = 'impacto' and not v_asc then impacto end desc nulls last,
       id desc) as ord
      from agg
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id,
           'codigo', pg.code,
           'fecha', pg.fecha,
           'creado', pg.created_at,
           'aplicado', pg.posted_at,
           'autor', public.fn_ajuste_int_nombre(pg.created_by),
           'sucursal', jsonb_build_object('id', pg.branch_id, 'nombre', pg.sucursal),
           'tipo', case pg.type when 'loss' then 'salida' else 'entrada' end,
           'modo', coalesce(pg.mode, 'conteo'),
           'razon', pg.reason,
           'notas', pg.notes,
           'estado', pg.status,
           'productos', pg.n,
           'diferencia', coalesce(pg.dif, 0),
           'unidad', pg.unidad,
           'impacto', case when v_costos then round(coalesce(pg.impacto, 0), 2) end
         ) order by pg.ord), '[]'::jsonb)
    into v_filas
    from ordenado pg
   where pg.ord > v_off and pg.ord <= v_off + v_lim;

  select jsonb_build_object(
           'total', count(*),
           'mes', count(*) filter (where ia.status <> 'cancelled'
                                     and (ia.created_at at time zone v_tz)::date >= v_mes),
           'sucursales_mes', count(distinct ia.branch_id) filter (where ia.status <> 'cancelled'
                                     and (ia.created_at at time zone v_tz)::date >= v_mes),
           'borradores', count(*) filter (where ia.status = 'draft'),
           'borrador_mas_antiguo_dias', v_hoy - min((ia.created_at at time zone v_tz)::date) filter (where ia.status = 'draft'),
           'aplicados', count(*) filter (where ia.status = 'posted'),
           'descartados', count(*) filter (where ia.status = 'cancelled'),
           'impacto_mes', case when v_costos then (
             select round(coalesce(sum(ai.difference * coalesce(ai.applied_cost, 0)), 0), 2)
               from public.inventory_adjustments x
               join public.adjustment_items ai on ai.inventory_adjustment_id = x.id
              where x.organization_id = p_org
                and (v_suc is null or x.branch_id = v_suc)
                and x.status = 'posted'
                and (coalesce(x.posted_at, x.updated_at) at time zone v_tz)::date >= v_mes) end)
    into v_kpis
    from public.inventory_adjustments ia
   where ia.organization_id = p_org
     and (v_suc is null or ia.branch_id = v_suc);

  return jsonb_build_object(
    'filas', v_filas,
    'total', coalesce(array_length(v_ids, 1), 0),
    'kpis', v_kpis,
    'permisos', v_perm,
    'hoy', v_hoy,
    'zona', v_tz);
end;
$$;

-- ── Detalle ─────────────────────────────────────────────────────────────────
create or replace function public.fn_ajuste_detalle(p_org integer, p_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_perm jsonb;
  v_costos boolean;
  v_aj record;
  v_items jsonb;
  v_movs jsonb;
  v_asiento jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_perm := public.fn_inventario_permisos(p_org);
  v_costos := coalesce((v_perm->>'costos')::boolean, false);

  select ia.*, b.name as sucursal into v_aj
    from public.inventory_adjustments ia
    join public.branches b on b.id = ia.branch_id
   where ia.id = p_id and ia.organization_id = p_org;
  if not found then
    raise exception 'ajuste_no_encontrado' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'producto', jsonb_build_object('id', x.product_id, 'nombre', x.name, 'sku', x.sku, 'unidad', btrim(x.unit_code),
                                          'controla_lotes', coalesce(x.track_lots, false),
                                          'controla_serial', coalesce(x.track_serial, false)),
           'lote', case when x.lot_id is not null then jsonb_build_object('id', x.lot_id, 'codigo', x.lot_code, 'vence', x.expiry_date) end,
           'cantidad', x.quantity,
           'sistema', x.sistema,
           'sistema_actual', case when v_aj.status = 'draft' then x.actual end,
           'diferencia', x.dif,
           'costo', case when v_costos then x.costo end,
           'costo_ingresado', case when v_costos then x.unit_cost end,
           'impacto', case when v_costos then round(x.dif * coalesce(x.costo, 0), 2) end,
           'seriales', to_jsonb(coalesce(x.serial_numbers, array[]::text[]))
         ) order by x.id), '[]'::jsonb)
    into v_items
    from (
      select ai.*, p.name, p.sku, p.unit_code, p.track_lots, p.track_serial, l.lot_code, l.expiry_date,
             coalesce(sl.qty_on_hand, 0) as actual,
             coalesce(ai.system_qty, coalesce(sl.qty_on_hand, 0)) as sistema,
             coalesce(ai.difference,
                      case coalesce(v_aj.mode, 'conteo')
                        when 'entrada' then ai.quantity
                        when 'salida' then -ai.quantity
                        else ai.quantity - coalesce(sl.qty_on_hand, 0) end) as dif,
             coalesce(ai.applied_cost, ai.unit_cost, nullif(sl.avg_cost, 0)) as costo
        from public.adjustment_items ai
        join public.products p on p.id = ai.product_id
        left join public.lots l on l.id = ai.lot_id
        left join lateral (
          select s.qty_on_hand, s.avg_cost from public.stock_levels s
           where s.product_id = ai.product_id and s.branch_id = v_aj.branch_id
             and s.lot_id is not distinct from ai.lot_id
           order by s.id limit 1
        ) sl on true
       where ai.inventory_adjustment_id = v_aj.id
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sm.id,
           'fecha', sm.created_at,
           'producto', jsonb_build_object('id', sm.product_id, 'nombre', p.name, 'sku', p.sku, 'unidad', btrim(p.unit_code)),
           'lote', l.lot_code,
           'direccion', sm.direction,
           'cantidad', sm.qty,
           'costo', case when v_costos then sm.unit_cost end,
           'costo_promedio_despues', case when v_costos then sm.avg_cost_after end,
           'saldo_despues', (select ai.system_qty + ai.difference from public.adjustment_items ai
                              where ai.inventory_adjustment_id = v_aj.id and ai.product_id = sm.product_id
                                and ai.lot_id is not distinct from sm.lot_id
                                and ai.system_qty is not null and ai.difference is not null
                              limit 1)
         ) order by sm.created_at, sm.id), '[]'::jsonb)
    into v_movs
    from public.stock_movements sm
    join public.products p on p.id = sm.product_id
    left join public.lots l on l.id = sm.lot_id
   where sm.organization_id = p_org and sm.source = 'adjustment' and sm.source_id = v_aj.id::text;

  select jsonb_build_object('id', je.id, 'fecha', je.entry_date)
    into v_asiento
    from public.journal_entries je
   where je.organization_id = p_org and je.source = 'inventory_adjustment' and je.source_id = v_aj.id::text
   order by je.id limit 1;

  return jsonb_build_object(
    'ajuste', jsonb_build_object(
      'id', v_aj.id,
      'codigo', v_aj.code,
      'estado', v_aj.status,
      'modo', coalesce(v_aj.mode, 'conteo'),
      'tipo', case v_aj.type when 'loss' then 'salida' else 'entrada' end,
      'razon', v_aj.reason,
      'notas', v_aj.notes,
      'sucursal', jsonb_build_object('id', v_aj.branch_id, 'nombre', v_aj.sucursal),
      'fecha', coalesce(v_aj.counted_at, v_aj.created_at),
      'creado', v_aj.created_at,
      'creado_por', public.fn_ajuste_int_nombre(v_aj.created_by),
      'aplicado', v_aj.posted_at,
      'aplicado_por', public.fn_ajuste_int_nombre(v_aj.posted_by),
      'descartado', v_aj.cancelled_at,
      'descartado_por', public.fn_ajuste_int_nombre(v_aj.cancelled_by),
      'motivo_descarte', v_aj.cancel_reason),
    'renglones', v_items,
    'movimientos', v_movs,
    'asiento', v_asiento,
    'permisos', v_perm);
end;
$$;

-- ── Productos para contar (con su existencia por lote en la sucursal) ──────
create or replace function public.fn_ajuste_productos(
  p_org integer,
  p_branch integer,
  p_texto text default null,
  p_ids integer[] default null,
  p_limite integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_costos boolean;
  v_texto text := nullif(btrim(left(coalesce(p_texto, ''), 100)), '');
  v_patron text;
  v_lim integer := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_out jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar', 'ver']);
  v_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);
  if p_branch is null or not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if p_ids is not null and cardinality(p_ids) > 500 then
    raise exception 'demasiadas_referencias' using errcode = '22023', detail = 'máximo 500';
  end if;
  if v_texto is not null then
    v_patron := '%' || replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'nombre', q.name,
           'sku', q.sku,
           'codigo_barras', q.barcode,
           'unidad', btrim(q.unit_code),
           'controla_lotes', coalesce(q.track_lots, false),
           'controla_serial', coalesce(q.track_serial, false),
           'existencias', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'lot_id', sl.lot_id,
                      'lote', l.lot_code,
                      'vence', l.expiry_date,
                      'cantidad', coalesce(sl.qty_on_hand, 0),
                      'costo_promedio', case when v_costos then sl.avg_cost end
                    ) order by sl.lot_id nulls first, l.expiry_date nulls last), '[]'::jsonb)
               from public.stock_levels sl
               left join public.lots l on l.id = sl.lot_id
              where sl.product_id = q.id and sl.branch_id = p_branch),
           'lotes', case when coalesce(q.track_lots, false) then (
             select coalesce(jsonb_agg(jsonb_build_object('lot_id', l.id, 'lote', l.lot_code, 'vence', l.expiry_date)
                                       order by l.expiry_date nulls last, l.id), '[]'::jsonb)
               from public.lots l
              where l.product_id = q.id and l.organization_id = p_org
                and (l.branch_id is null or l.branch_id = p_branch)) else '[]'::jsonb end,
           'costo_vigente', case when v_costos then public.fn_costo_unitario_producto(q.id, p_branch, null) end,
           'seriales_en_stock', case when coalesce(q.track_serial, false) then (
             select coalesce(jsonb_agg(s.serial order by s.serial), '[]'::jsonb)
               from (select sn.serial from public.serial_numbers sn
                      where sn.organization_id = p_org and sn.product_id = q.id and sn.status = 'in_stock'
                        and coalesce(sn.current_branch_id, sn.branch_id) = p_branch
                      order by sn.serial limit 300) s) else '[]'::jsonb end
         ) order by q.ord), '[]'::jsonb)
    into v_out
    from (
      select p.*, row_number() over (
               order by (lower(p.sku) = lower(coalesce(v_texto, '')) or lower(coalesce(p.barcode, '')) = lower(coalesce(v_texto, ''))) desc,
                        p.name, p.id) as ord
        from public.products p
       where p.organization_id = p_org
         and p.track_stock
         and coalesce(p.is_parent, false) = false
         and (
           (p_ids is not null and p.id = any(p_ids))
           or (p_ids is null and p.status = 'active' and coalesce(p.product_type, 'product') <> 'service'
               and (v_patron is null or p.name ilike v_patron or p.sku ilike v_patron or p.barcode ilike v_patron))
         )
       order by ord
       limit case when p_ids is not null then 500 else v_lim end
    ) q;

  return v_out;
end;
$$;

-- ── fn_inv_documentos: número = code del ajuste ─────────────────────────────
do $$
declare
  v_firma constant text := 'fn_inv_documentos(integer,jsonb)';
  v_def text := pg_get_functiondef('public.fn_inv_documentos(integer,jsonb)'::regprocedure);
  v_m1 constant text := 'select a.id into v_x from public.inventory_adjustments a where a.id = v_int and a.organization_id = p_org;';
  v_n1 constant text := 'select a.id, a.code into v_x from public.inventory_adjustments a where a.id = v_int and a.organization_id = p_org;';
  v_m2 constant text := E'v_num := ''AJ-'' || v_x.id;';
  v_n2 constant text := E'v_num := coalesce(v_x.code, ''AJ-'' || v_x.id);';
begin
  if position(v_n1 in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if (length(v_def) - length(replace(v_def, v_m1, ''))) / length(v_m1) <> 1
     or (length(v_def) - length(replace(v_def, v_m2, ''))) / length(v_m2) <> 1 then
    raise exception 'Los marcadores del ajuste no aparecen exactamente una vez en %', v_firma;
  end if;
  insert into private.respaldo_funciones (migracion, firma, definicion, md5)
  values ('20260929130200_inv_b2_3', v_firma, v_def, md5(v_def))
  on conflict (migracion, firma) do nothing;
  execute replace(replace(v_def, v_m1, v_n1), v_m2, v_n2);
end $$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────
revoke all on function public.fn_ajustes_listado(integer, jsonb) from public, anon;
revoke all on function public.fn_ajuste_detalle(integer, integer) from public, anon;
revoke all on function public.fn_ajuste_productos(integer, integer, text, integer[], integer) from public, anon;
grant execute on function public.fn_ajustes_listado(integer, jsonb) to authenticated, service_role;
grant execute on function public.fn_ajuste_detalle(integer, integer) to authenticated, service_role;
grant execute on function public.fn_ajuste_productos(integer, integer, text, integer[], integer) to authenticated, service_role;

comment on function public.fn_ajustes_listado(integer, jsonb) is
  'B2: listado de ajustes paginado en el servidor con KPI del mes (zona de la organización). Permiso ver; importes solo con costos.';
comment on function public.fn_ajuste_detalle(integer, integer) is
  'B2: un ajuste con renglones (sistema al contar, diferencia, impacto), movimientos del kardex y asiento. Permiso ver.';
comment on function public.fn_ajuste_productos(integer, integer, text, integer[], integer) is
  'B2: productos con control de stock y su existencia por lote en la sucursal, para contar. Permiso ajustar o ver.';
