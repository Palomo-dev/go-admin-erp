-- Ventas del POS: listado paginado en el servidor y cifras con criterio de caja.
-- Plan: docs/implementacion/CAJAS-VENTAS-PLAN.md paso 14 (D1, D2).
--
--  1. `pos_ventas_listado(...)`: el listado de /app/pos/ventas paginado, ordenado
--     y filtrado EN EL SERVIDOR. Solo filas de `sales` (D1): los pedidos web sin
--     venta viven en «Pedidos online». Antes el navegador traía `sales` +
--     TODOS los `web_orders` (4.780 expirados), los mezclaba y paginaba en
--     memoria con un tope de 1.000 filas por consulta.
--     Estado visible y origen con la MISMA regla que `src/lib/pos/ventas/estadoVenta.ts`
--     (hay una prueba que compara ambas). La búsqueda es un parámetro, nunca se
--     interpola en un filtro de PostgREST.
--  2. `fn_inicio_ventas_rango(org, desde, hasta, sucursal)`: la cifra de ventas
--     con CRITERIO DE CAJA (PARIDAD-DASHBOARD-INICIO §V.9c): lo cobrado en el
--     periodo por `payment_date` (pagos completados y no anulados de ventas,
--     facturas y abonos de cartera, neto del vuelto), menos los reintegros de
--     devoluciones en efectivo del periodo; atribuido al canal y a la sucursal
--     de la venta o factura que paga; con el periodo anterior de igual duración.
--     Es la función ÚNICA que usan los KPI de Ventas y que usará el Inicio, para
--     que nunca den cifras distintas. `facturado` (ventas del periodo por fecha
--     de venta) va como detalle.
--  3. Índices de apoyo (aditivos): ventas por organización y fecha, facturas por
--     venta y pagos por organización y fecha de pago.
--
-- Ambas funciones: SECURITY DEFINER con `fn_assert_acceso_org`, sucursal
-- validada con `app_branch_access` y sin grant a anon. Probadas en una
-- transacción que se deshace con un usuario simulado (ver el commit).

create index if not exists idx_sales_org_sale_date on public.sales (organization_id, sale_date desc);
create index if not exists idx_invoice_sales_sale_id on public.invoice_sales (sale_id) where sale_id is not null;
create index if not exists idx_payments_org_payment_date on public.payments (organization_id, payment_date);

-- ── 1. Listado ───────────────────────────────────────────────────────────────
create or replace function public.pos_ventas_listado(
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
  p_orden text default 'fecha',
  p_direccion text default 'desc',
  p_limite integer default 20,
  p_desplazamiento integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sucursales integer[];
  v_patron text;
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_desp integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_total integer;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
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

  if p_busqueda is not null and btrim(p_busqueda) <> '' then
    v_patron := '%' || replace(replace(replace(left(btrim(p_busqueda), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  -- Primero lo que filtra y ordena (barato); lo demás, solo para la página.
  with base as (
    select s.id, s.organization_id, s.branch_id, s.customer_id, s.user_id, s.sale_date, s.created_at,
           s.total, s.balance, s.status, s.payment_status, s.source, s.web_order_id, s.table_session_id,
           (select i.id from public.invoice_sales i
             where i.sale_id = s.id and coalesce(i.document_type, 'invoice') <> 'credit_note'
             order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1) as factura_id,
           coalesce((select sum(r.total_refund) from public.returns r where r.sale_id = s.id and r.status = 'processed'), 0) as devuelto
      from public.sales s
     where s.organization_id = p_organization_id
       and s.branch_id = any (v_sucursales)
       and (p_desde is null or s.sale_date >= p_desde)
       and (p_hasta is null or s.sale_date <= p_hasta)
       and (p_cliente_id is null or s.customer_id = p_cliente_id)
       and (p_cajero_id is null or s.user_id = p_cajero_id)
       and (p_importe_min is null or s.total >= p_importe_min)
       and (p_importe_max is null or s.total <= p_importe_max)
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
  ),
  filtrada as (
    select x.*, coalesce(x.factura_numero, x.pedido_numero) as numero
      from calculada x
     where (p_origenes is null or x.origen = any (p_origenes))
       and (p_estados is null or x.estado = any (p_estados))
       and (v_patron is null
            or x.factura_numero ilike v_patron
            or x.pedido_numero ilike v_patron
            or x.cliente_nombre ilike v_patron
            or x.cliente_documento ilike v_patron)
       and (p_metodos is null or exists (
            select 1 from public.payments p
             where p.organization_id = x.organization_id
               and p.status = 'completed' and p.voided_at is null
               and p.method = any (p_metodos)
               and ((p.source = 'sale' and p.source_id = x.id::text)
                 or (p.source = 'invoice_sales' and x.factura_id is not null and p.source_id = x.factura_id::text))))
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
                                      else jsonb_build_object('id', x.customer_id, 'nombre', x.cliente_nombre, 'documento', x.cliente_documento) end,
                      'cajero', jsonb_build_object('id', x.user_id, 'nombre',
                                  (select nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '') from public.profiles pr where pr.id = x.user_id)),
                      'sucursal', jsonb_build_object('id', x.branch_id, 'nombre', (select br.name from public.branches br where br.id = x.branch_id)),
                      'metodos', coalesce((
                          select jsonb_agg(distinct p.method)
                            from public.payments p
                           where p.organization_id = x.organization_id
                             and p.status = 'completed' and p.voided_at is null
                             and ((p.source = 'sale' and p.source_id = x.id::text)
                               or (p.source = 'invoice_sales' and p.source_id in (select i2.id::text from public.invoice_sales i2 where i2.sale_id = x.id)))), '[]'::jsonb),
                      'devuelto', x.devuelto,
                      'notas_credito', (select count(*) from public.invoice_sales n where n.sale_id = x.id and n.document_type = 'credit_note')
                    ) order by x.orden_n)
             from pagina x
         ), '[]'::jsonb)
    into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

comment on function public.pos_ventas_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text, text, integer, integer) is
  'Listado de ventas (solo sales) paginado, filtrado y ordenado en el servidor para /app/pos/ventas. Estado y origen con la regla de src/lib/pos/ventas/estadoVenta.ts.';

revoke all on function public.pos_ventas_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text, text, integer, integer) from public, anon;
grant execute on function public.pos_ventas_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text, text, integer, integer) to authenticated, service_role;

-- ── 2. Ventas cobradas en un rango (criterio de caja) ───────────────────────
create or replace function public.fn_inicio_ventas_rango(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_branch_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer) is
  'Ventas con criterio de caja (PARIDAD-DASHBOARD-INICIO §V.9c): lo cobrado por payment_date menos reintegros en efectivo, por canal y sucursal, con el periodo anterior de igual duración. Función única para los KPI de Ventas y el Inicio.';

revoke all on function public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer) to authenticated, service_role;
