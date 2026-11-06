-- Cartera y proveedores por edades, a la fecha de corte (hallazgo 7 de la auditoría del Contador).
--
-- Lo que hacían fn_reporte_cxc_aging y fn_reporte_cxp_aging:
--  * La mora salía de days_overdue, que solo se actualiza cuando alguien escribe la fila.
--  * Las bandas filtraban due_date <= corte + 90 días y el total no: una factura que
--    vence después de esa fecha sumaba al total y a ninguna banda.
--  * El saldo era el de hoy: un abono posterior al corte ya estaba restado.
--  * Solo se devolvían las bandas con filas, en orden alfabético.
--
-- Ahora el saldo se reconstruye al corte con los mismos orígenes que usa el recálculo
-- de la factura (fn_invoice_sales_paid, fn_invoice_sales_acreditado,
-- fn_invoice_purchase_paid), cada pago una sola vez, y las bandas se calculan sobre esas
-- mismas filas: bandas y total son la misma suma.
--
-- Anticipos aparte: los saldos a favor de clientes (credit_notes) se informan solos y no
-- restan de la cartera. Con proveedores no hay auxiliar por tercero: se informa el saldo
-- del mayor 1330.
--
-- Límite conocido: una factura anulada no guarda su fecha de anulación, así que al mirar
-- un corte anterior no aparece. Si el asiento original sigue en el mayor, la diferencia
-- con el mayor lo deja ver.
--
-- Solo cambia lo que se lee. No toca saldos, documentos ni asientos.
--
-- Rollback: supabase/rollbacks/20261107130000_cartera_edades_al_corte_rollback.sql

create or replace function public.fn_cartera_banda(p_dias integer)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when coalesce(p_dias, 0) <= 0 then 'corriente'
    when p_dias <= 30 then '1-30'
    when p_dias <= 60 then '31-60'
    when p_dias <= 90 then '61-90'
    else '+90'
  end;
$function$;

-- Documentos con saldo a la fecha de corte. La usan las RPC de abajo, que ya validaron
-- acceso, permiso y sucursal: no se abre a authenticated.
create or replace function public.fn_cartera_documentos_al_corte(
  p_tipo text,
  p_org integer,
  p_corte date,
  p_branch integer default null
)
returns table (
  documento_id uuid,
  numero text,
  tercero_id text,
  tercero text,
  branch_id integer,
  fecha date,
  vence date,
  monto numeric,
  abonado numeric,
  saldo numeric,
  dias_mora integer,
  banda text
)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text := public.fn_timezone_for(p_org, p_branch);
begin
  if p_tipo = 'cxc' then
    return query
    with pagos as (
      select p.source, p.source_id,
             sum(p.amount + case when p.source = 'account_receivable' then coalesce(p.discount_amount, 0) else 0 end) as total
        from public.payments p
       where p.organization_id = p_org
         and p.source in ('invoice_sales', 'sale', 'account_receivable')
         and (p.status = 'completed' or (p.voided_at at time zone v_tz)::date > p_corte)
         and (coalesce(p.payment_date, p.created_at) at time zone v_tz)::date <= p_corte
       group by p.source, p.source_id
    ),
    aplicaciones as (
      select a.invoice_id, sum(a.amount) as total
        from public.credit_note_applications a
       where a.organization_id = p_org
         and (a.created_at at time zone v_tz)::date <= p_corte
       group by a.invoice_id
    ),
    notas as (
      select n.related_invoice_id, sum(abs(coalesce(n.total, 0))) as total
        from public.invoice_sales n
       where n.organization_id = p_org
         and n.document_type = 'credit_note'
         and n.related_invoice_id is not null
         and n.status not in ('draft', 'void', 'voided', 'cancelled')
         and (coalesce(n.issue_date, n.created_at) at time zone v_tz)::date <= p_corte
       group by n.related_invoice_id
    ),
    base as (
      select ar.id, i.number as numero, ar.customer_id::text as tercero_id,
             coalesce(
               case when c.customer_type = 'empresa' then nullif(btrim(c.company_name), '') end,
               nullif(btrim(c.full_name), ''),
               '—'
             ) as tercero,
             ar.branch_id,
             (coalesce(i.issue_date, ar.created_at) at time zone v_tz)::date as fecha,
             coalesce((ar.due_date at time zone v_tz)::date,
                      (coalesce(i.issue_date, ar.created_at) at time zone v_tz)::date) as vence,
             coalesce(ar.amount, 0) as monto,
             coalesce(pf.total, 0) + coalesce(pv.total, 0) + coalesce(pc.total, 0)
               + coalesce(ap.total, 0) + coalesce(nc.total, 0) as abonado
        from public.accounts_receivable ar
        left join public.invoice_sales i on i.id = ar.invoice_id and i.organization_id = p_org
        left join public.customers c on c.id = ar.customer_id and c.organization_id = p_org
        left join pagos pf on ar.invoice_id is not null and pf.source = 'invoice_sales' and pf.source_id = ar.invoice_id::text
        left join pagos pv on i.sale_id is not null and pv.source = 'sale' and pv.source_id = i.sale_id::text
        left join pagos pc on pc.source = 'account_receivable' and pc.source_id = ar.id::text
        left join aplicaciones ap on ap.invoice_id = ar.invoice_id
        left join notas nc on nc.related_invoice_id = ar.invoice_id
       where ar.organization_id = p_org
         and coalesce(ar.status, '') <> 'cancelled'
         and (p_branch is null or ar.branch_id = p_branch)
         and (coalesce(i.issue_date, ar.created_at) at time zone v_tz)::date <= p_corte
         and coalesce(i.status, '') not in ('draft', 'void', 'voided', 'cancelled')
         and coalesce(i.document_type, 'invoice') <> 'credit_note'
         -- La cartera vieja sin factura duplica la de la factura de la misma venta.
         and not (ar.invoice_id is null and ar.sale_id is not null and exists (
           select 1 from public.accounts_receivable o
            where o.organization_id = p_org and o.sale_id = ar.sale_id and o.invoice_id is not null
         ))
    )
    select b.id, b.numero, b.tercero_id, b.tercero, b.branch_id, b.fecha, b.vence, b.monto,
           least(b.abonado, b.monto),
           b.monto - b.abonado,
           greatest(p_corte - b.vence, 0),
           public.fn_cartera_banda(greatest(p_corte - b.vence, 0))
      from base b
     where b.monto - b.abonado > 0;

  elsif p_tipo = 'cxp' then
    return query
    with pagos as (
      select p.source, p.source_id,
             sum(p.amount + coalesce(p.discount_amount, 0)) as total
        from public.payments p
       where p.organization_id = p_org
         and p.source in ('invoice_purchase', 'account_payable')
         and (p.status = 'completed' or (p.voided_at at time zone v_tz)::date > p_corte)
         and (coalesce(p.payment_date, p.created_at) at time zone v_tz)::date <= p_corte
       group by p.source, p.source_id
    ),
    base as (
      select ap.id, i.number_ext as numero, ap.supplier_id::text as tercero_id,
             coalesce(nullif(btrim(s.name), ''), '—') as tercero,
             ap.branch_id,
             (coalesce(i.issue_date, ap.created_at) at time zone v_tz)::date as fecha,
             coalesce((ap.due_date at time zone v_tz)::date,
                      (coalesce(i.issue_date, ap.created_at) at time zone v_tz)::date) as vence,
             coalesce(ap.amount, 0) as monto,
             coalesce(pf.total, 0) + coalesce(pc.total, 0) as abonado
        from public.accounts_payable ap
        left join public.invoice_purchase i on i.id = ap.invoice_id and i.organization_id = p_org
        left join public.suppliers s on s.id = ap.supplier_id and s.organization_id = p_org
        left join pagos pf on ap.invoice_id is not null and pf.source = 'invoice_purchase' and pf.source_id = ap.invoice_id::text
        left join pagos pc on pc.source = 'account_payable' and pc.source_id = ap.id::text
       where ap.organization_id = p_org
         and coalesce(ap.status, '') not in ('void', 'cancelled')
         and (p_branch is null or ap.branch_id = p_branch)
         and (coalesce(i.issue_date, ap.created_at) at time zone v_tz)::date <= p_corte
         and coalesce(i.status, '') not in ('draft', 'void', 'voided', 'cancelled')
    )
    select b.id, b.numero, b.tercero_id, b.tercero, b.branch_id, b.fecha, b.vence, b.monto,
           least(b.abonado, b.monto),
           b.monto - b.abonado,
           greatest(p_corte - b.vence, 0),
           public.fn_cartera_banda(greatest(p_corte - b.vence, 0))
      from base b
     where b.monto - b.abonado > 0;

  else
    raise exception 'tipo_cartera_invalido' using errcode = '22023';
  end if;
end;
$function$;

-- Saldos a favor de clientes a la fecha de corte: lo recibido menos lo aplicado a
-- facturas y lo devuelto en dinero hasta ese día.
create or replace function public.fn_cartera_anticipos_al_corte(
  p_org integer,
  p_corte date,
  p_branch integer default null
)
returns table (
  credito_id uuid,
  tercero_id text,
  tercero text,
  fecha date,
  saldo numeric
)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text := public.fn_timezone_for(p_org, p_branch);
begin
  return query
  with aplicado as (
    select a.credit_note_id, sum(a.amount) as total
      from public.credit_note_applications a
     where a.organization_id = p_org
       and (a.created_at at time zone v_tz)::date <= p_corte
     group by a.credit_note_id
  ),
  devuelto as (
    select p.source_id, sum(abs(p.amount)) as total
      from public.payments p
     where p.organization_id = p_org
       and p.source = 'customer_credit_refund'
       and (p.status = 'completed' or (p.voided_at at time zone v_tz)::date > p_corte)
       and (coalesce(p.payment_date, p.created_at) at time zone v_tz)::date <= p_corte
     group by p.source_id
  )
  select cn.id, cn.customer_id::text,
         coalesce(
           case when c.customer_type = 'empresa' then nullif(btrim(c.company_name), '') end,
           nullif(btrim(c.full_name), ''),
           '—'
         ),
         (cn.created_at at time zone v_tz)::date,
         cn.amount - coalesce(ap.total, 0) - coalesce(de.total, 0)
    from public.credit_notes cn
    left join public.customers c on c.id = cn.customer_id and c.organization_id = p_org
    left join aplicado ap on ap.credit_note_id = cn.id
    left join devuelto de on de.source_id = cn.id::text
   where cn.organization_id = p_org
     and cn.status <> 'cancelled'
     and (p_branch is null or cn.branch_id = p_branch)
     and (cn.created_at at time zone v_tz)::date <= p_corte
     and cn.amount - coalesce(ap.total, 0) - coalesce(de.total, 0) > 0;
end;
$function$;

-- Saldo del mayor a la fecha de corte, con la naturaleza de la cuenta. Asientos publicados,
-- en la moneda base, con el día en la zona de la organización.
create or replace function public.fn_cartera_mayor_al_corte(
  p_org integer,
  p_prefijo text,
  p_naturaleza text,
  p_corte date,
  p_branch integer default null
)
returns numeric
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text := public.fn_timezone_for(p_org, p_branch);
  v_saldo numeric;
begin
  select coalesce(sum(
           public.monto_base_asiento(l.debit, l.debit_base, l.exchange_rate)
           - public.monto_base_asiento(l.credit, l.credit_base, l.exchange_rate)
         ), 0)
    into v_saldo
    from public.journal_lines l
    join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = p_org
     and e.posted is true
     and l.account_code like p_prefijo || '%'
     and (p_branch is null or e.branch_id = p_branch)
     and (coalesce(e.entry_date, e.created_at) at time zone v_tz)::date <= p_corte;

  return case when p_naturaleza = 'credito' then -v_saldo else v_saldo end;
end;
$function$;

create or replace function public.fn_cartera_edades_json(
  p_tipo text,
  p_org integer,
  p_corte date,
  p_branch integer default null
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_docs jsonb;
  v_buckets jsonb;
  v_terceros jsonb;
  v_total numeric;
  v_vencida numeric;
  v_cuenta text := case when p_tipo = 'cxc' then '1305' else '2205' end;
  v_mayor numeric;
  v_dif numeric;
  v_anticipos jsonb;
begin
  -- Bandas, terceros y total salen de las mismas filas: siempre suman lo mismo.
  with d as materialized (
    select * from public.fn_cartera_documentos_al_corte(p_tipo, p_org, p_corte, p_branch)
  ),
  bandas as (
    select d.banda, sum(d.saldo) as total, count(*) as cantidad
      from d
     group by d.banda
  ),
  terceros as (
    select d.tercero_id, min(d.tercero) as tercero,
           coalesce(sum(d.saldo) filter (where d.banda = 'corriente'), 0) as corriente,
           coalesce(sum(d.saldo) filter (where d.banda = '1-30'), 0) as d1_30,
           coalesce(sum(d.saldo) filter (where d.banda = '31-60'), 0) as d31_60,
           coalesce(sum(d.saldo) filter (where d.banda = '61-90'), 0) as d61_90,
           coalesce(sum(d.saldo) filter (where d.banda = '+90'), 0) as d90,
           sum(d.saldo) as total,
           count(*) as cantidad
      from d
     group by d.tercero_id
  )
  select
    (select coalesce(sum(d.saldo), 0) from d),
    (select coalesce(sum(d.saldo), 0) from d where d.dias_mora > 0),
    -- Las cinco bandas, siempre y en orden.
    (select jsonb_agg(jsonb_build_object(
              'bucket', o.banda,
              'total', coalesce(b.total, 0),
              'cantidad', coalesce(b.cantidad, 0)
            ) order by o.orden)
       from unnest(array['corriente', '1-30', '31-60', '61-90', '+90']) with ordinality as o(banda, orden)
       left join bandas b on b.banda = o.banda),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'tercero_id', t.tercero_id,
              'tercero', t.tercero,
              'corriente', t.corriente,
              'd1_30', t.d1_30,
              'd31_60', t.d31_60,
              'd61_90', t.d61_90,
              'd90', t.d90,
              'total', t.total,
              'cantidad', t.cantidad
            ) order by t.total desc, t.tercero), '[]'::jsonb)
       from terceros t),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'documento_id', d.documento_id,
              'numero', d.numero,
              'tercero_id', d.tercero_id,
              'tercero', d.tercero,
              'branch_id', d.branch_id,
              'fecha', d.fecha,
              'vence', d.vence,
              'monto', d.monto,
              'abonado', d.abonado,
              'saldo', d.saldo,
              'dias_mora', d.dias_mora,
              'banda', d.banda
            ) order by d.dias_mora desc, d.vence, d.documento_id), '[]'::jsonb)
       from d)
    into v_total, v_vencida, v_buckets, v_terceros, v_docs;

  v_mayor := public.fn_cartera_mayor_al_corte(
    p_org, v_cuenta, case when p_tipo = 'cxc' then 'debito' else 'credito' end, p_corte, p_branch
  );
  v_dif := v_mayor - v_total;

  if p_tipo = 'cxc' then
    select jsonb_build_object(
             'origen', 'saldos_a_favor',
             'cuenta', '2805',
             'total', coalesce(sum(a.saldo), 0),
             'detalle', coalesce(jsonb_agg(jsonb_build_object(
               'credito_id', a.credito_id, 'tercero_id', a.tercero_id, 'tercero', a.tercero,
               'fecha', a.fecha, 'saldo', a.saldo
             ) order by a.fecha, a.credito_id), '[]'::jsonb)
           )
      into v_anticipos
      from public.fn_cartera_anticipos_al_corte(p_org, p_corte, p_branch) a;
  else
    v_anticipos := jsonb_build_object(
      'origen', 'mayor',
      'cuenta', '1330',
      'total', public.fn_cartera_mayor_al_corte(p_org, '1330', 'debito', p_corte, p_branch),
      'detalle', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'tipo', p_tipo,
    'corte', p_corte,
    'total', v_total,
    'vencida', v_vencida,
    'buckets', v_buckets,
    'terceros', v_terceros,
    'detalle', v_docs,
    'anticipos', v_anticipos,
    'mayor', jsonb_build_object(
      'cuenta', v_cuenta,
      'saldo', v_mayor,
      'diferencia', v_dif,
      -- El mayor va en pesos enteros y la cartera puede traer decimales.
      'cuadra', abs(v_dif) < 1
    )
  );
end;
$function$;

revoke all on function public.fn_cartera_documentos_al_corte(text, integer, date, integer) from public, anon, authenticated;
revoke all on function public.fn_cartera_anticipos_al_corte(integer, date, integer) from public, anon, authenticated;
revoke all on function public.fn_cartera_mayor_al_corte(integer, text, text, date, integer) from public, anon, authenticated;
revoke all on function public.fn_cartera_edades_json(text, integer, date, integer) from public, anon, authenticated;
revoke all on function public.fn_cartera_banda(integer) from public, anon;
grant execute on function public.fn_cartera_documentos_al_corte(text, integer, date, integer) to service_role;
grant execute on function public.fn_cartera_anticipos_al_corte(integer, date, integer) to service_role;
grant execute on function public.fn_cartera_mayor_al_corte(integer, text, text, date, integer) to service_role;
grant execute on function public.fn_cartera_edades_json(text, integer, date, integer) to service_role;
grant execute on function public.fn_cartera_banda(integer) to authenticated, service_role;

create or replace function public.fn_reporte_cxc_aging(p_organization_id bigint, p_as_of date, p_branch_id bigint default null::bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  perform public.fn_assert_acceso_org(p_organization_id::integer);
  if not public.fn_tiene_permiso(p_organization_id::integer, 'finance.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  return public.fn_cartera_edades_json('cxc', p_organization_id::integer, p_as_of, p_branch_id::integer);
end;
$function$;

create or replace function public.fn_reporte_cxp_aging(p_organization_id bigint, p_as_of date, p_branch_id bigint default null::bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  perform public.fn_assert_acceso_org(p_organization_id::integer);
  if not public.fn_tiene_permiso(p_organization_id::integer, 'finance.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  return public.fn_cartera_edades_json('cxp', p_organization_id::integer, p_as_of, p_branch_id::integer);
end;
$function$;

revoke all on function public.fn_reporte_cxc_aging(bigint, date, bigint) from public, anon;
revoke all on function public.fn_reporte_cxp_aging(bigint, date, bigint) from public, anon;
grant execute on function public.fn_reporte_cxc_aging(bigint, date, bigint) to authenticated, service_role;
grant execute on function public.fn_reporte_cxp_aging(bigint, date, bigint) to authenticated, service_role;
