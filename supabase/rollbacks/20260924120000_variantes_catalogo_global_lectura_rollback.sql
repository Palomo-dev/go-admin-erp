-- Rollback de 20260924120000_variantes_catalogo_global_lectura.sql (no toca datos).
drop policy if exists variant_values_globales_lectura on public.variant_values;
drop policy if exists variant_types_globales_lectura on public.variant_types;
