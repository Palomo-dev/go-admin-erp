-- ============================================================
-- POS: pos_product_ranking comprueba pertenencia y deja de ser ejecutable por anon
-- ============================================================
-- La RPC que ordena el catálogo del POS (favoritos primero, luego unidades
-- vendidas en 90 días) es SECURITY DEFINER, recibe `p_org_id` por parámetro y
-- hasta hoy no comprobaba nada: cualquier llamante podía pasar cualquier
-- organización y leer sus product_ids, favoritos y ventas de 90 días por
-- producto. Además `anon` tenía EXECUTE (privilegio por defecto del esquema),
-- así que bastaba la clave publicable del navegador, sin sesión.
--
-- Se aplican las dos mitades juntas, calcadas de `pos_category_ranking`
-- (migración 20260910225629):
--   1. Guarda de pertenencia contra organization_members con is_active, en
--      forma de afirmación positiva incondicional: con `anon` auth.uid() es
--      NULL y el EXISTS falla cerrado (errcode 42501).
--   2. REVOKE EXECUTE FROM public, anon; GRANT a authenticated, service_role.
--
-- También se fija `search_path = public`, que faltaba: una función con
-- elevación no debe resolver objetos según el search_path del llamante.
--
-- El cuerpo de la consulta es el que estaba en producción (verificado con
-- pg_get_functiondef antes de escribir esto); solo se añade la guarda.
-- Único consumidor: posService.getProductsPaginated, con sesión de usuario.
--
-- Verificado antes de aplicar, dentro de begin/rollback, impersonando:
--   · miembro activo de la org       → filas (5 de 1359)
--   · usuario autenticado de otra org → 42501 "No perteneces a esta organización"
--   · anon                            → 42501 "permission denied for function"
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
set search_path = public
as $$
DECLARE
  v_offset integer;
  v_sales_window timestamptz := now() - interval '90 days';
  v_has_search boolean := (p_search IS NOT NULL AND p_search <> '');
BEGIN
  -- Guarda de pertenencia. Afirmación positiva incondicional: con `anon`
  -- auth.uid() es NULL y el EXISTS falla cerrado (no se salta como en la
  -- forma `IF auth.uid() IS NOT NULL AND NOT EXISTS`).
  if not exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = p_org_id
      and om.is_active
  ) then
    raise exception 'No perteneces a esta organización'
      using errcode = '42501';
  end if;

  v_offset := (p_page - 1) * p_limit;

  RETURN QUERY
  WITH
  -- IDs de productos (padre/simple) que coinciden con el término de búsqueda.
  -- Incluye coincidencias directas (sku/name/description/barcode del producto),
  -- variantes hijas (sku/name/barcode) -> su producto padre, y
  -- modificadores (grupo u opción por nombre) -> su producto asociado.
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

revoke execute on function public.pos_product_ranking(integer, text, integer, text, boolean, integer, integer)
  from public, anon;
grant  execute on function public.pos_product_ranking(integer, text, integer, text, boolean, integer, integer)
  to authenticated, service_role;

commit;
