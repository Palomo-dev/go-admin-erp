-- Reversión de 20260929230200_peso_f4_generador_sin_prefijo_peso: quita la
-- comprobación de codigos_barras_reservar y codigos_barras_generar_faltantes
-- sobre su definición VIVA (se conserva cualquier otro parche posterior) y
-- borra la función auxiliar.

do $parche$
declare
  v_fn    text;
  v_def   text;
  v_frag  text := '
  -- Fase 4 de peso (20260929230200): nunca un prefijo de etiqueta de peso.
  perform public.fn_codigos_barras_assert_sin_prefijo_peso(p_org);';
begin
  foreach v_fn in array array[
    'public.codigos_barras_reservar(integer,integer)',
    'public.codigos_barras_generar_faltantes(integer,integer[],boolean)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position(v_frag in v_def) > 0 then
      execute replace(v_def, v_frag, '');
    end if;
  end loop;
end;
$parche$;

drop function if exists public.fn_codigos_barras_assert_sin_prefijo_peso(integer);
