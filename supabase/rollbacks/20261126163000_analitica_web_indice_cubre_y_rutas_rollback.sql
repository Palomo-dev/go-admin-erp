-- Reversión de 20261126163000_analitica_web_indice_cubre_y_rutas.sql
-- 1) fn_analitica_web_trafico vuelve a la versión de 20261126160000 (ruta calculada por visita).
-- 2) El índice cubridor se quita APARTE y fuera de una transacción (no bloquea el registro de visitas):
--      drop index concurrently if exists public.idx_website_visits_org_created_cubre;
--    Sin él, fn_analitica_web vuelve a leer el heap (~1 s más en la org con más tráfico).

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
