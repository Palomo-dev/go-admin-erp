-- Restaurar primero código previo. Conserva certificados expedidos y la
-- foto totals._filtros_contables ya guardada; no toca asientos ni consecutivos.
create or replace function public.fn_retenciones_practicadas_filas(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_branch_id integer,
  p_supplier_id integer
)
returns table (
  invoice_id uuid,
  numero text,
  emision timestamptz,
  supplier_id integer,
  branch_id integer,
  concepto text,
  codigo text,
  clase text,
  cuenta text,
  base numeric,
  tarifa numeric,
  valor numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select i.id,
         coalesce(nullif(btrim(i.number_ext), ''), i.id::text)::text,
         i.issue_date::timestamptz,
         i.supplier_id::integer,
         i.branch_id::integer,
         w.concept::text,
         w.tax_code::text,
         public.fn_clase_retencion(w.tax_code, w.concept),
         coalesce(
           (select jl.account_code
              from journal_entries e
              join journal_lines jl on jl.journal_entry_id = e.id
             where e.organization_id = i.organization_id
               and e.source = 'invoice_purchase'
               and e.source_id = i.id::text
               and e.memo like 'Compra %'
               and jl.description = w.concept || ' - ' || e.memo
               and jl.credit = w.amount
             order by jl.id
             limit 1),
           public.fn_cuenta_retencion_compra(i.organization_id, w.tax_code, w.concept)
         )::text,
         w.base::numeric,
         w.rate::numeric,
         w.amount::numeric
    from invoice_purchase_withholdings w
    join invoice_purchase i on i.id = w.invoice_id and i.organization_id = w.organization_id
   where w.organization_id = p_organization_id
     and w.amount > 0
     and i.status not in ('draft', 'void', 'cancelled')
     and i.issue_date >= p_desde
     and i.issue_date <= p_hasta
     and (p_branch_id is null or i.branch_id = p_branch_id)
     and (p_supplier_id is null or i.supplier_id = p_supplier_id);
$$;

create or replace function public.fn_certificado_retenciones_proveedor(
  p_organization_id integer,
  p_supplier_id integer,
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_conceptos jsonb;
  v_facturas jsonb;
  v_totales jsonb;
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.view']);

  if not exists (select 1 from suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id) then
    raise exception 'PROVEEDOR_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'PERIODO_INVALIDO' using errcode = '22023';
  end if;

  v_tz := coalesce(public.fn_timezone_for(p_organization_id, null), 'America/Bogota');
  v_desde := p_desde::timestamp at time zone v_tz;
  v_hasta := ((p_hasta + 1)::timestamp at time zone v_tz) - interval '1 microsecond';

  select coalesce(jsonb_agg(jsonb_build_object(
           'clase', t.clase,
           'concepto', t.concepto,
           'cuenta', t.cuenta,
           'tarifa', t.tarifa,
           'base', t.base,
           'valor', t.valor
         ) order by t.orden, t.concepto, t.tarifa), '[]'::jsonb)
    into v_conceptos
    from (
      select f.clase, f.concepto, f.cuenta, f.tarifa, sum(f.base) as base, sum(f.valor) as valor,
             case f.clase when 'retefuente' then 1 when 'reteiva' then 2 else 3 end as orden
        from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, null, p_supplier_id) f
       group by f.clase, f.concepto, f.cuenta, f.tarifa
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.invoice_id,
           'numero', x.numero,
           'emision', x.emision,
           'dia', to_char(x.emision at time zone v_tz, 'YYYY-MM-DD'),
           'valor', x.valor
         ) order by x.emision, x.numero), '[]'::jsonb)
    into v_facturas
    from (
      select f.invoice_id, f.numero, f.emision, sum(f.valor) as valor
        from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, null, p_supplier_id) f
       group by f.invoice_id, f.numero, f.emision
    ) x;

  select jsonb_build_object(
           'retenido', coalesce(sum(f.valor), 0),
           'retefuente', coalesce(sum(f.valor) filter (where f.clase = 'retefuente'), 0),
           'reteiva', coalesce(sum(f.valor) filter (where f.clase = 'reteiva'), 0),
           'reteica', coalesce(sum(f.valor) filter (where f.clase = 'reteica'), 0)
         )
    into v_totales
    from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, null, p_supplier_id) f;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'conceptos', v_conceptos,
    'facturas', v_facturas,
    'totales', v_totales
  );
end;
$$;

create or replace function public.fn_certificado_retenciones_expedir(
  p_organization_id integer,
  p_supplier_id integer,
  p_desde date,
  p_hasta date,
  p_branch_id integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
  v_hoy date;
  v_hasta date;
  v_datos jsonb;
  v_anio integer;
  v_consecutivo integer;
  v_numero text;
  v_existente record;
  v_id uuid;
begin
  -- Misma guarda que la lectura del certificado (pertenencia + finance.view).
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.view']);

  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'SUCURSAL_NO_ENCONTRADA' using errcode = 'P0002';
  end if;

  v_tz := coalesce(public.fn_timezone_for(p_organization_id, null), 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  -- El periodo nunca pasa de hoy en la zona de la organización.
  v_hasta := least(p_hasta, v_hoy);

  -- Valida proveedor de la organización y periodo, y arma la foto.
  v_datos := public.fn_certificado_retenciones_proveedor(p_organization_id, p_supplier_id, p_desde, v_hasta);

  select c.id, c.number into v_existente
    from public.withholding_certificates c
   where c.organization_id = p_organization_id
     and c.supplier_id = p_supplier_id
     and c.period_from = p_desde
     and c.period_to = v_hasta
     and c.branch_id is not distinct from p_branch_id
     and c.status = 'issued'
     and c.concepts = coalesce(v_datos -> 'conceptos', '[]'::jsonb)
     and c.invoices = coalesce(v_datos -> 'facturas', '[]'::jsonb)
   order by c.issued_at desc
   limit 1;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.number, 'reexpedido', true);
  end if;

  v_anio := extract(year from v_hasta)::integer;
  perform pg_advisory_xact_lock(hashtextextended('certificado_retenciones:' || p_organization_id || ':' || v_anio, 0));

  select coalesce(max(c.consecutive), 0) + 1 into v_consecutivo
    from public.withholding_certificates c
   where c.organization_id = p_organization_id and c.series = 'CR' and c.year = v_anio;

  v_numero := 'CR-' || v_anio || '-' || case when v_consecutivo < 10000 then lpad(v_consecutivo::text, 4, '0') else v_consecutivo::text end;

  insert into public.withholding_certificates (
    organization_id, branch_id, supplier_id, series, year, consecutive, number,
    period_from, period_to, invoice_count, total_withheld, totals, concepts, invoices,
    status, issued_by
  ) values (
    p_organization_id, p_branch_id, p_supplier_id, 'CR', v_anio, v_consecutivo, v_numero,
    p_desde, v_hasta,
    jsonb_array_length(coalesce(v_datos -> 'facturas', '[]'::jsonb)),
    coalesce((v_datos -> 'totales' ->> 'retenido')::numeric, 0),
    coalesce(v_datos -> 'totales', '{}'::jsonb),
    coalesce(v_datos -> 'conceptos', '[]'::jsonb),
    coalesce(v_datos -> 'facturas', '[]'::jsonb),
    'issued', auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'reexpedido', false);
end;
$$;

drop function if exists public.fn_certificado_retenciones_expedir(integer,integer,date,date,integer,jsonb);
drop function if exists public.fn_certificado_retenciones_proveedor(integer,integer,date,date,jsonb);
drop function if exists public.fn_retenciones_practicadas_filas(integer,timestamptz,timestamptz,integer,integer,jsonb);

alter policy withholding_certificates_select on public.withholding_certificates
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active));
drop function if exists public.fn_certificado_retenciones_acceso(integer,jsonb);
