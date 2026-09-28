-- ============================================================================
-- Compras F4 y F8 — listados y resúmenes de facturas de compra y de cuentas por
-- pagar, filtrados, ordenados y paginados en la base.
-- Plan: docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md (§3.2, F4, F8).
--
-- SECURITY INVOKER: se leen con la RLS de quien consulta (organización y
-- restricción por sucursal); `p_org` solo acota. Los días (vencida hace n días,
-- tramo de antigüedad, críticas ≤ 3 d, próximas ≤ 7 d) se cuentan con el día de
-- la organización (`fn_timezone_for`), nunca con el día UTC.
--
-- Estados derivados (§3.4): el pago sale de `balance`/`total` y la recepción de
-- `stock_received_at` o de si hay líneas con producto; `status` es solo el
-- ciclo del documento. Las CxP de borradores que crearon los caminos viejos
-- (D2) no salen en el listado de CxP salvo que se pidan (`p_incluir_borradores`).
-- ============================================================================

create or replace function public.fn_facturas_compra_listado(
  p_org integer,
  p_busqueda text default null,
  p_estado text default null,
  p_recepcion text default null,
  p_proveedor integer default null,
  p_desde date default null,
  p_hasta date default null,
  p_branch integer default null,
  p_orden text default 'fecha',
  p_direccion text default 'desc',
  p_offset integer default 0,
  p_limite integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tz text := public.fn_timezone_for(p_org, null);
  v_hoy date := (now() at time zone public.fn_timezone_for(p_org, null))::date;
  v_q text := nullif(btrim(p_busqueda), '');
  v_res jsonb;
begin
  with base as (
    select ip.id, ip.number_ext, ip.issue_date, ip.due_date, ip.currency, ip.subtotal, ip.tax_total, ip.total, ip.balance,
           ip.status, ip.stock_received_at, ip.branch_id, ip.po_id, ip.created_at,
           s.id as supplier_id, s.name as supplier_name, s.nit as supplier_nit,
           ip.total - coalesce((select sum(w.amount) from public.invoice_purchase_withholdings w where w.invoice_id = ip.id), 0) as neto,
           (select count(*) from public.invoice_items ii
             where (ii.invoice_purchase_id = ip.id or (ii.invoice_id = ip.id and ii.invoice_type = 'purchase'))
               and ii.product_id is not null) as lineas_producto,
           (select jsonb_build_object('id', sd.id, 'referencia', coalesce(sd.number, sd.reference_code), 'estado', sd.status)
              from public.support_documents sd
             where sd.invoice_purchase_id = ip.id and sd.status <> 'cancelled'
             order by sd.created_at desc limit 1) as documento_soporte,
           case
             when ip.status in ('draft', 'void') or coalesce(ip.balance, 0) <= 0 or ip.due_date is null then null
             else v_hoy - (ip.due_date at time zone v_tz)::date
           end as dias_vencida
      from public.invoice_purchase ip
      join public.suppliers s on s.id = ip.supplier_id
     where ip.organization_id = p_org
       and (p_branch is null or ip.branch_id = p_branch)
       and (p_proveedor is null or ip.supplier_id = p_proveedor)
       and (p_desde is null or (ip.issue_date at time zone v_tz)::date >= p_desde)
       and (p_hasta is null or (ip.issue_date at time zone v_tz)::date <= p_hasta)
       and (v_q is null
            or ip.number_ext ilike '%' || v_q || '%'
            or coalesce(ip.notes, '') ilike '%' || v_q || '%'
            or s.name ilike '%' || v_q || '%'
            or coalesce(s.nit, '') ilike '%' || v_q || '%')
  ),
  derivada as (
    select b.*,
           case
             when b.status = 'void' then 'anulada'
             when b.status = 'draft' then 'borrador'
             when coalesce(b.balance, 0) <= 0 then 'pagada'
             when coalesce(b.dias_vencida, 0) > 0 then 'vencida'
             when coalesce(b.balance, 0) < coalesce(b.neto, 0) then 'parcial'
             else 'pendiente'
           end as estado_pago,
           case
             when b.stock_received_at is not null then 'recibido'
             when b.lineas_producto = 0 then 'no_aplica'
             else 'por_recibir'
           end as recepcion
      from base b
  ),
  filtrada as (
    select d.* from derivada d
     where (p_estado is null
            or (p_estado = 'vencida' and d.estado_pago = 'vencida')
            or (p_estado = 'pendiente' and d.estado_pago in ('pendiente', 'vencida'))
            or (p_estado = 'parcial' and d.estado_pago = 'parcial')
            or d.estado_pago = p_estado)
       and (p_recepcion is null or d.recepcion = p_recepcion)
  ),
  ordenada as (
    select f.*, count(*) over () as total_filas,
           row_number() over (order by
             case when p_direccion = 'asc' then
               case p_orden
                 when 'vencimiento' then extract(epoch from f.due_date)
                 when 'total' then f.total
                 when 'saldo' then f.balance
                 else extract(epoch from coalesce(f.issue_date, f.created_at))
               end
             end asc nulls last,
             case when p_direccion <> 'asc' then
               case p_orden
                 when 'vencimiento' then extract(epoch from f.due_date)
                 when 'total' then f.total
                 when 'saldo' then f.balance
                 else extract(epoch from coalesce(f.issue_date, f.created_at))
               end
             end desc nulls last,
             case when p_orden = 'numero' and p_direccion = 'asc' then f.number_ext end asc,
             case when p_orden = 'numero' and p_direccion <> 'asc' then f.number_ext end desc,
             f.created_at desc, f.id) as rn
      from filtrada f
  )
  select jsonb_build_object(
           'total', coalesce(max(o.total_filas), 0),
           'items', coalesce(jsonb_agg(jsonb_build_object(
              'id', o.id, 'number_ext', o.number_ext, 'issue_date', o.issue_date, 'due_date', o.due_date,
              'currency', o.currency, 'subtotal', o.subtotal, 'tax_total', o.tax_total, 'total', o.total,
              'neto', o.neto, 'balance', o.balance, 'status', o.status, 'estado_pago', o.estado_pago,
              'recepcion', o.recepcion, 'dias_vencida', o.dias_vencida, 'branch_id', o.branch_id, 'po_id', o.po_id,
              'supplier_id', o.supplier_id, 'supplier_name', o.supplier_name, 'supplier_nit', o.supplier_nit,
              'documento_soporte', o.documento_soporte) order by o.rn)
              filter (where o.rn > greatest(p_offset, 0) and o.rn <= greatest(p_offset, 0) + least(greatest(p_limite, 1), 200)),
              '[]'::jsonb))
    into v_res
    from ordenada o;
  return v_res;
end;
$$;

comment on function public.fn_facturas_compra_listado(integer, text, text, text, integer, date, date, integer, text, text, integer, integer) is
  'Listado de facturas de compra con estado de pago y de recepción derivados, días de mora con el día de la organización y documento soporte. SECURITY INVOKER (RLS de quien consulta).';

create or replace function public.fn_facturas_compra_resumen(p_org integer, p_branch integer default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with abiertas as (
    select ip.balance,
           (ip.due_date at time zone public.fn_timezone_for(p_org, null))::date
             - (now() at time zone public.fn_timezone_for(p_org, null))::date as dias_para_vencer
      from public.invoice_purchase ip
     where ip.organization_id = p_org
       and (p_branch is null or ip.branch_id = p_branch)
       and ip.status not in ('draft', 'void')
       and coalesce(ip.balance, 0) > 0
  )
  select jsonb_build_object(
    'total_por_pagar', coalesce((select sum(balance) from abiertas), 0),
    'abiertas', (select count(*) from abiertas),
    'vencidas_total', coalesce((select sum(balance) from abiertas where dias_para_vencer < 0), 0),
    'vencidas', (select count(*) from abiertas where dias_para_vencer < 0),
    'criticas', (select count(*) from abiertas where dias_para_vencer between 0 and 3),
    'proximas', (select count(*) from abiertas where dias_para_vencer between 0 and 7),
    'por_recibir', (select count(*) from public.invoice_purchase ip
                     where ip.organization_id = p_org and (p_branch is null or ip.branch_id = p_branch)
                       and ip.status in ('received', 'partial', 'paid') and ip.stock_received_at is null
                       and exists (select 1 from public.invoice_items ii
                                    where (ii.invoice_purchase_id = ip.id or (ii.invoice_id = ip.id and ii.invoice_type = 'purchase'))
                                      and ii.product_id is not null)),
    'borradores', (select count(*) from public.invoice_purchase ip
                    where ip.organization_id = p_org and (p_branch is null or ip.branch_id = p_branch) and ip.status = 'draft')
  );
$$;

create or replace function public.fn_cxp_listado(
  p_org integer,
  p_busqueda text default null,
  p_estado text default null,
  p_tramo text default null,
  p_proveedor integer default null,
  p_branch integer default null,
  p_incluir_borradores boolean default false,
  p_orden text default 'vencimiento',
  p_direccion text default 'asc',
  p_offset integer default 0,
  p_limite integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tz text := public.fn_timezone_for(p_org, null);
  v_hoy date := (now() at time zone public.fn_timezone_for(p_org, null))::date;
  v_q text := nullif(btrim(p_busqueda), '');
  v_res jsonb;
begin
  with base as (
    select ap.id, ap.amount, ap.balance, ap.due_date, ap.status, ap.created_at, ap.branch_id,
           s.id as supplier_id, s.name as supplier_name, s.nit as supplier_nit, s.phone as supplier_phone, s.email as supplier_email,
           ip.id as invoice_id, ip.number_ext, ip.status as invoice_status, ip.po_id, ip.currency,
           case
             when coalesce(ap.status, '') in ('paid', 'void') or coalesce(ap.balance, 0) <= 0 or ap.due_date is null then null
             else v_hoy - (ap.due_date at time zone v_tz)::date
           end as dias_vencida,
           (select count(*) from public.ap_installments i where i.account_payable_id = ap.id) as cuotas,
           (select count(*) from public.ap_installments i where i.account_payable_id = ap.id and i.status = 'paid') as cuotas_pagadas,
           coalesce((select sum(ps.amount) from public.ap_payment_schedules ps
                      where ps.account_payable_id = ap.id and ps.status = 'pending'), 0) as programado
      from public.accounts_payable ap
      join public.suppliers s on s.id = ap.supplier_id
      left join public.invoice_purchase ip on ip.id = ap.invoice_id
     where ap.organization_id = p_org
       and (p_branch is null or ap.branch_id = p_branch)
       and (p_proveedor is null or ap.supplier_id = p_proveedor)
       and (p_incluir_borradores or ip.id is null or ip.status <> 'draft')
       and (v_q is null
            or s.name ilike '%' || v_q || '%'
            or coalesce(s.nit, '') ilike '%' || v_q || '%'
            or coalesce(ip.number_ext, '') ilike '%' || v_q || '%')
  ),
  derivada as (
    select b.*,
           case
             when b.status = 'void' or b.invoice_status = 'void' then 'anulada'
             when coalesce(b.balance, 0) <= 0 then 'pagada'
             when coalesce(b.dias_vencida, 0) > 0 then 'vencida'
             when coalesce(b.balance, 0) < coalesce(b.amount, 0) then 'parcial'
             else 'pendiente'
           end as estado,
           case
             when b.dias_vencida is null then null
             when b.dias_vencida <= 0 then 'al_dia'
             when b.dias_vencida <= 30 then 'd1_30'
             when b.dias_vencida <= 60 then 'd31_60'
             when b.dias_vencida <= 90 then 'd61_90'
             else 'd90_mas'
           end as tramo
      from base b
  ),
  filtrada as (
    select d.* from derivada d
     where (p_estado is null
            or (p_estado = 'abierta' and d.estado in ('pendiente', 'parcial', 'vencida'))
            or d.estado = p_estado)
       and (p_tramo is null or d.tramo = p_tramo)
  ),
  ordenada as (
    select f.*, count(*) over () as total_filas,
           row_number() over (order by
             case when p_direccion = 'asc' then
               case p_orden when 'saldo' then f.balance when 'monto' then f.amount else extract(epoch from f.due_date) end
             end asc nulls last,
             case when p_direccion <> 'asc' then
               case p_orden when 'saldo' then f.balance when 'monto' then f.amount else extract(epoch from f.due_date) end
             end desc nulls last,
             case when p_orden = 'proveedor' and p_direccion = 'asc' then f.supplier_name end asc,
             case when p_orden = 'proveedor' and p_direccion <> 'asc' then f.supplier_name end desc,
             f.created_at desc, f.id) as rn
      from filtrada f
  )
  select jsonb_build_object(
           'total', coalesce(max(o.total_filas), 0),
           'items', coalesce(jsonb_agg(jsonb_build_object(
              'id', o.id, 'amount', o.amount, 'balance', o.balance, 'due_date', o.due_date, 'status', o.status,
              'estado', o.estado, 'dias_vencida', o.dias_vencida, 'tramo', o.tramo, 'branch_id', o.branch_id,
              'supplier_id', o.supplier_id, 'supplier_name', o.supplier_name, 'supplier_nit', o.supplier_nit,
              'supplier_phone', o.supplier_phone, 'supplier_email', o.supplier_email,
              'invoice_id', o.invoice_id, 'number_ext', o.number_ext, 'invoice_status', o.invoice_status,
              'po_id', o.po_id, 'currency', o.currency, 'cuotas', o.cuotas, 'cuotas_pagadas', o.cuotas_pagadas,
              'programado', o.programado) order by o.rn)
              filter (where o.rn > greatest(p_offset, 0) and o.rn <= greatest(p_offset, 0) + least(greatest(p_limite, 1), 500)),
              '[]'::jsonb))
    into v_res
    from ordenada o;
  return v_res;
end;
$$;

comment on function public.fn_cxp_listado(integer, text, text, text, integer, integer, boolean, text, text, integer, integer) is
  'Listado de cuentas por pagar con estado derivado, días de mora y tramo de antigüedad con el día de la organización, cuotas y monto programado. SECURITY INVOKER.';

create or replace function public.fn_cxp_resumen(p_org integer, p_branch integer default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with abiertas as (
    select ap.balance, ap.due_date,
           (now() at time zone public.fn_timezone_for(p_org, null))::date
             - (ap.due_date at time zone public.fn_timezone_for(p_org, null))::date as dias
      from public.accounts_payable ap
      left join public.invoice_purchase ip on ip.id = ap.invoice_id
     where ap.organization_id = p_org
       and (p_branch is null or ap.branch_id = p_branch)
       and coalesce(ap.status, '') not in ('paid', 'void')
       and coalesce(ap.balance, 0) > 0
       and (ip.id is null or ip.status not in ('draft', 'void'))
  )
  select jsonb_build_object(
    'total_por_pagar', coalesce((select sum(balance) from abiertas), 0),
    'cuentas', (select count(*) from abiertas),
    'al_dia', coalesce((select sum(balance) from abiertas where coalesce(dias, 0) <= 0), 0),
    'vencida', coalesce((select sum(balance) from abiertas where dias > 0), 0),
    'vencidas', (select count(*) from abiertas where dias > 0),
    'proximo_vencimiento', (select min(due_date) from abiertas where coalesce(dias, 0) <= 0),
    'tramos', jsonb_build_object(
      'al_dia', coalesce((select sum(balance) from abiertas where coalesce(dias, 0) <= 0), 0),
      'd1_30', coalesce((select sum(balance) from abiertas where dias between 1 and 30), 0),
      'd31_60', coalesce((select sum(balance) from abiertas where dias between 31 and 60), 0),
      'd61_90', coalesce((select sum(balance) from abiertas where dias between 61 and 90), 0),
      'd90_mas', coalesce((select sum(balance) from abiertas where dias > 90), 0)),
    'aprobaciones_pendientes', (select count(*) from public.ap_payment_schedules ps
                                 where ps.organization_id = p_org and ps.status = 'pending'
                                   and (p_branch is null or ps.branch_id = p_branch))
  );
$$;

revoke all on function public.fn_facturas_compra_listado(integer, text, text, text, integer, date, date, integer, text, text, integer, integer) from public, anon;
revoke all on function public.fn_facturas_compra_resumen(integer, integer) from public, anon;
revoke all on function public.fn_cxp_listado(integer, text, text, text, integer, integer, boolean, text, text, integer, integer) from public, anon;
revoke all on function public.fn_cxp_resumen(integer, integer) from public, anon;

grant execute on function public.fn_facturas_compra_listado(integer, text, text, text, integer, date, date, integer, text, text, integer, integer) to authenticated;
grant execute on function public.fn_facturas_compra_resumen(integer, integer) to authenticated;
grant execute on function public.fn_cxp_listado(integer, text, text, text, integer, integer, boolean, text, text, integer, integer) to authenticated;
grant execute on function public.fn_cxp_resumen(integer, integer) to authenticated;
