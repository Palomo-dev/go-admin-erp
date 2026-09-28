-- Acción masiva de stock por el kardex (decisión del dueño, 2026-09-24).
--
-- Antes: `bulkUpdateStock` (src/components/inventario/productos/bulk/bulkService.ts)
-- escribía stock_levels desde el navegador (update/insert por lotes) sin
-- stock_movements ni asiento: el inventario cambiaba sin rastro en el kardex ni
-- en la contabilidad.
--
-- Ahora: UNA RPC transaccional por lote. Para cada producto rastreable (con la
-- expansión padre↔variantes de siempre) calcula la cantidad objetivo (modo
-- «set» = establecer, «add» = sumar/restar; mínimo 0) y reutiliza
-- fn_producto_int_ajustar_stock, la misma primitiva del detalle de producto y
-- de las variantes: bloquea la fila sin lote (SELECT … FOR UPDATE, nunca upsert:
-- el UNIQUE de stock_levels incluye lot_id NULL y no deduplica), la crea si
-- falta, aplica la diferencia e inserta el stock_movement de ajuste
-- (source 'adjustment', in/out). El costo unitario es el vigente
-- (fn_costo_unitario_producto: avg_cost de la sucursal, si no el costo vigente
-- del producto). El asiento lo crea el trigger existente
-- trg_auto_journal_stock_movement con la regla inventory/adjusted.
--
-- Seguridad: SECURITY DEFINER, fn_productos_exigir_permiso (fn_assert_acceso_org
-- + inventory.adjust / inventory_management resuelto en el servidor), sin anon.
-- La interna *_int_* no la ejecuta nadie salvo el dueño.

-- ── 1. Interna: expansión padre↔variantes ───────────────────────────────────
-- Seleccionados + padres de los seleccionados que son variantes + variantes de
-- los padres (seleccionados o alcanzados). Excluye los eliminados.
create or replace function public.fn_productos_int_expandir_variantes(p_org integer, p_ids integer[])
returns integer[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sel as (
    select p.id, p.is_parent, p.parent_product_id
      from public.products p
     where p.id = any(coalesce(p_ids, '{}'::integer[]))
       and p.organization_id = p_org
       and coalesce(p.status, 'active') <> 'deleted'
  ), padres as (
    select s.id from sel s where s.is_parent
    union
    select s.parent_product_id from sel s where s.parent_product_id is not null
  ), expandidos as (
    select s.id from sel s
    union
    select p.id from public.products p
     where p.id in (select id from padres)
       and p.organization_id = p_org
       and coalesce(p.status, 'active') <> 'deleted'
    union
    select c.id from public.products c
     where c.parent_product_id in (select id from padres)
       and c.organization_id = p_org
       and coalesce(c.status, 'active') <> 'deleted'
  )
  select coalesce(array_agg(e.id order by e.id), '{}'::integer[]) from expandidos e;
$$;

-- ── 2. Alcance: productos rastreables que tocará el ajuste ──────────────────
-- La interfaz la usa para partir los lotes sin repetir un producto (un padre en
-- un lote y su variante en otro sumarían dos veces).
create or replace function public.fn_productos_stock_masivo_alcance(
  p_organization_id integer, p_product_ids integer[])
returns integer[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.adjust', 'inventory_management']);
  if coalesce(cardinality(p_product_ids), 0) > 50000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '50000';
  end if;
  return (
    select coalesce(array_agg(p.id order by p.id), '{}'::integer[])
      from public.products p
     where p.id = any(public.fn_productos_int_expandir_variantes(p_organization_id, p_product_ids))
       and p.organization_id = p_organization_id
       and p.track_stock);
end;
$$;

-- ── 3. Ajuste masivo ────────────────────────────────────────────────────────
-- p_modo: 'set' (dejar en p_cantidad) · 'add' (sumar p_cantidad, negativa resta).
-- El resultado nunca baja de 0. p_expandir = false cuando los ids ya vienen de
-- fn_productos_stock_masivo_alcance (lotes de la interfaz).
create or replace function public.fn_productos_ajuste_masivo_stock(
  p_organization_id integer,
  p_product_ids integer[],
  p_branch_id integer,
  p_modo text,
  p_cantidad numeric,
  p_motivo text default null,
  p_expandir boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ids integer[];
  v_prod record;
  v_actual numeric;
  v_objetivo numeric;
  v_costo numeric;
  v_delta numeric;
  v_quien text;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_nota text;
  v_ajustados integer := 0;
  v_sin_cambio integer := 0;
  v_sin_rastreo integer := 0;
  v_entradas integer := 0;
  v_salidas integer := 0;
  v_sin_costo integer := 0;
  v_unidades_entrada numeric := 0;
  v_unidades_salida numeric := 0;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.adjust', 'inventory_management']);

  if p_modo is null or p_modo not in ('set', 'add') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if p_cantidad is null then
    raise exception 'cantidad_requerida' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_product_ids), 0) = 0 then
    raise exception 'sin_productos' using errcode = '22023';
  end if;
  -- Un lote por llamada: el asiento de cada movimiento corre en la misma
  -- transacción y el rol authenticated tiene statement_timeout de 8 s.
  if cardinality(p_product_ids) > 500 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '500';
  end if;
  if not exists (select 1 from public.branches b
                  where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;

  v_ids := case when coalesce(p_expandir, true)
                then public.fn_productos_int_expandir_variantes(p_organization_id, p_product_ids)
                else p_product_ids end;

  select coalesce(nullif(btrim(coalesce(pf.first_name, '') || ' ' || coalesce(pf.last_name, '')), ''), pf.email)
    into v_quien
    from public.profiles pf
   where pf.id = v_uid;
  v_nota := 'Ajuste masivo · ' || coalesce(v_quien, case when v_uid is null then 'sistema' else v_uid::text end)
            || coalesce(' · ' || v_motivo, '');

  -- Orden por id: dos ajustes masivos simultáneos bloquean en el mismo orden.
  for v_prod in
    select p.id, p.track_stock
      from public.products p
     where p.id = any(v_ids)
       and p.organization_id = p_organization_id
       and coalesce(p.status, 'active') <> 'deleted'
     order by p.id
  loop
    if not v_prod.track_stock then
      v_sin_rastreo := v_sin_rastreo + 1;
      continue;
    end if;

    v_actual := null;
    select sl.qty_on_hand into v_actual
      from public.stock_levels sl
     where sl.product_id = v_prod.id and sl.branch_id = p_branch_id and sl.lot_id is null
     order by sl.id
     limit 1
       for update;
    v_actual := coalesce(v_actual, 0);
    v_objetivo := greatest(0, case when p_modo = 'set' then p_cantidad else v_actual + p_cantidad end);

    if v_objetivo = v_actual then
      v_sin_cambio := v_sin_cambio + 1;
      continue;
    end if;

    v_costo := coalesce(public.fn_costo_unitario_producto(v_prod.id, p_branch_id, 0), 0);
    v_delta := public.fn_producto_int_ajustar_stock(
      p_organization_id, v_prod.id, p_branch_id, v_objetivo, v_costo, v_nota);

    v_ajustados := v_ajustados + 1;
    if v_delta > 0 then
      v_entradas := v_entradas + 1;
      v_unidades_entrada := v_unidades_entrada + v_delta;
    else
      v_salidas := v_salidas + 1;
      v_unidades_salida := v_unidades_salida - v_delta;
    end if;
    -- Sin costo no hay importe: el trigger no genera asiento para ese movimiento.
    if v_costo <= 0 then
      v_sin_costo := v_sin_costo + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'productos', cardinality(v_ids),
    'ajustados', v_ajustados,
    'sin_cambio', v_sin_cambio,
    'sin_rastreo', v_sin_rastreo,
    'entradas', v_entradas,
    'salidas', v_salidas,
    'unidades_entrada', v_unidades_entrada,
    'unidades_salida', v_unidades_salida,
    'sin_costo', v_sin_costo);
end;
$$;

-- ── 4. Permisos de ejecución ────────────────────────────────────────────────
revoke all on function public.fn_productos_int_expandir_variantes(integer, integer[]) from public, anon, authenticated;
revoke all on function public.fn_productos_stock_masivo_alcance(integer, integer[]) from public, anon;
revoke all on function public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean) from public, anon;

grant execute on function public.fn_productos_stock_masivo_alcance(integer, integer[]) to authenticated, service_role;
grant execute on function public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean) to authenticated, service_role;

comment on function public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean) is
  'Ajuste masivo de stock por el kardex: un stock_movement de ajuste por producto (costo vigente) y su asiento por trigger. Modo set/add, mínimo 0.';
