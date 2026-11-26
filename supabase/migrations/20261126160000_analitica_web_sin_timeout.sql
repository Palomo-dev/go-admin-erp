-- Analítica web sin timeout (2026-11-26).
--
-- GET /api/analitica-web y /api/sitio-web/analitica/trafico daban 500
-- («canceling statement due to statement timeout», límite de 8 s del rol
-- authenticated) en la organización con más tráfico: ~206 000 visitas en 30
-- días (org 333). No era la RLS (con service_role tardaba lo mismo: 9,4 s el
-- tráfico y 4,1–7,5 s la analítica) ni los cambios de seguridad del
-- 2026-11-25: era el volumen.
--
-- Dónde se iba el tiempo (EXPLAIN ANALYZE):
--   * fn_analitica_web_trafico: el CTE «origen» se expandía dentro de cada
--     rama del CASE de «clasificadas», así que lower(substring(...)) y
--     regexp_replace(...) se evaluaban hasta 10 veces por sesión (90 000
--     sesiones): 6,7 s de 9,8 s.
--   * Las dos: count(distinct ...) sobre texto con la intercalación
--     en_US.UTF-8 ordena 200 000 filas por consulta y, con el work_mem por
--     defecto, los ordenamientos se iban a disco.
--
-- Arreglo (mismo resultado, mismas firmas, mismo SECURITY INVOKER con la RLS
-- de la sesión y la misma guarda fn_assert_acceso_org):
--   * work_mem = 64MB en las dos funciones (los ordenamientos caben en memoria).
--   * Distintos por agrupación (hash) en lugar de count(distinct), con las
--     claves derivadas en intercalación "C" (comparación por bytes, exacta
--     para hashes e ids). ip_hash conserva su intercalación para que el
--     NOT EXISTS de «visitantes nuevos» siga usando su índice.
--   * Tráfico: el origen se clasifica una vez por referrer distinto, no por
--     sesión, y el utm_source solo se busca cuando la entrada lo trae.
--   * Ciudades y regiones del país salen de una sola lectura.
--
-- Reversión: supabase/rollbacks/20261126160000_analitica_web_sin_timeout_rollback.sql

create or replace function public.fn_analitica_web(
  p_organization_id integer,
  p_desde date,
  p_hasta date,
  p_branch_id integer default null::integer,
  p_pais text default null::text
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
set work_mem to '64MB'
as $function$
declare
  v_tz        text;
  v_dias      integer;
  v_ini       timestamptz;
  v_fin       timestamptz;
  v_ini_ant   timestamptz;
  v_pais      text := upper(nullif(btrim(p_pais), ''));
  v_periodos  jsonb;
  v_serie     jsonb;
  v_paises    jsonb;
  v_ciudades  jsonb := '[]'::jsonb;
  v_ciudades_total integer := 0;
  v_regiones  jsonb := '[]'::jsonb;
  v_ciudades_region jsonb := '[]'::jsonb;
  v_con_pais  bigint;
  v_sin_ubic  bigint := null;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  v_dias := (p_hasta - p_desde) + 1;
  if v_dias > 400 then
    raise exception 'El rango no puede superar 400 días' using errcode = '22023';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'La sucursal no es de la organización' using errcode = '42501';
  end if;
  if v_pais is not null and v_pais !~ '^[A-Z]{2}$' then
    raise exception 'País inválido' using errcode = '22023';
  end if;

  v_tz      := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_ini     := p_desde::timestamp at time zone v_tz;
  v_fin     := (p_hasta + 1)::timestamp at time zone v_tz;
  v_ini_ant := (p_desde - v_dias)::timestamp at time zone v_tz;

  -- Totales de los dos periodos.
  with periodos(p, ini, fin) as (
    values ('actual'::text, v_ini, v_fin), ('anterior'::text, v_ini_ant, v_ini)
  ),
  vis as materialized (
    select pe.p, pe.ini,
           (coalesce(w.ip_hash, 's:' || w.session_id)) collate "C" as visitante,
           w.ip_hash,
           w.session_id collate "C" as session_id
    from periodos pe
    join public.website_visits w
      on w.organization_id = p_organization_id
     and w.created_at >= pe.ini and w.created_at < pe.fin
  ),
  -- Un visitante por fila y periodo (equivale al «distinct p, ini, visitante, ip_hash»).
  vis_dist as materialized (
    select p, ini, visitante, ip_hash
    from vis
    group by p, ini, visitante, ip_hash
  ),
  vis_tot as (
    select v.p, v.visitantes, coalesce(s.sesiones, 0) as sesiones
    from (select p, count(visitante) as visitantes from vis_dist group by p) v
    left join (
      select p, count(session_id) as sesiones
      from (select p, session_id from vis group by p, session_id) x
      group by p
    ) s on s.p = v.p
  ),
  vis_nuevos as (
    select d.p, count(*) as nuevos
    from vis_dist d
    where d.ip_hash is null
       or not exists (
         select 1 from public.website_visits w2
         where w2.organization_id = p_organization_id
           and w2.ip_hash = d.ip_hash
           and w2.created_at < d.ini
       )
    group by d.p
  ),
  ped as (
    select pe.p,
      count(o.id) as pedidos,
      count(o.id) filter (where o.payment_status = 'paid' or o.status = 'delivered') as completados,
      count(o.id) filter (where o.status in ('cancelled', 'rejected')) as cancelados,
      count(o.id) filter (
        where not (o.payment_status = 'paid' or o.status = 'delivered')
          and o.status not in ('cancelled', 'rejected')
      ) as pendientes,
      coalesce(sum(o.total) filter (where o.payment_status = 'paid' or o.status = 'delivered'), 0) as ingresos
    from periodos pe
    left join public.web_orders o
      on o.organization_id = p_organization_id
     and (p_branch_id is null or o.branch_id = p_branch_id)
     and o.created_at >= pe.ini and o.created_at < pe.fin
    group by pe.p
  )
  select jsonb_object_agg(pe.p, jsonb_build_object(
           'visitantes', coalesce(vt.visitantes, 0),
           'visitantes_nuevos', coalesce(vn.nuevos, 0),
           'sesiones', coalesce(vt.sesiones, 0),
           'pedidos', coalesce(pd.pedidos, 0),
           'pendientes', coalesce(pd.pendientes, 0),
           'completados', coalesce(pd.completados, 0),
           'cancelados', coalesce(pd.cancelados, 0),
           'ingresos', coalesce(pd.ingresos, 0),
           'venta_media', case when coalesce(pd.completados, 0) > 0
                               then round(pd.ingresos / pd.completados, 2) else null end
         ))
    into v_periodos
  from periodos pe
  left join vis_tot vt on vt.p = pe.p
  left join vis_nuevos vn on vn.p = pe.p
  left join ped pd on pd.p = pe.p;

  -- Serie diaria, alineada día a día con el periodo anterior.
  with dias as (
    select d::date as fecha, (d::date - v_dias) as fecha_ant
    from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') d
  ),
  v_dia as (
    select x.fecha, count(x.visitante) as n
    from (
      select (w.created_at at time zone v_tz)::date as fecha,
             (coalesce(w.ip_hash, 's:' || w.session_id)) collate "C" as visitante
      from public.website_visits w
      where w.organization_id = p_organization_id and w.created_at >= v_ini_ant and w.created_at < v_fin
      group by 1, 2
    ) x
    group by x.fecha
  ),
  p_dia as (
    select (o.created_at at time zone v_tz)::date as fecha, count(*) as n
    from public.web_orders o
    where o.organization_id = p_organization_id
      and (p_branch_id is null or o.branch_id = p_branch_id)
      and o.created_at >= v_ini_ant and o.created_at < v_fin
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', d.fecha,
           'visitantes', coalesce(va.n, 0),
           'pedidos', coalesce(pa.n, 0),
           'visitantes_anterior', coalesce(vb.n, 0),
           'pedidos_anterior', coalesce(pb.n, 0)
         ) order by d.fecha), '[]'::jsonb)
    into v_serie
  from dias d
  left join v_dia va on va.fecha = d.fecha
  left join p_dia pa on pa.fecha = d.fecha
  left join v_dia vb on vb.fecha = d.fecha_ant
  left join p_dia pb on pb.fecha = d.fecha_ant;

  -- Países del periodo actual.
  with base as materialized (
    select w.country as pais,
           (coalesce(w.ip_hash, 's:' || w.session_id)) collate "C" as visitante,
           w.session_id collate "C" as session_id
    from public.website_visits w
    where w.organization_id = p_organization_id
      and w.created_at >= v_ini and w.created_at < v_fin
      and w.country is not null
  ),
  pv as (
    select pais, count(visitante) as visitantes, sum(filas) as filas
    from (select pais, visitante, count(*) as filas from base group by pais, visitante) x
    group by pais
  ),
  ps as (
    select pais, count(session_id) as sesiones
    from (select pais, session_id from base group by pais, session_id) x
    group by pais
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.visitantes desc, x.pais), '[]'::jsonb),
         coalesce(sum(x.filas), 0)
    into v_paises, v_con_pais
  from (
    select pv.pais, pv.visitantes, coalesce(ps.sesiones, 0) as sesiones, pv.filas
    from pv
    left join ps on ps.pais = pv.pais
    order by pv.visitantes desc, pv.pais
    limit 60
  ) x;
  v_paises := (select coalesce(jsonb_agg(e - 'filas' order by (e->>'visitantes')::bigint desc, e->>'pais'), '[]'::jsonb)
               from jsonb_array_elements(v_paises) e);

  -- Ciudades y regiones del país pedido, de una sola lectura:
  --   ciudades        las 500 con más visitantes;
  --   ciudades_region las que quedan fuera de esas 500 pero están entre las
  --                   50 primeras de SU región (hasta 1 000 filas);
  --   ciudades_total  ciudades distintas;
  --   regiones        departamentos (en CO), tope de 100 filas.
  if v_pais is not null then
    with base as materialized (
      select w.city, w.region,
             (coalesce(w.ip_hash, 's:' || w.session_id)) collate "C" as visitante,
             w.session_id collate "C" as session_id
      from public.website_visits w
      where w.organization_id = p_organization_id
        and w.created_at >= v_ini and w.created_at < v_fin
        and w.country = v_pais
    ),
    cv as (
      select ciudad, count(visitante) as visitantes, max(region) as region
      from (select city as ciudad, visitante, max(region) as region
              from base where city is not null group by city, visitante) x
      group by ciudad
    ),
    cs as (
      select ciudad, count(session_id) as sesiones
      from (select city as ciudad, session_id from base where city is not null group by city, session_id) x
      group by ciudad
    ),
    c as (
      select cv.ciudad, cv.region, cv.visitantes, coalesce(cs.sesiones, 0) as sesiones
      from cv left join cs on cs.ciudad = cv.ciudad
    ),
    r as (
      select c.*,
             row_number() over (order by c.visitantes desc, c.ciudad) as rn,
             row_number() over (partition by c.region order by c.visitantes desc, c.ciudad) as rn_region
      from c
    ),
    extra as (
      select r.ciudad, r.region, r.visitantes, r.sesiones
      from r
      where r.rn > 500 and r.region is not null and r.rn_region <= 50
      order by r.rn_region, r.visitantes desc, r.ciudad
      limit 1000
    ),
    rv as (
      select region, count(visitante) as visitantes
      from (select region, visitante from base where region is not null group by region, visitante) x
      group by region
    ),
    rs as (
      select region, count(session_id) as sesiones
      from (select region, session_id from base where region is not null group by region, session_id) x
      group by region
    ),
    rc as (
      select region, count(city) as ciudades
      from (select region, city from base where region is not null group by region, city) x
      group by region
    ),
    reg as (
      select rv.region, rv.visitantes, coalesce(rs.sesiones, 0) as sesiones, coalesce(rc.ciudades, 0) as ciudades
      from rv
      left join rs on rs.region = rv.region
      left join rc on rc.region = rv.region
      order by rv.visitantes desc, rv.region
      limit 100
    )
    select coalesce((select jsonb_agg(jsonb_build_object('ciudad', r.ciudad, 'region', r.region, 'visitantes', r.visitantes, 'sesiones', r.sesiones)
                                      order by r.visitantes desc, r.ciudad)
                       from r where r.rn <= 500), '[]'::jsonb),
           coalesce((select jsonb_agg(jsonb_build_object('ciudad', e.ciudad, 'region', e.region, 'visitantes', e.visitantes, 'sesiones', e.sesiones)
                                      order by e.visitantes desc, e.ciudad)
                       from extra e), '[]'::jsonb),
           (select count(*) from r),
           coalesce((select jsonb_agg(to_jsonb(g) order by g.visitantes desc, g.region) from reg g), '[]'::jsonb)
      into v_ciudades, v_ciudades_region, v_ciudades_total, v_regiones;
  end if;

  -- Estado «sin ubicación»: solo se cuenta el histórico cuando el periodo no
  -- trae ninguna visita ubicada (evita recorrer la tabla en cada carga).
  if coalesce(v_con_pais, 0) = 0 then
    select count(*) into v_sin_ubic
    from public.website_visits w
    where w.organization_id = p_organization_id and w.country is null;
  end if;

  return jsonb_build_object(
    'zona', v_tz,
    'desde', p_desde,
    'hasta', p_hasta,
    'dias', v_dias,
    'actual', v_periodos->'actual',
    'anterior', v_periodos->'anterior',
    'serie', v_serie,
    'paises', v_paises,
    'pais', v_pais,
    'ciudades', v_ciudades,
    'ciudades_total', v_ciudades_total,
    'regiones', v_regiones,
    'ciudades_region', v_ciudades_region,
    'visitas_con_pais', coalesce(v_con_pais, 0),
    'visitas_sin_ubicacion_total', v_sin_ubic
  );
end;
$function$;

create or replace function public.fn_analitica_web_trafico(
  p_organization_id integer,
  p_desde date,
  p_hasta date,
  p_branch_id integer default null::integer
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
set enable_nestloop to 'off'
set work_mem to '64MB'
as $function$
declare
  v_tz     text;
  v_dias   integer;
  v_ini    timestamptz;
  v_fin    timestamptz;
  v_hosts  text[];
  v_fuentes jsonb;
  v_paginas jsonb;
  v_pedido  jsonb;
  v_reserva jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  v_dias := (p_hasta - p_desde) + 1;
  if v_dias > 400 then
    raise exception 'El rango no puede superar 400 días' using errcode = '22023';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'La sucursal no es de la organización' using errcode = '42501';
  end if;

  v_tz  := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;

  -- Hosts propios: los dominios de la organización y su subdominio del sistema.
  select coalesce(array_agg(distinct h), '{}')
    into v_hosts
    from (
      select regexp_replace(lower(d.host), '^www\.', '') as h
        from public.organization_domains d
       where d.organization_id = p_organization_id and d.host is not null
      union all
      select lower(o.subdomain) || '.goadmin.io'
        from public.organizations o
       where o.id = p_organization_id and nullif(btrim(o.subdomain), '') is not null
    ) x;

  -- Una sola lectura de las visitas del periodo (idx_website_visits_org_created):
  -- se resume por sesión y por ruta, y de ahí salen fuentes, páginas y embudo.
  with vis as materialized (
    select w.session_id collate "C" as session_id,
           w.created_at,
           w.referrer,
           w.page_path,
           case
             when split_part(w.page_path, '?', 1) in ('', '/') then '/'
             when right(l.p, 1) = '/' then regexp_replace(l.p, '/+$', '')
             else l.p
           end as ruta
      from public.website_visits w
      cross join lateral (select lower(split_part(split_part(w.page_path, '?', 1), '#', 1)) as p) l
     where w.organization_id = p_organization_id
       and w.created_at >= v_ini and w.created_at < v_fin
  ),
  ses as materialized (
    select session_id,
           (array_agg(referrer order by created_at))[1] as referrer,
           (array_agg(page_path order by created_at))[1] as entrada,
           bool_or(ruta like '/productos/%' or ruta like '/producto/%') as vio_producto,
           bool_or(ruta like '/carrito%') as vio_carrito,
           bool_or(ruta like '/checkout%') as vio_pago,
           bool_or(ruta like '/reservas%') as vio_reservas,
           bool_or(ruta like '/pedido/%' or ruta like '/checkout/resultado%' or ruta like '/reservas/confirmada%') as convirtio
      from vis
     group by session_id
  ),
  -- El origen se calcula una vez por (utm, referrer) distinto, no por sesión.
  origen as materialized (
    select h.utm,
           regexp_replace(lower(substring(h.referrer from '^[A-Za-z][A-Za-z0-9+.-]*://([^/:?#]+)')), '^www\.', '') as host,
           h.n
      from (
        select case when strpos(s.entrada, 'utm_source=') > 0
                    then lower(substring(s.entrada from '[?&]utm_source=([^&#]+)')) end as utm,
               s.referrer,
               count(*) as n
          from ses s
         group by 1, 2
      ) h
  ),
  clasificadas as (
    select case
      when utm is not null and utm <> '' then
        case
          when utm ~ 'google' then 'google'
          when utm ~ '(^|[^a-z])(ig|instagram)([^a-z]|$)' or utm ~ 'instagram' then 'instagram'
          when utm ~ '(^|[^a-z])(fb|facebook|meta)([^a-z]|$)' or utm ~ 'facebook' then 'facebook'
          when utm ~ '(whatsapp|^wa$)' then 'whatsapp'
          when utm ~ 'tiktok' then 'tiktok'
          else 'otros'
        end
      when host is null or host = '' then 'directo'
      when host = any (v_hosts) then 'directo'
      when host ~ '(^|\.)(wompi\.co|payu\.com|payulatam\.com|mercadopago\.com|mercadopago\.com\.co|epayco\.co|epayco\.com|bold\.co|stripe\.com)$' then 'directo'
      when host ~ '(^|\.)google\.[a-z.]+$' or host ~ '(^|\.)googleadservices\.com$' then 'google'
      when host ~ '(^|\.)instagram\.com$' then 'instagram'
      when host ~ '(^|\.)(facebook\.com|fb\.com|fb\.me)$' then 'facebook'
      when host ~ '(^|\.)(whatsapp\.com|wa\.me)$' then 'whatsapp'
      when host ~ '(^|\.)tiktok\.com$' then 'tiktok'
      else 'otros'
    end as fuente,
    n
    from origen
  ),
  por_ruta as (
    select v.ruta,
           count(*) as visitas,
           count(distinct v.session_id) as sesiones,
           count(distinct v.session_id) filter (where s.convirtio) as conversiones
      from vis v
      join ses s on s.session_id = v.session_id
     group by v.ruta
     order by count(*) desc, v.ruta
     limit 10
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('fuente', fuente, 'sesiones', n) order by n desc, fuente), '[]'::jsonb)
       from (select fuente, sum(n)::bigint as n from clasificadas group by fuente) f),
    (select coalesce(jsonb_agg(jsonb_build_object('ruta', ruta, 'visitas', visitas, 'sesiones', sesiones, 'conversiones', conversiones)
                               order by visitas desc, ruta), '[]'::jsonb)
       from por_ruta),
    (select jsonb_build_object(
              'sesiones', count(*),
              'productos', count(*) filter (where vio_producto),
              'carrito', count(*) filter (where vio_carrito),
              'pago', count(*) filter (where vio_pago),
              'reservas_visitas', count(*) filter (where vio_reservas))
       from ses)
    into v_fuentes, v_paginas, v_pedido;

  -- Pedidos web pagados del periodo (mismo criterio de «completado» que fn_analitica_web).
  v_pedido := v_pedido || jsonb_build_object('pagados', (
    select count(*) from public.web_orders o
     where o.organization_id = p_organization_id
       and (p_branch_id is null or o.branch_id = p_branch_id)
       and o.created_at >= v_ini and o.created_at < v_fin
       and (o.payment_status = 'paid' or o.status = 'delivered')));

  -- ── Conversión a reserva ────────────────────────────────────────────────────
  select jsonb_build_object(
           'visitas', v_pedido->'reservas_visitas',
           'creadas', count(*),
           'confirmadas', count(*) filter (where r.status in ('confirmed', 'seated', 'completed'))
         )
    into v_reserva
    from public.restaurant_reservations r
   where r.organization_id = p_organization_id
     and (p_branch_id is null or r.branch_id = p_branch_id)
     and r.source = 'website'
     and r.created_at >= v_ini and r.created_at < v_fin;

  return jsonb_build_object(
    'zona', v_tz,
    'desde', p_desde,
    'hasta', p_hasta,
    'fuentes', v_fuentes,
    'paginas', v_paginas,
    'conversion_pedido', v_pedido - 'reservas_visitas',
    'conversion_reserva', v_reserva
  );
end;
$function$;
