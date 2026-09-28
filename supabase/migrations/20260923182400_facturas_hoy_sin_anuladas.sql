-- F-63 · «Facturas Hoy» no cuenta facturas anuladas
--
-- get_invoice_sales_by_day / _by_hour contaban toda fila de invoice_sales, así
-- que una factura anulada (FACT-0075 de la org 145, anulada por F-63) seguía
-- sumando en la tarjeta del inicio. Solo cuentan facturas vivas: sin 'void' y
-- sin notas crédito (document_type = 'credit_note', que no son facturas).
-- Misma firma: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_invoice_sales_by_day(p_organization_id integer, p_timezone text, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(fecha date, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (issue_date AT TIME ZONE p_timezone)::date AS fecha,
         COUNT(*)::bigint AS total
  FROM public.invoice_sales
  WHERE organization_id = p_organization_id
    AND issue_date >= p_start AND issue_date < p_end
    AND status <> 'void'
    AND COALESCE(document_type, 'invoice') <> 'credit_note'
  GROUP BY 1 ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_invoice_sales_by_day(p_organization_id integer, p_timezone text, p_start timestamp with time zone, p_end timestamp with time zone, p_branch_id integer DEFAULT NULL::integer)
 RETURNS TABLE(fecha date, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (issue_date AT TIME ZONE p_timezone)::date AS fecha,
         COUNT(*)::bigint AS total
  FROM public.invoice_sales
  WHERE organization_id = p_organization_id
    AND issue_date >= p_start AND issue_date < p_end
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status <> 'void'
    AND COALESCE(document_type, 'invoice') <> 'credit_note'
  GROUP BY 1 ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_invoice_sales_by_hour(p_organization_id integer, p_timezone text, p_start timestamp with time zone, p_end timestamp with time zone, p_branch_id integer DEFAULT NULL::integer)
 RETURNS TABLE(hora integer, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH agg AS (
    SELECT EXTRACT(HOUR FROM issue_date AT TIME ZONE p_timezone)::int AS hora,
           COUNT(*)::bigint AS total
    FROM public.invoice_sales
    WHERE organization_id = p_organization_id
      AND issue_date >= p_start AND issue_date < p_end
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status <> 'void'
      AND COALESCE(document_type, 'invoice') <> 'credit_note'
    GROUP BY 1
  )
  SELECT h.hora::int, COALESCE(a.total, 0)::bigint AS total
  FROM generate_series(0, 23) AS h(hora)
  LEFT JOIN agg a ON a.hora = h.hora
  ORDER BY h.hora;
$function$;
