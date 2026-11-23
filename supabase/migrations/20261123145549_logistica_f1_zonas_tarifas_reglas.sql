-- Logística Fase 1 — 2/5: zonas y tarifas de envío, reglas de despacho y UN SOLO cálculo de envío.
--
-- 1. shipping_zones: zona de reparto por organización y, opcionalmente, por sede (branch_id NULL =
--    todas las sedes). Cada zona tiene tarifa, tiempo prometido (mín–máx minutos y/o texto),
--    pedido mínimo, envío gratis desde y «envío gratis aplica en» (web | pos | both; por defecto
--    solo web; el pedido manual cuenta como pos), horario de corte, días de reparto (ISO 1 = lunes)
--    y prioridad (menor gana). is_fallback = «tarifa general»: la que se ofrece fuera de zona (una
--    por organización y sede).
-- 2. shipping_zone_locations: cobertura de la zona por municipio (código DANE de 5 dígitos), barrio
--    (opcionalmente acotado a un municipio; se compara normalizado: minúsculas, sin tildes, espacios
--    simples), código postal o polígono GeoJSON (Polygon, MultiPolygon o Feature, [lng, lat]).
--    FK compuesta (zone_id, organization_id): una ubicación no puede colgar de la zona de otra
--    organización.
-- 3. delivery_rules: reglas de despacho básicas (prioridad; condiciones por zona, canal, medio de
--    pago, valor, peso, días y horario; acción). En la Fase 1 solo 'own' (CHECK
--    delivery_rules_fase1_solo_propio, que la Fase 2 retira).
-- 4. logistica_cotizar_envio(org, sede, dirección, canal, subtotal, opciones): el ÚNICO cálculo de
--    envío. Lo usan el checkout web (service role), el POS y el pedido manual; el servidor
--    recalcula siempre. Orden de elección: zona de la sede antes que zona de toda la
--    organización, luego prioridad, luego coincidencia más precisa (polígono > barrio > código
--    postal > municipio), luego tarifa más baja. Fuera de zona: tarifa general si existe, si no
--    «transportadora» cuando la organización tiene una de tercero activa.
-- 5. shipments.shipping_zone_id: la zona con que se cotizó el envío.
-- 6. shipping_rates → zonas: hoy 0 filas en shipping_rates (verificado). Si alguna organización
--    tuviera tarifas propias, se copian como zonas INACTIVAS sin cobertura (hay que asignarles
--    barrios o municipios y activarlas); metadata.shipping_rate_id evita duplicarlas.
--
-- RLS: leer = miembro activo de la organización; escribir = además fn_caja_puede(org,
-- 'organization_settings') (administradores y cargos con «Configuración de la organización»).
-- Políticas separadas por comando para no duplicar permisivas.

-- ── Utilidades puras ───────────────────────────────────────────────────────────────────────────
create or replace function public.fn_logistica_normalizar(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(regexp_replace(lower(translate(btrim(coalesce(p_texto, '')),
           'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ',
           'aaaaeeeeiiiioooouuuunaaaaeeeeiiiioooouuuun')), '\s+', ' ', 'g'), '');
$$;

create or replace function public.fn_logistica_punto_en_anillo(p_x double precision, p_y double precision, p_anillo jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  n integer := coalesce(jsonb_array_length(p_anillo), 0);
  i integer;
  j integer;
  xi double precision;
  yi double precision;
  xj double precision;
  yj double precision;
  dentro boolean := false;
begin
  if n < 3 then
    return false;
  end if;
  j := n - 1;
  for i in 0 .. n - 1 loop
    xi := (p_anillo -> i ->> 0)::double precision;
    yi := (p_anillo -> i ->> 1)::double precision;
    xj := (p_anillo -> j ->> 0)::double precision;
    yj := (p_anillo -> j ->> 1)::double precision;
    if ((yi > p_y) <> (yj > p_y)) and (p_x < (xj - xi) * (p_y - yi) / (yj - yi) + xi) then
      dentro := not dentro;
    end if;
    j := i;
  end loop;
  return dentro;
end;
$$;

create or replace function public.fn_logistica_punto_en_geojson(p_lat numeric, p_lng numeric, p_geo jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  v_geo jsonb := p_geo;
  v_poligonos jsonb;
  v_pol jsonb;
begin
  if p_lat is null or p_lng is null or v_geo is null then
    return false;
  end if;
  if v_geo ->> 'type' = 'Feature' then
    v_geo := v_geo -> 'geometry';
  end if;
  if v_geo ->> 'type' = 'Polygon' then
    v_poligonos := jsonb_build_array(v_geo -> 'coordinates');
  elsif v_geo ->> 'type' = 'MultiPolygon' then
    v_poligonos := v_geo -> 'coordinates';
  else
    return false;
  end if;
  for v_pol in select value from jsonb_array_elements(v_poligonos) loop
    if public.fn_logistica_punto_en_anillo(p_lng::double precision, p_lat::double precision, v_pol -> 0)
       and not exists (
         select 1 from jsonb_array_elements(v_pol) with ordinality h (anillo, orden)
          where h.orden > 1
            and public.fn_logistica_punto_en_anillo(p_lng::double precision, p_lat::double precision, h.anillo)) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- ── 1. shipping_zones ──────────────────────────────────────────────────────────────────────────
create table if not exists public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  branch_id integer references public.branches (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  is_active boolean not null default true,
  is_fallback boolean not null default false,
  priority integer not null default 100,
  fee numeric(14, 2) not null default 0 check (fee >= 0),
  currency character(3),
  promise_min_minutes integer check (promise_min_minutes is null or promise_min_minutes >= 0),
  promise_max_minutes integer check (promise_max_minutes is null or promise_max_minutes >= 0),
  promise_text text,
  min_order_amount numeric(14, 2) not null default 0 check (min_order_amount >= 0),
  free_shipping_from numeric(14, 2) check (free_shipping_from is null or free_shipping_from > 0),
  free_shipping_applies_to text not null default 'web' check (free_shipping_applies_to in ('web', 'pos', 'both')),
  cutoff_time time,
  delivery_days smallint[] not null default '{1,2,3,4,5,6,7}'::smallint[]
    check (cardinality(delivery_days) > 0 and delivery_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_zones_promesa_check
    check (promise_min_minutes is null or promise_max_minutes is null or promise_max_minutes >= promise_min_minutes),
  constraint shipping_zones_id_org_key unique (id, organization_id)
);
create index if not exists idx_shipping_zones_org on public.shipping_zones (organization_id, is_active, priority);
create index if not exists idx_shipping_zones_branch on public.shipping_zones (branch_id);
create unique index if not exists uq_shipping_zones_nombre
  on public.shipping_zones (organization_id, coalesce(branch_id, 0), lower(btrim(name)));
create unique index if not exists uq_shipping_zones_tarifa_general
  on public.shipping_zones (organization_id, coalesce(branch_id, 0)) where is_fallback;

create or replace function public.fn_shipping_zones_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.branch_id is not null and not exists (
    select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id
  ) then
    raise exception 'SEDE_DE_OTRA_ORGANIZACION' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.fn_shipping_zones_validar() from public, anon, authenticated;

drop trigger if exists trg_shipping_zones_validar on public.shipping_zones;
create trigger trg_shipping_zones_validar
  before insert or update on public.shipping_zones
  for each row execute function public.fn_shipping_zones_validar();

drop trigger if exists trg_00_moneda_base_por_defecto on public.shipping_zones;
create trigger trg_00_moneda_base_por_defecto
  before insert on public.shipping_zones
  for each row execute function public.fn_trg_moneda_base_por_defecto('currency');

-- ── 2. shipping_zone_locations ─────────────────────────────────────────────────────────────────
create table if not exists public.shipping_zone_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  zone_id uuid not null,
  location_type text not null check (location_type in ('municipality', 'neighborhood', 'postal_code', 'polygon')),
  municipality_code text check (municipality_code is null or municipality_code ~ '^[0-9]{5}$'),
  neighborhood text,
  neighborhood_key text generated always as (public.fn_logistica_normalizar(neighborhood)) stored,
  postal_code text check (postal_code is null or postal_code ~ '^[0-9A-Za-z -]{3,10}$'),
  polygon jsonb,
  label text,
  created_at timestamptz not null default now(),
  constraint shipping_zone_locations_zona_fkey foreign key (zone_id, organization_id)
    references public.shipping_zones (id, organization_id) on delete cascade,
  constraint shipping_zone_locations_forma_check check (
       (location_type = 'municipality' and municipality_code is not null)
    or (location_type = 'neighborhood' and public.fn_logistica_normalizar(neighborhood) is not null)
    or (location_type = 'postal_code' and postal_code is not null)
    or (location_type = 'polygon' and polygon is not null
        and coalesce(polygon ->> 'type', '') in ('Polygon', 'MultiPolygon', 'Feature')))
);
create index if not exists idx_shipping_zone_locations_zona on public.shipping_zone_locations (zone_id, organization_id);
create index if not exists idx_shipping_zone_locations_muni
  on public.shipping_zone_locations (organization_id, location_type, municipality_code);
create index if not exists idx_shipping_zone_locations_barrio
  on public.shipping_zone_locations (organization_id, neighborhood_key) where location_type = 'neighborhood';
create index if not exists idx_shipping_zone_locations_cp
  on public.shipping_zone_locations (organization_id, postal_code) where location_type = 'postal_code';

-- ── 3. delivery_rules ──────────────────────────────────────────────────────────────────────────
create table if not exists public.delivery_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  branch_id integer references public.branches (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  is_active boolean not null default true,
  priority integer not null default 100,
  zone_ids uuid[],
  channels text[] check (channels is null or channels <@ array['web', 'pos', 'manual']),
  payment_methods text[],
  min_order_value numeric(14, 2),
  max_order_value numeric(14, 2),
  min_weight_kg numeric(10, 3),
  max_weight_kg numeric(10, 3),
  weekdays smallint[] check (weekdays is null or weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  time_from time,
  time_to time,
  action text not null default 'own' check (action in ('own', 'last_mile', 'national_carrier', 'marketplace')),
  carrier_id uuid references public.transport_carriers (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_rules_fase1_solo_propio check (action = 'own')
);
create index if not exists idx_delivery_rules_org on public.delivery_rules (organization_id, is_active, priority);
create index if not exists idx_delivery_rules_branch on public.delivery_rules (branch_id);
create index if not exists idx_delivery_rules_carrier on public.delivery_rules (carrier_id);

drop trigger if exists trg_delivery_rules_validar on public.delivery_rules;
create trigger trg_delivery_rules_validar
  before insert or update on public.delivery_rules
  for each row execute function public.fn_shipping_zones_validar();

-- ── RLS de las tres tablas ─────────────────────────────────────────────────────────────────────
do $p$
declare
  t text;
  v_miembro text := 'organization_id in (select om.organization_id from public.organization_members om '
                    'where om.user_id = (select auth.uid()) and om.is_active)';
  v_gestor text;
begin
  v_gestor := v_miembro || ' and public.fn_caja_puede(organization_id, ''organization_settings'')';
  foreach t in array array['shipping_zones', 'shipping_zone_locations', 'delivery_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t, v_miembro);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert', t, v_gestor);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   t || '_update', t, v_gestor, v_gestor);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_delete', t, v_gestor);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end
$p$;

-- ── 5. shipments.shipping_zone_id ──────────────────────────────────────────────────────────────
alter table public.shipments
  add column if not exists shipping_zone_id uuid references public.shipping_zones (id) on delete set null;
create index if not exists idx_shipments_shipping_zone on public.shipments (shipping_zone_id);

-- ── 6. shipping_rates → zonas (hoy 0 filas) ────────────────────────────────────────────────────
insert into public.shipping_zones (organization_id, name, is_active, is_fallback, fee, currency, free_shipping_from,
                                   free_shipping_applies_to, promise_text, metadata)
select r.organization_id,
       left(r.rate_name, 100) || ' (tarifa anterior)',
       false,
       false,
       greatest(coalesce(r.base_rate, 0), coalesce(r.min_charge, 0)),
       r.currency,
       nullif(r.free_shipping_threshold, 0),
       case when r.show_on_website and r.show_on_pos then 'both' when r.show_on_pos then 'pos' else 'web' end,
       case when r.estimated_transit_days is not null then r.estimated_transit_days || ' día(s)' end,
       jsonb_build_object('shipping_rate_id', r.id, 'destination_city', r.destination_city,
                          'destination_zone', r.destination_zone, 'migrado', '2026-11-23')
  from public.shipping_rates r
  left join public.transport_carriers c on c.id = r.carrier_id
 where coalesce(r.is_active, true)
   and coalesce(c.carrier_type, 'own_fleet') <> 'third_party'
   and not exists (select 1 from public.shipping_zones z
                    where z.organization_id = r.organization_id
                      and z.metadata ->> 'shipping_rate_id' = r.id::text)
on conflict do nothing;

-- ── 4. Cotizar envío ───────────────────────────────────────────────────────────────────────────
create or replace function public.logistica_cotizar_envio(
  p_organization_id integer,
  p_branch_id integer,
  p_direccion jsonb,
  p_canal text,
  p_subtotal numeric,
  p_opciones jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    'subtotal', v_sub
  );
end;
$$;
revoke execute on function public.logistica_cotizar_envio(integer, integer, jsonb, text, numeric, jsonb) from public, anon;
grant execute on function public.logistica_cotizar_envio(integer, integer, jsonb, text, numeric, jsonb) to authenticated, service_role;

comment on function public.logistica_cotizar_envio(integer, integer, jsonb, text, numeric, jsonb) is
  'Único cálculo de envío (logística Fase 1). p_direccion: {municipio_dane, barrio, codigo_postal, lat, lng}; p_canal: web | pos | manual; p_opciones: {metodo_pago, peso_kg}. Devuelve zona, precio, tiempo, mínimo, falta para envío gratis, despacho y motivo/alternativa fuera de zona.';
comment on table public.shipping_zones is 'Zonas de reparto propias (logística Fase 1). is_fallback = tarifa general fuera de zona.';
comment on table public.shipping_zone_locations is 'Cobertura de una zona: municipio DANE, barrio (normalizado), código postal o polígono GeoJSON [lng, lat].';
comment on table public.delivery_rules is 'Reglas de despacho (logística Fase 1: solo acción own).';
