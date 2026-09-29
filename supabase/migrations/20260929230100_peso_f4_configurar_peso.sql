-- Productos por peso, fase 4: guardar el formato de etiqueta de peso variable
-- (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.7, M3).
--
-- fn_codigo_barras_choca_con_peso: ¿los códigos que genera la numeración
-- interna pueden empezar por alguno de los prefijos de peso? Pura (la usan la
-- RPC de configuración y el generador, 20260929230200).
--   EAN-13 (y Code128 numérico de 13): con prefijo de 2 o más dígitos se mira
--   su comienzo; con 1 dígito, cualquier prefijo de peso que empiece por él
--   (el número lo completa); sin prefijo, el código que saldría ahora.
--
-- codigos_barras_configurar_peso: upsert de las 6 columnas weight_label_* de
-- organization_barcode_settings. Permiso pos.basculas.configurar resuelto en
-- el servidor (fn_tiene_permiso), nunca por el nombre del rol. Rechaza un
-- prefijo que choque con el generador y devuelve cuántos productos tienen hoy
-- un código propio que empieza por esos prefijos (el POS busca siempre primero
-- el código exacto, así que siguen funcionando; es un aviso) y cuántos PLU no
-- caben en los dígitos elegidos.

create or replace function public.fn_codigo_barras_choca_con_peso(
  p_formato text, p_prefijo text, p_siguiente bigint, p_longitud integer, p_prefijos_peso text[]
)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_prefijo text := coalesce(btrim(p_prefijo), '');
  v_codigo  text;
begin
  if p_prefijos_peso is null or cardinality(p_prefijos_peso) = 0 then
    return false;
  end if;
  -- Un Code128 solo puede confundirse con un EAN-13 si es numérico de 13.
  if p_formato = 'code128' and not (coalesce(p_longitud, 10) = 13 and v_prefijo ~ '^[0-9]*$') then
    return false;
  end if;
  if p_formato not in ('ean13', 'code128') then
    return false;
  end if;
  if length(v_prefijo) >= 2 then
    return left(v_prefijo, 2) = any(p_prefijos_peso);
  end if;
  if length(v_prefijo) = 1 then
    return exists (select 1 from unnest(p_prefijos_peso) x where left(x, 1) = v_prefijo);
  end if;
  v_codigo := public.fn_codigo_barras_construir(p_formato, v_prefijo, coalesce(p_siguiente, 1), p_longitud);
  return v_codigo is not null and left(v_codigo, 2) = any(p_prefijos_peso);
end;
$$;

revoke all on function public.fn_codigo_barras_choca_con_peso(text, text, bigint, integer, text[]) from public, anon;
grant execute on function public.fn_codigo_barras_choca_con_peso(text, text, bigint, integer, text[]) to authenticated, service_role;

create or replace function public.codigos_barras_configurar_peso(
  p_org integer,
  p_activo boolean,
  p_prefijos text[],
  p_contenido text default 'weight',
  p_digitos_plu integer default 5,
  p_digitos_valor integer default 5,
  p_digito_valor boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefijos  text[];
  v_gen       record;
  v_fila      public.organization_barcode_settings%rowtype;
  v_con_pref  integer;
  v_plu_fuera integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_tiene_permiso(p_org, 'pos.basculas.configurar') then
    raise exception 'sin_permiso: configurar básculas y etiquetas de peso' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}')
    into v_prefijos
    from unnest(coalesce(p_prefijos, '{}'::text[])) x
   where coalesce(btrim(x), '') <> '';

  if exists (select 1 from unnest(v_prefijos) x where x !~ '^2[1-9]$') then
    raise exception 'prefijo_peso_invalido: los prefijos de peso van del 21 al 29' using errcode = '22023';
  end if;
  if coalesce(p_activo, false) and cardinality(v_prefijos) = 0 then
    raise exception 'prefijos_requeridos' using errcode = '22023';
  end if;
  if coalesce(p_contenido, '') not in ('weight', 'price') then
    raise exception 'contenido_invalido' using errcode = '22023';
  end if;
  if p_digitos_plu is null or p_digitos_plu not between 4 and 6
     or p_digitos_valor is null or p_digitos_valor not between 4 and 6
     or 2 + p_digitos_plu + p_digitos_valor + (case when coalesce(p_digito_valor, false) then 1 else 0 end) <> 12 then
    raise exception 'formato_invalido: prefijo + PLU + valor deben sumar 12 dígitos' using errcode = '22023';
  end if;

  -- La numeración interna de la organización (sin fila: la de por defecto, EAN-13 con 20).
  select coalesce(s.format, 'ean13') as format, coalesce(s.prefix, '20') as prefix,
         coalesce(s.next_number, 1) as next_number, coalesce(s.code_length, 10) as code_length
    into v_gen
    from (select 1) uno
    left join public.organization_barcode_settings s on s.organization_id = p_org;
  if public.fn_codigo_barras_choca_con_peso(v_gen.format, v_gen.prefix, v_gen.next_number, v_gen.code_length, v_prefijos) then
    raise exception 'prefijo_del_generador: el generador de códigos usa el prefijo %', v_gen.prefix
      using errcode = '22023', detail = v_gen.prefix;
  end if;

  insert into public.organization_barcode_settings as s
    (organization_id, weight_label_enabled, weight_label_prefixes, weight_label_content,
     weight_label_plu_digits, weight_label_value_digits, weight_label_value_check, updated_by)
  values
    (p_org, coalesce(p_activo, false), v_prefijos, p_contenido,
     p_digitos_plu::smallint, p_digitos_valor::smallint, coalesce(p_digito_valor, false), auth.uid())
  on conflict (organization_id) do update
    set weight_label_enabled = excluded.weight_label_enabled,
        weight_label_prefixes = excluded.weight_label_prefixes,
        weight_label_content = excluded.weight_label_content,
        weight_label_plu_digits = excluded.weight_label_plu_digits,
        weight_label_value_digits = excluded.weight_label_value_digits,
        weight_label_value_check = excluded.weight_label_value_check,
        updated_at = now(),
        updated_by = auth.uid()
  returning * into v_fila;

  select count(*) into v_con_pref
    from public.products p
   where p.organization_id = p_org
     and coalesce(p.status, 'active') <> 'deleted'
     and p.barcode ~ '^[0-9]{13}$'
     and left(p.barcode, 2) = any(v_prefijos);

  select count(*) into v_plu_fuera
    from public.products p
   where p.organization_id = p_org
     and coalesce(p.status, 'active') <> 'deleted'
     and p.scale_plu is not null
     and p.scale_plu >= power(10, p_digitos_plu)::integer;

  return jsonb_build_object(
    'enabled', v_fila.weight_label_enabled,
    'prefixes', to_jsonb(v_fila.weight_label_prefixes),
    'content', v_fila.weight_label_content,
    'plu_digits', v_fila.weight_label_plu_digits,
    'value_digits', v_fila.weight_label_value_digits,
    'value_check', v_fila.weight_label_value_check,
    'productos_con_prefijo', v_con_pref,
    'productos_plu_fuera_de_rango', v_plu_fuera
  );
end;
$$;

revoke all on function public.codigos_barras_configurar_peso(integer, boolean, text[], text, integer, integer, boolean) from public, anon;
grant execute on function public.codigos_barras_configurar_peso(integer, boolean, text[], text, integer, integer, boolean) to authenticated, service_role;

comment on function public.codigos_barras_configurar_peso(integer, boolean, text[], text, integer, integer, boolean) is
  'Formato de etiqueta de peso variable de la organización (pos.basculas.configurar). Rechaza el prefijo del generador; devuelve productos con código propio en esos prefijos.';
