-- Reversión de 20260929220200_peso_f3_validar_pesaje_bascula_etiqueta.
-- Devuelve fn_pos_validar_pesaje (definición viva) al rechazo de fase 2: todo
-- origen distinto de 'manual' → origen_peso_no_disponible. Las ventas ya hechas
-- con origen 'bascula' o 'etiqueta' no se tocan; un sobre offline con esos
-- orígenes que llegue después de revertir se rechazará.

do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_pos_validar_pesaje(integer,uuid,jsonb)'::regprocedure);
  v_ini text := '  -- Fase 3 (20260929220200): peso leído de una báscula o de una etiqueta de balanza.' || E'\n';
  v_fin text := $frag$        detail = format('«%s» (producto %s): el peso por etiqueta no trae el código leído.', v_p.name, v_product);
    end if;
    return;
  end if;
$frag$;
  v_old text := $frag$  if v_origen <> 'manual' then
    -- Fase 2: todavía no hay lectura de báscula (fase 3) ni etiquetas (fase 4).
    raise exception 'origen_peso_no_disponible' using errcode = '22023',
      detail = format('«%s» (producto %s): el peso por %s aún no está disponible.', v_p.name, v_product, v_origen);
  end if;
$frag$;
  v_a integer;
  v_b integer;
begin
  v_a := position(v_ini in v_def);
  v_b := position(v_fin in v_def);
  if v_a = 0 or v_b = 0 or v_b < v_a then
    return;  -- el parche no está (ya revertido)
  end if;
  execute substr(v_def, 1, v_a - 1) || v_old || substr(v_def, v_b + length(v_fin));
end;
$parche$;

revoke all on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_pos_validar_pesaje(integer, uuid, jsonb) to service_role;
