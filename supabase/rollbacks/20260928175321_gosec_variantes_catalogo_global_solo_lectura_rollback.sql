-- Rollback de 20260928175321_gosec_variantes_catalogo_global_solo_lectura.
-- Quita las restrictivas y devuelve EXECUTE de crear_tipo_variante a
-- authenticated (estado del 2026-09-28). OJO: con eso cualquier usuario con
-- sesión vuelve a poder escribir en el catálogo global (organization_id = 0).
-- Los privilegios de tabla de anon se devuelven como estaban. No toca datos.

drop policy if exists variant_types_global_solo_lectura on public.variant_types;
drop policy if exists variant_values_global_solo_lectura on public.variant_values;
grant execute on function public.crear_tipo_variante(text, integer, text[]) to authenticated, service_role;
grant insert, update, delete, truncate on table public.variant_types, public.variant_values to anon;
