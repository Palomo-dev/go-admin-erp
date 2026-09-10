-- ============================================================
-- ROLLBACK de 20260911000000_pos_product_ranking_guarda_pertenencia
-- ============================================================
-- Restaura la definición anterior de pos_product_ranking (sin guarda de
-- pertenencia ni search_path fijo) y devuelve el EXECUTE a anon, tal como
-- estaba en el baseline. No hay datos que revertir: la migración solo cambia
-- la función y sus privilegios.
--
-- Ojo: esto reabre el agujero (lectura de favoritos y ventas de 90 días de
-- cualquier organización con la clave publicable). Solo para revertir una
-- regresión funcional del POS mientras se corrige la migración.
-- ============================================================

begin;

set local lock_timeout = '3s';

create or replace function public.pos_product_ranking(
  p_org_id          integer,
  p_search          text    default null,
  p_category_id     integer default null,
  p_status          text    default 'active',
  p_include_variants boolean default false,
  p_page            integer default 1,
  p_limit           integer default 12
)
returns table (
  product_id      integer,
  total_count     bigint,
  is_favorite     boolean,
  sales_count_90d bigint
)
language plpgsql
security definer
as $$
DECLARE
  v_offset integer;
  v_sales_window timestamptz := now() - interval '90 days';
  v_has_search boolean := (p_search IS NOT NULL AND p_search <> '');
BEGIN
  v_offset := (p_page - 1) * p_limit;

  RETURN QUERY
  WITH
  matched_ids AS (
    SELECT p.id
    FROM public.products p
    WHERE p.organization_id = p_org_id
      AND p.parent_product_id IS NULL
      AND (
        p.sku ILIKE '%' || p_search || '%'
        OR p.name ILIKE '%' || p_search || '%'
        OR COALESCE(p.description, '') ILIKE '%' || p_search || '%'
        OR p.barcode = p_search
      )
    UNION
    SELECT parent.id
    FROM public.products variant
    JOIN public.products parent ON parent.id = variant.parent_product_id
    WHERE variant.organization_id = p_org_id
      AND parent.organization_id = p_org_id
      AND parent.parent_product_id IS NULL
      AND (
        variant.sku ILIKE '%' || p_search || '%'
        OR variant.name ILIKE '%' || p_search || '%'
        OR variant.barcode = p_search
      )
    UNION
    SELECT g.product_id
    FROM public.product_modifier_groups g
    JOIN public.products p ON p.id = g.product_id
    WHERE g.organization_id = p_org_id
      AND p.organization_id = p_org_id
      AND p.parent_product_id IS NULL
      AND g.name ILIKE '%' || p_search || '%'
    UNION
    SELECT g.product_id
    FROM public.product_modifiers m
    JOIN public.product_modifier_groups g ON g.id = m.group_id
    JOIN public.products p ON p.id = g.product_id
    WHERE g.organization_id = p_org_id
      AND p.organization_id = p_org_id
      AND p.parent_product_id IS NULL
      AND m.is_active = true
      AND m.name ILIKE '%' || p_search || '%'
  ),
  ranked AS (
    SELECT
      p.id AS product_id,
      (pf.product_id IS NOT NULL) AS is_favorite,
      COALESCE(si.sales_count, 0) AS sales_count_90d
    FROM public.products p
    LEFT JOIN public.product_favorites pf
      ON pf.product_id = p.id AND pf.organization_id = p.organization_id
    LEFT JOIN (
      SELECT si.product_id, SUM(si.quantity)::bigint AS sales_count
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE s.organization_id = p_org_id
        AND si.created_at >= v_sales_window
        AND s.status <> 'cancelled'
      GROUP BY si.product_id
    ) si ON si.product_id = p.id
    WHERE p.organization_id = p_org_id
      AND (p_status = 'all' OR p.status = p_status)
      AND (p_include_variants OR p.parent_product_id IS NULL)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (
        NOT v_has_search OR p.id IN (SELECT id FROM matched_ids)
      )
  )
  SELECT
    r.product_id,
    COUNT(*) OVER () AS total_count,
    r.is_favorite,
    r.sales_count_90d
  FROM ranked r
  ORDER BY r.is_favorite DESC, r.sales_count_90d DESC, r.product_id ASC
  LIMIT p_limit OFFSET v_offset;
END;
$$;

-- `create or replace` ya sustituye la definición entera (proconfig incluido),
-- así que la función queda sin search_path fijo. El reset es redundante y se
-- deja explícito para que la intención se lea en el diff.
alter function public.pos_product_ranking(integer, text, integer, text, boolean, integer, integer)
  reset search_path;

grant execute on function public.pos_product_ranking(integer, text, integer, text, boolean, integer, integer)
  to anon, authenticated, service_role;

commit;
