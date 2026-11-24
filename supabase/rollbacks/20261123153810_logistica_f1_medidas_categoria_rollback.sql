-- Reversión de 20261123153810_logistica_f1_medidas_categoria.
-- Borra las medidas por defecto de cada categoría que se hayan escrito (no se restauran datos).
alter table public.categories drop constraint if exists categories_medidas_defecto_check;
alter table public.categories
  drop column if exists default_length_cm,
  drop column if exists default_width_cm,
  drop column if exists default_height_cm;
