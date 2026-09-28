-- Receta dentro del formulario de producto (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2.2, §2.3, §2.5 B3, B4, B5, B7)
--
-- La receta vive en el estado del formulario hasta «Guardar» y una sola RPC
-- (fn_producto_guardar) crea producto, variantes y recetas juntos: si algo
-- falla no queda nada a medias. Una receta de una variante que aún no existe se
-- identifica por la clave de cliente de la variante (VarianteForm.clave), que
-- ahora viaja en el payload y vuelve en el resultado.
--
--   product_save_requests            idempotencia: la misma clave devuelve el mismo resultado (doble clic, reintento)
--   fn_receta_int_guardar_version    valida y guarda una versión nueva (o nada si no cambió); la misma interna
--                                    para el formulario y para «Editar receta» (fn_receta_guardar)
--   fn_receta_guardar                RPC del detalle y de la pantalla Recetas (sustituye 4 llamadas del navegador)
--   fn_producto_guardar              + clave_idempotencia, + receta, variantes con su clave en el resultado
--   fn_producto_recetas_para_formulario  recetas activas del producto y sus variantes, y órdenes abiertas
--   fn_receta_costo                  costo de una receta o de un borrador (el mismo cálculo que la venta)
--   fn_receta_necesidades            lo que falta para vender unos ítems (aviso previo del POS, sin N+1)
--   fn_receta_expandir               qué se reserva o libera por un pedido web
--
-- Payload nuevo de fn_producto_guardar:
--   "clave_idempotencia": uuid
--   "variantes": [{ "clave": "v…", … }]
--   "receta": { "activa": bool, "modo": "al_vender" | "al_producir",
--               "recetas": [ { "destino": "producto" | { "variante": "<clave>" },
--                              "name", "yield_qty", "yield_unit_code", "notes",
--                              "ingredientes": [ { "ingredient_product_id", "quantity", "unit_code",
--                                                  "waste_pct", "is_optional", "notes" } ] } ] }
-- Sin la clave "receta", las recetas no se tocan (compatibilidad).
-- Con receta activa: lo que no viene se desactiva (no se borra): la variante sin receta propia usa la del
-- producto, y el producto sin receta compartida no tiene. Apagada: se desactivan todas.
-- «Al producir» se guarda como production_type = 'preparation' (decisión 1) y exige inventario.

-- ── B3. Idempotencia ────────────────────────────────────────────────────────
create table if not exists public.product_save_requests (
  organization_id integer not null references public.organizations(id) on delete cascade,
  clave uuid not null,
  user_id uuid,
  product_id integer references public.products(id) on delete set null,
  resultado jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, clave)
);

create index if not exists idx_product_save_requests_org_fecha
  on public.product_save_requests (organization_id, created_at);

comment on table public.product_save_requests is
  'Idempotencia del guardado del formulario de producto: una fila por clave de intento. Se escribe solo desde fn_producto_guardar; se limpia a los 30 días.';

alter table public.product_save_requests enable row level security;

drop policy if exists product_save_requests_lectura on public.product_save_requests;
create policy product_save_requests_lectura on public.product_save_requests
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

revoke all on table public.product_save_requests from anon;
revoke insert, update, delete on table public.product_save_requests from authenticated;

-- ── B4. Guardar una versión de receta ───────────────────────────────────────
create or replace function public.fn_receta_int_guardar_version(p_org integer, p_product_id integer, p_receta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p record;
  v_rinde numeric := coalesce(nullif(p_receta->>'yield_qty', '')::numeric, 1);
  v_unid text := nullif(upper(btrim(coalesce(p_receta->>'yield_unit_code', ''))), '');
  v_l record;
  v_dup integer;
  v_act record;
  v_nuevo jsonb;
  v_viejo jsonb;
  v_id integer;
  v_ver integer;
begin
  select pr.id, pr.parent_product_id into v_p
    from public.products pr
   where pr.id = p_product_id and pr.organization_id = p_org and pr.status <> 'deleted';
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if v_rinde <= 0 then
    raise exception 'receta_rinde_invalido' using errcode = '22023';
  end if;
  if v_unid is not null and not exists (select 1 from public.units u where upper(btrim(u.code)) = v_unid) then
    raise exception 'receta_unidad_invalida' using errcode = '22023', detail = v_unid;
  end if;
  if jsonb_typeof(p_receta->'ingredientes') is distinct from 'array' or jsonb_array_length(p_receta->'ingredientes') = 0 then
    raise exception 'receta_sin_ingredientes' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_receta->'ingredientes') e
              where coalesce(nullif(e->>'waste_pct', '')::numeric, 0) < 0 or coalesce(nullif(e->>'waste_pct', '')::numeric, 0) >= 100) then
    raise exception 'receta_merma_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_receta->'ingredientes') e
              where nullif(btrim(coalesce(e->>'unit_code', '')), '') is not null
                and not exists (select 1 from public.units u where upper(btrim(u.code)) = upper(btrim(e->>'unit_code')))) then
    raise exception 'receta_unidad_invalida' using errcode = '22023';
  end if;

  -- Mismo cálculo que la venta, con la cantidad del rinde (una tanda).
  for v_l in select c.* from public.fn_receta_int_calcular(p_org, p_receta, v_rinde) c loop
    if v_l.error = 'ingrediente_invalido' or v_l.estado = 'deleted' or v_l.es_servicio or v_l.es_padre then
      raise exception 'receta_ingrediente_invalido' using errcode = '22023', detail = coalesce(v_l.ingredient_product_id::text, '');
    end if;
    if v_l.ingredient_product_id = p_product_id
       or v_l.ingredient_product_id = v_p.parent_product_id
       or exists (select 1 from public.products c where c.id = v_l.ingredient_product_id and c.parent_product_id = p_product_id) then
      raise exception 'receta_autorreferida' using errcode = '23514', detail = v_l.ingredient_product_id::text;
    end if;
    if coalesce(v_l.cantidad_neta, 0) <= 0 then
      raise exception 'receta_cantidad_invalida' using errcode = '22023', detail = v_l.ingredient_product_id::text;
    end if;
    if v_l.error = 'conversion_faltante' then
      raise exception 'conversion_faltante' using errcode = '22023',
        detail = jsonb_build_object('ingrediente_id', v_l.ingredient_product_id, 'de', v_l.unidad_receta,
                                    'a', v_l.unidad_ingrediente)::text;
    end if;
  end loop;

  -- Normalizado: lo que se guarda y con lo que se compara la versión activa.
  select jsonb_build_object(
           'name', nullif(btrim(coalesce(p_receta->>'name', '')), ''),
           'yield_qty', v_rinde,
           'yield_unit_code', v_unid,
           'notes', nullif(btrim(coalesce(p_receta->>'notes', '')), ''),
           'ingredientes', jsonb_agg(jsonb_build_object(
               'ingredient_product_id', (x.e->>'ingredient_product_id')::integer,
               'quantity', (x.e->>'quantity')::numeric,
               'unit_code', upper(btrim(coalesce(nullif(x.e->>'unit_code', ''), pr.unit_code, 'UN'))),
               'waste_pct', coalesce(nullif(x.e->>'waste_pct', '')::numeric, 0),
               'is_optional', coalesce((x.e->>'is_optional')::boolean, false),
               'notes', nullif(btrim(coalesce(x.e->>'notes', '')), ''))
             order by x.ord))
    into v_nuevo
    from jsonb_array_elements(p_receta->'ingredientes') with ordinality x(e, ord)
    left join public.products pr on pr.id = (x.e->>'ingredient_product_id')::integer;

  select i->>'ingredient_product_id' into v_dup
    from jsonb_array_elements(v_nuevo->'ingredientes') i
   group by i->>'ingredient_product_id', i->>'unit_code'
  having count(*) > 1
   limit 1;
  if v_dup is not null then
    raise exception 'receta_ingrediente_repetido' using errcode = '22023', detail = v_dup::text;
  end if;

  select r.id, r.version into v_act
    from public.product_recipes r
   where r.product_id = p_product_id and r.is_active
   for update;
  if found then
    select jsonb_build_object(
             'name', nullif(btrim(coalesce(r.name, '')), ''),
             'yield_qty', coalesce(r.yield_qty, 1),
             'yield_unit_code', nullif(upper(btrim(coalesce(r.yield_unit_code, ''))), ''),
             'notes', nullif(btrim(coalesce(r.notes, '')), ''),
             'ingredientes', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'ingredient_product_id', ri.ingredient_product_id,
                        'quantity', ri.quantity,
                        'unit_code', upper(btrim(ri.unit_code)),
                        'waste_pct', coalesce(ri.waste_pct, 0),
                        'is_optional', coalesce(ri.is_optional, false),
                        'notes', nullif(btrim(coalesce(ri.notes, '')), ''))
                      order by ri.sort_order, ri.id)
                 from public.recipe_ingredients ri where ri.recipe_id = r.id), '[]'::jsonb))
      into v_viejo
      from public.product_recipes r where r.id = v_act.id;
    if v_viejo = v_nuevo then
      return jsonb_build_object('recipe_id', v_act.id, 'version', coalesce(v_act.version, 1), 'cambio', false);
    end if;
    update public.product_recipes set is_active = false, updated_at = now() where id = v_act.id;
  end if;

  select coalesce(max(r.version), 0) + 1 into v_ver from public.product_recipes r where r.product_id = p_product_id;
  insert into public.product_recipes (organization_id, product_id, name, yield_qty, yield_unit_code, is_active, version, notes)
  values (p_org, p_product_id, v_nuevo->>'name', v_rinde, v_unid, true, v_ver, v_nuevo->>'notes')
  returning id into v_id;
  insert into public.recipe_ingredients (recipe_id, ingredient_product_id, quantity, unit_code, waste_pct, is_optional, notes, sort_order)
  select v_id, (x.e->>'ingredient_product_id')::integer, (x.e->>'quantity')::numeric, x.e->>'unit_code',
         (x.e->>'waste_pct')::numeric, (x.e->>'is_optional')::boolean, x.e->>'notes', (x.ord - 1)::integer
    from jsonb_array_elements(v_nuevo->'ingredientes') with ordinality x(e, ord);

  return jsonb_build_object('recipe_id', v_id, 'version', v_ver, 'cambio', true);
end;
$$;

revoke all on function public.fn_receta_int_guardar_version(integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_receta_int_guardar_version(integer, integer, jsonb) to service_role;

-- ── B7. Guardar receta desde el detalle o la pantalla Recetas ───────────────
-- p_receta: igual que un elemento de receta.recetas[] del formulario, más "modo" opcional.
create or replace function public.fn_receta_guardar(p_organization_id integer, p_product_id integer, p_receta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r jsonb;
  v_track boolean;
  v_tipo text;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  select track_stock, production_type into v_track, v_tipo
    from public.products where id = p_product_id and organization_id = p_organization_id;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  v_tipo := case p_receta->>'modo'
              when 'al_producir' then 'preparation'
              when 'al_vender' then 'composite'
              else case when v_tipo in ('composite', 'preparation') then v_tipo else 'composite' end
            end;
  if v_tipo = 'preparation' and not coalesce(v_track, false) then
    raise exception 'receta_al_producir_sin_inventario' using errcode = '22023';
  end if;
  v_r := public.fn_receta_int_guardar_version(p_organization_id, p_product_id, p_receta);
  update public.products set is_composite = true, production_type = v_tipo, updated_at = now()
   where id = p_product_id and (not coalesce(is_composite, false) or production_type is distinct from v_tipo);
  return v_r;
end;
$$;

revoke all on function public.fn_receta_guardar(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_receta_guardar(integer, integer, jsonb) to authenticated, service_role;

-- ── Lectura para el formulario (editar y duplicar) ──────────────────────────
create or replace function public.fn_producto_recetas_para_formulario(p_organization_id integer, p_product_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not exists (select 1 from public.products where id = p_product_id and organization_id = p_organization_id) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(r.id order by r.product_id), '{}') into v_ids
    from public.product_recipes r
   where r.is_active and r.organization_id = p_organization_id
     and (r.product_id = p_product_id
          or r.product_id in (select c.id from public.products c
                               where c.parent_product_id = p_product_id and c.status <> 'deleted'));
  return jsonb_build_object(
    'recetas', coalesce((select jsonb_agg(public.fn_receta_int_a_jsonb(i) order by o) from unnest(v_ids) with ordinality u(i, o)), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(distinct jsonb_build_object('id', p.id, 'name', p.name, 'sku', p.sku,
               'unit_code', btrim(coalesce(p.unit_code, 'UN')), 'track_stock', coalesce(p.track_stock, false)))
        from public.recipe_ingredients ri join public.products p on p.id = ri.ingredient_product_id
       where ri.recipe_id = any(v_ids)), '[]'::jsonb),
    'ordenes_abiertas', (select count(*) from public.production_orders po
                          where po.organization_id = p_organization_id and po.recipe_id = any(v_ids)
                            and po.status in ('draft', 'confirmed', 'in_progress')));
end;
$$;

revoke all on function public.fn_producto_recetas_para_formulario(integer, integer) from public, anon;
grant execute on function public.fn_producto_recetas_para_formulario(integer, integer) to authenticated, service_role;

-- ── Costo: el mismo cálculo que la venta ────────────────────────────────────
-- p_receta: un borrador ({yield_qty, ingredientes:[…]}) o {"recipe_id": n}.
-- Costo unitario del ingrediente: promedio de la sucursal → costo vigente (product_costs) → sin costo.
-- Se calcula sobre la unidad del ingrediente (el empaque: KG, LT, PAQ) y luego se
-- multiplica por la cantidad convertida; así un costo por gramo no se redondea a
-- 0,00 aunque avg_cost sea numeric(12,2) (riesgo del §7, sin cambiar tipos).
-- Los opcionales no suman a la tanda (al vender no se descuentan, decisión 6).
-- Sin inventory.costs.view: mismas líneas y avisos de conversión, importes en null.
create or replace function public.fn_receta_costo(p_organization_id integer, p_branch_id integer, p_receta jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec jsonb := p_receta;
  v_ver boolean;
  v_rinde numeric;
  v_lineas jsonb;
  v_tanda numeric;
  v_sin integer;
  v_err integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_branch_id is not null and not exists (
       select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if p_receta ? 'recipe_id' then
    v_rec := public.fn_receta_int_a_jsonb(nullif(p_receta->>'recipe_id', '')::integer);
    if v_rec is null or (v_rec->>'organization_id')::integer <> p_organization_id then
      raise exception 'receta_no_encontrada' using errcode = 'P0002';
    end if;
  end if;
  v_ver := public.fn_receta_int_puede_ver_costos(p_organization_id);
  v_rinde := coalesce(nullif(nullif(v_rec->>'yield_qty', '')::numeric, 0), 1);

  with l as (
    select c.*,
           (select sl.avg_cost from public.stock_levels sl
             where sl.product_id = c.ingredient_product_id and sl.branch_id = p_branch_id and sl.lot_id is null
             limit 1) as promedio,
           (select pc.cost from public.product_costs pc
             where pc.product_id = c.ingredient_product_id and pc.effective_from <= now()
               and (pc.effective_to is null or pc.effective_to > now())
             order by pc.effective_from desc, pc.id desc limit 1) as vigente,
           (select sum(sl.qty_on_hand) from public.stock_levels sl
             where sl.product_id = c.ingredient_product_id and sl.branch_id = p_branch_id) as existencia
      from public.fn_receta_int_calcular(p_organization_id, v_rec, v_rinde) c
  ), k as (
    select l.*,
           case when coalesce(l.promedio, 0) > 0 then l.promedio
                when coalesce(l.vigente, 0) > 0 then l.vigente end as costo_unitario,
           case when coalesce(l.promedio, 0) > 0 then 'promedio_sucursal'
                when coalesce(l.vigente, 0) > 0 then 'costo_vigente'
                else 'sin_costo' end as fuente
      from l
  ), m as (
    select k.*, case when k.costo_unitario is not null and k.factor is not null then k.cantidad * k.costo_unitario end as costo_linea
      from k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'orden', m.orden,
           'ingredient_product_id', m.ingredient_product_id,
           'nombre', m.nombre,
           'sku', m.sku,
           'track_stock', m.track_stock,
           'unidad_receta', m.unidad_receta,
           'unidad_ingrediente', m.unidad_ingrediente,
           'cantidad_neta', round(m.cantidad_neta, 6),
           'merma_pct', m.merma_pct,
           'cantidad_bruta', round(m.cantidad_bruta, 6),
           'factor', m.factor,
           'cantidad', round(m.cantidad, 6),
           'opcional', m.opcional,
           'existencia', m.existencia,
           'fuente', m.fuente,
           'costo_unitario', case when v_ver then m.costo_unitario end,
           'costo_linea', case when v_ver then round(m.costo_linea, 4) end,
           'error', m.error) order by m.orden), '[]'::jsonb),
         sum(m.costo_linea) filter (where not m.opcional),
         count(*) filter (where not m.opcional and m.costo_unitario is null and m.error is null),
         count(*) filter (where m.error is not null)
    into v_lineas, v_tanda, v_sin, v_err
    from m;

  return jsonb_build_object(
    'permitido', v_ver,
    'rinde', v_rinde,
    'unidad_rinde', nullif(upper(btrim(coalesce(v_rec->>'yield_unit_code', ''))), ''),
    'costo_tanda', case when v_ver then round(coalesce(v_tanda, 0), 4) end,
    'costo_unidad', case when v_ver then round(coalesce(v_tanda, 0) / v_rinde, 4) end,
    'completo', coalesce(v_sin, 0) = 0 and coalesce(v_err, 0) = 0,
    'lineas_sin_costo', coalesce(v_sin, 0),
    'lineas_con_error', coalesce(v_err, 0),
    'lineas', v_lineas);
end;
$$;

revoke all on function public.fn_receta_costo(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_receta_costo(integer, integer, jsonb) to authenticated, service_role;

-- ── Necesidades: aviso previo del POS (una llamada por carrito) ─────────────
-- p_items: [{product_id, quantity}]. Devuelve por ingrediente con inventario: necesario, disponible
-- (existencia de la sucursal, todos los lotes) y faltante. Conversiones faltantes: en «error», sin bloquear.
create or replace function public.fn_receta_necesidades(p_organization_id integer, p_branch_id integer, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'product_id', x.product_id, 'nombre', x.nombre, 'unidad', x.unidad,
             'necesario', round(x.necesario, 6), 'disponible', x.disponible,
             'faltante', round(greatest(x.necesario - x.disponible, 0), 6), 'error', x.error)
           order by x.nombre)
      from (
        select e.product_id, max(e.nombre) as nombre, max(e.unidad) as unidad, sum(e.qty) as necesario,
               max(e.error) as error,
               coalesce((select sum(sl.qty_on_hand) from public.stock_levels sl
                          where sl.product_id = e.product_id and sl.branch_id = p_branch_id), 0) as disponible
          from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
          join public.products pp on pp.id = nullif(i->>'product_id', '')::integer and pp.organization_id = p_organization_id
         cross join lateral public.fn_receta_int_expandir(p_organization_id, pp.id, nullif(i->>'quantity', '')::numeric, false) e
         where coalesce(nullif(i->>'quantity', '')::numeric, 0) > 0
           and e.es_ingrediente and e.track_stock
         group by e.product_id
      ) x), '[]'::jsonb);
end;
$$;

revoke all on function public.fn_receta_necesidades(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_receta_necesidades(integer, integer, jsonb) to authenticated, service_role;

-- ── Reservas de pedidos web ─────────────────────────────────────────────────
create or replace function public.fn_receta_expandir(p_product_id integer, p_qty numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
begin
  select organization_id into v_org from public.products where id = p_product_id;
  if v_org is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  return coalesce((
    select jsonb_agg(jsonb_build_object('product_id', e.product_id, 'quantity', round(e.qty, 6),
             'track_stock', e.track_stock, 'es_ingrediente', e.es_ingrediente))
      from public.fn_receta_int_expandir(v_org, p_product_id, p_qty, false) e), '[]'::jsonb);
end;
$$;

revoke all on function public.fn_receta_expandir(integer, numeric) from public, anon;
grant execute on function public.fn_receta_expandir(integer, numeric) to authenticated, service_role;

-- ── B5. fn_producto_guardar con recetas e idempotencia ──────────────────────
-- Cuerpo anterior íntegro (20260924110000_producto_formulario_transaccional.sql, verificado contra
-- pg_get_functiondef el 2026-09-28) más: idempotencia justo después del permiso, «clave» en v_vars,
-- bloque de recetas después de las variantes y «recetas» en el resultado.
create or replace function public.fn_producto_guardar(p_organization_id integer, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_modo text := coalesce(p_payload->>'modo', 'crear');
  v_pr jsonb := coalesce(p_payload->'producto', '{}'::jsonb);
  v_id integer;
  v_uuid uuid;
  v_sku text := btrim(coalesce(v_pr->>'sku', ''));
  v_name text := btrim(coalesce(v_pr->>'name', ''));
  v_tiene_var boolean := coalesce((p_payload->>'tiene_variantes')::boolean, false);
  v_track boolean;
  v_x jsonb;
  v_ids integer[];
  v_gid integer;
  v_quitadas jsonb := '[]'::jsonb;
  v_vars jsonb := '[]'::jsonb;
  v_vid integer;
  v_i integer;
  v_pref integer;
  v_costo numeric := nullif(p_payload->'costo'->>'cost', '')::numeric;
  v_precio numeric := nullif(p_payload->'precio'->>'price', '')::numeric;
  v_comp numeric := nullif(p_payload->'precio'->>'compare_price', '')::numeric;
  -- Idempotencia y recetas
  v_clave uuid := nullif(p_payload->>'clave_idempotencia', '')::uuid;
  v_prev jsonb;
  v_res jsonb;
  v_rc jsonb;
  v_rec jsonb;
  v_dest integer;
  v_rr jsonb;
  v_recetas jsonb := '[]'::jsonb;
  v_listadas integer[] := '{}';
  v_tipo_rec text;
begin
  if v_modo not in ('crear', 'editar', 'duplicar') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if v_modo = 'editar' then
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.edit', 'product_management', 'inventory_management']);
  else
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.create', 'product_management', 'inventory_management']);
  end if;

  -- Idempotencia: un reintento con la misma clave devuelve lo ya guardado (antes de
  -- validar: el reintento de un «crear» que sí se guardó chocaría con sku_duplicado).
  -- Un segundo envío simultáneo espera en el INSERT a que el primero termine.
  if v_clave is not null then
    delete from public.product_save_requests
     where organization_id = p_organization_id and created_at < now() - interval '30 days';
    insert into public.product_save_requests (organization_id, clave, user_id)
    values (p_organization_id, v_clave, auth.uid())
    on conflict (organization_id, clave) do nothing;
    if not found then
      select resultado into v_prev from public.product_save_requests
       where organization_id = p_organization_id and clave = v_clave;
      if v_prev is not null then
        return v_prev || jsonb_build_object('repetido', true);
      end if;
      raise exception 'guardado_en_curso' using errcode = '55P03';
    end if;
  end if;

  -- Validación (los códigos los traduce la interfaz y marcan el campo).
  if v_sku = '' then
    raise exception 'sku_requerido' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'nombre_corto' using errcode = '22023';
  end if;
  if v_precio is not null and v_precio < 0 then
    raise exception 'precio_negativo' using errcode = '22023';
  end if;
  if v_costo is not null and v_costo < 0 then
    raise exception 'costo_negativo' using errcode = '22023';
  end if;
  if v_comp is not null and v_comp > 0 and v_precio is not null and v_comp <= v_precio then
    raise exception 'comparacion_menor' using errcode = '22023';
  end if;
  if coalesce(v_pr->>'status', 'active') not in ('active', 'inactive', 'discontinued') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  if coalesce(v_pr->>'product_type', 'product') not in ('product', 'service') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if nullif(v_pr->>'station', '') is not null and v_pr->>'station' not in ('hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all') then
    raise exception 'estacion_invalida' using errcode = '22023';
  end if;
  if nullif(v_pr->>'category_id', '') is not null and not exists (
       select 1 from public.categories where id = (v_pr->>'category_id')::int and organization_id = p_organization_id) then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_payload->'categorias_adicionales', '[]'::jsonb)) c
              where not exists (select 1 from public.categories where id = c::int and organization_id = p_organization_id)) then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_payload->'impuestos', '[]'::jsonb)) t
              where not exists (select 1 from public.organization_taxes where id = t::uuid and organization_id = p_organization_id)) then
    raise exception 'impuesto_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_payload->'etiquetas', '[]'::jsonb)) t
              where not exists (select 1 from public.product_tags where id = t::int and organization_id = p_organization_id)) then
    raise exception 'etiqueta_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_payload->'proveedores', '[]'::jsonb)) s
              where not exists (select 1 from public.suppliers where id = (s->>'supplier_id')::int and organization_id = p_organization_id)) then
    raise exception 'proveedor_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.products where organization_id = p_organization_id and sku = v_sku
              and (v_modo <> 'editar' or id <> (p_payload->>'product_id')::int)) then
    raise exception 'sku_duplicado' using errcode = '23505', detail = v_sku;
  end if;
  -- SKU repetidos dentro de las variantes del mismo guardado.
  if exists (select btrim(v->>'sku') from jsonb_array_elements(coalesce(p_payload->'variantes', '[]'::jsonb)) v
              group by 1 having count(*) > 1 or btrim(v->>'sku') = v_sku) then
    raise exception 'sku_variante_repetido' using errcode = '23505';
  end if;

  v_track := coalesce((v_pr->>'track_stock')::boolean, true) and coalesce(v_pr->>'product_type', 'product') <> 'service';

  if v_modo = 'editar' then
    v_id := (p_payload->>'product_id')::int;
    perform 1 from public.products where id = v_id and organization_id = p_organization_id and parent_product_id is null for update;
    if not found then
      raise exception 'producto_no_encontrado' using errcode = 'P0002';
    end if;
    if not v_tiene_var and exists (select 1 from public.products where parent_product_id = v_id and status <> 'deleted') then
      raise exception 'variantes_activas' using errcode = '22023';
    end if;
    update public.products set
      sku = v_sku, name = v_name,
      barcode = nullif(btrim(coalesce(v_pr->>'barcode', '')), ''),
      description = nullif(v_pr->>'description', ''),
      category_id = nullif(v_pr->>'category_id', '')::int,
      unit_code = coalesce(nullif(v_pr->>'unit_code', ''), unit_code),
      station = nullif(v_pr->>'station', ''),
      product_type = coalesce(nullif(v_pr->>'product_type', ''), 'product'),
      status = coalesce(nullif(v_pr->>'status', ''), status),
      brand = nullif(btrim(coalesce(v_pr->>'brand', '')), ''),
      reference = nullif(btrim(coalesce(v_pr->>'reference', '')), ''),
      track_stock = v_track,
      track_serial = coalesce((v_pr->>'track_serial')::boolean, false),
      serial_pattern = nullif(btrim(coalesce(v_pr->>'serial_pattern', '')), ''),
      auto_generate_serial = coalesce((v_pr->>'auto_generate_serial')::boolean, false),
      warranty_months = nullif(v_pr->>'warranty_months', '')::int,
      weight_kg = nullif(v_pr->>'weight_kg', '')::numeric,
      length_cm = nullif(v_pr->>'length_cm', '')::numeric,
      width_cm = nullif(v_pr->>'width_cm', '')::numeric,
      height_cm = nullif(v_pr->>'height_cm', '')::numeric,
      is_composite = coalesce((v_pr->>'is_composite')::boolean, is_composite),
      is_parent = v_tiene_var,
      updated_at = now()
     where id = v_id
    returning uuid into v_uuid;
    -- Las variantes heredan el seguimiento de inventario y de seriales.
    update public.products set track_stock = v_track,
           track_serial = coalesce((v_pr->>'track_serial')::boolean, false),
           warranty_months = nullif(v_pr->>'warranty_months', '')::int, updated_at = now()
     where parent_product_id = v_id;
  else
    insert into public.products (
      organization_id, sku, name, barcode, description, category_id, unit_code, station, product_type,
      status, brand, reference, track_stock, track_serial, serial_pattern, auto_generate_serial,
      warranty_months, weight_kg, length_cm, width_cm, height_cm, is_composite, is_parent)
    values (
      p_organization_id, v_sku, v_name, nullif(btrim(coalesce(v_pr->>'barcode', '')), ''), nullif(v_pr->>'description', ''),
      nullif(v_pr->>'category_id', '')::int, coalesce(nullif(v_pr->>'unit_code', ''), 'UN'), nullif(v_pr->>'station', ''),
      coalesce(nullif(v_pr->>'product_type', ''), 'product'), coalesce(nullif(v_pr->>'status', ''), 'active'),
      nullif(btrim(coalesce(v_pr->>'brand', '')), ''), nullif(btrim(coalesce(v_pr->>'reference', '')), ''), v_track,
      coalesce((v_pr->>'track_serial')::boolean, false), nullif(btrim(coalesce(v_pr->>'serial_pattern', '')), ''),
      coalesce((v_pr->>'auto_generate_serial')::boolean, false), nullif(v_pr->>'warranty_months', '')::int,
      nullif(v_pr->>'weight_kg', '')::numeric, nullif(v_pr->>'length_cm', '')::numeric,
      nullif(v_pr->>'width_cm', '')::numeric, nullif(v_pr->>'height_cm', '')::numeric,
      coalesce((v_pr->>'is_composite')::boolean, false), v_tiene_var)
    returning id, uuid into v_id, v_uuid;
  end if;

  -- Precio y costo (con vigencia; en crear, precio 0 se omite como antes).
  if p_payload ? 'precio' and v_precio is not null and (v_modo = 'editar' or v_precio > 0) then
    perform public.fn_producto_int_fijar_precio(v_id, v_precio, v_comp, nullif(p_payload->'precio'->>'desde', '')::timestamptz);
  end if;
  if p_payload ? 'costo' and v_costo is not null and (v_modo = 'editar' or v_costo > 0) then
    select (s->>'supplier_id')::int into v_pref
      from jsonb_array_elements(coalesce(p_payload->'proveedores', '[]'::jsonb)) s
     where coalesce((s->>'is_preferred')::boolean, false) limit 1;
    perform public.fn_producto_int_fijar_costo(v_id, v_costo, nullif(p_payload->'costo'->>'desde', '')::timestamptz, v_pref);
  end if;

  -- Impuestos (N por producto) y propagación a las variantes.
  if p_payload ? 'impuestos' then
    select coalesce(array_agg(c.id), '{}') into v_ids from public.products c where c.parent_product_id = v_id;
    delete from public.product_tax_relations where product_id = v_id or product_id = any(v_ids);
    insert into public.product_tax_relations (product_id, tax_id)
    select pid, t::uuid
      from unnest(array[v_id] || v_ids) pid
     cross join jsonb_array_elements_text(p_payload->'impuestos') t
    on conflict do nothing;
  end if;

  -- Categorías adicionales (las asignadas por regla no se tocan).
  if p_payload ? 'categorias_adicionales' then
    delete from public.product_category_relations
     where product_id = v_id and not assigned_by_rule
       and category_id not in (select c::int from jsonb_array_elements_text(p_payload->'categorias_adicionales') c);
    insert into public.product_category_relations (product_id, category_id, organization_id, assigned_by_rule)
    select v_id, c::int, p_organization_id, false
      from jsonb_array_elements_text(p_payload->'categorias_adicionales') c
     where c::int is distinct from nullif(v_pr->>'category_id', '')::int
       and not exists (select 1 from public.product_category_relations r where r.product_id = v_id and r.category_id = c::int);
  end if;

  -- Etiquetas (conjunto completo).
  if p_payload ? 'etiquetas' then
    delete from public.product_tag_relations
     where product_id = v_id and tag_id not in (select t::int from jsonb_array_elements_text(p_payload->'etiquetas') t);
    insert into public.product_tag_relations (product_id, tag_id)
    select v_id, t::int from jsonb_array_elements_text(p_payload->'etiquetas') t
     where not exists (select 1 from public.product_tag_relations r where r.product_id = v_id and r.tag_id = t::int);
  end if;

  -- Proveedores: se fusionan (los que no vienen se quedan) y el preferido es uno.
  if p_payload ? 'proveedores' then
    if exists (select 1 from jsonb_array_elements(p_payload->'proveedores') s where coalesce((s->>'is_preferred')::boolean, false)) then
      update public.product_suppliers set is_preferred = false, updated_at = now() where product_id = v_id and is_preferred;
    end if;
    for v_x in select * from jsonb_array_elements(p_payload->'proveedores') loop
      insert into public.product_suppliers (product_id, supplier_id, cost, lead_time_days, min_order_qty, supplier_sku, notes, is_preferred)
      values (v_id, (v_x->>'supplier_id')::int, coalesce(nullif(v_x->>'cost', '')::numeric, v_costo, 0),
              coalesce(nullif(v_x->>'lead_time_days', '')::int, 0), coalesce(nullif(v_x->>'min_order_qty', '')::numeric, 1),
              nullif(btrim(coalesce(v_x->>'supplier_sku', '')), ''), nullif(btrim(coalesce(v_x->>'notes', '')), ''),
              coalesce((v_x->>'is_preferred')::boolean, false))
      on conflict (product_id, supplier_id) do update set
        cost = excluded.cost,
        lead_time_days = case when v_x ? 'lead_time_days' then excluded.lead_time_days else product_suppliers.lead_time_days end,
        min_order_qty = case when v_x ? 'min_order_qty' then excluded.min_order_qty else product_suppliers.min_order_qty end,
        supplier_sku = case when v_x ? 'supplier_sku' then excluded.supplier_sku else product_suppliers.supplier_sku end,
        notes = case when v_x ? 'notes' then excluded.notes else product_suppliers.notes end,
        is_preferred = excluded.is_preferred,
        updated_at = now();
    end loop;
    if coalesce(p_payload->>'proveedores_quitar_preferido', 'false')::boolean then
      update public.product_suppliers set is_preferred = false, updated_at = now() where product_id = v_id and is_preferred;
    end if;
  end if;

  -- Stock: crear/duplicar = entradas por kardex; editar = solo mínimos y filas faltantes.
  if v_track and not v_tiene_var then
    if v_modo = 'editar' then
      perform public.fn_producto_int_stock_inicial(p_organization_id, v_id,
        (select coalesce(jsonb_agg(s - 'qty'), '[]'::jsonb) from jsonb_array_elements(coalesce(p_payload->'stock', '[]'::jsonb)) s), null);
    else
      perform public.fn_producto_int_stock_inicial(p_organization_id, v_id,
        (select coalesce(jsonb_agg(case when s ? 'unit_cost' and coalesce((s->>'unit_cost')::numeric, 0) > 0 then s
                                        else s || jsonb_build_object('unit_cost', coalesce(v_costo, 0)) end), '[]'::jsonb)
           from jsonb_array_elements(coalesce(p_payload->'stock', '[]'::jsonb)) s), 'Stock inicial');
    end if;
  end if;

  -- Variantes: crear o actualizar; las que ya no vienen pasan a baja lógica.
  -- «clave» (VarianteForm.clave) vuelve en el resultado: con ella se ubica la receta de cada variante.
  if v_tiene_var then
    for v_x in select * from jsonb_array_elements(coalesce(p_payload->'variantes', '[]'::jsonb)) loop
      if v_modo <> 'editar' then
        v_x := v_x - 'id';
      end if;
      -- En editar, la cantidad de una variante existente no se toca aquí (va por ajuste).
      if nullif(v_x->>'id', '') is not null then
        v_x := jsonb_set(v_x, '{stock}', (select coalesce(jsonb_agg(s - 'qty'), '[]'::jsonb)
                                            from jsonb_array_elements(coalesce(v_x->'stock', '[]'::jsonb)) s));
      end if;
      v_vid := public.fn_producto_int_variante_guardar(p_organization_id, v_id, v_x, false);
      v_vars := v_vars || jsonb_build_object('id', v_vid, 'sku', btrim(coalesce(v_x->>'sku', '')),
                                             'clave', nullif(v_x->>'clave', ''));
    end loop;
    if v_modo = 'editar' then
      update public.products set status = 'deleted', updated_at = now()
       where parent_product_id = v_id and status <> 'deleted'
         and id not in (select (x->>'id')::int from jsonb_array_elements(v_vars) x);
    end if;
  end if;

  -- Recetas (§2.3 paso 4 y 5). Sin la clave «receta» no se tocan.
  if jsonb_typeof(p_payload->'receta') = 'object' then
    v_rc := p_payload->'receta';
    if not coalesce((v_rc->>'activa')::boolean, false) then
      -- Apagada: se desactivan (no se borran; se recuperan desde Versiones).
      update public.product_recipes set is_active = false, updated_at = now()
       where is_active
         and (product_id = v_id or product_id in (select c.id from public.products c where c.parent_product_id = v_id));
      update public.products set is_composite = false, production_type = 'simple', updated_at = now()
       where (id = v_id or parent_product_id = v_id)
         and (coalesce(is_composite, false) or production_type is distinct from 'simple');
    else
      v_tipo_rec := case when v_rc->>'modo' = 'al_producir' then 'preparation' else 'composite' end;
      if v_tipo_rec = 'preparation' and not v_track then
        raise exception 'receta_al_producir_sin_inventario' using errcode = '22023';
      end if;
      if jsonb_typeof(v_rc->'recetas') is distinct from 'array' or jsonb_array_length(v_rc->'recetas') = 0 then
        raise exception 'receta_sin_ingredientes' using errcode = '22023';
      end if;
      for v_rec in select * from jsonb_array_elements(v_rc->'recetas') loop
        v_dest := null;
        if v_rec->>'destino' = 'producto' then
          v_dest := v_id;
        elsif jsonb_typeof(v_rec->'destino') = 'object' then
          select (x->>'id')::int into v_dest
            from jsonb_array_elements(v_vars) x
           where x->>'clave' = v_rec->'destino'->>'variante'
           limit 1;
        end if;
        if v_dest is null then
          raise exception 'receta_variante_desconocida' using errcode = '22023',
            detail = coalesce(v_rec->'destino'->>'variante', v_rec->>'destino', '');
        end if;
        if v_dest = any(v_listadas) then
          raise exception 'receta_destino_repetido' using errcode = '22023', detail = v_dest::text;
        end if;
        v_listadas := v_listadas || v_dest;
        v_rr := public.fn_receta_int_guardar_version(p_organization_id, v_dest, v_rec);
        v_recetas := v_recetas || jsonb_build_object('destino', v_rec->'destino', 'product_id', v_dest,
          'recipe_id', v_rr->'recipe_id', 'version', v_rr->'version', 'cambio', v_rr->'cambio');
      end loop;
      -- Lo que no vino: la variante usa la compartida; el producto no tiene compartida.
      update public.product_recipes set is_active = false, updated_at = now()
       where is_active and not (product_id = any(v_listadas))
         and (product_id = v_id or product_id in (select c.id from public.products c where c.parent_product_id = v_id));
      update public.products set is_composite = true, production_type = v_tipo_rec, updated_at = now()
       where (id = v_id or (parent_product_id = v_id and status <> 'deleted'))
         and (not coalesce(is_composite, false) or production_type is distinct from v_tipo_rec);
    end if;
  end if;

  -- Modificadores (lista completa cuando viene).
  if p_payload ? 'modificadores' and jsonb_typeof(p_payload->'modificadores') = 'array' then
    select coalesce(array_agg((g->>'id')::int), '{}') into v_ids
      from jsonb_array_elements(p_payload->'modificadores') g
     where v_modo = 'editar' and nullif(g->>'id', '') is not null;
    delete from public.product_modifier_groups where product_id = v_id and not (id = any(v_ids));
    v_i := 0;
    for v_x in select * from jsonb_array_elements(p_payload->'modificadores') loop
      if btrim(coalesce(v_x->>'name', '')) = '' then
        raise exception 'grupo_sin_nombre' using errcode = '22023';
      end if;
      if coalesce(v_x->>'selection_mode', 'multiple') not in ('single', 'multiple') then
        raise exception 'modo_seleccion_invalido' using errcode = '22023';
      end if;
      if nullif(v_x->>'max_selections', '') is not null
         and (v_x->>'max_selections')::int < coalesce(nullif(v_x->>'min_selections', '')::int, 0) then
        raise exception 'min_max_invalido' using errcode = '22023';
      end if;
      v_gid := case when v_modo = 'editar' then nullif(v_x->>'id', '')::int end;
      if v_gid is not null and exists (select 1 from public.product_modifier_groups where id = v_gid and product_id = v_id) then
        update public.product_modifier_groups set
          name = btrim(v_x->>'name'), selection_mode = coalesce(v_x->>'selection_mode', 'multiple'),
          min_selections = coalesce(nullif(v_x->>'min_selections', '')::int, 0),
          max_selections = nullif(v_x->>'max_selections', '')::int,
          required = coalesce((v_x->>'required')::boolean, false), display_order = v_i, updated_at = now()
         where id = v_gid;
      else
        insert into public.product_modifier_groups (organization_id, product_id, name, selection_mode, min_selections,
          max_selections, required, display_order)
        values (p_organization_id, v_id, btrim(v_x->>'name'), coalesce(v_x->>'selection_mode', 'multiple'),
          coalesce(nullif(v_x->>'min_selections', '')::int, 0), nullif(v_x->>'max_selections', '')::int,
          coalesce((v_x->>'required')::boolean, false), v_i)
        returning id into v_gid;
      end if;
      delete from public.product_modifiers
       where group_id = v_gid
         and id not in (select (o->>'id')::int from jsonb_array_elements(coalesce(v_x->'opciones', '[]'::jsonb)) o
                         where v_modo = 'editar' and nullif(o->>'id', '') is not null);
      insert into public.product_modifiers (group_id, name, extra_price, is_active, display_order)
      select v_gid, btrim(o.value->>'name'), coalesce(nullif(o.value->>'extra_price', '')::numeric, 0),
             coalesce((o.value->>'is_active')::boolean, true), (o.ordinality - 1)::int
        from jsonb_array_elements(coalesce(v_x->'opciones', '[]'::jsonb)) with ordinality o
       where btrim(coalesce(o.value->>'name', '')) <> ''
         and (v_modo <> 'editar' or nullif(o.value->>'id', '') is null
              or not exists (select 1 from public.product_modifiers pm where pm.id = (o.value->>'id')::int and pm.group_id = v_gid));
      update public.product_modifiers pm set
        name = btrim(o.value->>'name'), extra_price = coalesce(nullif(o.value->>'extra_price', '')::numeric, 0),
        is_active = coalesce((o.value->>'is_active')::boolean, true), display_order = (o.ordinality - 1)::int, updated_at = now()
        from jsonb_array_elements(coalesce(v_x->'opciones', '[]'::jsonb)) with ordinality o
       where v_modo = 'editar' and pm.group_id = v_gid and nullif(o.value->>'id', '') is not null
         and pm.id = (o.value->>'id')::int;
      v_i := v_i + 1;
    end loop;
  end if;

  -- Imágenes (lista completa y ordenada cuando viene). Se devuelven las rutas
  -- que quedan sin uso para que el navegador las borre del almacenamiento.
  if p_payload ? 'imagenes' and jsonb_typeof(p_payload->'imagenes') = 'array' then
    select coalesce(array_agg(pi.id), '{}') into v_ids
      from public.product_images pi
     where pi.product_id = v_id
       and pi.id not in (select (i->>'id')::int from jsonb_array_elements(p_payload->'imagenes') i
                          where v_modo = 'editar' and nullif(i->>'id', '') is not null);
    -- Rutas que nadie más usa (ni otra fila ni la biblioteca compartida).
    select coalesce(jsonb_agg(distinct pi.storage_path), '[]'::jsonb) into v_quitadas
      from public.product_images pi
     where pi.id = any(v_ids) and pi.shared_image_id is null
       and not exists (select 1 from public.product_images o
                        where o.storage_path = pi.storage_path and not (o.id = any(v_ids)))
       and not exists (select 1 from jsonb_array_elements(p_payload->'imagenes') i
                        where i->>'storage_path' = pi.storage_path);
    delete from public.product_images where id = any(v_ids);
    update public.product_images set display_order = -1000000 - id where product_id = v_id;
    v_i := 0;
    for v_x in select * from jsonb_array_elements(p_payload->'imagenes') loop
      if v_modo = 'editar' and nullif(v_x->>'id', '') is not null
         and exists (select 1 from public.product_images where id = (v_x->>'id')::int and product_id = v_id) then
        update public.product_images set display_order = v_i,
               is_primary = coalesce((v_x->>'is_primary')::boolean, false),
               alt_text = nullif(btrim(coalesce(v_x->>'alt_text', '')), ''), updated_at = now()
         where id = (v_x->>'id')::int;
      else
        if btrim(coalesce(v_x->>'storage_path', '')) = '' then
          raise exception 'imagen_sin_ruta' using errcode = '22023';
        end if;
        insert into public.product_images (product_id, storage_path, display_order, is_primary, alt_text, shared_image_id)
        values (v_id, v_x->>'storage_path', v_i, coalesce((v_x->>'is_primary')::boolean, false),
                nullif(btrim(coalesce(v_x->>'alt_text', '')), ''), nullif(v_x->>'shared_image_id', '')::int);
      end if;
      v_i := v_i + 1;
    end loop;
    -- Una sola principal: si no hay, la primera.
    if not exists (select 1 from public.product_images where product_id = v_id and is_primary) then
      update public.product_images set is_primary = true
       where id = (select id from public.product_images where product_id = v_id order by display_order limit 1);
    end if;
  end if;

  -- Nota interna.
  if nullif(btrim(coalesce(p_payload->>'nota', '')), '') is not null and auth.uid() is not null then
    insert into public.product_notes (product_id, user_id, content, organization_id)
    values (v_id, auth.uid(), p_payload->>'nota', p_organization_id);
  end if;

  v_res := jsonb_build_object(
    'id', v_id, 'uuid', v_uuid, 'sku', v_sku, 'name', v_name,
    'price', coalesce(v_precio, 0), 'cost', coalesce(v_costo, 0),
    'variantes', v_vars, 'imagenes_quitadas', v_quitadas, 'recetas', v_recetas);

  if v_clave is not null then
    -- Un reintento no debe volver a pedir que se borren imágenes ya borradas.
    update public.product_save_requests
       set resultado = v_res || jsonb_build_object('imagenes_quitadas', '[]'::jsonb), product_id = v_id
     where organization_id = p_organization_id and clave = v_clave;
  end if;
  return v_res;
end;
$function$;

revoke all on function public.fn_producto_guardar(integer, jsonb) from public, anon;
grant execute on function public.fn_producto_guardar(integer, jsonb) to authenticated, service_role;
