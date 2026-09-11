-- ============================================================
-- ROLLBACK de 20260911030000_coupons_quitar_update_anon
-- ============================================================
-- Recrea la política tal como estaba (UPDATE para public con using = true).
-- No hay datos que revertir. Ojo: reabre el agujero (cualquiera con la clave
-- publicable puede modificar cualquier cupón); solo para diagnosticar una
-- regresión del sitio web mientras se corrige la causa.
-- ============================================================

begin;

create policy "Allow anon update coupons" on public.coupons
  for update to public using (true);

commit;
