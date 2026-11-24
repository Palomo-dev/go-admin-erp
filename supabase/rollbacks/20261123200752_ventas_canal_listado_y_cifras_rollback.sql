-- Reversión de 20261123200752_ventas_canal_listado_y_cifras: quita la columna
-- `canal`, el parámetro `p_canales` y `por_canal`, y deja las tres funciones
-- como las dejó 20261120180446_pos_ventas_listado_figma_filtros_y_cifras
-- (copiadas tal cual de esa migración, la única que las había definido).

drop function if exists public.pos_ventas_listado_v2(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text, text, integer, integer, text[]);
drop function if exists public.pos_ventas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[]);
drop function if exists public.pos_ventas_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[]);

create or replace function public.pos_ventas_filtradas(
  p_organization_id integer,
  p_sucursales integer[],
  p_desde timestamptz,
  p_hasta timestamptz,
  p_busqueda text,
  p_origenes text[],
  p_estados text[],
  p_metodos text[],
  p_cliente_id uuid,
  p_cajero_id uuid,
  p_importe_min numeric,
  p_importe_max numeric,
  p_pagos text[],
  p_con_saldo boolean,
  p_con_devolucion boolean,
  p_pendientes_sync boolean
)
returns table (
  id uuid,
  organization_id integer,
  branch_id integer,
  customer_id uuid,
  user_id uuid,
  sale_date timestamptz,
  created_at timestamptz,
  total numeric,
  balance numeric,
  tax_total numeric,
  tax_breakdown jsonb,
  status text,
  payment_status text,
  web_order_id uuid,
  table_session_id uuid,
  factura_id uuid,
  factura_numero text,
  pedido_numero text,
  numero text,
  cliente_nombre text,
  cliente_documento text,
  devuelto numeric,
  notas_credito integer,
  origen text,
  estado text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with base as (
    select s.id, s.organization_id, s.branch_id, s.customer_id, s.user_id, s.sale_date, s.created_at,
           s.total, s.balance, s.tax_total, s.tax_breakdown, s.status, s.payment_status, s.source,
           s.web_order_id, s.table_session_id,
           (select i.id from public.invoice_sales i
             where i.sale_id = s.id and coalesce(i.document_type, 'invoice') <> 'credit_note'
             order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1) as factura_id,
           coalesce((select sum(r.total_refund) from public.returns r where r.sale_id = s.id and r.status = 'processed'), 0) as devuelto,
           (select count(*)::integer from public.invoice_sales n where n.sale_id = s.id and n.document_type = 'credit_note') as notas_credito
      from public.sales s
     where s.organization_id = p_organization_id
       and s.branch_id = any (p_sucursales)
       and (p_desde is null or s.sale_date >= p_desde)
       and (p_hasta is null or s.sale_date <= p_hasta)
       and (p_cliente_id is null or s.customer_id = p_cliente_id)
       and (p_cajero_id is null or s.user_id = p_cajero_id)
       and (p_importe_min is null or s.total >= p_importe_min)
       and (p_importe_max is null or s.total <= p_importe_max)
       and (p_pagos is null or coalesce(nullif(s.payment_status, ''), s.status) = any (p_pagos))
       -- Las ventas del outbox del Desktop solo existen en la réplica local.
       and (p_pendientes_sync is not true or s.status = 'pending_sync')
  ),
  calculada as (
    select b.*,
           fi.number as factura_numero,
           wo.order_number as pedido_numero,
           c.full_name as cliente_nombre,
           coalesce(nullif(c.identification_number, ''), c.doc_number) as cliente_documento,
           case
             when b.web_order_id is not null or b.source = 'web' then 'web'
             when b.table_session_id is not null then 'mesa'
             when b.source = 'invoice' then 'factura'
             else 'pos'
           end as origen,
           case
             when b.status in ('void', 'cancelled') then 'anulada'
             when b.status = 'draft' then 'borrador'
             when b.payment_status = 'refunded' or (coalesce(b.total, 0) > 0 and b.devuelto >= coalesce(b.total, 0) - 0.005) then 'devuelta'
             when b.devuelto > 0 then 'devuelta_parcial'
             when coalesce(nullif(b.payment_status, ''), b.status) = 'paid' then 'pagada'
             when coalesce(nullif(b.payment_status, ''), b.status) = 'partial' then 'pago_parcial'
             else 'pendiente_pago'
           end as estado
      from base b
      left join public.invoice_sales fi on fi.id = b.factura_id
      left join public.web_orders wo on wo.id = b.web_order_id
      left join public.customers c on c.id = b.customer_id
  )
  select x.id, x.organization_id, x.branch_id, x.customer_id, x.user_id, x.sale_date, x.created_at,
         x.total, x.balance, x.tax_total, x.tax_breakdown, x.status, x.payment_status, x.web_order_id,
         x.table_session_id, x.factura_id, x.factura_numero, x.pedido_numero,
         coalesce(x.factura_numero, x.pedido_numero) as numero,
         x.cliente_nombre, x.cliente_documento, x.devuelto, x.notas_credito, x.origen, x.estado
    from calculada x
   where (p_origenes is null or x.origen = any (p_origenes))
     and (p_estados is null or x.estado = any (p_estados))
     and (p_con_saldo is not true or (coalesce(x.balance, 0) > 0.005 and x.estado not in ('anulada', 'borrador')))
     and (p_con_devolucion is not true or x.devuelto > 0 or x.notas_credito > 0)
     and (p_busqueda is null
          or x.factura_numero ilike p_busqueda
          or x.pedido_numero ilike p_busqueda
          or x.cliente_nombre ilike p_busqueda
          or x.cliente_documento ilike p_busqueda)
     and (p_metodos is null or exists (
          select 1 from public.payments p
           where p.organization_id = x.organization_id
             and p.status = 'completed' and p.voided_at is null
             and p.method = any (p_metodos)
             and ((p.source = 'sale' and p.source_id = x.id::text)
               or (p.source = 'invoice_sales' and x.factura_id is not null and p.source_id = x.factura_id::text))))
$$;

comment on function public.pos_ventas_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean) is
  'Interna (solo service_role): ventas que cumplen los filtros del listado de /app/pos/ventas, con estado y origen. p_busqueda llega ya como patrón ILIKE escapado. La usan pos_ventas_listado_v2 y pos_ventas_cifras.';

revoke all on function public.pos_ventas_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.pos_ventas_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean) to service_role;

create or replace function public.pos_ventas_listado_v2(
  p_organization_id integer,
  p_branch_id integer default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_busqueda text default null,
  p_origenes text[] default null,
  p_estados text[] default null,
  p_metodos text[] default null,
  p_cliente_id uuid default null,
  p_cajero_id uuid default null,
  p_importe_min numeric default null,
  p_importe_max numeric default null,
  p_pagos text[] default null,
  p_con_saldo boolean default false,
  p_con_devolucion boolean default false,
  p_pendientes_sync boolean default false,
  p_orden text default 'fecha',
  p_direccion text default 'desc',
  p_limite integer default 20,
  p_desplazamiento integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sucursales integer[];
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_desp integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_total integer;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);

  with filtrada as (
    select * from public.pos_ventas_filtradas(
      p_organization_id, v_sucursales, p_desde, p_hasta, public.pos_ventas_patron(p_busqueda),
      p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
      p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync)
  ),
  pagina as (
    select x.*,
           row_number() over (
             order by
               case when p_orden = 'total' and p_direccion = 'asc' then x.total end asc nulls last,
               case when p_orden = 'total' and p_direccion <> 'asc' then x.total end desc nulls last,
               case when p_orden = 'numero' and p_direccion = 'asc' then x.numero end asc nulls last,
               case when p_orden = 'numero' and p_direccion <> 'asc' then x.numero end desc nulls last,
               case when p_orden = 'cliente' and p_direccion = 'asc' then x.cliente_nombre end asc nulls last,
               case when p_orden = 'cliente' and p_direccion <> 'asc' then x.cliente_nombre end desc nulls last,
               case when p_direccion = 'asc' then x.sale_date end asc nulls last,
               x.sale_date desc nulls last,
               x.id
           ) as orden_n
      from filtrada x
     order by orden_n
     offset v_desp
     limit v_limite
  )
  select (select count(*) from filtrada),
         coalesce((
           select jsonb_agg(
                    jsonb_build_object(
                      'id', x.id,
                      'fecha', x.sale_date,
                      'creada', x.created_at,
                      'total', coalesce(x.total, 0),
                      'saldo', coalesce(x.balance, 0),
                      'status', x.status,
                      'payment_status', x.payment_status,
                      'estado', x.estado,
                      'origen', x.origen,
                      'numero', x.numero,
                      'tipo_numero', case when x.factura_numero is not null then 'factura' when x.pedido_numero is not null then 'pedido' end,
                      'factura_id', x.factura_id,
                      'cxc_id', (select a.id from public.accounts_receivable a where a.sale_id = x.id order by a.created_at desc limit 1),
                      'web_order_id', x.web_order_id,
                      'cliente', case when x.customer_id is null then null
                                      else (select jsonb_build_object(
                                                     'id', x.customer_id,
                                                     'nombre', x.cliente_nombre,
                                                     'documento', x.cliente_documento,
                                                     -- Tipo declarado; una empresa sin tipo se identifica con NIT.
                                                     'tipo_documento', coalesce(upper(nullif(btrim(c.identification_type), '')),
                                                                                case when c.customer_type = 'company' and x.cliente_documento is not null then 'NIT' end),
                                                     'telefono', nullif(btrim(c.phone), ''))
                                              from public.customers c where c.id = x.customer_id) end,
                      'cajero', jsonb_build_object('id', x.user_id, 'nombre',
                                  (select nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '') from public.profiles pr where pr.id = x.user_id)),
                      'sucursal', jsonb_build_object('id', x.branch_id, 'nombre', (select br.name from public.branches br where br.id = x.branch_id)),
                      'mesa', case when x.table_session_id is null then null
                                   else (select rt.name from public.table_sessions ts
                                           join public.restaurant_tables rt on rt.id = ts.restaurant_table_id
                                          where ts.id = x.table_session_id) end,
                      'metodos', coalesce((
                          select jsonb_agg(distinct p.method)
                            from public.payments p
                           where p.organization_id = x.organization_id
                             and p.status = 'completed' and p.voided_at is null
                             and ((p.source = 'sale' and p.source_id = x.id::text)
                               or (p.source = 'invoice_sales' and p.source_id in (select i2.id::text from public.invoice_sales i2 where i2.sale_id = x.id)))), '[]'::jsonb),
                      'devuelto', x.devuelto,
                      'notas_credito', x.notas_credito,
                      'nota_credito_numero', case when x.notas_credito > 0 then
                          (select n.number from public.invoice_sales n
                            where n.sale_id = x.id and n.document_type = 'credit_note'
                            order by n.created_at desc limit 1) end
                    ) order by x.orden_n)
             from pagina x
         ), '[]'::jsonb)
    into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

comment on function public.pos_ventas_listado_v2(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text, text, integer, integer) is
  'Listado de /app/pos/ventas (v2, Figma 2026-11-20) paginado, filtrado y ordenado en el servidor (solo sales, D1). Filtros en pos_ventas_filtradas.';

revoke all on function public.pos_ventas_listado_v2(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text, text, integer, integer) from public, anon;
grant execute on function public.pos_ventas_listado_v2(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text, text, integer, integer) to authenticated, service_role;

create or replace function public.pos_ventas_cifras(
  p_organization_id integer,
  p_branch_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_desde_anterior timestamptz,
  p_hasta_anterior timestamptz,
  p_busqueda text default null,
  p_origenes text[] default null,
  p_estados text[] default null,
  p_metodos text[] default null,
  p_cliente_id uuid default null,
  p_cajero_id uuid default null,
  p_importe_min numeric default null,
  p_importe_max numeric default null,
  p_pagos text[] default null,
  p_con_saldo boolean default false,
  p_con_devolucion boolean default false,
  p_pendientes_sync boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sucursales integer[];
  v_patron text := public.pos_ventas_patron(p_busqueda);
  v_actual jsonb;
  v_anterior jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Quien vende ve lo vendido (la misma regla que fn_inicio_ventas_rango).
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);

  with f as (
    select * from public.pos_ventas_filtradas(
      p_organization_id, v_sucursales, p_desde, p_hasta, v_patron,
      p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
      p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync)
  ),
  -- Ventas que cuentan como vendidas: ni anuladas ni borradores.
  ef as (
    select * from f where estado not in ('anulada', 'borrador')
  ),
  impuestos as (
    -- 1) Con factura: sus líneas (cuadran con invoice_sales.tax_total).
    select it.tax_code as codigo, it.tax_rate as tasa,
           sum(case when it.tax_included then it.total_line - it.total_line / (1 + it.tax_rate / 100)
                    else it.total_line * it.tax_rate / 100 end) as monto
      from ef join public.invoice_items it on it.invoice_sales_id = ef.factura_id
     where it.tax_rate > 0
     group by 1, 2
    union all
    -- 2) Sin factura, con desglose guardado en la venta.
    select nullif(btrim(e ->> 'name'), ''), null::numeric, sum(coalesce((e ->> 'amount')::numeric, 0))
      from ef cross join lateral jsonb_array_elements(case when jsonb_typeof(ef.tax_breakdown) = 'array' then ef.tax_breakdown else '[]'::jsonb end) e
     where ef.factura_id is null
     group by 1
    union all
    -- 3) Sin factura ni desglose: el total de impuestos de la venta, sin detalle.
    select null, null::numeric, sum(ef.tax_total)
      from ef
     where ef.factura_id is null and coalesce(ef.tax_total, 0) > 0
       and (case when jsonb_typeof(ef.tax_breakdown) = 'array' then jsonb_array_length(ef.tax_breakdown) else 0 end) = 0
  ),
  detalle as (
    select codigo, tasa, round(sum(monto), 2) as monto
      from impuestos group by codigo, tasa having round(sum(monto), 2) <> 0
  )
  select jsonb_build_object(
           'ventas', round(coalesce((select sum(total) from ef), 0), 2),
           'transacciones', (select count(*) from f),
           'efectivas', (select count(*) from ef),
           'pagadas', (select count(*) from f where estado = 'pagada'),
           'pendientes', (select count(*) from f where estado in ('pendiente_pago', 'pago_parcial')),
           'anuladas', (select count(*) from f where estado = 'anulada'),
           'devueltas', (select count(*) from f where estado in ('devuelta', 'devuelta_parcial')),
           'ticket_promedio', case when (select count(*) from ef) > 0
                                   then round((select sum(total) from ef) / (select count(*) from ef), 2) else 0 end,
           'impuestos', round(coalesce((select sum(monto) from detalle), 0), 2),
           'impuestos_detalle', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'tasa', tasa, 'monto', monto) order by monto desc) from detalle), '[]'::jsonb)
         )
    into v_actual;

  if p_desde_anterior is not null and p_hasta_anterior is not null and p_hasta_anterior >= p_desde_anterior then
    select jsonb_build_object(
             'ventas', round(coalesce(sum(a.total) filter (where a.estado not in ('anulada', 'borrador')), 0), 2),
             'transacciones', count(*))
      into v_anterior
      from public.pos_ventas_filtradas(
        p_organization_id, v_sucursales, p_desde_anterior, p_hasta_anterior, v_patron,
        p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
        p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync) a;
  end if;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'actual', v_actual, 'anterior', v_anterior);
end;
$$;

comment on function public.pos_ventas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean) is
  'KPI del listado de /app/pos/ventas (Figma 329:36071) sobre las ventas listadas, por fecha de venta: ventas, ticket, transacciones e impuestos con detalle; periodo anterior de igual duración.';

revoke all on function public.pos_ventas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean) from public, anon;
grant execute on function public.pos_ventas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean) to authenticated, service_role;
