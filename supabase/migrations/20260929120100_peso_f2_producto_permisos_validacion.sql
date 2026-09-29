-- Productos por peso, fase 2 (docs/design/PRODUCTOS-POR-PESO-BASCULA.md, M2 + M5 + M6).
--
-- 1. «Cómo se vende» en el producto (M2): sale_mode unit | weight | measure y
--    sus datos (decimales de la cantidad, presentación del precio «cada 100 g»,
--    venta mínima, tara, exigir báscula, PLU de balanza para la fase 4).
--    Columnas con DEFAULT constante: Postgres 15 no reescribe la tabla
--    (70.319 productos, todos quedan 'unit' como hoy).
-- 2. Permisos (M5): pos.peso_manual («Pesar a mano en el POS») y
--    pos.basculas.configurar (fase 3). Se conceden a Admin de organización (2)
--    y Manager (5); Empleado (4) no pesa a mano salvo que se le conceda.
--    Regla de la organización en organization_settings key 'pos_pesaje'
--    ({"manual": "no" | "permiso"}); sin fila: 'permiso'.
-- 3. Validación en el servidor (M6): fn_pos_validar_pesaje, que
--    fn_pos_validar_linea_venta llama para cada línea de una venta NUEVA
--    (parche sobre la definición VIVA, una sola aparición). Productos 'unit':
--    sin cambios. Por peso o medida: la cantidad no trae más decimales que el
--    producto y no baja del mínimo. Por peso: el origen del peso
--    (notes.pesaje.origen) es manual y está permitido — la lectura de báscula
--    (fase 3) y la etiqueta (fase 4) todavía no existen y se rechazan.
-- 4. pos_pesaje_contexto(org): lo que el POS necesita saber (regla y si la
--    persona puede pesar a mano), resuelto en el servidor.

-- ── 1. Columnas del producto ────────────────────────────────────────────────
alter table public.products
  add column if not exists sale_mode text not null default 'unit',
  add column if not exists qty_decimals smallint not null default 0,
  add column if not exists price_ref_qty numeric(12,3),
  add column if not exists price_ref_unit_code character(4) references public.units(code),
  add column if not exists min_sale_qty numeric(12,3),
  add column if not exists default_tare_qty numeric(12,3),
  add column if not exists tare_required boolean not null default false,
  add column if not exists require_scale boolean not null default false,
  add column if not exists scale_plu integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_sale_mode_check') then
    alter table public.products add constraint products_sale_mode_check
      check (sale_mode in ('unit', 'weight', 'measure'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_qty_decimals_check') then
    alter table public.products add constraint products_qty_decimals_check
      check (qty_decimals between 0 and 3 and (sale_mode <> 'unit' or qty_decimals = 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_peso_valores_check') then
    alter table public.products add constraint products_peso_valores_check check (
      (min_sale_qty is null or min_sale_qty > 0)
      and (default_tare_qty is null or default_tare_qty >= 0)
      and (price_ref_qty is null or price_ref_qty > 0)
      and (scale_plu is null or scale_plu between 1 and 99999)
      and (sale_mode = 'weight' or (not require_scale and not tare_required)));
  end if;
end;
$$;

create unique index if not exists products_org_scale_plu_uq
  on public.products (organization_id, scale_plu) where scale_plu is not null;

comment on column public.products.sale_mode is
  'Cómo se vende: unit (cantidad entera), weight (kg o lb, con peso), measure (metro o litro con decimales).';
comment on column public.products.qty_decimals is
  'Decimales de la cantidad vendida (0 por unidad; 3 en kg = gramos; 2 por medida).';
comment on column public.products.price_ref_qty is
  'Presentación del precio («cada 100 g» = 100 + GR). El precio en product_prices es SIEMPRE por unit_code (por kg).';
comment on column public.products.price_ref_unit_code is
  'Unidad de price_ref_qty (GR o KG en productos por kg; LB en productos por libra).';
comment on column public.products.min_sale_qty is
  'Cantidad mínima de una línea de venta (en unit_code). Sin valor: cualquiera mayor que 0.';
comment on column public.products.default_tare_qty is
  'Tara predefinida (bandeja) en unit_code; la usa la báscula (fase 3).';
comment on column public.products.tare_required is
  'La pesada exige tara (fase 3).';
comment on column public.products.require_scale is
  'Exige báscula: el POS no deja escribir el peso a mano y el servidor rechaza el origen manual.';
comment on column public.products.scale_plu is
  'PLU de balanza etiquetadora (fase 4), único por organización.';

-- ── 2. Permisos ─────────────────────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select v.code, v.name, v.description, 'pos', 'pos'
  from (values
    ('pos.peso_manual', 'Pesar a mano en el POS', 'Escribir el peso de un producto por peso sin báscula'),
    ('pos.basculas.configurar', 'Configurar básculas', 'Básculas del POS y etiquetas de peso variable')
  ) v(code, name, description)
 where not exists (select 1 from public.permissions p where p.code = v.code);

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (2), (5)) as r(role_id)
 where p.code in ('pos.peso_manual', 'pos.basculas.configurar')
   and not exists (select 1 from public.role_permissions rp
                    where rp.role_id = r.role_id and rp.permission_id = p.id);

-- ── 3. Decimales efectivos de la cantidad ───────────────────────────────────
create or replace function public.fn_producto_decimales_cantidad(p_sale_mode text, p_qty_decimals smallint)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case coalesce(p_sale_mode, 'unit')
           when 'weight'  then coalesce(nullif(p_qty_decimals, 0), 3)
           when 'measure' then coalesce(nullif(p_qty_decimals, 0), 2)
           else 0 end
$$;

comment on function public.fn_producto_decimales_cantidad(text, smallint) is
  'Decimales de la cantidad según cómo se vende: unit 0; weight qty_decimals o 3; measure qty_decimals o 2. Misma regla que decimalesCantidad (src/lib/pos/peso/modoVenta.ts).';

revoke all on function public.fn_producto_decimales_cantidad(text, smallint) from public, anon;
grant execute on function public.fn_producto_decimales_cantidad(text, smallint) to authenticated, service_role;

-- ── 4. ¿Puede la persona pesar a mano? ──────────────────────────────────────
create or replace function public.fn_pos_puede_pesar_a_mano(p_org integer, p_actor uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_regla text;
begin
  if p_org is null or p_actor is null then
    return false;
  end if;
  select coalesce(nullif(s.settings->>'manual', ''), 'permiso') into v_regla
    from public.organization_settings s
   where s.organization_id = p_org and s.key = 'pos_pesaje'
   limit 1;
  if coalesce(v_regla, 'permiso') = 'no' then
    return false;
  end if;
  -- 'permiso' (y 'supervisor', mientras no exista la autorización de supervisor).
  return exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = p_actor)
      or public.check_user_permission(p_actor, p_org, 'pos.peso_manual');
end;
$$;

comment on function public.fn_pos_puede_pesar_a_mano(integer, uuid) is
  'Regla pos_pesaje de la organización (no | permiso; por defecto permiso) + permiso pos.peso_manual (o dueño). Interna: la usan fn_pos_validar_pesaje y pos_pesaje_contexto.';

revoke all on function public.fn_pos_puede_pesar_a_mano(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_pos_puede_pesar_a_mano(integer, uuid) to service_role;

-- ── 5. Validación de una línea por peso o medida ────────────────────────────
create or replace function public.fn_pos_validar_pesaje(p_org integer, p_actor uuid, p_item jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_product integer := nullif(p_item->>'product_id', '')::integer;
  v_qty     numeric := (p_item->>'quantity')::numeric;
  v_p       record;
  v_dec     integer;
  v_pesaje  jsonb;
  v_origen  text;
begin
  select p.name, p.sale_mode, p.qty_decimals, p.min_sale_qty, p.require_scale
    into v_p
    from public.products p
   where p.id = v_product and p.organization_id = p_org;
  if not found or coalesce(v_p.sale_mode, 'unit') = 'unit' then
    return;  -- por unidad: sin cambios
  end if;

  v_dec := public.fn_producto_decimales_cantidad(v_p.sale_mode, v_p.qty_decimals);
  if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, v_dec) then
    raise exception 'cantidad_decimales' using errcode = '22023',
      detail = format('«%s» (producto %s): la cantidad %s admite hasta %s decimales.', v_p.name, v_product, v_qty, v_dec);
  end if;
  if v_p.min_sale_qty is not null and v_qty < v_p.min_sale_qty then
    raise exception 'cantidad_bajo_minimo' using errcode = '22023',
      detail = format('«%s» (producto %s): %s es menos que el mínimo %s.', v_p.name, v_product, v_qty, v_p.min_sale_qty);
  end if;

  if v_p.sale_mode <> 'weight' then
    return;  -- por medida: cantidad escrita, sin origen de peso
  end if;

  v_pesaje := case when jsonb_typeof(p_item->'notes'->'pesaje') = 'object' then p_item->'notes'->'pesaje' else '{}'::jsonb end;
  v_origen := coalesce(nullif(v_pesaje->>'origen', ''), 'manual');
  if v_origen not in ('bascula', 'manual', 'etiqueta') then
    raise exception 'origen_peso_invalido' using errcode = '22023',
      detail = format('«%s» (producto %s): origen del peso «%s» desconocido.', v_p.name, v_product, v_origen);
  end if;
  if v_origen <> 'manual' then
    -- Fase 2: todavía no hay lectura de báscula (fase 3) ni etiquetas (fase 4).
    raise exception 'origen_peso_no_disponible' using errcode = '22023',
      detail = format('«%s» (producto %s): el peso por %s aún no está disponible.', v_p.name, v_product, v_origen);
  end if;
  if v_p.require_scale then
    raise exception 'peso_exige_bascula' using errcode = '22023',
      detail = format('«%s» (producto %s) exige báscula: no se vende con peso escrito a mano.', v_p.name, v_product);
  end if;
  if not public.fn_pos_puede_pesar_a_mano(p_org, p_actor) then
    raise exception 'sin_permiso_peso_manual' using errcode = '42501',
      detail = format('«%s» (producto %s): pesar a mano necesita el permiso «Pesar a mano en el POS».', v_p.name, v_product);
  end if;
end;
$$;

comment on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) is
  'Valida una línea de venta de un producto por peso o medida: decimales, mínimo y origen del peso (notes.pesaje). Productos por unidad: no hace nada. La llama fn_pos_validar_linea_venta.';

revoke all on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) to service_role;

-- ── 6. Contexto del POS ─────────────────────────────────────────────────────
create or replace function public.pos_pesaje_contexto(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_regla text;
begin
  perform public.fn_assert_acceso_org(p_org);
  select coalesce(nullif(s.settings->>'manual', ''), 'permiso') into v_regla
    from public.organization_settings s
   where s.organization_id = p_org and s.key = 'pos_pesaje'
   limit 1;
  return jsonb_build_object(
    'manual', coalesce(v_regla, 'permiso'),
    'puede_pesar_a_mano', case when v_uid is null then true else public.fn_pos_puede_pesar_a_mano(p_org, v_uid) end
  );
end;
$$;

comment on function public.pos_pesaje_contexto(integer) is
  'POS: regla de peso manual de la organización y si la persona en sesión puede pesar a mano (resuelto en el servidor).';

revoke all on function public.pos_pesaje_contexto(integer) from public, anon;
grant execute on function public.pos_pesaje_contexto(integer) to authenticated, service_role;

-- ── 7. Parche de fn_pos_validar_linea_venta (definición viva) ───────────────
do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_pos_validar_linea_venta(integer,uuid,jsonb,timestamp with time zone,jsonb)'::regprocedure);
  v_old text := $frag$      detail = format('El producto %s no es de la organización.', v_product);
  end if;
$frag$;
  v_new text := $frag$      detail = format('El producto %s no es de la organización.', v_product);
  end if;
  -- Productos por peso o medida (20260929120100): decimales, mínimo y origen del peso.
  perform public.fn_pos_validar_pesaje(p_org, p_actor, p_item);
$frag$;
begin
  if position('fn_pos_validar_pesaje' in v_def) > 0 then
    return;  -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_pos_validar_linea_venta cambió: el fragmento del parche no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$parche$;
