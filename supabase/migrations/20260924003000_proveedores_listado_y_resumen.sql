-- Proveedores: listado paginado en el servidor con saldo y cartera, KPIs del
-- listado y resumen del detalle (rediseño de Figma, 2026-09-23).
--
-- Antes el listado traía todos los proveedores y todas las órdenes de compra
-- de la organización en cada tecla del buscador, calculaba el cumplimiento en
-- el navegador y paginaba en memoria; el detalle contaba solo las 10 órdenes y
-- las 10 facturas que traía y descargaba todos los pagos de la organización.
-- (docs/design/AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md §E.1 y §G.5)
--
-- Saldo por pagar y estado de cartera salen de `accounts_payable`: filas con
-- saldo > 0 que no están pagadas ni anuladas. «Vencida» = `due_date` ya pasó
-- (la columna `days_overdue` no la mantiene nadie: está en NULL en todas las
-- filas). Los días de mora se cuentan en el día de la organización.
--
-- Cumplimiento de entregas: órdenes con fecha esperada en estado `received` o
-- `sent`; a tiempo = recibida con `updated_at` el día esperado o antes, en la
-- zona de la sucursal de la orden (`fn_timezone_for`).
--
-- Las tres funciones son SECURITY DEFINER con `fn_assert_acceso_org` y sin
-- EXECUTE para anon ni public.

create or replace function public.proveedores_listado(
  p_organization_id integer,
  p_offset integer default 0,
  p_limit integer default 20,
  p_busqueda text default null,
  p_estado text default null,
  p_tipo text default null,
  p_cartera text default null,
  p_sin_nit boolean default false,
  p_orden text default 'nombre',
  p_direccion text default 'asc',
  p_ids integer[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 10000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_patron text;
  v_orden text := case when p_orden in ('nombre', 'saldo', 'creado') then p_orden else 'nombre' end;
  v_desc boolean := lower(coalesce(p_direccion, 'asc')) = 'desc';
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if v_busqueda is not null then
    -- `%` y `_` escritos por el usuario se buscan literalmente.
    v_patron := '%' || replace(replace(replace(v_busqueda, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with cartera as (
    select ap.supplier_id,
           sum(ap.balance) as saldo,
           count(*) as abiertas,
           count(*) filter (where ap.due_date < now()) as vencidas,
           coalesce(sum(ap.balance) filter (where ap.due_date < now()), 0) as saldo_vencido
    from accounts_payable ap
    where ap.organization_id = p_organization_id
      and coalesce(ap.balance, 0) > 0
      and coalesce(ap.status, '') not in ('paid', 'cancelled', 'void', 'voided')
    group by ap.supplier_id
  ),
  entregas as (
    select po.supplier_id,
           count(*) as total,
           count(*) filter (
             where po.status = 'received'
               and (po.updated_at at time zone public.fn_timezone_for(po.organization_id, po.branch_id))::date <= po.expected_date
           ) as a_tiempo
    from purchase_orders po
    where po.organization_id = p_organization_id
      and po.expected_date is not null
      and po.status in ('received', 'sent')
    group by po.supplier_id
  ),
  base as (
    select s.id, s.uuid, s.name, s.nit, s.dv, s.doc_type, s.identification_document_code,
           s.supplier_type, s.contact, s.phone, s.email, s.payment_terms, s.credit_days,
           coalesce(s.is_active, true) as is_active, s.logo_url, s.created_at,
           coalesce(c.saldo, 0) as saldo,
           coalesce(c.abiertas, 0) as facturas_abiertas,
           coalesce(c.vencidas, 0) as facturas_vencidas,
           coalesce(c.saldo_vencido, 0) as saldo_vencido,
           case when e.total > 0 then round(e.a_tiempo * 100.0 / e.total)::integer end as cumplimiento,
           coalesce(e.total, 0) as entregas_total
    from suppliers s
    left join cartera c on c.supplier_id = s.id
    left join entregas e on e.supplier_id = s.id
    where s.organization_id = p_organization_id
      and (p_ids is null or s.id = any(p_ids))
      and (v_patron is null
           or s.name ilike v_patron
           or s.nit ilike v_patron
           or s.contact ilike v_patron
           or s.email ilike v_patron
           or s.phone ilike v_patron)
      and (p_estado is null
           or (p_estado = 'activo' and coalesce(s.is_active, true))
           or (p_estado = 'inactivo' and not coalesce(s.is_active, true)))
      and (p_tipo is null or s.supplier_type = p_tipo)
      and (not coalesce(p_sin_nit, false) or nullif(btrim(coalesce(s.nit, '')), '') is null)
      and (p_cartera is null
           or (p_cartera = 'con_saldo' and coalesce(c.saldo, 0) > 0)
           or (p_cartera = 'vencido' and coalesce(c.vencidas, 0) > 0)
           or (p_cartera = 'al_dia' and coalesce(c.vencidas, 0) = 0))
  ),
  ordenada as (
    select b.*,
           count(*) over () as total_filas,
           row_number() over (
             order by
               case when v_orden = 'saldo' and not v_desc then b.saldo end asc,
               case when v_orden = 'saldo' and v_desc then b.saldo end desc,
               case when v_orden = 'creado' and not v_desc then b.created_at end asc,
               case when v_orden = 'creado' and v_desc then b.created_at end desc,
               case when v_orden = 'nombre' and not v_desc then lower(b.name) end asc,
               case when v_orden = 'nombre' and v_desc then lower(b.name) end desc,
               lower(b.name) asc,
               b.id asc
           ) as fila
    from base b
  )
  select jsonb_build_object(
           'total', coalesce(max(o.total_filas), 0),
           'items', coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'id', o.id,
                 'uuid', o.uuid,
                 'name', o.name,
                 'nit', o.nit,
                 'dv', o.dv,
                 'doc_type', o.doc_type,
                 'identification_document_code', o.identification_document_code,
                 'supplier_type', o.supplier_type,
                 'contact', o.contact,
                 'phone', o.phone,
                 'email', o.email,
                 'payment_terms', o.payment_terms,
                 'credit_days', o.credit_days,
                 'is_active', o.is_active,
                 'logo_url', o.logo_url,
                 'saldo', o.saldo,
                 'facturas_abiertas', o.facturas_abiertas,
                 'facturas_vencidas', o.facturas_vencidas,
                 'saldo_vencido', o.saldo_vencido,
                 'cumplimiento', o.cumplimiento,
                 'entregas_total', o.entregas_total
               ) order by o.fila
             ) filter (where o.fila > v_offset and o.fila <= v_offset + v_limit),
             '[]'::jsonb
           )
         )
    into v_resultado
  from ordenada o;

  return v_resultado;
end;
$$;

comment on function public.proveedores_listado(integer, integer, integer, text, text, text, text, boolean, text, text, integer[]) is
  'Listado de proveedores paginado en el servidor con saldo por pagar, facturas abiertas y vencidas (accounts_payable) y % de entregas a tiempo (purchase_orders).';

create or replace function public.proveedores_resumen(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  with cartera as (
    select ap.supplier_id,
           sum(ap.balance) as saldo,
           coalesce(sum(ap.balance) filter (where ap.due_date < now() - interval '30 days'), 0) as vencido_30
    from accounts_payable ap
    where ap.organization_id = p_organization_id
      and coalesce(ap.balance, 0) > 0
      and coalesce(ap.status, '') not in ('paid', 'cancelled', 'void', 'voided')
    group by ap.supplier_id
  )
  select jsonb_build_object(
           'total', (select count(*) from suppliers s where s.organization_id = p_organization_id),
           'activos', (select count(*) from suppliers s where s.organization_id = p_organization_id and coalesce(s.is_active, true)),
           'inactivos', (select count(*) from suppliers s where s.organization_id = p_organization_id and not coalesce(s.is_active, true)),
           'sin_nit', (select count(*) from suppliers s
                       where s.organization_id = p_organization_id and nullif(btrim(coalesce(s.nit, '')), '') is null),
           'saldo_por_pagar', coalesce((select sum(c.saldo) from cartera c), 0),
           'proveedores_con_saldo', (select count(*) from cartera c where c.saldo > 0),
           'vencido_30', coalesce((select sum(c.vencido_30) from cartera c), 0),
           'proveedores_vencido_30', (select count(*) from cartera c where c.vencido_30 > 0)
         )
    into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.proveedores_resumen(integer) is
  'KPIs del listado de proveedores: activos, inactivos, sin NIT, saldo por pagar y vencido a más de 30 días.';

create or replace function public.proveedor_resumen(p_organization_id integer, p_supplier_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_hoy date;
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if not exists (
    select 1 from suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id
  ) then
    return null;
  end if;

  v_tz := public.fn_timezone_for(p_organization_id, null);
  v_hoy := (now() at time zone v_tz)::date;

  with cxp as (
    select ap.balance, ap.due_date
    from accounts_payable ap
    where ap.organization_id = p_organization_id
      and ap.supplier_id = p_supplier_id
      and coalesce(ap.balance, 0) > 0
      and coalesce(ap.status, '') not in ('paid', 'cancelled', 'void', 'voided')
  ),
  entregas as (
    select count(*) as total,
           count(*) filter (
             where po.status = 'received'
               and (po.updated_at at time zone public.fn_timezone_for(po.organization_id, po.branch_id))::date <= po.expected_date
           ) as a_tiempo
    from purchase_orders po
    where po.organization_id = p_organization_id
      and po.supplier_id = p_supplier_id
      and po.expected_date is not null
      and po.status in ('received', 'sent')
  )
  select jsonb_build_object(
    'saldo', coalesce((select sum(balance) from cxp), 0),
    'facturas_abiertas', (select count(*) from cxp),
    'vencido', coalesce((select sum(balance) from cxp where due_date < now()), 0),
    'facturas_vencidas', (select count(*) from cxp where due_date < now()),
    'max_dias_mora', coalesce((select max(v_hoy - (due_date at time zone v_tz)::date) from cxp where due_date < now()), 0),
    'compras_12m', coalesce((
      select sum(ip.total) from invoice_purchase ip
      where ip.organization_id = p_organization_id and ip.supplier_id = p_supplier_id
        and coalesce(ip.status, '') not in ('draft', 'cancelled', 'void', 'voided')
        and coalesce(ip.issue_date, ip.created_at) >= now() - interval '12 months'), 0),
    'facturas_12m', (
      select count(*) from invoice_purchase ip
      where ip.organization_id = p_organization_id and ip.supplier_id = p_supplier_id
        and coalesce(ip.status, '') not in ('draft', 'cancelled', 'void', 'voided')
        and coalesce(ip.issue_date, ip.created_at) >= now() - interval '12 months'),
    'ordenes_12m', (
      select count(*) from purchase_orders po
      where po.organization_id = p_organization_id and po.supplier_id = p_supplier_id
        and po.status <> 'cancelled'
        and po.created_at >= now() - interval '12 months'),
    'entregas_total', (select total from entregas),
    'entregas_a_tiempo', (select a_tiempo from entregas),
    'productos', (select count(*) from product_suppliers ps where ps.supplier_id = p_supplier_id),
    'ordenes', (select count(*) from purchase_orders po
                where po.organization_id = p_organization_id and po.supplier_id = p_supplier_id),
    'ordenes_abiertas', (select count(*) from purchase_orders po
                         where po.organization_id = p_organization_id and po.supplier_id = p_supplier_id
                           and po.status not in ('received', 'cancelled', 'closed', 'completed')),
    'facturas', (select count(*) from invoice_purchase ip
                 where ip.organization_id = p_organization_id and ip.supplier_id = p_supplier_id),
    'cuentas_por_pagar', (select count(*) from accounts_payable ap
                          where ap.organization_id = p_organization_id and ap.supplier_id = p_supplier_id),
    'pagos', (
      select count(*) from payments pay
      where pay.organization_id = p_organization_id
        and pay.status = 'completed'
        and (
          (pay.source = 'account_payable' and pay.source_id in (
             select ap.id::text from accounts_payable ap
             where ap.organization_id = p_organization_id and ap.supplier_id = p_supplier_id))
          or (pay.source = 'invoice_purchase' and pay.source_id in (
             select ip.id::text from invoice_purchase ip
             where ip.organization_id = p_organization_id and ip.supplier_id = p_supplier_id))
        )),
    'lotes', (select count(*) from lots l where l.supplier_id = p_supplier_id)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.proveedor_resumen(integer, integer) is
  'Cifras del detalle de un proveedor: saldo y vencido por pagar, compras de 12 meses, entregas a tiempo y conteos reales de productos, órdenes, facturas, cuentas por pagar, pagos y lotes.';

revoke all on function public.proveedores_listado(integer, integer, integer, text, text, text, text, boolean, text, text, integer[]) from public, anon;
revoke all on function public.proveedores_resumen(integer) from public, anon;
revoke all on function public.proveedor_resumen(integer, integer) from public, anon;
grant execute on function public.proveedores_listado(integer, integer, integer, text, text, text, text, boolean, text, text, integer[]) to authenticated, service_role;
grant execute on function public.proveedores_resumen(integer) to authenticated, service_role;
grant execute on function public.proveedor_resumen(integer, integer) to authenticated, service_role;
