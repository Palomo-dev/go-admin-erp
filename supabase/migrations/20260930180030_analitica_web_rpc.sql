-- ============================================================
-- fn_analitica_web — pantalla «Analítica web» (Figma 03 › 464:237482).
--
-- Una sola llamada devuelve (jsonb):
--   zona, desde, hasta, dias
--   actual / anterior: visitantes, visitantes_nuevos, sesiones, pedidos,
--     pendientes, completados, cancelados, ingresos, venta_media
--   serie: por día [{fecha, visitantes, pedidos, visitantes_anterior, pedidos_anterior}]
--   paises: [{pais, visitantes, sesiones}] (máx. 60)
--   ciudades: [{ciudad, region, visitantes, sesiones}] del país pedido (máx. 50)
--   ciudades_total, visitas_con_pais, visitas_sin_ubicacion_total
--
-- Definiciones (las del diseño):
--   - Visitante = persona distinta: `ip_hash` (hash truncado, nunca la IP) o,
--     si falta, la sesión. NO es una fila de website_visits.
--   - Sesión = `session_id` distinto (una pestaña del navegador).
--   - Visitante nuevo = sin visitas en la organización antes del periodo.
--   - Pedido completado / cancelado / pendiente: la misma regla que
--     `get_web_conversion_stats` (paid o delivered / cancelled o rejected / resto).
--   - Periodo anterior = mismos días inmediatamente antes.
--
-- Zona: `fn_timezone_for(org, sucursal)` — la de la sucursal pedida si tiene,
-- si no la de la organización (regla única, docs/reglas-fechas-timezone.md §9).
-- Nunca una zona escrita.
--
-- Sucursal: las visitas son de la tienda (no tienen sucursal); la sucursal
-- solo filtra los pedidos y debe ser de la organización.
--
-- SECURITY INVOKER: lee con la RLS de quien llama (miembros activos leen
-- website_visits y web_orders de su organización). La guarda
-- `fn_assert_acceso_org` da un error claro antes de consultar. Sin anon.
-- El permiso de negocio para VER la pantalla se comprueba en la ruta del ERP.
-- ============================================================

create or replace function public.fn_analitica_web(
  p_organization_id integer,
  p_desde date,
  p_hasta date,
  p_branch_id integer default null,
  p_pais text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
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
  vis as (
    select pe.p, pe.ini, coalesce(w.ip_hash, 's:' || w.session_id) as visitante, w.ip_hash, w.session_id
    from periodos pe
    join public.website_visits w
      on w.organization_id = p_organization_id
     and w.created_at >= pe.ini and w.created_at < pe.fin
  ),
  vis_tot as (
    select p, count(distinct visitante) as visitantes, count(distinct session_id) as sesiones
    from vis group by p
  ),
  vis_nuevos as (
    select d.p, count(*) as nuevos
    from (select distinct p, ini, visitante, ip_hash from vis) d
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
    select (w.created_at at time zone v_tz)::date as fecha,
           count(distinct coalesce(w.ip_hash, 's:' || w.session_id)) as n
    from public.website_visits w
    where w.organization_id = p_organization_id and w.created_at >= v_ini_ant and w.created_at < v_fin
    group by 1
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
  select coalesce(jsonb_agg(to_jsonb(x) order by x.visitantes desc, x.pais), '[]'::jsonb),
         coalesce(sum(x.filas), 0)
    into v_paises, v_con_pais
  from (
    select w.country as pais,
           count(distinct coalesce(w.ip_hash, 's:' || w.session_id)) as visitantes,
           count(distinct w.session_id) as sesiones,
           count(*) as filas
    from public.website_visits w
    where w.organization_id = p_organization_id
      and w.created_at >= v_ini and w.created_at < v_fin
      and w.country is not null
    group by w.country
    order by 2 desc, 1
    limit 60
  ) x;
  v_paises := (select coalesce(jsonb_agg(e - 'filas' order by (e->>'visitantes')::bigint desc, e->>'pais'), '[]'::jsonb)
               from jsonb_array_elements(v_paises) e);

  -- Ciudades del país pedido.
  if v_pais is not null then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.visitantes desc, c.ciudad), '[]'::jsonb)
      into v_ciudades
    from (
      select w.city as ciudad, max(w.region) as region,
             count(distinct coalesce(w.ip_hash, 's:' || w.session_id)) as visitantes,
             count(distinct w.session_id) as sesiones
      from public.website_visits w
      where w.organization_id = p_organization_id
        and w.created_at >= v_ini and w.created_at < v_fin
        and w.country = v_pais and w.city is not null
      group by w.city
      order by 3 desc, 1
      limit 50
    ) c;
    select count(distinct w.city) into v_ciudades_total
    from public.website_visits w
    where w.organization_id = p_organization_id
      and w.created_at >= v_ini and w.created_at < v_fin
      and w.country = v_pais and w.city is not null;
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
    'visitas_con_pais', coalesce(v_con_pais, 0),
    'visitas_sin_ubicacion_total', v_sin_ubic
  );
end;
$function$;

comment on function public.fn_analitica_web(integer, date, date, integer, text) is
  'Analítica web de la organización (visitantes únicos, sesiones, pedidos, conversión, serie diaria y geolocalización aproximada) con la zona de fn_timezone_for. SECURITY INVOKER.';

revoke all on function public.fn_analitica_web(integer, date, date, integer, text) from public, anon;
grant execute on function public.fn_analitica_web(integer, date, date, integer, text) to authenticated, service_role;
