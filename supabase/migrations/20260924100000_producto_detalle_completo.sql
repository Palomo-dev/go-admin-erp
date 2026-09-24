-- Detalle de producto completo (inventario): resumen con KPIs y conteos,
-- kardex con saldo y documento de origen, lotes, seriales (alta masiva,
-- cambio de estado con trazabilidad), variantes sin DELETE físico, precios y
-- costos con vigencia, orden de imágenes, historial unificado y notas fijadas.
--
-- Hallazgos que corrige (verificados por MCP el 2026-09-24):
--  * serial_numbers.status solo admitía in_stock/sold/warranty/repair/defective,
--    pero la app escribe reserved, returned, in_transit, damaged, rma y
--    warranty_claim: esas actualizaciones fallaban. El CHECK se amplía (unión de
--    los dos vocabularios; ninguna fila deja de cumplirlo).
--  * product_prices y product_costs no tienen política UPDATE: el navegador no
--    podía cerrar la vigencia anterior y los precios «vigentes» se acumulaban.
--    Aquí se cierran en el servidor (fn_producto_fijar_precio / _costo).
--  * product_notes tenía RLS «authenticated y organization_id no nulo»: cualquier
--    sesión leía las notas de cualquier organización. Pasa a pertenencia.
--  * variant_types / variant_values: igual («organization_id IS NOT NULL»).
--  * El bucket product-documents (adjuntos de notas) no existía.
--
-- Todas las funciones públicas son SECURITY DEFINER con fn_assert_acceso_org,
-- permiso resuelto en el servidor (fn_productos_exigir_permiso) y sin anon.
-- Las funciones *_int_* son internas: sin EXECUTE para nadie salvo el dueño.

-- ── 0. Índices para las consultas por producto ──────────────────────────────
create index if not exists idx_sale_items_product_id on public.sale_items (product_id);
create index if not exists idx_invoice_items_product_id on public.invoice_items (product_id);
create index if not exists idx_stock_movements_product_created on public.stock_movements (product_id, created_at);
create index if not exists idx_product_notes_product on public.product_notes (product_id);
create index if not exists idx_lots_product on public.lots (product_id);
create index if not exists idx_products_parent on public.products (parent_product_id) where parent_product_id is not null;

-- ── 1. Estados de serial ────────────────────────────────────────────────────
-- Se sustituye el CHECK por uno más amplio (ninguna fila existente lo viola).
alter table public.serial_numbers drop constraint if exists serial_numbers_status_check;
alter table public.serial_numbers add constraint serial_numbers_status_check
  check (status = any (array[
    'in_stock', 'reserved', 'sold', 'returned', 'in_transit', 'damaged', 'rma',
    'warranty_claim', 'warranty', 'repair', 'defective'
  ]));

-- ── 2. Notas: fijar y editar ────────────────────────────────────────────────
alter table public.product_notes add column if not exists is_pinned boolean not null default false;
alter table public.product_notes add column if not exists pinned_at timestamptz;
alter table public.product_notes add column if not exists edited_at timestamptz;

-- ── 3. RLS por pertenencia ──────────────────────────────────────────────────
drop policy if exists product_notes_org_isolation on public.product_notes;
drop policy if exists product_notes_miembros on public.product_notes;
create policy product_notes_miembros on public.product_notes
  for all to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists "Allow operations on variant_types by organization" on public.variant_types;
drop policy if exists variant_types_miembros on public.variant_types;
create policy variant_types_miembros on public.variant_types
  for all to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists "Allow operations on variant_values by organization" on public.variant_values;
drop policy if exists variant_values_miembros on public.variant_values;
create policy variant_values_miembros on public.variant_values
  for all to authenticated
  using (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true));

-- ── 4. Bucket de adjuntos de notas (privado; carpeta raíz = organización) ────
insert into storage.buckets (id, name, public)
values ('product-documents', 'product-documents', false)
on conflict (id) do nothing;

drop policy if exists product_documents_miembros_select on storage.objects;
drop policy if exists product_documents_miembros_insert on storage.objects;
drop policy if exists product_documents_miembros_delete on storage.objects;
create policy product_documents_miembros_select on storage.objects
  for select to authenticated
  using (bucket_id = 'product-documents' and (storage.foldername(name))[1] in (
    select om.organization_id::text from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));
create policy product_documents_miembros_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-documents' and (storage.foldername(name))[1] in (
    select om.organization_id::text from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));
create policy product_documents_miembros_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-documents' and (storage.foldername(name))[1] in (
    select om.organization_id::text from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

-- ── 5. Permiso resuelto en el servidor ──────────────────────────────────────
create or replace function public.fn_productos_exigir_permiso(p_org integer, p_codigos text[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return; -- service role (fn_assert_acceso_org ya rechazó anon/authenticated sin sesión)
  end if;
  if exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) then
    return;
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.check_user_permission(v_uid, p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = 'No tienes permiso para esta acción sobre productos';
end;
$$;

-- Permisos del usuario actual sobre productos (para mostrar u ocultar acciones).
create or replace function public.fn_productos_permisos(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return jsonb_build_object('crear', true, 'editar', true, 'eliminar', true, 'ajustar', true);
  end if;
  select exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) into v_owner;
  return jsonb_build_object(
    'crear', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.create')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'editar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.edit')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'eliminar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.delete')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'ajustar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.adjust')
      or public.check_user_permission(v_uid, p_org, 'inventory_management')
  );
end;
$$;

-- ── 6. Internas: precio y costo con vigencia ────────────────────────────────
-- Cierra la vigencia que cubre p_desde, cancela lo programado después
-- (effective_to = effective_from: intervalo vacío, queda en el historial) e
-- inserta la nueva fila. Con p_precio NULL solo cierra (variante sin precio).
-- Devuelve true si cambió algo.
create or replace function public.fn_producto_int_fijar_precio(
  p_product_id integer, p_precio numeric, p_comparacion numeric, p_desde timestamptz default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde timestamptz := coalesce(p_desde, now());
  v_act record;
  v_hay_futuros boolean;
begin
  if p_precio is not null and p_precio < 0 then
    raise exception 'precio_negativo' using errcode = '22023';
  end if;
  select price, compare_price into v_act
    from public.product_prices
   where product_id = p_product_id and effective_from <= v_desde
     and (effective_to is null or effective_to > v_desde)
   order by effective_from desc, id desc limit 1;
  select exists (select 1 from public.product_prices
                  where product_id = p_product_id and effective_from > v_desde
                    and (effective_to is null or effective_to > effective_from)) into v_hay_futuros;
  if not v_hay_futuros then
    if v_act is null and p_precio is null then
      return false;
    end if;
    if v_act is not null and p_precio is not null and v_act.price = p_precio
       and coalesce(v_act.compare_price, 0) = coalesce(p_comparacion, 0) then
      return false;
    end if;
  end if;
  update public.product_prices set effective_to = effective_from
   where product_id = p_product_id and effective_from > v_desde
     and (effective_to is null or effective_to > effective_from);
  update public.product_prices set effective_to = v_desde
   where product_id = p_product_id and effective_from <= v_desde
     and (effective_to is null or effective_to > v_desde);
  if p_precio is not null then
    insert into public.product_prices (product_id, price, compare_price, effective_from)
    values (p_product_id, p_precio, nullif(p_comparacion, 0), v_desde);
  end if;
  return true;
end;
$$;

create or replace function public.fn_producto_int_fijar_costo(
  p_product_id integer, p_costo numeric, p_desde timestamptz default null, p_supplier_id integer default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde timestamptz := coalesce(p_desde, now());
  v_act record;
  v_hay_futuros boolean;
begin
  if p_costo is not null and p_costo < 0 then
    raise exception 'costo_negativo' using errcode = '22023';
  end if;
  select cost, supplier_id into v_act
    from public.product_costs
   where product_id = p_product_id and effective_from <= v_desde
     and (effective_to is null or effective_to > v_desde)
   order by effective_from desc, id desc limit 1;
  select exists (select 1 from public.product_costs
                  where product_id = p_product_id and effective_from > v_desde
                    and (effective_to is null or effective_to > effective_from)) into v_hay_futuros;
  if not v_hay_futuros then
    if v_act is null and p_costo is null then
      return false;
    end if;
    if v_act is not null and p_costo is not null and v_act.cost = p_costo
       and v_act.supplier_id is not distinct from coalesce(p_supplier_id, v_act.supplier_id) then
      return false;
    end if;
  end if;
  update public.product_costs set effective_to = effective_from
   where product_id = p_product_id and effective_from > v_desde
     and (effective_to is null or effective_to > effective_from);
  update public.product_costs set effective_to = v_desde
   where product_id = p_product_id and effective_from <= v_desde
     and (effective_to is null or effective_to > v_desde);
  if p_costo is not null then
    insert into public.product_costs (product_id, cost, effective_from, supplier_id)
    values (p_product_id, p_costo, v_desde, p_supplier_id);
  end if;
  return true;
end;
$$;

-- ── 7. Internas: stock (siempre por kardex) ─────────────────────────────────
-- Fila en 0 (lot_id NULL) por cada sucursal activa, mínimo por sucursal y
-- entradas iniciales por fn_register_stock_entry (stock_levels + stock_movements).
-- p_entradas: [{branch_id, qty, min_level, unit_cost}]
create or replace function public.fn_producto_int_stock_inicial(
  p_org integer, p_product_id integer, p_entradas jsonb, p_nota text default 'Stock inicial')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_e jsonb;
  v_branch integer;
  v_entries jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.products where id = p_product_id and organization_id = p_org and track_stock) then
    return;
  end if;
  -- Filas en 0 para las sucursales activas (y las que traiga la entrada) sin fila propia.
  insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
  select p_product_id, b.id, null, 0, 0, 0, 0
    from public.branches b
   where b.organization_id = p_org
     and (b.is_active or b.id in (select (x->>'branch_id')::int from jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) x))
     and not exists (select 1 from public.stock_levels sl
                      where sl.product_id = p_product_id and sl.branch_id = b.id and sl.lot_id is null);

  for v_e in select * from jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) loop
    v_branch := (v_e->>'branch_id')::int;
    if not exists (select 1 from public.branches where id = v_branch and organization_id = p_org) then
      raise exception 'sucursal_invalida' using errcode = '22023';
    end if;
    if v_e ? 'min_level' then
      update public.stock_levels set min_level = greatest(coalesce((v_e->>'min_level')::numeric, 0), 0), updated_at = now()
       where product_id = p_product_id and branch_id = v_branch and lot_id is null;
    end if;
    if coalesce((v_e->>'qty')::numeric, 0) > 0 then
      if coalesce((v_e->>'unit_cost')::numeric, 0) <= 0 then
        raise exception 'stock_sin_costo' using errcode = '22023', detail = v_branch::text;
      end if;
      v_entries := v_entries || jsonb_build_object(
        'organization_id', p_org, 'branch_id', v_branch, 'product_id', p_product_id,
        'qty', (v_e->>'qty')::numeric, 'unit_cost', coalesce((v_e->>'unit_cost')::numeric, 0),
        'source', 'initial', 'source_id', null, 'note', coalesce(p_nota, 'Stock inicial'),
        'updated_by', auth.uid());
    elsif coalesce((v_e->>'qty')::numeric, 0) < 0 then
      raise exception 'cantidad_negativa' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(v_entries) > 0 then
    -- Exige costo > 0 con cantidad (regla del kardex y la contabilidad).
    perform public.fn_register_stock_entry(v_entries, null);
  end if;
end;
$$;

-- Lleva el stock (fila sin lote) de una sucursal a p_qty con un movimiento de
-- ajuste por la diferencia. Nunca sobrescribe sin kardex.
create or replace function public.fn_producto_int_ajustar_stock(
  p_org integer, p_product_id integer, p_branch_id integer, p_qty numeric,
  p_unit_cost numeric, p_nota text)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sl record;
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
  select id, qty_on_hand into v_sl from public.stock_levels
   where product_id = p_product_id and branch_id = p_branch_id and lot_id is null
   order by id limit 1 for update;
  if v_sl.id is null then
    insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
    values (p_product_id, p_branch_id, null, 0, 0, coalesce(p_unit_cost, 0), 0)
    returning id, qty_on_hand into v_sl;
  end if;
  v_delta := p_qty - coalesce(v_sl.qty_on_hand, 0);
  if v_delta = 0 then
    return 0;
  end if;
  update public.stock_levels set qty_on_hand = qty_on_hand + v_delta, updated_at = now() where id = v_sl.id;
  insert into public.stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by)
  values (p_org, p_branch_id, p_product_id, null, case when v_delta > 0 then 'in' else 'out' end,
          abs(v_delta), coalesce(p_unit_cost, 0), 'adjustment', null, p_nota, auth.uid());
  return v_delta;
end;
$$;

-- ── 8. Internas: catálogo de atributos y variante ───────────────────────────
create or replace function public.fn_producto_int_asegurar_atributos(p_org integer, p_atributos jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_k text;
  v_v text;
  v_tipo integer;
begin
  if p_atributos is null or jsonb_typeof(p_atributos) <> 'object' then
    return;
  end if;
  for v_k, v_v in select key, value #>> '{}' from jsonb_each(p_atributos) loop
    continue when btrim(coalesce(v_k, '')) = '' or btrim(coalesce(v_v, '')) = '';
    select id into v_tipo from public.variant_types
     where organization_id = p_org and lower(btrim(name)) = lower(btrim(v_k)) order by id limit 1;
    if v_tipo is null then
      insert into public.variant_types (organization_id, name) values (p_org, btrim(v_k)) returning id into v_tipo;
    end if;
    if not exists (select 1 from public.variant_values where variant_type_id = v_tipo and lower(btrim(value)) = lower(btrim(v_v))) then
      insert into public.variant_values (variant_type_id, value, display_order)
      values (v_tipo, btrim(v_v), coalesce((select max(display_order) + 1 from public.variant_values where variant_type_id = v_tipo), 0));
    end if;
  end loop;
end;
$$;

-- p_v: {id?, sku, barcode?, name, attributes, price?, compare_price?, cost?, status?,
--       stock?: [{branch_id, qty, min_level?}]}
-- Nueva: fila hija + precio + costo + impuestos del padre + stock inicial por kardex.
-- Existente: datos, precio y costo con vigencia; stock por ajuste (solo si
-- p_ajustar_stock) con movimiento por la diferencia.
create or replace function public.fn_producto_int_variante_guardar(
  p_org integer, p_parent_id integer, p_v jsonb, p_ajustar_stock boolean)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent public.products%rowtype;
  v_id integer := nullif(p_v->>'id', '')::integer;
  v_sku text := nullif(btrim(coalesce(p_v->>'sku', '')), '');
  v_name text := nullif(btrim(coalesce(p_v->>'name', '')), '');
  v_status text := coalesce(nullif(p_v->>'status', ''), 'active');
  v_costo numeric := nullif(p_v->>'cost', '')::numeric;
  v_precio numeric := nullif(p_v->>'price', '')::numeric;
  v_s jsonb;
begin
  select * into v_parent from public.products where id = p_parent_id and organization_id = p_org;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if v_sku is null then
    raise exception 'sku_requerido' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'nombre_requerido' using errcode = '22023';
  end if;
  if v_status not in ('active', 'inactive', 'discontinued', 'deleted') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.products where organization_id = p_org and sku = v_sku and id is distinct from v_id) then
    raise exception 'sku_duplicado' using errcode = '23505', detail = v_sku;
  end if;

  if v_id is not null then
    if not exists (select 1 from public.products where id = v_id and parent_product_id = p_parent_id and organization_id = p_org) then
      raise exception 'variante_no_encontrada' using errcode = 'P0002';
    end if;
    update public.products set
      sku = v_sku, name = v_name,
      barcode = nullif(btrim(coalesce(p_v->>'barcode', '')), ''),
      variant_data = coalesce(p_v->'attributes', variant_data),
      status = v_status,
      track_stock = v_parent.track_stock,
      updated_at = now()
     where id = v_id;
  else
    insert into public.products (
      organization_id, sku, name, barcode, parent_product_id, is_parent, variant_data, status,
      track_stock, category_id, unit_code, product_type, station, brand, reference,
      track_serial, serial_pattern, auto_generate_serial, warranty_months)
    values (
      p_org, v_sku, v_name, nullif(btrim(coalesce(p_v->>'barcode', '')), ''), p_parent_id, false,
      coalesce(p_v->'attributes', '{}'::jsonb), v_status, v_parent.track_stock, v_parent.category_id,
      v_parent.unit_code, v_parent.product_type, v_parent.station, v_parent.brand, v_parent.reference,
      v_parent.track_serial, v_parent.serial_pattern, v_parent.auto_generate_serial, v_parent.warranty_months)
    returning id into v_id;
    insert into public.product_tax_relations (product_id, tax_id)
    select v_id, tr.tax_id from public.product_tax_relations tr where tr.product_id = p_parent_id
    on conflict do nothing;
  end if;

  perform public.fn_producto_int_asegurar_atributos(p_org, p_v->'attributes');

  if p_v ? 'price' then
    perform public.fn_producto_int_fijar_precio(v_id, case when coalesce(v_precio, 0) > 0 then v_precio end,
      nullif(p_v->>'compare_price', '')::numeric, null);
  end if;
  if p_v ? 'cost' then
    perform public.fn_producto_int_fijar_costo(v_id, case when coalesce(v_costo, 0) > 0 then v_costo end, null, null);
  end if;

  if v_parent.track_stock and p_v ? 'stock' then
    if nullif(p_v->>'id', '') is null then
      perform public.fn_producto_int_stock_inicial(p_org, v_id,
        (select coalesce(jsonb_agg(s || jsonb_build_object('unit_cost', coalesce(v_costo, 0))), '[]'::jsonb)
           from jsonb_array_elements(p_v->'stock') s),
        'Stock inicial variante ' || v_sku);
    else
      for v_s in select * from jsonb_array_elements(p_v->'stock') loop
        if p_ajustar_stock and v_s ? 'qty' then
          perform public.fn_producto_int_ajustar_stock(p_org, v_id, (v_s->>'branch_id')::int,
            (v_s->>'qty')::numeric, coalesce(nullif(v_costo, 0), public.fn_costo_unitario_producto(v_id, (v_s->>'branch_id')::int, 0)),
            'Ajuste variante ' || v_sku);
        end if;
        if v_s ? 'min_level' then
          update public.stock_levels set min_level = greatest(coalesce((v_s->>'min_level')::numeric, 0), 0), updated_at = now()
           where product_id = v_id and branch_id = (v_s->>'branch_id')::int and lot_id is null;
        end if;
      end loop;
    end if;
  elsif v_parent.track_stock and nullif(p_v->>'id', '') is null then
    perform public.fn_producto_int_stock_inicial(p_org, v_id, '[]'::jsonb, null);
  end if;

  return v_id;
end;
$$;


-- ── 9. Resumen del detalle (una llamada: KPIs, stock por sucursal, conteos) ──
-- Stock del padre = el suyo + el de sus variantes no eliminadas.
create or replace function public.fn_producto_resumen(p_organization_id integer, p_product_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not exists (select 1 from public.products where id = p_product_id and organization_id = p_organization_id) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  v_ids := array[p_product_id] || coalesce((
    select array_agg(id) from public.products
     where parent_product_id = p_product_id and organization_id = p_organization_id and status <> 'deleted'), '{}');

  with suc as (
    select b.id, b.name::text as name, coalesce(b.is_main, false) as is_main, coalesce(b.is_active, true) as is_active,
           coalesce(sum(sl.qty_on_hand), 0) as qty,
           coalesce(sum(sl.qty_reserved), 0) as res,
           coalesce(sum(sl.min_level) filter (where sl.lot_id is null), 0) as minimo,
           case when coalesce(sum(sl.qty_on_hand), 0) > 0
                then round(sum(sl.qty_on_hand * coalesce(sl.avg_cost, 0)) / sum(sl.qty_on_hand), 4)
                else coalesce(max(sl.avg_cost), 0) end as avg_cost,
           max(sl.updated_at) as actualizado,
           count(sl.id) as filas,
           count(sl.id) filter (where sl.lot_id is not null) as lotes
      from public.branches b
      left join public.stock_levels sl on sl.branch_id = b.id and sl.product_id = any(v_ids)
     where b.organization_id = p_organization_id
     group by b.id, b.name, b.is_main, b.is_active
    having coalesce(b.is_active, true) or count(sl.id) > 0
  ),
  pr as (
    select price, compare_price, effective_from from public.product_prices
     where product_id = p_product_id and effective_from <= now() and (effective_to is null or effective_to > now())
     order by effective_from desc, id desc limit 1
  ),
  co as (
    select cost, effective_from from public.product_costs
     where product_id = p_product_id and effective_from <= now() and (effective_to is null or effective_to > now())
     order by effective_from desc, id desc limit 1
  )
  select jsonb_build_object(
    'precio', (select price from pr),
    'precio_comparacion', (select compare_price from pr),
    'precio_desde', (select effective_from from pr),
    'costo', (select cost from co),
    'costo_desde', (select effective_from from co),
    'stock_total', coalesce((select sum(qty) from suc), 0),
    'reservado', coalesce((select sum(res) from suc), 0),
    'minimo_total', coalesce((select sum(minimo) from suc), 0),
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object(
        'branch_id', id, 'nombre', name, 'principal', is_main, 'activa', is_active,
        'qty_on_hand', qty, 'qty_reserved', res, 'disponible', qty - res, 'min_level', minimo,
        'avg_cost', avg_cost, 'actualizado', actualizado, 'con_registro', filas > 0,
        'filas_lote', lotes) order by is_main desc, name) from suc), '[]'::jsonb),
    'conteos', jsonb_build_object(
      'variantes', (select count(*) from public.products where parent_product_id = p_product_id and organization_id = p_organization_id and status <> 'deleted'),
      'variantes_activas', (select count(*) from public.products where parent_product_id = p_product_id and organization_id = p_organization_id and status = 'active'),
      'modificadores', (select count(*) from public.product_modifier_groups where product_id = p_product_id and organization_id = p_organization_id),
      'imagenes', (select count(*) from public.product_images where product_id = p_product_id),
      'proveedores', (select count(*) from public.product_suppliers where product_id = p_product_id),
      'etiquetas', (select count(*) from public.product_tag_relations where product_id = p_product_id),
      'notas', (select count(*) from public.product_notes where product_id = p_product_id and organization_id = p_organization_id),
      'lotes', (select count(*) from public.lots where product_id = any(v_ids)),
      'precios', (select count(*) from public.product_prices where product_id = p_product_id),
      'seriales', (select count(*) from public.serial_numbers where product_id = any(v_ids) and organization_id = p_organization_id),
      'seriales_por_estado', coalesce((select jsonb_object_agg(status, n) from (
          select status, count(*) as n from public.serial_numbers
           where product_id = any(v_ids) and organization_id = p_organization_id group by status) s), '{}'::jsonb),
      'movimientos', (select count(*) from public.stock_movements where product_id = any(v_ids) and organization_id = p_organization_id)
    ),
    'permisos', public.fn_productos_permisos(p_organization_id)
  ) into v_res;
  return v_res;
end;
$$;

-- ── 10. Kardex del producto (y sus variantes) con saldo y documento ─────────
-- El saldo es acumulado por (producto, sucursal) sobre toda la historia y
-- después se filtra y pagina: el saldo de una fila no depende del filtro.
create or replace function public.fn_producto_kardex(
  p_organization_id integer, p_product_id integer,
  p_branch_id integer default null, p_desde timestamptz default null, p_hasta timestamptz default null,
  p_direccion text default null, p_origen text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (
  id integer, fecha timestamptz, product_id integer, producto_nombre text, producto_sku text,
  es_variante boolean, branch_id integer, sucursal text, direccion text, cantidad numeric,
  costo_unitario numeric, costo_total numeric, saldo numeric, origen text, origen_id text,
  documento text, nota text, usuario text, total_filas bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_ids integer[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not exists (select 1 from public.products p where p.id = p_product_id and p.organization_id = p_organization_id) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  v_ids := array[p_product_id] || coalesce((
    select array_agg(c.id) from public.products c
     where c.parent_product_id = p_product_id and c.organization_id = p_organization_id), '{}');

  return query
  with mov as (
    select m.id as mid, m.created_at, m.product_id as pid, m.branch_id as bid, m.direction, m.qty,
           m.unit_cost, m.source, m.source_id, m.note, m.updated_by,
           sum(case when m.direction = 'in' then abs(m.qty) else -abs(m.qty) end)
             over (partition by m.product_id, m.branch_id order by m.created_at, m.id) as saldo_acum
      from public.stock_movements m
     where m.organization_id = p_organization_id and m.product_id = any(v_ids)
  ), filt as (
    select mv.*, count(*) over () as n
      from mov mv
     where (p_branch_id is null or mv.bid = p_branch_id)
       and (p_desde is null or mv.created_at >= p_desde)
       and (p_hasta is null or mv.created_at < p_hasta)
       and (p_direccion is null or mv.direction = p_direccion)
       and (p_origen is null or mv.source = p_origen)
     order by mv.created_at desc, mv.mid desc
     limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select f.mid, f.created_at, f.pid, pr.name, pr.sku, pr.parent_product_id is not null,
         f.bid, b.name::text, f.direction, abs(f.qty), coalesce(f.unit_cost, 0),
         round(abs(f.qty) * coalesce(f.unit_cost, 0), 2), f.saldo_acum, f.source, f.source_id,
         case
           when f.source in ('invoice_sale', 'invoice_void', 'credit_note') then
             (select iv.number from public.invoice_sales iv where iv.id::text = f.source_id and iv.organization_id = p_organization_id)
           when f.source = 'purchase_invoice' then
             (select ip.number_ext from public.invoice_purchase ip where ip.id::text = f.source_id and ip.organization_id = p_organization_id)
           when f.source in ('purchase_order', 'purchase') and f.source_id ~ '^[0-9]+$' then
             (select 'OC-' || po.id from public.purchase_orders po where po.id = f.source_id::int and po.organization_id = p_organization_id)
           when f.source in ('adjustment', 'loss') and f.source_id ~ '^[0-9]+$' then 'AJ-' || f.source_id
           when f.source in ('transfer', 'transfer_in', 'transfer_out') and f.source_id ~ '^[0-9]+$' then 'TR-' || f.source_id
           when f.source_id is not null then left(f.source_id, 8)
         end,
         f.note,
         nullif(btrim(coalesce(pf.first_name, '') || ' ' || coalesce(pf.last_name, '')), ''),
         f.n
    from filt f
    join public.products pr on pr.id = f.pid
    left join public.branches b on b.id = f.bid
    left join public.profiles pf on pf.id = f.updated_by
   order by f.created_at desc, f.mid desc;
end;
$$;

-- ── 11. Lotes del producto (y sus variantes) con stock por sucursal ─────────
create or replace function public.fn_producto_lotes(p_organization_id integer, p_product_id integer)
returns table (
  lot_id integer, lot_code text, product_id integer, producto_nombre text, expiry_date date,
  supplier_id integer, proveedor text, creado timestamptz, qty_on_hand numeric, qty_reserved numeric,
  dias_para_vencer integer, sucursales jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_ids integer[];
  v_hoy date := (now() at time zone public.fn_timezone_for(p_organization_id, null))::date;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not exists (select 1 from public.products p where p.id = p_product_id and p.organization_id = p_organization_id) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  v_ids := array[p_product_id] || coalesce((
    select array_agg(c.id) from public.products c
     where c.parent_product_id = p_product_id and c.organization_id = p_organization_id), '{}');
  return query
  select l.id, l.lot_code, l.product_id, pr.name, l.expiry_date, l.supplier_id, s.name,
         l.created_at,
         coalesce((select sum(sl.qty_on_hand) from public.stock_levels sl where sl.lot_id = l.id), 0),
         coalesce((select sum(sl.qty_reserved) from public.stock_levels sl where sl.lot_id = l.id), 0),
         case when l.expiry_date is not null then (l.expiry_date - v_hoy) end,
         coalesce((select jsonb_agg(jsonb_build_object('branch_id', sl.branch_id, 'sucursal', b.name,
                    'qty_on_hand', sl.qty_on_hand, 'qty_reserved', sl.qty_reserved) order by b.name)
                     from public.stock_levels sl join public.branches b on b.id = sl.branch_id
                    where sl.lot_id = l.id), '[]'::jsonb)
    from public.lots l
    join public.products pr on pr.id = l.product_id and pr.organization_id = p_organization_id
    left join public.suppliers s on s.id = l.supplier_id
   where l.product_id = any(v_ids)
   order by l.expiry_date nulls last, l.created_at desc;
end;
$$;

-- ── 12. Seriales: alta masiva (patrón o lista) ──────────────────────────────
-- Patrón: {PROD} (SKU), {YYYY} {YY} {MM} {DD} (día de la organización),
-- {SEQ} (6 dígitos), {####} {###} {##}. El consecutivo continúa desde los
-- seriales del producto y salta los que ya existan (serial es único global).
-- Límite: unidades de la sucursal sin serial disponible
-- (stock − seriales en stock o reservados en esa sucursal).
-- Garantía: warranty_months del producto, desde hoy (día de la organización).
create or replace function public.fn_producto_generar_seriales(
  p_organization_id integer, p_product_id integer, p_branch_id integer,
  p_cantidad integer default null, p_seriales text[] default null,
  p_costo numeric default null, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p public.products%rowtype;
  v_tz text := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_hoy date := (now() at time zone v_tz)::date;
  v_stock numeric;
  v_con_serial integer;
  v_cupo integer;
  v_costo numeric;
  v_lista text[] := array[]::text[];
  v_creados jsonb := '[]'::jsonb;
  v_omitidos jsonb := '[]'::jsonb;
  v_seq integer;
  v_intentos integer := 0;
  v_serial text;
  v_id integer;
  v_patron text;
  v_fin date;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'inventory.create', 'inventory.adjust', 'product_management', 'inventory_management']);
  select * into v_p from public.products where id = p_product_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if not coalesce(v_p.track_serial, false) then
    raise exception 'producto_sin_seriales' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;

  select coalesce(sum(qty_on_hand), 0) into v_stock from public.stock_levels
   where product_id = p_product_id and branch_id = p_branch_id;
  select count(*) into v_con_serial from public.serial_numbers
   where product_id = p_product_id and current_branch_id = p_branch_id and status in ('in_stock', 'reserved');
  v_cupo := greatest(floor(v_stock)::int - v_con_serial, 0);

  v_costo := coalesce(p_costo, (
    select cost from public.product_costs
     where product_id = p_product_id and effective_from <= now() and (effective_to is null or effective_to > now())
     order by effective_from desc, id desc limit 1), 0);
  v_fin := case when coalesce(v_p.warranty_months, 0) > 0
                then (v_hoy + make_interval(months => v_p.warranty_months))::date end;

  if p_seriales is not null and coalesce(array_length(p_seriales, 1), 0) > 0 then
    select coalesce(array_agg(d.s order by d.ord), array[]::text[]) into v_lista
      from (select distinct on (btrim(t.x)) btrim(t.x) as s, t.ord
              from unnest(p_seriales) with ordinality as t(x, ord)
             where btrim(coalesce(t.x, '')) <> ''
             order by btrim(t.x), t.ord) d;
  else
    v_patron := nullif(btrim(coalesce(v_p.serial_pattern, '')), '');
    if v_patron is null then
      raise exception 'patron_requerido' using errcode = '22023';
    end if;
    if v_patron !~ '\{(SEQ|####|###|##)\}' then
      raise exception 'patron_sin_consecutivo' using errcode = '22023';
    end if;
    if coalesce(p_cantidad, 0) <= 0 then
      raise exception 'cantidad_invalida' using errcode = '22023';
    end if;
    if p_cantidad > v_cupo then
      raise exception 'excede_stock' using errcode = '22023', detail = v_cupo::text;
    end if;
    select count(*) + 1 into v_seq from public.serial_numbers where product_id = p_product_id;
    while coalesce(array_length(v_lista, 1), 0) < p_cantidad and v_intentos < p_cantidad * 3 + 200 loop
      v_serial := v_patron;
      v_serial := replace(v_serial, '{PROD}', v_p.sku);
      v_serial := replace(v_serial, '{YYYY}', to_char(v_hoy, 'YYYY'));
      v_serial := replace(v_serial, '{YY}', to_char(v_hoy, 'YY'));
      v_serial := replace(v_serial, '{MM}', to_char(v_hoy, 'MM'));
      v_serial := replace(v_serial, '{DD}', to_char(v_hoy, 'DD'));
      v_serial := replace(v_serial, '{SEQ}', lpad(v_seq::text, 6, '0'));
      v_serial := replace(v_serial, '{####}', lpad(v_seq::text, 4, '0'));
      v_serial := replace(v_serial, '{###}', lpad(v_seq::text, 3, '0'));
      v_serial := replace(v_serial, '{##}', lpad(v_seq::text, 2, '0'));
      if not exists (select 1 from public.serial_numbers where serial = v_serial) then
        v_lista := v_lista || v_serial;
      end if;
      v_seq := v_seq + 1;
      v_intentos := v_intentos + 1;
    end loop;
  end if;

  if coalesce(array_length(v_lista, 1), 0) = 0 then
    raise exception 'sin_seriales' using errcode = '22023';
  end if;
  if array_length(v_lista, 1) > v_cupo then
    raise exception 'excede_stock' using errcode = '22023', detail = v_cupo::text;
  end if;

  foreach v_serial in array v_lista loop
    if exists (select 1 from public.serial_numbers where serial = v_serial) then
      v_omitidos := v_omitidos || jsonb_build_object('serial', v_serial, 'motivo', 'duplicado');
      continue;
    end if;
    insert into public.serial_numbers (
      product_id, organization_id, branch_id, current_branch_id, serial, status, cost_at_purchase,
      received_date, warranty_months, warranty_start, warranty_end, notes, updated_by, sale_channel)
    values (
      p_product_id, p_organization_id, p_branch_id, p_branch_id, v_serial, 'in_stock', v_costo,
      now(), v_p.warranty_months, case when v_fin is not null then v_hoy end, v_fin,
      coalesce(nullif(btrim(coalesce(p_nota, '')), ''),
               case when p_seriales is not null then 'Alta masiva' else 'Generado desde patrón' end),
      auth.uid(), 'in_stock')
    returning id into v_id;
    insert into public.serial_tracking_events (
      id, serial_number_id, organization_id, event_type, to_branch_id, to_status, source_table, source_id,
      performed_by, event_date, notes, metadata)
    values (gen_random_uuid(), v_id, p_organization_id, 'received', p_branch_id, 'in_stock', 'manual', 'manual',
      auth.uid(), now(), p_nota, jsonb_build_object('origen', case when p_seriales is not null then 'lista' else 'patron' end));
    v_creados := v_creados || jsonb_build_object('id', v_id, 'serial', v_serial);
  end loop;

  return jsonb_build_object('creados', v_creados, 'omitidos', v_omitidos, 'cupo', v_cupo);
end;
$$;

-- ── 13. Seriales: cambio de estado con evento de trazabilidad ───────────────
-- Transiciones manuales permitidas. Ventas, reservas web y reclamos de
-- garantía siguen en sus flujos (POS, pedidos web, CreateClaimDialog).
create or replace function public.fn_producto_serial_cambiar_estado(
  p_organization_id integer, p_serial_ids integer[], p_estado text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s record;
  v_ok integer := 0;
  v_rechazados jsonb := '[]'::jsonb;
  v_evento text;
  v_permitidas jsonb := jsonb_build_object(
    'in_stock', jsonb_build_array('damaged', 'rma'),
    'reserved', jsonb_build_array('in_stock'),
    'damaged', jsonb_build_array('in_stock', 'rma'),
    'rma', jsonb_build_array('in_stock', 'damaged'),
    'returned', jsonb_build_array('in_stock', 'damaged', 'rma'),
    'in_transit', jsonb_build_array('in_stock'),
    'sold', jsonb_build_array('returned'),
    'warranty_claim', jsonb_build_array('sold', 'returned'));
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'inventory.adjust', 'product_management', 'inventory_management']);
  if p_estado not in ('in_stock', 'damaged', 'rma', 'returned', 'sold') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  v_evento := case p_estado when 'damaged' then 'damaged' when 'rma' then 'rma_created'
                            when 'returned' then 'returned' else 'status_change' end;
  for v_s in
    select sn.id, sn.serial, sn.status, sn.current_branch_id from public.serial_numbers sn
     where sn.id = any(p_serial_ids) and sn.organization_id = p_organization_id for update
  loop
    if not coalesce((v_permitidas->v_s.status) ? p_estado, false) then
      v_rechazados := v_rechazados || jsonb_build_object('id', v_s.id, 'serial', v_s.serial, 'estado', v_s.status);
      continue;
    end if;
    update public.serial_numbers
       set status = p_estado, updated_at = now(), updated_by = auth.uid(),
           notes = case when nullif(btrim(coalesce(p_nota, '')), '') is null then notes
                        else btrim(coalesce(notes || E'\n', '') || p_nota) end
     where id = v_s.id;
    insert into public.serial_tracking_events (
      id, serial_number_id, organization_id, event_type, from_status, to_status, from_branch_id,
      source_table, source_id, performed_by, event_date, notes, metadata)
    values (gen_random_uuid(), v_s.id, p_organization_id, v_evento, v_s.status, p_estado, v_s.current_branch_id,
      'manual', null, auth.uid(), now(), p_nota, '{}'::jsonb);
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('actualizados', v_ok, 'rechazados', v_rechazados);
end;
$$;

-- ── 14. Variantes desde el detalle ──────────────────────────────────────────
create or replace function public.fn_producto_variante_guardar(
  p_organization_id integer, p_parent_id integer, p_variante jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id integer;
  v_ajustar boolean;
begin
  if nullif(p_variante->>'id', '') is null then
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.create', 'inventory.edit', 'product_management', 'inventory_management']);
  else
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.edit', 'product_management', 'inventory_management']);
  end if;
  perform 1 from public.products where id = p_parent_id and organization_id = p_organization_id
     and parent_product_id is null for update;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  -- Cambiar la cantidad de una variante existente es un ajuste de inventario.
  v_ajustar := auth.uid() is null
    or exists (select 1 from public.organizations o where o.id = p_organization_id and o.owner_user_id = auth.uid())
    or public.check_user_permission(auth.uid(), p_organization_id, 'inventory.adjust')
    or public.check_user_permission(auth.uid(), p_organization_id, 'inventory_management');
  if nullif(p_variante->>'id', '') is not null and p_variante ? 'stock' and not v_ajustar
     and exists (select 1 from jsonb_array_elements(p_variante->'stock') s where s ? 'qty') then
    raise exception 'sin_permiso' using errcode = '42501', detail = 'inventory.adjust';
  end if;
  update public.products set is_parent = true, updated_at = now()
   where id = p_parent_id and not coalesce(is_parent, false);
  v_id := public.fn_producto_int_variante_guardar(p_organization_id, p_parent_id, p_variante, v_ajustar);
  return jsonb_build_object('id', v_id);
end;
$$;

-- Activar, desactivar o eliminar (baja lógica, status = 'deleted') una variante.
create or replace function public.fn_producto_variante_estado(
  p_organization_id integer, p_variant_id integer, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status = 'deleted' then
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.delete', 'product_management', 'inventory_management']);
  else
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.edit', 'product_management', 'inventory_management']);
  end if;
  if p_status not in ('active', 'inactive', 'discontinued', 'deleted') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  update public.products set status = p_status, updated_at = now()
   where id = p_variant_id and organization_id = p_organization_id and parent_product_id is not null;
  if not found then
    raise exception 'variante_no_encontrada' using errcode = 'P0002';
  end if;
end;
$$;

-- ── 15. Precio y costo desde el detalle (vigencia programable) ──────────────
create or replace function public.fn_producto_fijar_precio(
  p_organization_id integer, p_product_id integer, p_precio numeric,
  p_comparacion numeric default null, p_desde timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cambio boolean;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  perform 1 from public.products where id = p_product_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if p_precio is null then
    raise exception 'precio_requerido' using errcode = '22023';
  end if;
  if p_comparacion is not null and p_comparacion > 0 and p_comparacion <= p_precio then
    raise exception 'comparacion_menor' using errcode = '22023';
  end if;
  if p_desde is not null and p_desde < now() - interval '5 minutes' then
    raise exception 'vigencia_pasada' using errcode = '22023';
  end if;
  v_cambio := public.fn_producto_int_fijar_precio(p_product_id, p_precio, p_comparacion, p_desde);
  update public.products set updated_at = now() where id = p_product_id;
  return jsonb_build_object('cambio', v_cambio);
end;
$$;

create or replace function public.fn_producto_fijar_costo(
  p_organization_id integer, p_product_id integer, p_costo numeric,
  p_desde timestamptz default null, p_supplier_id integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cambio boolean;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  perform 1 from public.products where id = p_product_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if p_costo is null then
    raise exception 'costo_requerido' using errcode = '22023';
  end if;
  if p_supplier_id is not null and not exists (
       select 1 from public.suppliers where id = p_supplier_id and organization_id = p_organization_id) then
    raise exception 'proveedor_invalido' using errcode = '22023';
  end if;
  if p_desde is not null and p_desde < now() - interval '5 minutes' then
    raise exception 'vigencia_pasada' using errcode = '22023';
  end if;
  v_cambio := public.fn_producto_int_fijar_costo(p_product_id, p_costo, p_desde, p_supplier_id);
  update public.products set updated_at = now() where id = p_product_id;
  return jsonb_build_object('cambio', v_cambio);
end;
$$;

-- ── 16. Imágenes: orden y principal en una transacción ──────────────────────
-- UNIQUE (product_id, display_order) obliga a pasar por valores temporales.
create or replace function public.fn_producto_imagenes_ordenar(
  p_organization_id integer, p_product_id integer, p_ids integer[], p_principal_id integer default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_i integer;
  v_n integer := coalesce(array_length(p_ids, 1), 0);
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  if not exists (select 1 from public.products where id = p_product_id and organization_id = p_organization_id) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(coalesce(p_ids, array[]::integer[])) x
              where x not in (select pi.id from public.product_images pi where pi.product_id = p_product_id)) then
    raise exception 'imagen_invalida' using errcode = '22023';
  end if;
  update public.product_images set display_order = -1000000 - id where product_id = p_product_id;
  for v_i in 1 .. v_n loop
    update public.product_images set display_order = v_i - 1, updated_at = now()
     where id = p_ids[v_i] and product_id = p_product_id;
  end loop;
  -- Las que no vinieron en la lista van al final, en su orden anterior.
  with resto as (
    select pi.id, row_number() over (order by pi.display_order desc) as rn
      from public.product_images pi where pi.product_id = p_product_id and pi.display_order < 0)
  update public.product_images pi set display_order = v_n + r.rn - 1
    from resto r where pi.id = r.id;
  if p_principal_id is not null then
    update public.product_images set is_primary = (id = p_principal_id), updated_at = now()
     where product_id = p_product_id;
  end if;
end;
$$;

-- ── 17. Estado del producto (activar, desactivar, descontinuar, eliminar) ───
create or replace function public.fn_producto_cambiar_estado(
  p_organization_id integer, p_product_id integer, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status = 'deleted' then
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.delete', 'product_management', 'inventory_management']);
  else
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.edit', 'product_management', 'inventory_management']);
  end if;
  if p_status not in ('active', 'inactive', 'discontinued', 'deleted') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  update public.products set status = p_status, updated_at = now()
   where id = p_product_id and organization_id = p_organization_id;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- ── 18. Historial unificado ─────────────────────────────────────────────────
-- Tipos: auditoria · precio · costo · kardex · compra · venta · nota · serial · garantia.
-- `detalle` lleva los datos crudos; los textos los arma la interfaz (4 idiomas).
create or replace function public.fn_producto_historial(
  p_organization_id integer, p_product_id integer, p_tipos text[] default null,
  p_desde timestamptz default null, p_hasta timestamptz default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (
  clave text, fecha timestamptz, tipo text, product_id integer, producto_nombre text,
  usuario_id uuid, usuario text, detalle jsonb, total_filas bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_ids integer[];
  v_t text[] := coalesce(p_tipos, array['auditoria','precio','costo','kardex','compra','venta','nota','serial','garantia']);
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not exists (select 1 from public.products p where p.id = p_product_id and p.organization_id = p_organization_id) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  v_ids := array[p_product_id] || coalesce((
    select array_agg(c.id) from public.products c
     where c.parent_product_id = p_product_id and c.organization_id = p_organization_id), '{}');

  return query
  with ev as (
    select 'a' || a.id::text as k, coalesce(a.event_time, a.created_at) as f, 'auditoria'::text as t,
           a.entity_id as pid, a.user_id as uid,
           jsonb_build_object('accion', a.action_type, 'entidad', a.entity_type, 'cambios', a.changes) as d
      from public.products_audit_log a
     where 'auditoria' = any(v_t) and a.organization_id = p_organization_id
       and a.entity_type = 'product' and a.entity_id = any(v_ids)
    union all
    select 'p' || pp.id, pp.effective_from, 'precio', pp.product_id, null::uuid,
           jsonb_build_object('precio', pp.price, 'comparacion', pp.compare_price,
             'desde', pp.effective_from, 'hasta', pp.effective_to,
             'anterior', lag(pp.price) over (partition by pp.product_id order by pp.effective_from, pp.id),
             'cancelado', pp.effective_to is not null and pp.effective_to <= pp.effective_from)
      from public.product_prices pp
     where 'precio' = any(v_t) and pp.product_id = any(v_ids)
    union all
    select 'c' || pc.id, pc.effective_from, 'costo', pc.product_id, null::uuid,
           jsonb_build_object('costo', pc.cost, 'desde', pc.effective_from, 'hasta', pc.effective_to,
             'anterior', lag(pc.cost) over (partition by pc.product_id order by pc.effective_from, pc.id),
             'proveedor', (select s.name from public.suppliers s where s.id = pc.supplier_id),
             'cancelado', pc.effective_to is not null and pc.effective_to <= pc.effective_from)
      from public.product_costs pc
     where 'costo' = any(v_t) and pc.product_id = any(v_ids)
    union all
    select 'k' || m.id, m.created_at, 'kardex', m.product_id, m.updated_by,
           jsonb_build_object('direccion', m.direction, 'cantidad', abs(m.qty), 'costo_unitario', m.unit_cost,
             'origen', m.source, 'origen_id', m.source_id, 'nota', m.note,
             'sucursal', (select b.name from public.branches b where b.id = m.branch_id))
      from public.stock_movements m
     where 'kardex' = any(v_t) and m.organization_id = p_organization_id and m.product_id = any(v_ids)
    union all
    select 'oc' || poi.id, po.created_at, 'compra', poi.product_id, po.created_by,
           jsonb_build_object('documento', 'OC-' || po.id, 'documento_tipo', 'orden_compra', 'documento_id', po.uuid,
             'estado', po.status, 'cantidad', poi.quantity, 'recibido', poi.received_quantity,
             'costo_unitario', poi.unit_cost, 'total', poi.subtotal, 'supplier_id', po.supplier_id,
             'proveedor', (select s.name from public.suppliers s where s.id = po.supplier_id))
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id
     where 'compra' = any(v_t) and po.organization_id = p_organization_id and poi.product_id = any(v_ids)
    union all
    select 'fc' || ii.id, coalesce(ip.issue_date, ip.created_at), 'compra', ii.product_id, ip.created_by,
           jsonb_build_object('documento', coalesce(ip.number_ext, left(ip.id::text, 8)), 'documento_tipo', 'factura_compra',
             'documento_id', ip.id, 'estado', ip.status, 'cantidad', ii.qty, 'costo_unitario', ii.unit_price,
             'total', ii.total_line, 'supplier_id', ip.supplier_id,
             'proveedor', (select s.name from public.suppliers s where s.id = ip.supplier_id))
      from public.invoice_items ii
      join public.invoice_purchase ip on ip.id = ii.invoice_purchase_id
     where 'compra' = any(v_t) and ip.organization_id = p_organization_id and ii.product_id = any(v_ids)
    union all
    select 'v' || si.id, coalesce(s.sale_date, s.created_at), 'venta', si.product_id, s.user_id,
           jsonb_build_object('documento', left(s.id::text, 8), 'documento_tipo', 'venta', 'documento_id', s.id,
             'estado', s.status, 'cantidad', si.quantity, 'precio_unitario', si.unit_price, 'total', si.total,
             'customer_id', s.customer_id,
             'cliente', (select c.full_name from public.customers c where c.id = s.customer_id))
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
     where 'venta' = any(v_t) and s.organization_id = p_organization_id and si.product_id = any(v_ids)
    union all
    select 'fv' || ii.id, coalesce(iv.issue_date, iv.created_at), 'venta', ii.product_id, iv.created_by,
           jsonb_build_object('documento', iv.number, 'documento_tipo', 'factura_venta', 'documento_id', iv.id,
             'estado', iv.status, 'cantidad', ii.qty, 'precio_unitario', ii.unit_price, 'total', ii.total_line,
             'customer_id', iv.customer_id,
             'cliente', (select c.full_name from public.customers c where c.id = iv.customer_id))
      from public.invoice_items ii
      join public.invoice_sales iv on iv.id = ii.invoice_sales_id
     where 'venta' = any(v_t) and iv.organization_id = p_organization_id and ii.product_id = any(v_ids)
       and iv.sale_id is null
    union all
    select 'n' || n.id, n.created_at, 'nota', n.product_id, n.user_id,
           jsonb_build_object('contenido', left(n.content, 280), 'fijada', n.is_pinned)
      from public.product_notes n
     where 'nota' = any(v_t) and n.organization_id = p_organization_id and n.product_id = any(v_ids)
    union all
    select 's' || e.id::text, e.event_date, 'serial', sn.product_id, e.performed_by,
           jsonb_build_object('serial', sn.serial, 'serial_id', sn.id, 'evento', e.event_type,
             'de', e.from_status, 'a', e.to_status, 'nota', e.notes)
      from public.serial_tracking_events e
      join public.serial_numbers sn on sn.id = e.serial_number_id
     where 'serial' = any(v_t) and e.organization_id = p_organization_id and sn.product_id = any(v_ids)
    union all
    select 'g' || w.id::text, w.claim_date, 'garantia', sn.product_id, w.created_by,
           jsonb_build_object('serial', sn.serial, 'reclamo_id', w.id, 'estado', w.status, 'motivo', w.claim_reason,
             'resolucion', w.resolution_type)
      from public.warranty_claims w
      join public.serial_numbers sn on sn.id = w.serial_number_id
     where 'garantia' = any(v_t) and w.organization_id = p_organization_id and sn.product_id = any(v_ids)
  ), filt as (
    select ev.*, count(*) over () as n
      from ev
     where (p_desde is null or ev.f >= p_desde)
       and (p_hasta is null or ev.f < p_hasta)
     order by ev.f desc, ev.k desc
     limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select fl.k, fl.f, fl.t, fl.pid, pr.name, fl.uid,
         nullif(btrim(coalesce(pf.first_name, '') || ' ' || coalesce(pf.last_name, '')), ''),
         fl.d, fl.n
    from filt fl
    left join public.products pr on pr.id = fl.pid
    left join public.profiles pf on pf.id = fl.uid
   order by fl.f desc, fl.k desc;
end;
$$;

-- ── 19. Permisos de ejecución ───────────────────────────────────────────────
revoke all on function public.fn_productos_exigir_permiso(integer, text[]) from public, anon, authenticated;
revoke all on function public.fn_producto_int_fijar_precio(integer, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.fn_producto_int_fijar_costo(integer, numeric, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.fn_producto_int_stock_inicial(integer, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.fn_producto_int_asegurar_atributos(integer, jsonb) from public, anon, authenticated;
revoke all on function public.fn_producto_int_variante_guardar(integer, integer, jsonb, boolean) from public, anon, authenticated;

revoke all on function public.fn_productos_permisos(integer) from public, anon;
revoke all on function public.fn_producto_resumen(integer, integer) from public, anon;
revoke all on function public.fn_producto_kardex(integer, integer, integer, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
revoke all on function public.fn_producto_lotes(integer, integer) from public, anon;
revoke all on function public.fn_producto_generar_seriales(integer, integer, integer, integer, text[], numeric, text) from public, anon;
revoke all on function public.fn_producto_serial_cambiar_estado(integer, integer[], text, text) from public, anon;
revoke all on function public.fn_producto_variante_guardar(integer, integer, jsonb) from public, anon;
revoke all on function public.fn_producto_variante_estado(integer, integer, text) from public, anon;
revoke all on function public.fn_producto_fijar_precio(integer, integer, numeric, numeric, timestamptz) from public, anon;
revoke all on function public.fn_producto_fijar_costo(integer, integer, numeric, timestamptz, integer) from public, anon;
revoke all on function public.fn_producto_imagenes_ordenar(integer, integer, integer[], integer) from public, anon;
revoke all on function public.fn_producto_cambiar_estado(integer, integer, text) from public, anon;
revoke all on function public.fn_producto_historial(integer, integer, text[], timestamptz, timestamptz, integer, integer) from public, anon;

grant execute on function public.fn_productos_exigir_permiso(integer, text[]) to service_role;
grant execute on function public.fn_productos_permisos(integer) to authenticated, service_role;
grant execute on function public.fn_producto_resumen(integer, integer) to authenticated, service_role;
grant execute on function public.fn_producto_kardex(integer, integer, integer, timestamptz, timestamptz, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.fn_producto_lotes(integer, integer) to authenticated, service_role;
grant execute on function public.fn_producto_generar_seriales(integer, integer, integer, integer, text[], numeric, text) to authenticated, service_role;
grant execute on function public.fn_producto_serial_cambiar_estado(integer, integer[], text, text) to authenticated, service_role;
grant execute on function public.fn_producto_variante_guardar(integer, integer, jsonb) to authenticated, service_role;
grant execute on function public.fn_producto_variante_estado(integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_producto_fijar_precio(integer, integer, numeric, numeric, timestamptz) to authenticated, service_role;
grant execute on function public.fn_producto_fijar_costo(integer, integer, numeric, timestamptz, integer) to authenticated, service_role;
grant execute on function public.fn_producto_imagenes_ordenar(integer, integer, integer[], integer) to authenticated, service_role;
grant execute on function public.fn_producto_cambiar_estado(integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_producto_historial(integer, integer, text[], timestamptz, timestamptz, integer, integer) to authenticated, service_role;
