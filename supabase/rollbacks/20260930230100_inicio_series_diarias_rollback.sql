-- Rollback de 20260930230100_inicio_series_diarias: vuelve a las definiciones
-- anteriores de fn_inicio_ventas_rango y fn_inicio_tienda_web, byte a byte
-- (md5(prosrc) antes de la migración: fn_inicio_ventas_rango =
-- af58f90cde4c9eb089ca5664a085c1f2, fn_inicio_tienda_web =
-- b3619e82c6b35b7eccc3da38cd5edac4). Sin las claves `granularidad`/`serie`
-- ni `por_expirar`/`expiran_hoy`: el inicio las trata como opcionales (sin
-- miniaturas ni gráfica). Restaura también los comentarios anteriores. No
-- toca datos. Los privilegios se conservan (CREATE OR REPLACE no los cambia).

CREATE OR REPLACE FUNCTION public.fn_inicio_ventas_rango(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_branch_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sucursales integer[];
  v_duracion interval;
  v_r jsonb;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Quien vende ve lo vendido: pos.view, sales_management, reports.sales o administración.
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch_id is not null then
    if auth.uid() is not null and not public.app_branch_access(p_branch_id) then
      raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
    end if;
    v_sucursales := array[p_branch_id];
  else
    select coalesce(array_agg(b.id), array[]::integer[]) into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and (auth.uid() is null or public.app_branch_access(b.id));
  end if;

  v_duracion := p_hasta - p_desde;

  with cobros as (
    select p.id as pago_id,
           case when p.payment_date >= p_desde then 'actual' else 'anterior' end as periodo,
           (p.amount - coalesce(p.change_amount, 0)) as neto,
           coalesce(v.id::text, i.id::text) as documento,
           case
             when v.id is null then 'factura'
             when v.web_order_id is not null or v.source = 'web' then 'web'
             when v.table_session_id is not null then 'mesa'
             when v.source = 'invoice' then 'factura'
             else 'pos'
           end as canal,
           coalesce(v.branch_id, i.branch_id, p.branch_id) as sucursal,
           case when coalesce(i.total, v.total, 0) > 0
                then (p.amount - coalesce(p.change_amount, 0)) * coalesce(i.tax_total, v.tax_total, 0) / coalesce(i.total, v.total)
                else 0 end as impuesto
      from public.payments p
      left join public.accounts_receivable a
        on a.id = case when p.source = 'account_receivable' and p.source_id ~* v_uuid then p.source_id::uuid end
      left join public.invoice_sales i
        on i.id = case when p.source = 'invoice_sales' and p.source_id ~* v_uuid then p.source_id::uuid
                       when p.source = 'account_receivable' then a.invoice_id end
      left join public.sales v
        on v.id = case when p.source = 'sale' and p.source_id ~* v_uuid then p.source_id::uuid
                       else coalesce(i.sale_id, a.sale_id) end
     where p.organization_id = p_organization_id
       and p.status = 'completed'
       and p.voided_at is null
       and p.source in ('invoice_sales', 'sale', 'account_receivable')
       and p.payment_date >= p_desde - v_duracion
       and p.payment_date < p_hasta
  ),
  cs as (
    select * from cobros where sucursal = any (v_sucursales)
  ),
  reintegros as (
    select case when r.created_at >= p_desde then 'actual' else 'anterior' end as periodo, r.total_refund as monto
      from public.returns r
     where r.organization_id = p_organization_id
       and r.status = 'processed'
       and coalesce(r.refund_method, 'cash') = 'cash'
       and r.branch_id = any (v_sucursales)
       and r.created_at >= p_desde - v_duracion
       and r.created_at < p_hasta
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'desde_anterior', p_desde - v_duracion,
    'actual', jsonb_build_object(
      'cobrado', round(coalesce((select sum(neto) from cs where periodo = 'actual'), 0), 2),
      'reintegros', round(coalesce((select sum(monto) from reintegros where periodo = 'actual'), 0), 2),
      'num_cobros', (select count(*) from cs where periodo = 'actual'),
      'ventas_cobradas', (select count(distinct documento) from cs where periodo = 'actual'),
      'impuestos', round(coalesce((select sum(impuesto) from cs where periodo = 'actual'), 0), 2),
      'por_canal', coalesce((select jsonb_object_agg(canal, total) from (
          select canal, round(sum(neto), 2) as total from cs where periodo = 'actual' group by canal) c), '{}'::jsonb),
      'por_sucursal', coalesce((select jsonb_object_agg(sucursal::text, total) from (
          select sucursal, round(sum(neto), 2) as total from cs where periodo = 'actual' group by sucursal) s), '{}'::jsonb),
      'facturado', round(coalesce((
          select sum(s.total) from public.sales s
           where s.organization_id = p_organization_id
             and s.branch_id = any (v_sucursales)
             and s.status not in ('void', 'draft', 'cancelled')
             and s.sale_date >= p_desde and s.sale_date < p_hasta), 0), 2)
    ),
    'anterior', jsonb_build_object(
      'cobrado', round(coalesce((select sum(neto) from cs where periodo = 'anterior'), 0), 2),
      'reintegros', round(coalesce((select sum(monto) from reintegros where periodo = 'anterior'), 0), 2),
      'num_cobros', (select count(*) from cs where periodo = 'anterior'),
      'ventas_cobradas', (select count(distinct documento) from cs where periodo = 'anterior')
    )
  ) into v_r;

  -- Neto (cobrado − reintegros) y ticket promedio por venta cobrada.
  v_r := jsonb_set(v_r, '{actual,neto}', to_jsonb(round((v_r #>> '{actual,cobrado}')::numeric - (v_r #>> '{actual,reintegros}')::numeric, 2)));
  v_r := jsonb_set(v_r, '{anterior,neto}', to_jsonb(round((v_r #>> '{anterior,cobrado}')::numeric - (v_r #>> '{anterior,reintegros}')::numeric, 2)));
  v_r := jsonb_set(v_r, '{actual,ticket_promedio}', to_jsonb(
    case when (v_r #>> '{actual,ventas_cobradas}')::integer > 0
         then round((v_r #>> '{actual,cobrado}')::numeric / (v_r #>> '{actual,ventas_cobradas}')::integer, 2)
         else 0 end));
  return v_r;
end;
$function$;

comment on function public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer) is
  'Ventas con criterio de caja (PARIDAD-DASHBOARD-INICIO §V.9c): lo cobrado por payment_date menos reintegros en efectivo, por canal y sucursal, con el periodo anterior de igual duración. Función única para los KPI de Ventas y el Inicio.';

CREATE OR REPLACE FUNCTION public.fn_inicio_tienda_web(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_desde_anterior timestamp with time zone, p_hasta_anterior timestamp with time zone, p_branch_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sucursales integer[];
  v_r jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
     or p_desde_anterior is null or p_hasta_anterior is null or p_hasta_anterior <= p_desde_anterior then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Los pedidos web viven en el POS («Pedidos online»): mismo permiso que ventas.
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
      raise exception 'Sucursal no válida' using errcode = '22023';
    end if;
    if auth.uid() is not null and not public.app_branch_access(p_branch_id) then
      raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
    end if;
    v_sucursales := array[p_branch_id];
  else
    select coalesce(array_agg(b.id), array[]::integer[]) into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and (auth.uid() is null or public.app_branch_access(b.id));
  end if;

  -- Sin tienda web (ni pedidos ni visitas nunca), la tarjeta sobra.
  if not exists (select 1 from public.web_orders w where w.organization_id = p_organization_id)
     and not exists (select 1 from public.website_visits v where v.organization_id = p_organization_id) then
    return jsonb_build_object('activa', false);
  end if;

  -- Distintos con GROUP BY (agregado por hash) y no con count(distinct), que
  -- ordena: en la organización con más visitas, 3 s → 0,4 s para 60 días.
  with visitas as (
    select case when v.created_at >= p_desde then 'actual' else 'anterior' end as periodo,
           v.session_id, coalesce(v.ip_hash, v.session_id) as visitante, v.is_new_visitor
      from public.website_visits v
     where v.organization_id = p_organization_id
       and ((v.created_at >= p_desde and v.created_at < p_hasta)
            or (v.created_at >= p_desde_anterior and v.created_at < p_hasta_anterior))
  ),
  sesiones as (
    select periodo, session_id, bool_or(coalesce(is_new_visitor, false)) as nueva
      from visitas group by periodo, session_id
  ),
  visitantes as (
    select periodo, visitante from visitas group by periodo, visitante
  ),
  pedidos as (
    select case when w.created_at >= p_desde then 'actual' else 'anterior' end as periodo,
           (w.sale_id is not null or w.payment_status = 'paid') as pagado
      from public.web_orders w
     where w.organization_id = p_organization_id
       and w.branch_id = any (v_sucursales)
       and ((w.created_at >= p_desde and w.created_at < p_hasta)
            or (w.created_at >= p_desde_anterior and w.created_at < p_hasta_anterior))
  )
  select jsonb_build_object(
    'activa', true,
    'desde', p_desde,
    'hasta', p_hasta,
    'actual', jsonb_build_object(
      'visitantes', (select count(*) from visitantes where periodo = 'actual'),
      'sesiones', (select count(*) from sesiones where periodo = 'actual'),
      'sesiones_nuevas', (select count(*) from sesiones where periodo = 'actual' and nueva),
      'pedidos', (select count(*) from pedidos where periodo = 'actual'),
      'pedidos_pagados', (select count(*) from pedidos where periodo = 'actual' and pagado)
    ),
    'anterior', jsonb_build_object(
      'visitantes', (select count(*) from visitantes where periodo = 'anterior'),
      'sesiones', (select count(*) from sesiones where periodo = 'anterior'),
      'pedidos', (select count(*) from pedidos where periodo = 'anterior'),
      'pedidos_pagados', (select count(*) from pedidos where periodo = 'anterior' and pagado)
    ),
    -- Estado actual, no depende del periodo (mismo criterio que el bloque «Hoy»).
    'pendientes', (
      select count(*) from public.web_orders w
       where w.organization_id = p_organization_id
         and w.branch_id = any (v_sucursales)
         and w.status = 'pending'
         and w.payment_status = 'pending'
         and w.stock_released_at is null
    )
  ) into v_r;

  return v_r;
end;
$function$;

comment on function public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) is
  'Tarjeta «Tienda web» del inicio: visitantes (ip_hash o sesión), sesiones, pedidos y pedidos pagados del periodo y del anterior, y pendientes ahora. Sin importes (web_orders no guarda moneda).';
