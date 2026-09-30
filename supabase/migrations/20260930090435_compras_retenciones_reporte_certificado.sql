-- Retenciones practicadas: reporte del periodo y certificado por proveedor
-- (pantallas «visor-retenciones-practicadas» y «certificado-retenciones»
-- aprobadas en Figma).
--
-- fn_retenciones_practicadas_filas es la única lectura: una fila por
-- retención de una factura de compra confirmada (ni borrador ni anulada) en el
-- rango. La cuenta es la del asiento publicado (la línea de la retención); si
-- la factura aún no tiene asiento, la que resolvería hoy
-- fn_cuenta_retencion_compra. Es interna: solo la llaman las dos RPC públicas,
-- que ponen su guarda.
--
-- fn_reporte_retenciones_practicadas: rango de instantes (p_from, p_to
-- incluidos), como el resto de fn_reporte_*: guarda de pertenencia al
-- principio, alcance de sucursal y EXECUTE revocado a PUBLIC y anon.
--
-- fn_certificado_retenciones_proveedor: días calendario en la zona de la
-- organización (desde, hasta incluidos), finance.view, toda la organización
-- (el agente retenedor es la organización, no la sucursal), como el estado de
-- cuenta del proveedor.
--
-- Los importes se suman en la moneda de cada factura: las retenciones se
-- practican y declaran en la moneda base, que es la de las facturas de compra
-- de hoy. Los totales no suman bases: la misma factura es base de varias
-- retenciones (fuente e ICA) y la suma no significaría nada.

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

revoke all on function public.fn_retenciones_practicadas_filas(integer, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_retenciones_practicadas_filas(integer, timestamptz, timestamptz, integer, integer) to service_role;

create or replace function public.fn_reporte_retenciones_practicadas(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_totales jsonb;
  v_por_tipo jsonb;
  v_por_proveedor jsonb;
BEGIN
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Alcance de sucursal (ver reporte_exigir_alcance_sucursal).
  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  SELECT jsonb_build_object(
           'retefuente', coalesce(sum(f.valor) FILTER (WHERE f.clase = 'retefuente'), 0),
           'reteiva', coalesce(sum(f.valor) FILTER (WHERE f.clase = 'reteiva'), 0),
           'reteica', coalesce(sum(f.valor) FILTER (WHERE f.clase = 'reteica'), 0),
           'total', coalesce(sum(f.valor), 0),
           'facturas', count(DISTINCT f.invoice_id),
           'proveedores', count(DISTINCT f.supplier_id)
         )
    INTO v_totales
    FROM public.fn_retenciones_practicadas_filas(p_organization_id::integer, p_from, p_to, p_branch_id::integer, null) f;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'clase', t.clase,
           'concepto', t.concepto,
           'cuenta', t.cuenta,
           'tarifa', t.tarifa,
           'base', t.base,
           'retenido', t.retenido,
           'facturas', t.facturas
         ) ORDER BY t.orden, t.retenido DESC, t.concepto), '[]'::jsonb)
    INTO v_por_tipo
    FROM (
      SELECT f.clase, f.concepto, f.cuenta, f.tarifa,
             sum(f.base) AS base, sum(f.valor) AS retenido, count(DISTINCT f.invoice_id) AS facturas,
             CASE f.clase WHEN 'retefuente' THEN 1 WHEN 'reteiva' THEN 2 ELSE 3 END AS orden
        FROM public.fn_retenciones_practicadas_filas(p_organization_id::integer, p_from, p_to, p_branch_id::integer, null) f
       GROUP BY f.clase, f.concepto, f.cuenta, f.tarifa
    ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'proveedor_id', p.supplier_id,
           'proveedor', s.name,
           'nit', s.nit,
           'facturas', p.facturas,
           'retefuente', p.retefuente,
           'reteiva', p.reteiva,
           'reteica', p.reteica,
           'retenido', p.retenido
         ) ORDER BY p.retenido DESC, s.name), '[]'::jsonb)
    INTO v_por_proveedor
    FROM (
      SELECT f.supplier_id,
             count(DISTINCT f.invoice_id) AS facturas,
             coalesce(sum(f.valor) FILTER (WHERE f.clase = 'retefuente'), 0) AS retefuente,
             coalesce(sum(f.valor) FILTER (WHERE f.clase = 'reteiva'), 0) AS reteiva,
             coalesce(sum(f.valor) FILTER (WHERE f.clase = 'reteica'), 0) AS reteica,
             sum(f.valor) AS retenido
        FROM public.fn_retenciones_practicadas_filas(p_organization_id::integer, p_from, p_to, p_branch_id::integer, null) f
       GROUP BY f.supplier_id
    ) p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id AND s.organization_id = p_organization_id;

  RETURN jsonb_build_object('totales', v_totales, 'por_tipo', v_por_tipo, 'por_proveedor', v_por_proveedor);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_retenciones_practicadas(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_retenciones_practicadas(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

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

revoke all on function public.fn_certificado_retenciones_proveedor(integer, integer, date, date) from public, anon;
grant execute on function public.fn_certificado_retenciones_proveedor(integer, integer, date, date) to authenticated, service_role;
