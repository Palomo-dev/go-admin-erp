-- Finanzas ronda 4 · Frente R4-A · Borrador del IVA (formulario 300) desde los libros
-- (Figma «07 Finanzas» 2335:137440).
--
-- Aplicada por el MCP el 2026-11-07 con orden del dueño (docs/implementacion/FINANZAS-R4-E-INTEGRACIONES-PLAN.md). Mientras no exista,
-- la pantalla «Borrador de IVA» dice «pendiente de activar»; nunca muestra cero.
--
-- Por qué una función nueva y no `fn_reporte_impuestos`: aquella lee las facturas, no los libros, y
-- su desglose por código suma el subtotal de toda la factura en cada código (la cifra se repite). El
-- borrador debe salir de los ASIENTOS y poder decir de qué asientos sale cada renglón.
--
-- Qué hace (solo lectura, sin tocar tablas):
--   1. Toma los asientos publicados del periodo (días de la organización, `organizations.timezone`).
--      Un asiento y su contra-asiento dentro del mismo periodo se anulan y no se miran.
--   2. El IVA de cada asiento es su movimiento en las cuentas 2408 (crédito − débito).
--   3. Documentos de venta (POS `sales` y `invoice_sales`, con sus notas crédito) y de compra
--      (`invoice_purchase`) con asiento en el periodo: su IVA de libros se compara con el que dan sus
--      líneas. Si coincide (±$1), las líneas se reparten por tarifa (gravadas, sin IVA, devoluciones).
--      Si no coincide, si una línea tiene IVA sin tarifa o si no hay líneas, el documento entero va a un
--      renglón «revisar» con el IVA de los libros: nunca se reparte por adivinación.
--   4. Cualquier otro asiento que mueva 2408 (manual, pago del impuesto, ajuste) va a «Otros
--      movimientos en cuentas de IVA», también «revisar»: el Contador decide si entra.
--   5. Los totales son los de los libros: IVA generado y descontable de los documentos, y el saldo.
--      La diferencia de centavos entre líneas y libros de los documentos que cuadran sale en su propio
--      renglón de redondeo, para que la suma de los renglones dé el total.
-- La numeración de renglones del formulario no se fija aquí: la confirma el Contador con el formulario
-- vigente. Nada se presenta ni se firma ante la DIAN.
--
-- SECURITY DEFINER con guarda de pertenencia y `finance.view` (o admin.full_access); sin anon.
-- Lista de asientos por renglón: hasta 200 (más el conteo total).

create or replace function public.fn_tributario_borrador_iva(p_organization_id integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text;
  v_ini timestamptz;
  v_fin timestamptz;
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.view')
    or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'PERIODO_INVALIDO' using errcode = '22023';
  end if;

  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_organization_id;
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;

  with en_periodo as (
    select je.id, je.source, je.source_id,
           case when je.fact_key ~ '^reversal:[0-9]+$' then substring(je.fact_key from 10)::integer end as revierte_a
      from public.journal_entries je
     where je.organization_id = p_organization_id
       and je.posted
       and je.entry_date >= v_ini and je.entry_date < v_fin
       and coalesce(je.source, '') <> 'cierre_ejercicio'
  ), pares as (
    select r.original_entry_id as id, r.reversal_entry_id as otro
      from public.journal_reversals r
     where r.organization_id = p_organization_id and r.reversal_entry_id is not null
    union
    select x.revierte_a, x.id from en_periodo x where x.revierte_a is not null
  ), anulados as (
    select p.id from pares p
     where p.id in (select id from en_periodo) and p.otro in (select id from en_periodo)
    union
    select p.otro from pares p
     where p.id in (select id from en_periodo) and p.otro in (select id from en_periodo)
  ), vivos as (
    select e.id, e.source, e.source_id from en_periodo e where e.id not in (select a.id from anulados a where a.id is not null)
  ), iva as (
    select v.id, v.source, v.source_id, sum(l.credit - l.debit) as neto
      from vivos v
      join public.journal_lines l on l.journal_entry_id = v.id
     where l.account_code like '2408%'
     group by v.id, v.source, v.source_id
  ), docs as (
    select v.source, v.source_id,
           case when v.source = 'invoice_purchase' then 'descontable' else 'generado' end as lado,
           array_agg(v.id order by v.id) as asientos,
           -- Generado: crédito − débito. Descontable: débito − crédito. Positivo = el sentido normal.
           coalesce(sum(case when v.source = 'invoice_purchase' then -i.neto else i.neto end), 0) as iva_libro
      from vivos v
      left join iva i on i.id = v.id
     where v.source in ('sales', 'sale', 'invoice_sales', 'invoice_purchase')
     group by v.source, v.source_id
  ), lineas as (
    -- Venta POS: el IVA de la línea es el registrado; IVA sin tarifa = tarifa sin identificar.
    select d.source, d.source_id, 'venta'::text as tipo,
           case when coalesce(si.tax_rate, 0) > 0 then si.tax_rate
                when coalesce(si.tax_amount, 0) <> 0 then null
                else 0 end::numeric as tarifa,
           (case when coalesce(si.tax_included, s.tax_included, false) then coalesce(si.total, 0) - coalesce(si.tax_amount, 0)
                 else coalesce(si.total, 0) end)::numeric as base,
           coalesce(si.tax_amount, 0)::numeric as iva
      from docs d
      join public.sales s on s.id::text = d.source_id and s.organization_id = p_organization_id
      join public.sale_items si on si.sale_id = s.id
     where d.source in ('sales', 'sale')
    union all
    -- Factura de venta y nota crédito: base por línea con la fórmula del recálculo de totales.
    select d.source, d.source_id,
           case when coalesce(f.document_type, 'invoice') = 'credit_note' then 'devolucion' else 'venta' end,
           coalesce(it.tax_rate, 0)::numeric,
           case when coalesce(f.document_type, 'invoice') = 'credit_note' then -abs(b.base) else b.base end,
           round(case when coalesce(f.document_type, 'invoice') = 'credit_note' then -abs(b.base) else b.base end
                 * coalesce(it.tax_rate, 0) / 100, 2)
      from docs d
      join public.invoice_sales f on f.id::text = d.source_id and f.organization_id = p_organization_id
      join public.invoice_items it on (it.invoice_sales_id = f.id or (it.invoice_id = f.id and it.invoice_type = 'sale'))
      cross join lateral (
        select case when coalesce(it.tax_included, f.tax_included, false) and coalesce(it.tax_rate, 0) > 0
                    then round((it.qty * it.unit_price - coalesce(it.discount_amount, 0)) / (1 + it.tax_rate / 100), 2)
                    else round(it.qty * it.unit_price - coalesce(it.discount_amount, 0), 2) end::numeric as base
      ) b
     where d.source = 'invoice_sales'
    union all
    -- Factura de compra: misma fórmula.
    select d.source, d.source_id, 'compra',
           coalesce(it.tax_rate, 0)::numeric,
           b.base,
           round(b.base * coalesce(it.tax_rate, 0) / 100, 2)
      from docs d
      join public.invoice_purchase p on p.id::text = d.source_id and p.organization_id = p_organization_id
      join public.invoice_items it on (it.invoice_purchase_id = p.id or (it.invoice_id = p.id and it.invoice_type = 'purchase'))
      cross join lateral (
        select case when coalesce(it.tax_included, p.tax_included, false) and coalesce(it.tax_rate, 0) > 0
                    then round((it.qty * it.unit_price - coalesce(it.discount_amount, 0)) / (1 + it.tax_rate / 100), 2)
                    else round(it.qty * it.unit_price - coalesce(it.discount_amount, 0), 2) end::numeric as base
      ) b
     where d.source = 'invoice_purchase'
  ), por_doc as (
    select l.source, l.source_id, count(*) as n_lineas, sum(l.iva) as iva_calc, bool_or(l.tarifa is null) as sin_tarifa
      from lineas l
     group by l.source, l.source_id
  ), estado_doc as (
    select d.source, d.source_id, d.lado, d.asientos, d.iva_libro,
           coalesce(p.n_lineas, 0) as n_lineas,
           coalesce(p.iva_calc, 0) as iva_calc,
           case when coalesce(p.n_lineas, 0) = 0 then 'sin_lineas'
                when coalesce(p.sin_tarifa, false) then 'tarifa_sin_identificar'
                when abs(coalesce(p.iva_calc, 0) - d.iva_libro) > 1 then 'no_cuadra'
           end as motivo
      from docs d
      left join por_doc p on p.source = d.source and p.source_id = d.source_id
  ), clasif as (
    -- Una fila por línea de documento con su renglón.
    select e.lado,
           coalesce(e.motivo,
             case when l.tipo = 'devolucion' then 'devoluciones'
                  when l.tarifa = 0 then 'sin_iva'
                  else 'gravadas' end) as clave,
           case when e.motivo is null and l.tipo <> 'devolucion' and l.tarifa > 0 then l.tarifa end as tarifa,
           l.base,
           case when e.motivo is null then l.iva end as iva_linea,
           e.source, e.source_id
      from lineas l
      join estado_doc e on e.source = l.source and e.source_id = l.source_id
  ), docs_renglon as (
    select distinct c.lado, c.clave, c.tarifa, c.source, c.source_id from clasif c
    union
    select e.lado, e.motivo, null::numeric, e.source, e.source_id from estado_doc e where e.motivo = 'sin_lineas'
  ), valores as (
    select c.lado, c.clave, c.tarifa, sum(c.base) as base, sum(c.iva_linea) as valor
      from clasif c
     group by c.lado, c.clave, c.tarifa
  ), valores_motivo as (
    select e.lado, e.motivo as clave, sum(e.iva_libro) as valor
      from estado_doc e
     where e.motivo is not null
     group by e.lado, e.motivo
  ), asientos_renglon as (
    select dr.lado, dr.clave, dr.tarifa,
           count(distinct a.id) as n_asientos,
           count(distinct (dr.source, dr.source_id)) as n_documentos,
           (array_agg(distinct a.id order by a.id))[1:200] as asientos
      from docs_renglon dr
      join estado_doc e on e.source = dr.source and e.source_id = dr.source_id
      cross join lateral unnest(e.asientos) as a(id)
     group by dr.lado, dr.clave, dr.tarifa
  ), renglones_doc as (
    select ar.lado, ar.clave, ar.tarifa,
           v.base,
           case when ar.clave in ('sin_lineas', 'tarifa_sin_identificar', 'no_cuadra') then vm.valor else coalesce(v.valor, 0) end as valor,
           ar.n_asientos, ar.n_documentos, ar.asientos
      from asientos_renglon ar
      left join valores v on v.lado = ar.lado and v.clave = ar.clave and v.tarifa is not distinct from ar.tarifa
      left join valores_motivo vm on vm.lado = ar.lado and vm.clave = ar.clave
  ), totales_lado as (
    select e.lado, sum(e.iva_libro) as libro from estado_doc e group by e.lado
  ), redondeo as (
    select t.lado, 'ajuste_redondeo'::text as clave, null::numeric as tarifa, null::numeric as base,
           t.libro - coalesce((select sum(r.valor) from renglones_doc r where r.lado = t.lado), 0) as valor,
           0::bigint as n_asientos, 0::bigint as n_documentos, '{}'::integer[] as asientos
      from totales_lado t
  ), otros as (
    select 'otros'::text as lado, 'otros_movimientos'::text as clave, null::numeric as tarifa, null::numeric as base,
           sum(i.neto) as valor,
           count(*) as n_asientos, 0::bigint as n_documentos,
           (array_agg(i.id order by i.id))[1:200] as asientos
      from iva i
     where i.source is null or i.source not in ('sales', 'sale', 'invoice_sales', 'invoice_purchase')
    having count(*) > 0
  ), renglones as (
    select * from renglones_doc
    union all
    select * from redondeo where abs(valor) >= 0.005
    union all
    select * from otros
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'zona', v_tz),
    'renglones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lado', r.lado,
               'clave', r.clave,
               'tarifa', r.tarifa,
               'base', r.base,
               'valor', r.valor,
               'estado', case when r.clave in ('gravadas', 'devoluciones', 'ajuste_redondeo') then 'ok' else 'revisar' end,
               'asientos', to_jsonb(coalesce(r.asientos, '{}'::integer[])),
               'total_asientos', r.n_asientos,
               'total_documentos', r.n_documentos
             ) order by
               case r.lado when 'generado' then 1 when 'descontable' then 2 else 3 end,
               case r.clave when 'gravadas' then 1 when 'sin_iva' then 2 when 'devoluciones' then 3
                            when 'tarifa_sin_identificar' then 4 when 'no_cuadra' then 5 when 'sin_lineas' then 6
                            when 'ajuste_redondeo' then 7 else 8 end,
               r.tarifa desc nulls last)
        from renglones r), '[]'::jsonb),
    'totales', jsonb_build_object(
      'iva_generado', coalesce((select t.libro from totales_lado t where t.lado = 'generado'), 0),
      'iva_descontable', coalesce((select t.libro from totales_lado t where t.lado = 'descontable'), 0),
      'otros_movimientos', (select o.valor from otros o),
      'saldo', coalesce((select t.libro from totales_lado t where t.lado = 'generado'), 0)
               - coalesce((select t.libro from totales_lado t where t.lado = 'descontable'), 0),
      'documentos', (select count(*) from estado_doc),
      'por_revisar', (select count(*) from renglones r where r.clave not in ('gravadas', 'devoluciones', 'ajuste_redondeo'))
    ),
    'cuentas', coalesce((
      select jsonb_agg(distinct l.account_code order by l.account_code)
        from vivos v join public.journal_lines l on l.journal_entry_id = v.id
       where l.account_code like '2408%'), '[]'::jsonb),
    'calculado_en', now()
  ) into v_resultado;

  return v_resultado;
end;
$function$;

comment on function public.fn_tributario_borrador_iva(integer, date, date) is
  'Borrador del IVA (formulario 300) de un periodo desde los asientos (cuentas 2408), con los asientos de cada renglón. Solo lectura; no se presenta ante la DIAN.';

revoke all on function public.fn_tributario_borrador_iva(integer, date, date) from public, anon;
grant execute on function public.fn_tributario_borrador_iva(integer, date, date) to authenticated;
