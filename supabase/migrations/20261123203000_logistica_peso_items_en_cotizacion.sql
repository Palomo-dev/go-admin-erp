-- Logística: el peso del pedido entra a la cotización (2026-11-23).
--
-- Antes, las reglas de despacho por peso («más de 20 kg → transportadora») solo funcionaban en el
-- simulador: ni el checkout web ni el POS mandaban `peso_kg`. Ahora mandan los productos
-- (`p_opciones.items = [{product_id, cantidad}]`) y la base suma el peso con la MISMA cadena que
-- muestra la pantalla (`resolverPeso`, presentacionEnvio.ts):
--   1) products.weight_kg  2) categories.default_weight_kg  3) shipping_settings.default_weight_kg.
-- Si a algún producto no se le encuentra peso, el total es NULL (desconocido): no se inventa y las
-- reglas con peso no aplican, igual que `resolverPesoEnvio` (integrations/core/peso.ts).
-- `peso_kg` explícito (simulador, prueba de reglas) sigue mandando sobre los productos.

create or replace function public.fn_logistica_peso_items(p_org integer, p_items jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with items as (
    select (e ->> 'product_id')::integer as pid,
           case when coalesce(e ->> 'cantidad', e ->> 'quantity', '1') ~ '^\d{1,6}(\.\d{1,3})?$'
                then coalesce(e ->> 'cantidad', e ->> 'quantity', '1')::numeric else 1 end as cant
      from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
     where coalesce(e ->> 'product_id', '') ~ '^\d{1,9}$'
     limit 500
  ),
  org as (
    select s.default_weight_kg
      from public.shipping_settings s
     where s.organization_id = p_org
     limit 1
  ),
  pesos as (
    select i.cant,
           coalesce(case when p.weight_kg > 0 then p.weight_kg end,
                    case when c.default_weight_kg > 0 then c.default_weight_kg end,
                    case when o.default_weight_kg > 0 then o.default_weight_kg end) as peso
      from items i
      left join public.products p on p.id = i.pid and p.organization_id = p_org
      left join public.categories c on c.id = p.category_id and c.organization_id = p_org
      left join org o on true
  )
  select case when p_org is null or count(*) = 0 or bool_or(peso is null) then null
              else round(sum(peso * cant), 3) end
    from pesos;
$$;

revoke all on function public.fn_logistica_peso_items(integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_logistica_peso_items(integer, jsonb) to service_role;

comment on function public.fn_logistica_peso_items(integer, jsonb) is
  'Peso total (kg) de [{product_id, cantidad}]: producto → categoría → organización; NULL si falta alguno. Misma cadena que resolverPeso (presentacionEnvio.ts).';

-- La cotización: igual que en 20261123145549 / 20261123153948, salvo el bloque del peso y
-- `peso_kg` en la respuesta.
create or replace function public.logistica_cotizar_envio(p_organization_id integer, p_branch_id integer, p_direccion jsonb, p_canal text, p_subtotal numeric, p_opciones jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_dir jsonb := coalesce(p_direccion, '{}'::jsonb);
  v_opc jsonb := coalesce(p_opciones, '{}'::jsonb);
  v_muni text := nullif(regexp_replace(coalesce(v_dir ->> 'municipio_dane', ''), '\D', '', 'g'), '');
  v_barrio text := public.fn_logistica_normalizar(v_dir ->> 'barrio');
  v_cp text := nullif(upper(regexp_replace(coalesce(v_dir ->> 'codigo_postal', ''), '\s', '', 'g')), '');
  v_canal text := lower(btrim(coalesce(p_canal, 'web')));
  v_sub numeric := greatest(coalesce(p_subtotal, 0), 0);
  v_metodo text := nullif(lower(btrim(coalesce(v_opc ->> 'metodo_pago', ''))), '');
  v_peso numeric;
  v_lat numeric;
  v_lng numeric;
  v_zona_id uuid;
  v_rango integer;
  v_tipo text;
  v_z public.shipping_zones%rowtype;
  v_hay_zonas boolean;
  v_motivo text;
  v_alt text;
  v_tz text;
  v_ahora timestamp;
  v_dia date;
  v_i integer;
  v_aplica_gratis boolean := false;
  v_gratis boolean := false;
  v_precio numeric;
  v_regla_id uuid;
  v_regla_accion text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_organization_id is null then
    raise exception 'ORGANIZACION_REQUERIDA' using errcode = '22023';
  end if;
  if v_canal not in ('web', 'pos', 'manual') then
    raise exception 'CANAL_INVALIDO' using errcode = '22023';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'SEDE_INVALIDA' using errcode = '22023';
  end if;

  begin
    v_lat := nullif(v_dir ->> 'lat', '')::numeric;
    v_lng := nullif(v_dir ->> 'lng', '')::numeric;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      v_lat := null;
      v_lng := null;
    end if;
  exception when others then
    v_lat := null;
    v_lng := null;
  end;
  begin
    v_peso := nullif(v_opc ->> 'peso_kg', '')::numeric;
  exception when others then
    v_peso := null;
  end;
  -- Sin peso explícito: se suma con los productos del pedido (checkout web y POS).
  if v_peso is null and jsonb_typeof(v_opc -> 'items') = 'array' then
    v_peso := public.fn_logistica_peso_items(p_organization_id, v_opc -> 'items');
  end if;
  -- DANE de 5 dígitos; un código numérico que perdió el cero inicial (5001 → 05001) se completa.
  if v_muni is not null and length(v_muni) = 4 then
    v_muni := lpad(v_muni, 5, '0');
  end if;

  select z.id, m.rango, m.tipo
    into v_zona_id, v_rango, v_tipo
    from public.shipping_zones z
    cross join lateral (
      select min(x.rango) as rango, (array_agg(x.tipo order by x.rango))[1] as tipo
        from (
          select l.location_type as tipo,
                 case l.location_type when 'polygon' then 1 when 'neighborhood' then 2
                                      when 'postal_code' then 3 else 4 end as rango
            from public.shipping_zone_locations l
           where l.zone_id = z.id
             and l.organization_id = z.organization_id
             and (   (l.location_type = 'polygon' and v_lat is not null
                      and public.fn_logistica_punto_en_geojson(v_lat, v_lng, l.polygon))
                  or (l.location_type = 'neighborhood' and v_barrio is not null and l.neighborhood_key = v_barrio
                      and (l.municipality_code is null or l.municipality_code = v_muni))
                  or (l.location_type = 'postal_code' and v_cp is not null
                      and upper(replace(l.postal_code, ' ', '')) = v_cp)
                  or (l.location_type = 'municipality' and v_muni is not null and l.municipality_code = v_muni))
        ) x
    ) m
   where z.organization_id = p_organization_id
     and z.is_active
     and not z.is_fallback
     and (z.branch_id is null or z.branch_id = p_branch_id)
     and m.rango is not null
   order by (z.branch_id is null), z.priority, m.rango, z.fee, z.created_at
   limit 1;

  if v_zona_id is not null then
    select * into v_z from public.shipping_zones where id = v_zona_id;
  else
    select exists (select 1 from public.shipping_zones z
                    where z.organization_id = p_organization_id and z.is_active
                      and (z.branch_id is null or z.branch_id = p_branch_id))
      into v_hay_zonas;
    v_motivo := case when v_hay_zonas then 'fuera_de_zona' else 'sin_zonas_configuradas' end;
    select * into v_z from public.shipping_zones z
     where z.organization_id = p_organization_id and z.is_active and z.is_fallback
       and (z.branch_id is null or z.branch_id = p_branch_id)
     order by (z.branch_id is null)
     limit 1;
    if v_z.id is not null then
      v_alt := 'tarifa_general';
      v_tipo := 'tarifa_general';
    elsif exists (select 1 from public.transport_carriers c
                   where c.organization_id = p_organization_id and coalesce(c.is_active, true)
                     and c.carrier_type = 'third_party') then
      v_alt := 'transportadora';
    end if;
  end if;

  v_tz := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_ahora := now() at time zone v_tz;

  if v_z.id is not null then
    v_aplica_gratis := v_z.free_shipping_from is not null
      and (v_z.free_shipping_applies_to = 'both'
           or (v_z.free_shipping_applies_to = 'web' and v_canal = 'web')
           or (v_z.free_shipping_applies_to = 'pos' and v_canal in ('pos', 'manual')));
    v_gratis := v_aplica_gratis and v_sub >= v_z.free_shipping_from;
    v_precio := case when v_gratis then 0 else v_z.fee end;

    v_dia := v_ahora::date;
    if v_z.cutoff_time is not null and v_ahora::time > v_z.cutoff_time then
      v_dia := v_dia + 1;
    end if;
    for v_i in 1 .. 7 loop
      exit when extract(isodow from v_dia)::smallint = any (v_z.delivery_days);
      v_dia := v_dia + 1;
    end loop;
  end if;

  select r.id, r.action
    into v_regla_id, v_regla_accion
    from public.delivery_rules r
   where r.organization_id = p_organization_id
     and r.is_active
     and (r.branch_id is null or r.branch_id = p_branch_id)
     and (coalesce(cardinality(r.zone_ids), 0) = 0 or v_z.id = any (r.zone_ids))
     and (coalesce(cardinality(r.channels), 0) = 0 or v_canal = any (r.channels))
     and (coalesce(cardinality(r.payment_methods), 0) = 0 or v_metodo = any (r.payment_methods))
     and (r.min_order_value is null or v_sub >= r.min_order_value)
     and (r.max_order_value is null or v_sub <= r.max_order_value)
     and (r.min_weight_kg is null or v_peso >= r.min_weight_kg)
     and (r.max_weight_kg is null or v_peso <= r.max_weight_kg)
     and (coalesce(cardinality(r.weekdays), 0) = 0 or extract(isodow from v_ahora)::smallint = any (r.weekdays))
     and (r.time_from is null or v_ahora::time >= r.time_from)
     and (r.time_to is null or v_ahora::time <= r.time_to)
   order by (r.branch_id is null), r.priority, r.created_at
   limit 1;

  return jsonb_build_object(
    'en_zona', v_zona_id is not null,
    'zona', case when v_z.id is null then null else jsonb_build_object(
              'id', v_z.id, 'nombre', v_z.name, 'es_tarifa_general', v_z.is_fallback, 'coincidencia', v_tipo) end,
    'precio', v_precio,
    'tarifa', v_z.fee,
    'moneda', v_z.currency,
    'envio_gratis', v_gratis,
    'envio_gratis_desde', case when v_aplica_gratis then v_z.free_shipping_from end,
    'falta_para_envio_gratis', case when v_aplica_gratis and not v_gratis then v_z.free_shipping_from - v_sub end,
    'pedido_minimo', coalesce(v_z.min_order_amount, 0),
    'cumple_minimo', v_sub >= coalesce(v_z.min_order_amount, 0),
    'falta_para_minimo', greatest(coalesce(v_z.min_order_amount, 0) - v_sub, 0),
    'tiempo', case when v_z.id is null then null else jsonb_build_object(
                'min_minutos', v_z.promise_min_minutes, 'max_minutos', v_z.promise_max_minutes,
                'texto', v_z.promise_text) end,
    'despacho', case when v_z.id is null then null else jsonb_build_object(
                  'fecha', v_dia, 'hoy', v_dia = v_ahora::date, 'corte', v_z.cutoff_time,
                  'dias_reparto', to_jsonb(v_z.delivery_days), 'zona_horaria', v_tz) end,
    'modo', coalesce(v_regla_accion, 'own'),
    'regla_id', v_regla_id,
    'motivo', v_motivo,
    'alternativa', v_alt,
    'canal', v_canal,
    'subtotal', v_sub,
    'peso_kg', v_peso
  );
end;
$function$;
