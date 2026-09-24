-- Catálogo global de atributos de variante (organization_id = 0): solo lectura.
--
-- 20260924100000 cerró variant_types/variant_values a la pertenencia (antes
-- «organization_id IS NOT NULL» abría todo a cualquier sesión). El detalle de
-- producto sugiere además los tipos globales de la organización 0 (Talla, Color…),
-- que ninguna organización real tiene como miembro: se vuelven a poder LEER, no
-- escribir.

drop policy if exists variant_types_globales_lectura on public.variant_types;
create policy variant_types_globales_lectura on public.variant_types
  for select to authenticated
  using (organization_id = 0);

drop policy if exists variant_values_globales_lectura on public.variant_values;
create policy variant_values_globales_lectura on public.variant_values
  for select to authenticated
  using (variant_type_id in (select vt.id from public.variant_types vt where vt.organization_id = 0));
