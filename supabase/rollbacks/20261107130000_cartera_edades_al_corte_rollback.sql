-- Reversión de 20261107130000_cartera_edades_al_corte.sql
-- Devuelve las dos funciones a su cuerpo anterior (leído de producción con pg_get_functiondef)
-- y quita las auxiliares. Solo funciones de lectura: no hay datos que restaurar.

CREATE OR REPLACE FUNCTION public.fn_reporte_cxc_aging(p_organization_id bigint, p_as_of date, p_branch_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buckets jsonb;
  v_total numeric;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', b.bucket,
    'total', b.total,
    'cantidad', b.cantidad
  )), '[]'::jsonb) INTO v_buckets
  FROM (
    SELECT
      CASE
        WHEN COALESCE(ar.days_overdue, 0) = 0 THEN 'corriente'
        WHEN ar.days_overdue BETWEEN 1 AND 30 THEN '1-30'
        WHEN ar.days_overdue BETWEEN 31 AND 60 THEN '31-60'
        WHEN ar.days_overdue BETWEEN 61 AND 90 THEN '61-90'
        ELSE '+90'
      END AS bucket,
      COALESCE(SUM(ar.balance), 0) AS total,
      COUNT(*) AS cantidad
    FROM accounts_receivable ar
    WHERE ar.organization_id = p_organization_id
      AND ar.status NOT IN ('paid', 'cancelled')
      AND ar.due_date <= p_as_of + INTERVAL '90 days'
      AND (p_branch_id IS NULL OR ar.branch_id = p_branch_id)
    GROUP BY bucket
    ORDER BY bucket
  ) b;

  SELECT COALESCE(SUM(ar.balance), 0) INTO v_total
  FROM accounts_receivable ar
  WHERE ar.organization_id = p_organization_id
    AND ar.status NOT IN ('paid', 'cancelled')
    AND (p_branch_id IS NULL OR ar.branch_id = p_branch_id);

  RETURN jsonb_build_object('buckets', v_buckets, 'total', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reporte_cxp_aging(p_organization_id bigint, p_as_of date, p_branch_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buckets jsonb;
  v_total numeric;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', b.bucket,
    'total', b.total,
    'cantidad', b.cantidad
  )), '[]'::jsonb) INTO v_buckets
  FROM (
    SELECT
      CASE
        WHEN COALESCE(ap.days_overdue, 0) = 0 THEN 'corriente'
        WHEN ap.days_overdue BETWEEN 1 AND 30 THEN '1-30'
        WHEN ap.days_overdue BETWEEN 31 AND 60 THEN '31-60'
        WHEN ap.days_overdue BETWEEN 61 AND 90 THEN '61-90'
        ELSE '+90'
      END AS bucket,
      COALESCE(SUM(ap.balance), 0) AS total,
      COUNT(*) AS cantidad
    FROM accounts_payable ap
    WHERE ap.organization_id = p_organization_id
      AND ap.status NOT IN ('paid', 'cancelled')
      AND ap.due_date <= p_as_of + INTERVAL '90 days'
      AND (p_branch_id IS NULL OR ap.branch_id = p_branch_id)
    GROUP BY bucket
    ORDER BY bucket
  ) b;

  SELECT COALESCE(SUM(ap.balance), 0) INTO v_total
  FROM accounts_payable ap
  WHERE ap.organization_id = p_organization_id
    AND ap.status NOT IN ('paid', 'cancelled')
    AND (p_branch_id IS NULL OR ap.branch_id = p_branch_id);

  RETURN jsonb_build_object('buckets', v_buckets, 'total', v_total);
END;
$function$;

drop function if exists public.fn_cartera_edades_json(text, integer, date, integer);
drop function if exists public.fn_cartera_mayor_al_corte(integer, text, text, date, integer);
drop function if exists public.fn_cartera_anticipos_al_corte(integer, date, integer);
drop function if exists public.fn_cartera_documentos_al_corte(text, integer, date, integer);
drop function if exists public.fn_cartera_banda(integer);
