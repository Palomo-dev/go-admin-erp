-- Fase 3 de productos por peso: fn_pos_validar_pesaje acepta el peso leído de
-- una báscula y el de una etiqueta de balanza
-- (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6 «Checkout», §2.9, §3 M6).
--
-- Parche sobre la definición VIVA (pg_get_functiondef + replace de un
-- fragmento que debe aparecer una sola vez, como 20260929120100). Hasta hoy
-- todo origen distinto de 'manual' se rechazaba con origen_peso_no_disponible.
-- Ahora:
--   origen 'bascula'  → notes.pesaje.bascula_id es el uuid de una báscula ACTIVA
--                       de la organización (pos_scales), la lectura llegó estable
--                       (estable = true) y, si viene neto, coincide con la cantidad
--                       (±0,0005). Errores: bascula_invalida, peso_inestable,
--                       pesaje_no_coincide.
--   origen 'etiqueta' → notes.pesaje.codigo_etiqueta no vacío (≤ 64). La
--                       decodificación del código es de la fase 4 (cliente).
--                       Error: etiqueta_invalida.
-- Ni báscula ni etiqueta pasan por la regla de peso manual ni por «exige
-- báscula» (una etiqueta sale de una balanza). 'manual' queda igual.

do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_pos_validar_pesaje(integer,uuid,jsonb)'::regprocedure);
  v_old text := $frag$  if v_origen <> 'manual' then
    -- Fase 2: todavía no hay lectura de báscula (fase 3) ni etiquetas (fase 4).
    raise exception 'origen_peso_no_disponible' using errcode = '22023',
      detail = format('«%s» (producto %s): el peso por %s aún no está disponible.', v_p.name, v_product, v_origen);
  end if;
$frag$;
  v_new text := $frag$  -- Fase 3 (20260929220200): peso leído de una báscula o de una etiqueta de balanza.
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
    if jsonb_typeof(v_pesaje->'neto') = 'number' and abs((v_pesaje->>'neto')::numeric - v_qty) > 0.0005 then
      raise exception 'pesaje_no_coincide' using errcode = '22023',
        detail = format('«%s» (producto %s): la cantidad %s no coincide con el neto leído %s.',
                        v_p.name, v_product, v_qty, v_pesaje->>'neto');
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
$frag$;
begin
  if position('bascula_invalida' in v_def) > 0 then
    return;  -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_pos_validar_pesaje cambió: el fragmento del parche no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$parche$;

-- El execute de la definición conserva SECURITY DEFINER, search_path y los
-- privilegios (create or replace no los cambia); se repiten por claridad.
revoke all on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) to service_role;

comment on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) is
  'Valida una línea de venta de un producto por peso o medida: decimales, mínimo y origen del peso (notes.pesaje: manual con permiso, bascula con una báscula activa de la organización y lectura estable, etiqueta con su código). Productos por unidad: no hace nada. La llama fn_pos_validar_linea_venta.';
