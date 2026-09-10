-- ============================================================
-- Corrige la política RLS de product_images: EXISTS anidado -> forma hasheable
-- ============================================================
-- SÍNTOMA: el catálogo de productos (src/app/app/inventario/productos) dejó de
-- cargar con "canceling statement due to statement timeout" (57014) en la
-- consulta a product_images con ~1000 ids en `product_id=in.(...)`.
--
-- CAUSA: hasta el 2026-09-09, product_images tenía además la política
-- "Allow anon select product_images" con `qual = true`. Como las políticas
-- permisivas se combinan con OR, el planner plegaba todo el predicado a `true`
-- y RLS no costaba nada. Al retirar esa política (cierre del acceso anónimo),
-- la política que quedó pasó a evaluarse de verdad — y su forma es la peor
-- posible para el planner:
--
--   EXISTS (SELECT 1 FROM products p
--           WHERE p.id = product_images.product_id
--             AND EXISTS (SELECT 1 FROM organization_members om ...))
--
-- El EXISTS *anidado* impide que Postgres lo convierta en un InitPlan hasheado.
-- Se ejecuta como SubPlan correlacionado, una vez por fila: medido con
-- EXPLAIN ANALYZE, `Nested Loop Semi Join (loops=1000)` con un
-- `Seq Scan on organization_members (loops=1000)` dentro. 3.797 ms para
-- 1.000 filas; en producción supera el statement_timeout de 8 s.
--
-- ARREGLO: misma regla de acceso, expresada como `IN (subconsulta con JOIN)`,
-- que es la forma que el planner SÍ hashea (evaluada una sola vez). Es
-- exactamente la forma que ya usa `select_product_prices_by_org_membership`
-- en product_prices, que sigue respondiendo en 26 ms bajo la misma carga.
-- Además `auth.uid()` se envuelve en `(select auth.uid())` para que se
-- evalúe una vez como InitPlan y no por fila.
--
-- Se añade `om.is_active` siguiendo el patrón de pertenencia del proyecto.
-- Verificado que no excluye a nadie: los 130 miembros tienen is_active = true,
-- ninguno NULL.
--
-- Se conserva el nombre y el ámbito (FOR ALL) de la política original para no
-- alterar quién puede escribir imágenes.
-- ============================================================

begin;

set local lock_timeout = '3s';

drop policy if exists "Users can view their organization product_images"
  on public.product_images;

create policy "Users can view their organization product_images"
  on public.product_images
  for all
  using (
    product_id in (
      select p.id
      from public.products p
      join public.organization_members om
        on om.organization_id = p.organization_id
      where om.user_id = (select auth.uid())
        and om.is_active
    )
  );

commit;

-- ============================================================
-- Verificación (debe bajar de ~3.800 ms a decenas de ms, y el plan debe
-- mostrar `hashed SubPlan` con loops=1 en vez de loops=1000):
-- ============================================================
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--   explain (analyze, timing off)
--   select id, product_id, storage_path, is_primary
--   from public.product_images
--   where product_id = any (array(select id from public.products
--                                 where organization_id = <org> limit 1000))
--   limit 1000;
--
-- Aislamiento entre organizaciones (debe devolver 0):
--   select count(*) from public.product_images pi
--   join public.products p on p.id = pi.product_id
--   where p.organization_id <> <org del usuario>;
