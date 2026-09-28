-- Rollback de 20260928212308_facturas_venta_listado_figma_kpis.sql
--
-- Restaura fn_facturas_venta_listado como la dejó 20260924081336: sin los conteos
-- de los KPIs (facturas_emitidas, facturas_con_saldo, facturas_vence_15), sin
-- kpi_desde/kpi_hasta, sin metodo_nombre y con cliente_doc sin dígito de
-- verificación. Solo lectura: no hay datos que revertir.
--
-- OJO: la pantalla del listado manda kpi_desde/kpi_hasta y, con el periodo en
-- «todas las fechas», el KPI «Facturado en el periodo» pasaría a sumar todo el
-- histórico. Revertir junto con el commit de la pantalla.

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
