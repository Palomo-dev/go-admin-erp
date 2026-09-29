-- Productos por peso, fase 4: el generador interno de códigos nunca usa un
-- prefijo de etiqueta de peso (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.7, M6).
--
-- fn_codigos_barras_assert_sin_prefijo_peso(org): si la organización tiene
-- las etiquetas de peso activas y su numeración interna puede producir un
-- código que empiece por uno de esos prefijos, falla con «prefijo_de_peso».
--
-- codigos_barras_reservar y codigos_barras_generar_faltantes se parchean sobre
-- su definición VIVA (pg_get_functiondef + replace): se agrega la comprobación
-- justo después de fn_assert_acceso_org, que aparece UNA sola vez en cada una;
-- si el ancla no aparece exactamente una vez la migración falla y no toca nada.

create or replace function public.fn_codigos_barras_assert_sin_prefijo_peso(p_org integer)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg public.organization_barcode_settings%rowtype;
begin
  select * into v_cfg from public.organization_barcode_settings where organization_id = p_org;
  if not found or not v_cfg.weight_label_enabled then
    return;
  end if;
  if public.fn_codigo_barras_choca_con_peso(v_cfg.format, v_cfg.prefix, v_cfg.next_number, v_cfg.code_length,
                                            v_cfg.weight_label_prefixes) then
    raise exception 'prefijo_de_peso: el prefijo % del generador es de las etiquetas de peso variable', v_cfg.prefix
      using errcode = '22023', detail = v_cfg.prefix;
  end if;
end;
$$;

revoke all on function public.fn_codigos_barras_assert_sin_prefijo_peso(integer) from public, anon, authenticated;
grant execute on function public.fn_codigos_barras_assert_sin_prefijo_peso(integer) to service_role;

do $parche$
declare
  v_fn     text;
  v_def    text;
  v_ancla  text := 'perform public.fn_assert_acceso_org(p_org);';
  v_nuevo  text := 'perform public.fn_assert_acceso_org(p_org);
  -- Fase 4 de peso (20260929230200): nunca un prefijo de etiqueta de peso.
  perform public.fn_codigos_barras_assert_sin_prefijo_peso(p_org);';
  v_veces  integer;
begin
  foreach v_fn in array array[
    'public.codigos_barras_reservar(integer,integer)',
    'public.codigos_barras_generar_faltantes(integer,integer[],boolean)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position('fn_codigos_barras_assert_sin_prefijo_peso' in v_def) > 0 then
      continue; -- ya parcheada (idempotente)
    end if;
    v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    if v_veces <> 1 then
      raise exception 'ancla de % aparece % veces (se esperaba 1)', v_fn, v_veces;
    end if;
    execute replace(v_def, v_ancla, v_nuevo);
  end loop;
end;
$parche$;
