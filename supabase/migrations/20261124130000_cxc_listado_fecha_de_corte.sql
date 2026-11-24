-- Cuentas por cobrar: filtro «Fecha de corte» (2026-11-24).
--
-- Aprobado por el dueño el 2026-11-24. Ventas y Finanzas siguen con la MISMA página
-- (ListadoCartera → GET /api/cartera → fn_cxc_listado); lo que se mejora se agrega a esa
-- página única. Criterio del Contador: la cartera es un saldo a una fecha de corte y la
-- etiqueta lo dice.
--
-- `p_filtros.corte` ('YYYY-MM-DD', día de la organización). Sin él, todo sigue igual que hoy.
-- Con él, cada cuenta se ve como estaba al cierre de ese día:
--   · Solo cuentan las cuentas que ya existían (emisión de la factura, o creación de la cuenta,
--     antes del fin del día de corte).
--   · Saldo al corte = saldo de hoy + lo que la bajó DESPUÉS del corte: pagos completados con
--     `payment_date` posterior (mismos enlaces que el «promedio de cobro»: la cuenta, su factura
--     o su venta; monto + descuento, como el disparador de pagos) y notas crédito válidas de su
--     factura emitidas después. Nunca más que el monto de la cuenta (el mayor entre el de la
--     cuenta y el de su factura: hay facturas migradas con total 0).
--     Se parte del saldo de hoy, que es el correcto por construcción, y solo se devuelve lo
--     posterior: no se recalcula la historia.
--   · Días vencida y estado, contados al día de corte.
--   · Un corte en el futuro se trata como hoy.
-- El «promedio de cobro» no cambia (son los últimos 90 días). `resumen.corte` devuelve el día
-- aplicado (o null) para que la pantalla lo diga en la etiqueta.
--
-- Misma firma, mismos permisos (fn_assert_acceso_org + finance.view, o pos.view con origen=pos),
-- SECURITY DEFINER.
--
-- Aplicada por el MCP en dos pasos el mismo día: `cxc_listado_fecha_de_corte` y
-- `cxc_listado_fecha_de_corte_tope` (el tope pasó del monto de la factura al mayor entre ese y el
-- de la cuenta). Este archivo es el estado final.

create or replace function public.fn_cxc_listado(p_org integer, p_filtros jsonb default '{}'::jsonb, p_orden text default 'vencimiento_asc'::text, p_pagina integer default 1, p_tamano integer default 25)
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
  v_corte date := case when coalesce(v_f->>'corte', '') ~ '^\d{4}-\d{2}-\d{2}$' then (v_f->>'corte')::date end;
  v_tz text;
  v_corte_fin timestamptz;
  v_base text;
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_finanzas_exigir_permiso(p_org,
    case when v_origen = 'pos' then array['finance.view', 'pos.view'] else array['finance.view'] end);
  v_base := upper(public.fn_moneda_base_organizacion(p_org));

  if v_corte is not null then
    select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_org;
    v_tz := coalesce(v_tz, 'America/Bogota');
    if v_corte >= (now() at time zone v_tz)::date then
      v_corte := null;  -- hoy o futuro: el saldo de hoy
    else
      v_corte_fin := (v_corte + 1)::timestamp at time zone v_tz;
    end if;
  end if;

  with vivo as (
    select * from public.fn_cxc_estado_vivo(p_org)
  ),
  acceso as (
    select x.branch_id, (x.branch_id is null or public.app_branch_access(x.branch_id)) as ok
      from (select distinct a.branch_id from public.accounts_receivable a where a.organization_id = p_org) x
  ),
  -- Con fecha de corte: lo que bajó saldos DESPUÉS del corte, para devolverlo.
  pagos_post as (
    select p.source, p.source_id, sum(p.amount + coalesce(p.discount_amount, 0)) as monto
      from public.payments p
     where v_corte_fin is not null
       and p.organization_id = p_org
       and p.status = 'completed'
       and p.payment_date >= v_corte_fin
       and p.source in ('account_receivable', 'invoice_sales', 'sale')
     group by p.source, p.source_id
  ),
  nc_post as (
    select n.related_invoice_id as invoice_id, sum(abs(coalesce(n.total, 0))) as monto
      from public.invoice_sales n
     where v_corte_fin is not null
       and n.organization_id = p_org
       and n.document_type = 'credit_note'
       and n.related_invoice_id is not null
       and coalesce(n.status, '') not in ('void', 'voided', 'cancelled', 'draft', 'rejected')
       and coalesce(n.issue_date, n.created_at) >= v_corte_fin
     group by n.related_invoice_id
  ),
  crudo as (
    select ar.id, ar.invoice_id, ar.customer_id, ar.branch_id, ar.due_date, ar.created_at, ar.last_reminder_date,
           ar.status as estado_guardado,
           coalesce(ar.balance, 0) as saldo_hoy,
           coalesce(i.total, ar.amount, 0) as monto,
           -- Tope del saldo al corte: el mayor monto conocido (hay facturas migradas con total 0
           -- y la cuenta con su monto real).
           greatest(coalesce(ar.amount, 0), coalesce(i.total, 0)) as tope,
           upper(btrim(coalesce(i.currency, v_base))) as moneda,
           coalesce(i.number, case when ar.return_id is not null then 'DEV-' || lpad(ar.return_id::text, 6, '0') end) as numero, i.status as estado_factura,
           coalesce(ar.sale_id, i.sale_id) as sale_id,
           case when s.source = 'pos' then 'pos' when s.source = 'web' then 'web'
                when ar.invoice_id is not null then 'factura' else 'otro' end as origen,
           case when ar.status = 'cancelled' then 'cancelled' else v.estado_efectivo end as estado_hoy,
           coalesce(v.dias_vencida, 0) as dias_hoy,
           case when v_corte_fin is null then 0 else
             coalesce((select sum(pp.monto) from pagos_post pp
                        where (pp.source = 'account_receivable' and pp.source_id = ar.id::text)
                           or (ar.invoice_id is not null and pp.source = 'invoice_sales' and pp.source_id = ar.invoice_id::text)
                           or (coalesce(ar.sale_id, i.sale_id) is not null and pp.source = 'sale' and pp.source_id = coalesce(ar.sale_id, i.sale_id)::text)), 0)
             + coalesce((select nc.monto from nc_post nc where nc.invoice_id = ar.invoice_id), 0)
           end as devuelto,
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
       -- Con corte: solo las cuentas que ya existían ese día.
       and (v_corte_fin is null or coalesce(i.issue_date, ar.created_at) < v_corte_fin)
  ),
  al_corte as (
    select k.*,
           case when v_corte_fin is null then k.saldo_hoy
                else least(greatest(k.tope, k.saldo_hoy), k.saldo_hoy + k.devuelto) end as saldo_c,
           case when v_corte_fin is null or k.due_date is null then null
                else greatest(v_corte - (k.due_date at time zone v_tz)::date, 0) end as dias_c
      from crudo k
  ),
  base as (
    select a.id, a.invoice_id, a.customer_id, a.branch_id, a.due_date, a.created_at, a.last_reminder_date,
           a.saldo_c as saldo, a.monto, a.moneda, a.numero, a.estado_factura, a.sale_id, a.origen,
           case when v_corte_fin is null then a.estado_hoy
                when a.estado_guardado = 'cancelled' then 'cancelled'
                when a.saldo_c <= 0 then 'paid'
                when coalesce(a.dias_c, 0) > 0 then 'overdue'
                when a.saldo_c < a.tope then 'partial'
                else 'current' end as estado,
           case when v_corte_fin is null then a.dias_hoy
                when a.saldo_c > 0 then coalesce(a.dias_c, 0)
                else 0 end as dias,
           a.cliente, a.cliente_doc, a.cliente_email, a.cliente_telefono, a.sucursal
      from al_corte a
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
      'corte', v_corte,
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

comment on function public.fn_cxc_listado(integer, jsonb, text, integer, integer) is
  'Cuentas por cobrar (Ventas y Finanzas, una sola página): listado paginado, KPIs y tramos. p_filtros.corte (YYYY-MM-DD) muestra los saldos al cierre de ese día: saldo de hoy + pagos y notas crédito posteriores.';
