-- ============================================================
-- ROLLBACK de 20260910000000_rls_product_images_hashable.sql
-- ============================================================
-- Restaura la política de product_images tal y como estaba tras el cierre del
-- acceso anónimo del 2026-09-09 (transcrita de pg_policies, no de memoria).
--
-- ⚠️ ADVERTENCIA: esta forma con EXISTS anidado es la que provoca el
-- statement_timeout en el catálogo de productos. Restaurarla vuelve a romper
-- src/app/app/inventario/productos. Úsese solo si la política nueva resulta
-- conceder o denegar acceso de forma incorrecta; para un problema de
-- rendimiento, la solución es ajustar la nueva, no volver a esta.
--
-- NOTA: este rollback NO recrea "Allow anon select product_images"
-- (`qual = true`), que era una fuga de datos entre organizaciones. Si hiciera
-- falta revertir también aquello, está en el rollback del cierre anónimo.
-- ============================================================

begin;

set local lock_timeout = '3s';

drop policy if exists "Users can view their organization product_images"
  on public.product_images;

create policy "Users can view their organization product_images"
  on public.product_images
  for all
  using (
    exists (
      select 1
      from products p
      where p.id = product_images.product_id
        and exists (
          select 1
          from organization_members om
          where om.organization_id = p.organization_id
            and om.user_id = auth.uid()
        )
    )
  );

commit;
