-- Listados en servidor: facturas de venta y cuentas por cobrar (P1.7 del plan de ventas y CxC)
--
-- Antes: el listado de facturas bajaba TODAS las facturas y TODOS los clientes de
-- la organización al navegador y paginaba allí (FacturasTable.tsx:284-327); la
-- cartera calculaba la antigüedad recorriendo todas las páginas en el navegador.
--
-- fn_facturas_venta_listado(p_org, p_filtros, p_orden, p_pagina, p_tamano)
--   filas paginadas + total + KPIs por moneda (facturado en el periodo, por
--   cobrar, vencido, vence en 15 días). Sin notas crédito salvo que se pidan.
-- fn_cxc_listado(p_org, p_filtros, p_orden, p_pagina, p_tamano)
--   filas paginadas + total + resumen (por cobrar, al día, vencida, tramos de
--   antigüedad y días promedio de cobro de los últimos 90 días). El estado y los
--   días vencidos salen de fn_cxc_estado_vivo (zona de la sucursal) y el MONTO de
--   la factura (invoice_sales.total), no de accounts_receivable.amount (H2).
--
-- Las dos: SECURITY DEFINER con fn_assert_acceso_org + permiso (finance.view, o
-- pos.view para la cartera del POS) + filtro por las sucursales a las que el
-- usuario tiene acceso (app_branch_access). Días calendario en la zona de cada
-- sucursal (fn_timezone_for / fn_today_for). Solo lectura.

create or replace function public.fn_facturas_venta_listado(
  p_org integer,
  p_filtros jsonb default '{}'::jsonb,
  p_orden text default 'emision_desc',
  p_pagina integer default 1,
  p_tamano integer default 25
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_q text := nullif(lower(btrim(coalesce(v_f->>'q', ''))), '');
  v_estado_doc text := nullif(v_f->>'estado_doc', '');
  v_estado_pago text := nullif(v_f->>'estado_pago', '');
  v_moneda text := nullif(upper(v_f->>'moneda'), '');
  v_desde date := nullif(v_f->>'desde', '')::date;
  v_hasta date := nullif(v_f->>'hasta', '')::date;
  v_cliente uuid := nullif(v_f->>'cliente', '')::uuid;
  v_sucursal integer := nullif(v_f->>'sucursal', '')::integer;
  v_min numeric := nullif(v_f->>'monto_min', '')::numeric;
  v_max numeric := nullif(v_f->>'monto_max', '')::numeric;
  v_fe text := nullif(v_f->>'fe', '');
  v_nc boolean := coalesce((v_f->>'incluir_nc')::boolean, false);
  v_tamano integer := least(greatest(coalesce(p_tamano, 25), 1), 200);
  v_offset integer := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_tamano, 25), 1), 200);
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.view']);

  with zonas as (
    select x.branch_id, public.fn_timezone_for(p_org, x.branch_id) as tz, public.fn_today_for(p_org, x.branch_id) as hoy,
           (x.branch_id is null or public.app_branch_access(x.branch_id)) as acceso
      from (select distinct i.branch_id from public.invoice_sales i where i.organization_id = p_org) x
  ),
  base as (
    select i.id, i.number, i.status, coalesce(i.document_type, 'invoice') as document_type,
           i.issue_date, i.due_date, upper(btrim(i.currency)) as currency,
           coalesce(i.total, 0) as total, coalesce(i.balance, 0) as balance,
           i.payment_method, i.branch_id, i.einvoice_status, i.sale_id, i.customer_id, i.created_at,
           i.reference_code,
           c.full_name as cliente, nullif(concat_ws(' ', c.doc_type, c.doc_number), '') as cliente_doc,
           b.name as sucursal,
           (s.reservation_id is not null) as pms,
           s.source as origen_venta,
           (i.issue_date at time zone z.tz)::date as dia_emision,
           z.hoy,
           case
             when i.status not in ('draft', 'void', 'voided') and coalesce(i.balance, 0) > 0 and i.due_date is not null
                  and (i.due_date at time zone z.tz)::date < z.hoy
               then z.hoy - (i.due_date at time zone z.tz)::date
             else 0
           end::integer as dias_vencida,
           case when i.due_date is not null then (i.due_date at time zone z.tz)::date end as dia_vence
      from public.invoice_sales i
      join zonas z on z.branch_id is not distinct from i.branch_id and z.acceso
      left join public.customers c on c.id = i.customer_id
      left join public.branches b on b.id = i.branch_id
      left join public.sales s on s.id = i.sale_id
     where i.organization_id = p_org
       and (v_sucursal is null or i.branch_id = v_sucursal)
       and (v_cliente is null or i.customer_id = v_cliente)
       and (v_moneda is null or upper(btrim(i.currency)) = v_moneda)
       and (v_nc or coalesce(i.document_type, 'invoice') = 'invoice')
  ),
  filtradas as (
    select * from base
     where (v_q is null
            or lower(coalesce(number, '')) like '%' || v_q || '%'
            or lower(coalesce(cliente, '')) like '%' || v_q || '%'
            or lower(coalesce(cliente_doc, '')) like '%' || v_q || '%'
            or lower(coalesce(reference_code, '')) like '%' || v_q || '%')
       and (v_estado_doc is null
            or (v_estado_doc = 'borrador' and status = 'draft')
            or (v_estado_doc = 'emitida' and status in ('issued', 'paid', 'partial'))
            or (v_estado_doc = 'anulada' and status in ('void', 'voided')))
       and (v_estado_pago is null
            or (v_estado_pago = 'pagada' and status in ('issued', 'paid', 'partial') and balance <= 0)
            or (v_estado_pago = 'vencida' and dias_vencida > 0)
            or (v_estado_pago = 'parcial' and status in ('issued', 'paid', 'partial') and balance > 0 and balance < total and dias_vencida = 0)
            or (v_estado_pago = 'pendiente' and status in ('issued', 'paid', 'partial') and balance > 0 and balance >= total and dias_vencida = 0)
            or (v_estado_pago = 'abiertas' and status in ('issued', 'paid', 'partial') and balance > 0))
       and (v_desde is null or dia_emision >= v_desde)
       and (v_hasta is null or dia_emision <= v_hasta)
       and (v_min is null or total >= v_min)
       and (v_max is null or total <= v_max)
       and (v_fe is null or (v_fe = 'sin' and einvoice_status is null) or einvoice_status = v_fe)
  ),
  ordenadas as (
    select f.*, row_number() over (order by
       case when p_orden = 'emision_asc' then f.issue_date end asc nulls last,
       case when p_orden = 'numero_asc' then f.number end asc nulls last,
       case when p_orden = 'numero_desc' then f.number end desc nulls last,
       case when p_orden = 'cliente_asc' then lower(f.cliente) end asc nulls last,
       case when p_orden = 'total_desc' then f.total end desc nulls last,
       case when p_orden = 'total_asc' then f.total end asc nulls last,
       case when p_orden = 'saldo_desc' then f.balance end desc nulls last,
       case when p_orden = 'vencimiento_asc' then f.due_date end asc nulls last,
       f.issue_date desc nulls last, f.created_at desc, f.id) as ord
      from filtradas f
  ),
  pagina as (
    select * from ordenadas where ord > v_offset and ord <= v_offset + v_tamano
  ),
  kpis as (
    select currency as moneda,
           coalesce(sum(total) filter (where status not in ('draft', 'void', 'voided')
                                         and document_type = 'invoice'
                                         and (v_desde is null or dia_emision >= v_desde)
                                         and (v_hasta is null or dia_emision <= v_hasta)), 0) as facturado,
           coalesce(sum(balance) filter (where status in ('issued', 'paid', 'partial') and document_type = 'invoice'), 0) as por_cobrar,
           coalesce(sum(balance) filter (where status in ('issued', 'paid', 'partial') and document_type = 'invoice' and dias_vencida > 0), 0) as vencido,
           count(*) filter (where status in ('issued', 'paid', 'partial') and document_type = 'invoice' and dias_vencida > 0) as facturas_vencidas,
           coalesce(sum(balance) filter (where status in ('issued', 'paid', 'partial') and document_type = 'invoice' and balance > 0
                                           and dia_vence between hoy and hoy + 15), 0) as vence_15
      from base
     group by currency
  )
  select jsonb_build_object(
    'total', (select count(*) from filtradas),
    'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'numero', p.number, 'estado', p.status, 'tipo', p.document_type,
        'emision', p.issue_date, 'vencimiento', p.due_date, 'moneda', p.currency,
        'total', p.total, 'saldo', p.balance, 'metodo', p.payment_method,
        'branch_id', p.branch_id, 'sucursal', p.sucursal, 'fe', p.einvoice_status,
        'sale_id', p.sale_id, 'origen', p.origen_venta, 'pms', p.pms,
        'cliente_id', p.customer_id, 'cliente', p.cliente, 'cliente_doc', p.cliente_doc,
        'dias_vencida', p.dias_vencida) order by p.ord)
      from pagina p), '[]'::jsonb),
    'kpis', coalesce((select jsonb_agg(to_jsonb(k) order by k.por_cobrar desc) from kpis k), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;

revoke all on function public.fn_facturas_venta_listado(integer, jsonb, text, integer, integer) from public, anon;
grant execute on function public.fn_facturas_venta_listado(integer, jsonb, text, integer, integer) to authenticated, service_role;

create or replace function public.fn_cxc_listado(
  p_org integer,
  p_filtros jsonb default '{}'::jsonb,
  p_orden text default 'vencimiento_asc',
  p_pagina integer default 1,
  p_tamano integer default 25
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_q text := nullif(lower(btrim(coalesce(v_f->>'q', ''))), '');
  v_estado text := coalesce(nullif(v_f->>'estado', ''), 'abiertas');
  v_tramo text := nullif(v_f->>'tramo', '');
  v_cliente uuid := nullif(v_f->>'cliente', '')::uuid;
  v_sucursal integer := nullif(v_f->>'sucursal', '')::integer;
  v_origen text := nullif(v_f->>'origen', '');
  v_sin_rec integer := nullif(v_f->>'sin_recordatorio_dias', '')::integer;
  v_tamano integer := least(greatest(coalesce(p_tamano, 25), 1), 200);
  v_offset integer := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_tamano, 25), 1), 200);
  v_base text;
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_finanzas_exigir_permiso(p_org,
    case when v_origen = 'pos' then array['finance.view', 'pos.view'] else array['finance.view'] end);
  v_base := upper(public.fn_moneda_base_organizacion(p_org));

  with vivo as (
    select * from public.fn_cxc_estado_vivo(p_org)
  ),
  acceso as (
    select x.branch_id, (x.branch_id is null or public.app_branch_access(x.branch_id)) as ok
      from (select distinct a.branch_id from public.accounts_receivable a where a.organization_id = p_org) x
  ),
  base as (
    select ar.id, ar.invoice_id, ar.customer_id, ar.branch_id, ar.due_date, ar.created_at, ar.last_reminder_date,
           coalesce(ar.balance, 0) as saldo,
           coalesce(i.total, ar.amount, 0) as monto,
           upper(btrim(coalesce(i.currency, v_base))) as moneda,
           i.number as numero, i.status as estado_factura,
           coalesce(ar.sale_id, i.sale_id) as sale_id,
           case when s.source = 'pos' then 'pos' when s.source = 'web' then 'web'
                when ar.invoice_id is not null then 'factura' else 'otro' end as origen,
           case when ar.status = 'cancelled' then 'cancelled' else v.estado_efectivo end as estado,
           coalesce(v.dias_vencida, 0) as dias,
           c.full_name as cliente, nullif(concat_ws(' ', c.doc_type, c.doc_number), '') as cliente_doc,
           c.email as cliente_email, c.phone as cliente_telefono,
           b.name as sucursal
      from public.accounts_receivable ar
      join vivo v on v.account_id = ar.id
      join acceso ac on ac.branch_id is not distinct from ar.branch_id and ac.ok
      left join public.invoice_sales i on i.id = ar.invoice_id
      left join public.sales s on s.id = coalesce(ar.sale_id, i.sale_id)
      left join public.customers c on c.id = ar.customer_id
      left join public.branches b on b.id = ar.branch_id
     where ar.organization_id = p_org
       and (i.id is null or coalesce(i.document_type, 'invoice') = 'invoice')
       and (v_sucursal is null or ar.branch_id = v_sucursal)
       and (v_cliente is null or ar.customer_id = v_cliente)
       and (v_origen is null or v_origen = 'todos' or (v_origen = 'pos' and s.source = 'pos'))
  ),
  filtradas as (
    select * from base
     where (v_q is null
            or lower(coalesce(cliente, '')) like '%' || v_q || '%'
            or lower(coalesce(cliente_doc, '')) like '%' || v_q || '%'
            or lower(coalesce(cliente_email, '')) like '%' || v_q || '%'
            or lower(coalesce(cliente_telefono, '')) like '%' || v_q || '%'
            or lower(coalesce(numero, '')) like '%' || v_q || '%')
       and (v_estado = 'todos'
            or (v_estado = 'abiertas' and saldo > 0 and estado <> 'cancelled')
            or estado = v_estado)
       and (v_tramo is null
            or (v_tramo = 'al_dia' and saldo > 0 and dias <= 0)
            or (v_tramo = 'd1_30' and saldo > 0 and dias between 1 and 30)
            or (v_tramo = 'd31_60' and saldo > 0 and dias between 31 and 60)
            or (v_tramo = 'd61_90' and saldo > 0 and dias between 61 and 90)
            or (v_tramo = 'd90_mas' and saldo > 0 and dias > 90))
       and (v_sin_rec is null or last_reminder_date is null or last_reminder_date < now() - make_interval(days => v_sin_rec))
  ),
  ordenadas as (
    select f.*, row_number() over (order by
       case when p_orden = 'saldo_desc' then f.saldo end desc nulls last,
       case when p_orden = 'antiguedad_desc' then f.dias end desc nulls last,
       case when p_orden = 'cliente_asc' then lower(f.cliente) end asc nulls last,
       case when p_orden = 'creada_desc' then f.created_at end desc nulls last,
       f.due_date asc nulls last, f.created_at desc, f.id) as ord
      from filtradas f
  ),
  pagina as (
    select o.*,
           (select count(*) from public.ar_installments q where q.account_receivable_id = o.id) as cuotas,
           (select count(*) from public.ar_installments q where q.account_receivable_id = o.id and q.status not in ('paid', 'written_off')) as cuotas_pendientes
      from ordenadas o
     where o.ord > v_offset and o.ord <= v_offset + v_tamano
  ),
  abiertas as (
    select * from base where saldo > 0 and estado <> 'cancelled'
  ),
  cobro as (
    -- Días promedio de cobro: cuentas saldadas en los últimos 90 días, desde la
    -- emisión de la factura (o la creación de la cuenta) hasta el último pago.
    select avg(extract(epoch from (ult.fecha - coalesce(i.issue_date, ar.created_at))) / 86400.0) as dias
      from public.accounts_receivable ar
      join acceso ac on ac.branch_id is not distinct from ar.branch_id and ac.ok
      left join public.invoice_sales i on i.id = ar.invoice_id
      cross join lateral (
        select max(p.payment_date) as fecha from public.payments p
         where p.organization_id = p_org and p.status = 'completed'
           and ((p.source = 'account_receivable' and p.source_id = ar.id::text)
                or (ar.invoice_id is not null and p.source = 'invoice_sales' and p.source_id = ar.invoice_id::text)
                or (coalesce(ar.sale_id, i.sale_id) is not null and p.source = 'sale' and p.source_id = coalesce(ar.sale_id, i.sale_id)::text))
      ) ult
     where ar.organization_id = p_org and ar.status = 'paid' and coalesce(ar.balance, 0) = 0
       and ult.fecha >= now() - interval '90 days'
       and (v_sucursal is null or ar.branch_id = v_sucursal)
       and (v_origen is distinct from 'pos' or exists (select 1 from public.sales s where s.id = coalesce(ar.sale_id, i.sale_id) and s.source = 'pos'))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtradas),
    'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'invoice_id', p.invoice_id, 'numero', p.numero, 'sale_id', p.sale_id, 'origen', p.origen,
        'cliente_id', p.customer_id, 'cliente', p.cliente, 'cliente_doc', p.cliente_doc,
        'cliente_email', p.cliente_email, 'cliente_telefono', p.cliente_telefono,
        'branch_id', p.branch_id, 'sucursal', p.sucursal,
        'vencimiento', p.due_date, 'monto', p.monto, 'saldo', p.saldo, 'moneda', p.moneda,
        'estado', p.estado, 'dias', p.dias, 'cuotas', p.cuotas, 'cuotas_pendientes', p.cuotas_pendientes,
        'ultimo_recordatorio', p.last_reminder_date) order by p.ord)
      from pagina p), '[]'::jsonb),
    'resumen', jsonb_build_object(
      'monedas', coalesce((select jsonb_agg(distinct moneda) from abiertas), '[]'::jsonb),
      'por_cobrar', coalesce((select sum(saldo) from abiertas), 0),
      'al_dia', coalesce((select sum(saldo) from abiertas where dias <= 0), 0),
      'vencida', coalesce((select sum(saldo) from abiertas where dias > 0), 0),
      'cuentas_abiertas', (select count(*) from abiertas),
      'cuentas_vencidas', (select count(*) from abiertas where dias > 0),
      'promedio_cobro_dias', (select round(dias::numeric, 1) from cobro),
      'tramos', jsonb_build_array(
        jsonb_build_object('tramo', 'al_dia', 'saldo', coalesce((select sum(saldo) from abiertas where dias <= 0), 0), 'cuentas', (select count(*) from abiertas where dias <= 0)),
        jsonb_build_object('tramo', 'd1_30', 'saldo', coalesce((select sum(saldo) from abiertas where dias between 1 and 30), 0), 'cuentas', (select count(*) from abiertas where dias between 1 and 30)),
        jsonb_build_object('tramo', 'd31_60', 'saldo', coalesce((select sum(saldo) from abiertas where dias between 31 and 60), 0), 'cuentas', (select count(*) from abiertas where dias between 31 and 60)),
        jsonb_build_object('tramo', 'd61_90', 'saldo', coalesce((select sum(saldo) from abiertas where dias between 61 and 90), 0), 'cuentas', (select count(*) from abiertas where dias between 61 and 90)),
        jsonb_build_object('tramo', 'd90_mas', 'saldo', coalesce((select sum(saldo) from abiertas where dias > 90), 0), 'cuentas', (select count(*) from abiertas where dias > 90))
      )
    )
  ) into v_resultado;

  return v_resultado;
end;
$function$;

revoke all on function public.fn_cxc_listado(integer, jsonb, text, integer, integer) from public, anon;
grant execute on function public.fn_cxc_listado(integer, jsonb, text, integer, integer) to authenticated, service_role;
