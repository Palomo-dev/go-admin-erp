-- Venta por peso en gramos, kilos o libras (docs/design/PRODUCTOS-POR-PESO-BASCULA.md).
--
-- Estándar de los POS de pesaje: un producto por peso guarda su cantidad en su
-- unidad de inventario. GR = gramos enteros (0 decimales), KG y LB = 3
-- decimales. El precio se guarda por esa unidad (por gramo en GR) y se escribe
-- y se muestra por kg. La báscula lee en kg o lb y se convierte a la unidad del
-- producto con UNA conversión: fn_peso_convertir, espejo exacto de
-- print-agent/src/printing/peso.ts (1 kg = 1000 g, 1 lb = 453,59237 g).
--
-- Compatible con el código desplegado: solo cambia algo para un producto con
-- sale_mode = 'weight' y unidad GR, y hoy no hay ninguno. KG y LB quedan igual.
--
-- La versión de 2 argumentos de fn_producto_decimales_cantidad no cambia (la
-- usan procesar_devolucion y fn_ajuste_productos, que con GR admiten hasta 3
-- decimales: más permisivo, nunca rechaza una cantidad válida).
-- Rollback: supabase/rollbacks/20261006143255_venta_por_peso_en_gramos_rollback.sql

-- ── 1. Conversión única ────────────────────────────────────────────────────
create or replace function public.fn_peso_gramos(p_unidad text)
returns numeric
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case upper(btrim(coalesce(p_unidad, '')))
           when 'GR' then 1::numeric
           when 'G'  then 1::numeric
           when 'KG' then 1000::numeric
           when 'LB' then 453.59237::numeric
           when 'OZ' then 28.349523125::numeric
           else null end
$$;

comment on function public.fn_peso_gramos(text) is
  'Gramos que contiene una unidad de peso (GR, KG, LB, OZ) o NULL. Espejo de GRAMOS_POR_UNIDAD en print-agent/src/printing/peso.ts.';

create or replace function public.fn_peso_convertir(p_valor numeric, p_de text, p_a text)
returns numeric
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
           when public.fn_peso_gramos(p_de) is null or public.fn_peso_gramos(p_a) is null then null
           else p_valor * public.fn_peso_gramos(p_de) / public.fn_peso_gramos(p_a)
         end
$$;

comment on function public.fn_peso_convertir(numeric, text, text) is
  'Convierte un peso entre GR, KG, LB y OZ, sin redondear. NULL si alguna unidad no es de peso. Espejo de convertirPeso (print-agent/src/printing/peso.ts).';

revoke all on function public.fn_peso_gramos(text) from public, anon;
revoke all on function public.fn_peso_convertir(numeric, text, text) from public, anon;
grant execute on function public.fn_peso_gramos(text) to authenticated, service_role;
grant execute on function public.fn_peso_convertir(numeric, text, text) to authenticated, service_role;

-- ── 2. Decimales según la unidad ──────────────────────────────────────────
create or replace function public.fn_producto_decimales_cantidad(p_sale_mode text, p_qty_decimals smallint, p_unit_code text)
returns integer
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
           when coalesce(p_sale_mode, 'unit') = 'weight' and upper(btrim(coalesce(p_unit_code, ''))) = 'GR' then 0
           else public.fn_producto_decimales_cantidad(p_sale_mode, p_qty_decimals)
         end
$$;

comment on function public.fn_producto_decimales_cantidad(text, smallint, text) is
  'Decimales de la cantidad según cómo se vende y la unidad: por peso en gramos 0 (gramos enteros), en kg o lb 3. Espejo de decimalesCantidad (src/lib/pos/peso/modoVenta.ts).';

revoke all on function public.fn_producto_decimales_cantidad(text, smallint, text) from public, anon;
grant execute on function public.fn_producto_decimales_cantidad(text, smallint, text) to authenticated, service_role;

-- ── 3. «Cómo se vende» admite GR ──────────────────────────────────────────
-- GR: 0 decimales, precio por gramo, referencia «por kg» (1000 GR, la de
-- defecto) o cada 500, 250 o 100 g. KG y LB: igual que antes.
create or replace function public.fn_producto_int_modo_venta(p_org integer, p_product_id integer, p_pr jsonb, p_tiene_variantes boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_modo    text := coalesce(nullif(btrim(p_pr->>'sale_mode'), ''), 'unit');
  v_unidad  text;
  v_tipo    text;
  v_dec     integer := nullif(p_pr->>'qty_decimals', '')::integer;
  v_ref_q   numeric := nullif(p_pr->>'price_ref_qty', '')::numeric;
  v_ref_u   text := nullif(upper(btrim(coalesce(p_pr->>'price_ref_unit_code', ''))), '');
  v_min     numeric := nullif(p_pr->>'min_sale_qty', '')::numeric;
  v_tara    numeric := nullif(p_pr->>'default_tare_qty', '')::numeric;
  v_exige   boolean := coalesce((p_pr->>'require_scale')::boolean, false);
  v_tara_ob boolean := coalesce((p_pr->>'tare_required')::boolean, false);
begin
  select btrim(p.unit_code), coalesce(p.product_type, 'product') into v_unidad, v_tipo
    from public.products p
   where p.id = p_product_id and p.organization_id = p_org;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;

  if v_modo not in ('unit', 'weight', 'measure') then
    raise exception 'modo_venta_invalido' using errcode = '22023';
  end if;

  if v_modo = 'unit' then
    update public.products set
      sale_mode = 'unit', qty_decimals = 0, price_ref_qty = null, price_ref_unit_code = null,
      min_sale_qty = null, default_tare_qty = null, tare_required = false, require_scale = false, scale_plu = null
     where id = p_product_id
       and (sale_mode <> 'unit' or qty_decimals <> 0 or price_ref_qty is not null or min_sale_qty is not null
            or default_tare_qty is not null or tare_required or require_scale or scale_plu is not null);
    return;
  end if;

  if v_tipo = 'service' then
    raise exception 'modo_venta_servicio' using errcode = '22023';
  end if;
  if p_tiene_variantes then
    raise exception 'modo_venta_con_variantes' using errcode = '22023';
  end if;

  if v_modo = 'weight' then
    if v_unidad not in ('GR', 'KG', 'LB') then
      raise exception 'unidad_peso_invalida' using errcode = '22023', detail = v_unidad;
    end if;
    -- Gramos enteros en GR, 3 decimales en KG y LB (fn_producto_decimales_cantidad de 3 argumentos).
    v_dec := case when v_unidad = 'GR' then 0 else 3 end;
    -- En gramos el precio se escribe por kg aunque no venga referencia.
    if v_unidad = 'GR' and v_ref_q is null and v_ref_u is null then
      v_ref_q := 1000;
      v_ref_u := 'GR';
    end if;
    if v_ref_q is not null or v_ref_u is not null then
      if not (
        (v_unidad = 'KG' and ((v_ref_u = 'KG' and v_ref_q = 1) or (v_ref_u = 'GR' and v_ref_q in (500, 250, 100, 50))))
        or (v_unidad = 'GR' and v_ref_u = 'GR' and v_ref_q in (1000, 500, 250, 100))
        or (v_unidad = 'LB' and v_ref_u = 'LB' and v_ref_q = 1)
      ) then
        raise exception 'referencia_precio_invalida' using errcode = '22023',
          detail = format('%s %s', v_ref_q, v_ref_u);
      end if;
      -- «Por kg» / «por lb» (1 unidad de venta) es la referencia por defecto: no se guarda.
      if v_ref_u = v_unidad and v_ref_q = 1 then
        v_ref_q := null;
        v_ref_u := null;
      end if;
    end if;
  else
    if v_unidad not in ('MT', 'LT') then
      raise exception 'unidad_medida_invalida' using errcode = '22023', detail = v_unidad;
    end if;
    v_dec := coalesce(v_dec, 2);
    if v_dec not between 1 and 3 then
      raise exception 'decimales_invalidos' using errcode = '22023';
    end if;
    v_ref_q := null;
    v_ref_u := null;
    v_exige := false;
    v_tara_ob := false;
    v_tara := null;
  end if;

  if v_min is not null and (v_min <= 0 or v_min <> round(v_min, v_dec)) then
    raise exception 'minimo_invalido' using errcode = '22023';
  end if;
  if v_tara is not null and (v_tara < 0 or v_tara <> round(v_tara, v_dec)) then
    raise exception 'tara_invalida' using errcode = '22023';
  end if;

  update public.products set
    sale_mode = v_modo,
    qty_decimals = v_dec,
    price_ref_qty = v_ref_q,
    price_ref_unit_code = v_ref_u,
    min_sale_qty = v_min,
    default_tare_qty = v_tara,
    tare_required = v_tara_ob and v_tara is not null,
    require_scale = v_exige
   where id = p_product_id;

  -- PLU de balanza (20260929230300): solo si el payload lo trae.
  if p_pr ? 'scale_plu' then
    perform public.fn_producto_int_plu(p_org, p_product_id, p_pr->'scale_plu');
  end if;
end;
$function$;

-- ── 4. Validación del pesaje con la unidad del producto ───────────────────
-- Decimales por unidad (gramos enteros en GR) y el neto leído se compara en la
-- unidad del producto aunque la pesada diga otra (báscula en kg, producto en g).
create or replace function public.fn_pos_validar_pesaje(p_org integer, p_actor uuid, p_item jsonb)
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_product integer := nullif(p_item->>'product_id', '')::integer;
  v_qty     numeric := (p_item->>'quantity')::numeric;
  v_p       record;
  v_dec     integer;
  v_pesaje  jsonb;
  v_origen  text;
  v_neto    numeric;
begin
  select p.name, p.sale_mode, p.qty_decimals, p.min_sale_qty, p.require_scale, btrim(p.unit_code) as unit_code
    into v_p
    from public.products p
   where p.id = v_product and p.organization_id = p_org;
  if not found or coalesce(v_p.sale_mode, 'unit') = 'unit' then
    return;  -- por unidad: sin cambios
  end if;

  v_dec := public.fn_producto_decimales_cantidad(v_p.sale_mode, v_p.qty_decimals, v_p.unit_code);
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
  -- Fase 3 (20260929220200): peso leído de una báscula o de una etiqueta de balanza.
  if v_origen = 'bascula' then
    if coalesce(v_pesaje->>'bascula_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'bascula_invalida' using errcode = '22023',
        detail = format('«%s» (producto %s): el peso de báscula no trae una báscula válida.', v_p.name, v_product);
    end if;
    if not exists (select 1 from public.pos_scales sc
                    where sc.id = (v_pesaje->>'bascula_id')::uuid
                      and sc.organization_id = p_org
                      and sc.is_active) then
      raise exception 'bascula_invalida' using errcode = '22023',
        detail = format('«%s» (producto %s): la báscula %s no es una báscula activa de la organización.',
                        v_p.name, v_product, v_pesaje->>'bascula_id');
    end if;
    if coalesce(v_pesaje->'estable', 'false'::jsonb) <> 'true'::jsonb then
      raise exception 'peso_inestable' using errcode = '22023',
        detail = format('«%s» (producto %s): la lectura de la báscula no estaba estable.', v_p.name, v_product);
    end if;
    if jsonb_typeof(v_pesaje->'neto') = 'number' then
      -- El neto en la unidad del producto (si la pesada trae otra unidad de peso, se convierte).
      v_neto := (v_pesaje->>'neto')::numeric;
      if nullif(btrim(coalesce(v_pesaje->>'unidad', '')), '') is not null
         and public.fn_peso_convertir(v_neto, v_pesaje->>'unidad', v_p.unit_code) is not null then
        v_neto := round(public.fn_peso_convertir(v_neto, v_pesaje->>'unidad', v_p.unit_code), v_dec);
      end if;
      if abs(v_neto - v_qty) > 0.0005 then
        raise exception 'pesaje_no_coincide' using errcode = '22023',
          detail = format('«%s» (producto %s): la cantidad %s no coincide con el neto leído %s.',
                          v_p.name, v_product, v_qty, v_pesaje->>'neto');
      end if;
    end if;
    return;
  end if;
  if v_origen = 'etiqueta' then
    if length(btrim(coalesce(v_pesaje->>'codigo_etiqueta', ''))) = 0
       or length(v_pesaje->>'codigo_etiqueta') > 64 then
      raise exception 'etiqueta_invalida' using errcode = '22023',
        detail = format('«%s» (producto %s): el peso por etiqueta no trae el código leído.', v_p.name, v_product);
    end if;
    return;
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
$function$;

-- ── 5. Producción: los mismos decimales por unidad ────────────────────────
create or replace function public.fn_produccion_int_decimales(p_product integer)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select least(public.fn_producto_decimales_cantidad(p.sale_mode, p.qty_decimals, btrim(p.unit_code)), 3)
    from public.products p where p.id = p_product;
$function$;

-- Funciones internas (SECURITY DEFINER): sin ejecución directa desde el cliente.
revoke all on function public.fn_producto_int_modo_venta(integer, integer, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_produccion_int_decimales(integer) from public, anon, authenticated;
