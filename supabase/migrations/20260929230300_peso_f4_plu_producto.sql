-- Productos por peso, fase 4: PLU de balanza en el guardado del producto
-- (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.7, M6).
--
-- products.scale_plu (1–99.999, único por organización con
-- products_org_scale_plu_uq) ya existe desde 20260929120100, pero
-- fn_producto_guardar no lo escribía. Se agrega en el mismo paso de
-- «Cómo se vende» (fn_producto_int_modo_venta, llamado por fn_producto_guardar
-- cuando el payload trae producto.sale_mode):
--   - por unidad → el PLU se borra (una etiqueta de peso nunca resuelve a un
--     producto por unidad);
--   - por peso o por medida → si producto.scale_plu viene en el payload se
--     guarda (null lo quita); si no viene, se conserva.
-- Errores: plu_invalido (no entero o fuera de 1–99.999) y plu_duplicado
-- (otro producto de la organización ya lo usa; detail = su id).
--
-- fn_producto_int_modo_venta se parchea sobre su definición VIVA con dos
-- reemplazos cuya ancla debe aparecer exactamente una vez.

create or replace function public.fn_producto_int_plu(p_org integer, p_product_id integer, p_valor jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_txt  text := nullif(btrim(coalesce(p_valor #>> '{}', '')), '');
  v_plu  integer;
  v_otro integer;
begin
  if v_txt is not null then
    if v_txt !~ '^[0-9]{1,5}$' then
      raise exception 'plu_invalido' using errcode = '22023', detail = v_txt;
    end if;
    v_plu := v_txt::integer;
    if v_plu < 1 then
      raise exception 'plu_invalido' using errcode = '22023', detail = v_txt;
    end if;
    select p.id into v_otro
      from public.products p
     where p.organization_id = p_org and p.scale_plu = v_plu and p.id <> p_product_id
     limit 1;
    if v_otro is not null then
      raise exception 'plu_duplicado' using errcode = '23505', detail = v_otro::text;
    end if;
  end if;

  begin
    update public.products
       set scale_plu = v_plu
     where id = p_product_id and organization_id = p_org
       and scale_plu is distinct from v_plu;
  exception when unique_violation then
    raise exception 'plu_duplicado' using errcode = '23505';
  end;
end;
$$;

revoke all on function public.fn_producto_int_plu(integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_producto_int_plu(integer, integer, jsonb) to service_role;

do $parche$
declare
  v_def   text := pg_get_functiondef('public.fn_producto_int_modo_venta(integer,integer,jsonb,boolean)'::regprocedure);
  v_a1    text := 'tare_required = false, require_scale = false
     where id = p_product_id
       and (sale_mode <> ''unit'' or qty_decimals <> 0 or price_ref_qty is not null or min_sale_qty is not null
            or default_tare_qty is not null or tare_required or require_scale);';
  v_n1    text := 'tare_required = false, require_scale = false, scale_plu = null
     where id = p_product_id
       and (sale_mode <> ''unit'' or qty_decimals <> 0 or price_ref_qty is not null or min_sale_qty is not null
            or default_tare_qty is not null or tare_required or require_scale or scale_plu is not null);';
  v_a2    text := 'require_scale = v_exige
   where id = p_product_id;';
  v_n2    text := 'require_scale = v_exige
   where id = p_product_id;

  -- PLU de balanza (20260929230300): solo si el payload lo trae.
  if p_pr ? ''scale_plu'' then
    perform public.fn_producto_int_plu(p_org, p_product_id, p_pr->''scale_plu'');
  end if;';
  v_veces integer;
begin
  if position('fn_producto_int_plu' in v_def) > 0 then
    return; -- ya parcheada (idempotente)
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1);
  if v_veces <> 1 then
    raise exception 'ancla 1 de fn_producto_int_modo_venta aparece % veces', v_veces;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2);
  if v_veces <> 1 then
    raise exception 'ancla 2 de fn_producto_int_modo_venta aparece % veces', v_veces;
  end if;
  execute replace(replace(v_def, v_a1, v_n1), v_a2, v_n2);
end;
$parche$;
