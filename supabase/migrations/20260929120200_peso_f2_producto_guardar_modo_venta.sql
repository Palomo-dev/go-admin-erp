-- Productos por peso, fase 2: «Cómo se vende» en el guardado del producto
-- (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.1–2.2, M6).
--
-- fn_producto_int_modo_venta valida y guarda sale_mode y sus datos en la MISMA
-- transacción de fn_producto_guardar. fn_producto_guardar se parchea sobre su
-- definición VIVA (hoy la ampliaron recetas y membresías): un solo bloque antes
-- de «Precio y costo», verificando que el ancla aparece una vez. Solo actúa si
-- el payload trae producto.sale_mode: los guardados de hoy no cambian.
--
-- Reglas:
--   unit    → todo en sus valores por defecto (como hoy).
--   weight  → unidad KG o LB; 3 decimales; precio «cada tanto» solo 1 kg,
--             500/250/100/50 g (en libras, solo por lb); sin variantes; no
--             servicio. «Exige báscula» y la tara solo aquí.
--   measure → unidad MT o LT; 2 decimales por defecto (1 a 3); sin referencia
--             de precio; sin variantes; no servicio.
-- El precio llega SIEMPRE por la unidad de venta (por kg): el formulario
-- convierte «$ 1.890 cada 100 g» a $ 18.900 antes de enviar.

create or replace function public.fn_producto_int_modo_venta(
  p_org integer, p_product_id integer, p_pr jsonb, p_tiene_variantes boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      min_sale_qty = null, default_tare_qty = null, tare_required = false, require_scale = false
     where id = p_product_id
       and (sale_mode <> 'unit' or qty_decimals <> 0 or price_ref_qty is not null or min_sale_qty is not null
            or default_tare_qty is not null or tare_required or require_scale);
    return;
  end if;

  if v_tipo = 'service' then
    raise exception 'modo_venta_servicio' using errcode = '22023';
  end if;
  if p_tiene_variantes then
    raise exception 'modo_venta_con_variantes' using errcode = '22023';
  end if;

  if v_modo = 'weight' then
    if v_unidad not in ('KG', 'LB') then
      raise exception 'unidad_peso_invalida' using errcode = '22023', detail = v_unidad;
    end if;
    v_dec := 3;
    if v_ref_q is not null or v_ref_u is not null then
      if not (
        (v_unidad = 'KG' and ((v_ref_u = 'KG' and v_ref_q = 1) or (v_ref_u = 'GR' and v_ref_q in (500, 250, 100, 50))))
        or (v_unidad = 'LB' and v_ref_u = 'LB' and v_ref_q = 1)
      ) then
        raise exception 'referencia_precio_invalida' using errcode = '22023',
          detail = format('%s %s', v_ref_q, v_ref_u);
      end if;
      -- «Por kg» / «por lb» es la referencia por defecto: no se guarda.
      if v_ref_u = v_unidad then
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
end;
$$;

comment on function public.fn_producto_int_modo_venta(integer, integer, jsonb, boolean) is
  'Interna de fn_producto_guardar: valida y guarda «Cómo se vende» (sale_mode y sus datos) del producto. Por peso: KG o LB, 3 decimales, precio cada 1 kg/500/250/100/50 g o por lb. Por medida: MT o LT.';

revoke all on function public.fn_producto_int_modo_venta(integer, integer, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.fn_producto_int_modo_venta(integer, integer, jsonb, boolean) to service_role;

-- ── Parche de fn_producto_guardar (definición viva) ─────────────────────────
do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_producto_guardar(integer,jsonb)'::regprocedure);
  v_old text := $frag$  -- Precio y costo (con vigencia; en crear, precio 0 se omite como antes).
$frag$;
  v_new text := $frag$  -- Cómo se vende (20260929120200, productos por peso o medida): mismo paso del guardado.
  if v_pr ? 'sale_mode' then
    perform public.fn_producto_int_modo_venta(p_organization_id, v_id, v_pr, v_tiene_var);
  end if;

  -- Precio y costo (con vigencia; en crear, precio 0 se omite como antes).
$frag$;
begin
  if position('fn_producto_int_modo_venta' in v_def) > 0 then
    return;  -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_producto_guardar cambió: el ancla del parche no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$parche$;
