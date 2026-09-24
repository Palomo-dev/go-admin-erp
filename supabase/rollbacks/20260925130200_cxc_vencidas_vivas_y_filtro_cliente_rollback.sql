-- Reversión de 20260925130200_cxc_vencidas_vivas_y_filtro_cliente.sql
--
-- Restaura las versiones anteriores (cuerpos tomados de pg_get_functiondef el
-- 2026-09-23). Con ellas vuelven los dos fallos: el filtro «Cliente» de texto
-- rompe la consulta (22P02) y las parciales vencidas no cuentan como vencidas.
-- Revertir también `CuentasPorCobrarService` (manda `customer_search`).
-- No hay datos que restaurar: la migración no escribió filas.

drop function if exists public.get_accounts_receivable_paginated(integer, text, text, text, uuid, date, date, integer, integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_accounts_receivable_paginated(org_id integer, search_term text DEFAULT NULL::text, status_filter text DEFAULT 'todos'::text, aging_filter text DEFAULT 'todos'::text, customer_id_filter uuid DEFAULT NULL::uuid, date_from date DEFAULT NULL::date, date_to date DEFAULT NULL::date, page_size integer DEFAULT 10, page_number integer DEFAULT 1, branch_id_filter integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  offset_value INTEGER;
  result_data JSON;
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  -- Calcular offset
  offset_value := (page_number - 1) * page_size;

  -- Consulta principal con filtros y paginación
  WITH filtered_accounts AS (
    SELECT
      ar.*,
      c.full_name AS customer_name,
      c.email AS customer_email,
      c.phone AS customer_phone,
      inv.number AS invoice_number
    FROM accounts_receivable ar
    LEFT JOIN customers c ON ar.customer_id = c.id
    LEFT JOIN invoice_sales inv ON ar.invoice_id = inv.id
    WHERE ar.organization_id = org_id
      -- Filtro por sucursal (NULL = consolidado organización)
      AND (branch_id_filter IS NULL OR ar.branch_id = branch_id_filter)
      -- Filtro por búsqueda
      AND (
        search_term IS NULL OR
        LOWER(c.full_name) LIKE LOWER('%' || search_term || '%') OR
        LOWER(c.email) LIKE LOWER('%' || search_term || '%') OR
        LOWER(c.phone) LIKE LOWER('%' || search_term || '%') OR
        LOWER(inv.number) LIKE LOWER('%' || search_term || '%')
      )
      -- Filtro por estado
      AND (status_filter = 'todos' OR ar.status = status_filter)
      -- Filtro por cliente
      AND (customer_id_filter IS NULL OR ar.customer_id = customer_id_filter)
      -- Filtro por fechas
      AND (date_from IS NULL OR ar.created_at::date >= date_from)
      AND (date_to IS NULL OR ar.created_at::date <= date_to)
      -- Filtro por aging
      AND (
        aging_filter = 'todos' OR
        (aging_filter = '0-30' AND ar.days_overdue >= 0 AND ar.days_overdue <= 30) OR
        (aging_filter = '31-60' AND ar.days_overdue > 30 AND ar.days_overdue <= 60) OR
        (aging_filter = '61-90' AND ar.days_overdue > 60 AND ar.days_overdue <= 90) OR
        (aging_filter = '90+' AND ar.days_overdue > 90)
      )
  ),
  total_count_calc AS (
    SELECT COUNT(*) as total_count FROM filtered_accounts
  ),
  paginated_results AS (
    SELECT * FROM filtered_accounts
    ORDER BY created_at DESC
    LIMIT page_size
    OFFSET offset_value
  )
  SELECT json_build_object(
    'data', COALESCE((SELECT json_agg(pr ORDER BY pr.created_at DESC) FROM paginated_results pr), '[]'::json),
    'total_count', (SELECT total_count FROM total_count_calc),
    'page_size', page_size,
    'page_number', page_number,
    'total_pages', CEIL((SELECT total_count FROM total_count_calc)::DECIMAL / page_size)
  )
  INTO result_data;

  RETURN result_data;
END;
$function$;

revoke all on function public.get_accounts_receivable_paginated(integer, text, text, text, uuid, date, date, integer, integer, integer) from public, anon;
grant execute on function public.get_accounts_receivable_paginated(integer, text, text, text, uuid, date, date, integer, integer, integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_accounts_receivable_stats(org_id integer, branch_id_filter integer DEFAULT NULL::integer)
 RETURNS TABLE(total_cuentas integer, total_amount numeric, total_balance numeric, current_amount numeric, overdue_amount numeric, paid_amount numeric, partial_amount numeric, promedio_dias_cobro numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  RETURN QUERY
  SELECT
    COUNT(*)::integer as total_cuentas,
    SUM(ABS(ar.amount))::numeric as total_amount,
    SUM(CASE WHEN ar.balance > 0 THEN ar.balance ELSE 0 END)::numeric as total_balance,
    SUM(CASE WHEN ar.status = 'current' AND ar.balance > 0 THEN ar.balance ELSE 0 END)::numeric as current_amount,
    SUM(CASE WHEN ar.status = 'overdue' AND ar.balance > 0 THEN ar.balance ELSE 0 END)::numeric as overdue_amount,
    SUM(CASE WHEN ar.status = 'paid' THEN ABS(ar.amount) ELSE 0 END)::numeric as paid_amount,
    SUM(CASE WHEN ar.status = 'partial' AND ar.balance > 0 THEN ar.balance ELSE 0 END)::numeric as partial_amount,
    CASE
      WHEN COUNT(CASE WHEN ar.days_overdue > 0 THEN 1 END) > 0
      THEN AVG(CASE WHEN ar.days_overdue > 0 THEN ar.days_overdue END)::numeric
      ELSE 0
    END as promedio_dias_cobro
  FROM
    accounts_receivable ar
  WHERE
    ar.organization_id = org_id
    AND (branch_id_filter IS NULL OR ar.branch_id = branch_id_filter);
END;
$function$;

alter function public.get_accounts_receivable_stats(integer, integer) reset search_path;

drop function if exists public.fn_cxc_estado_vivo(integer);
