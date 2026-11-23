-- Logística Fase 1 · Peso y medidas por categoría (Figma 2800:3649).
-- categories ya tenía default_weight_kg; faltaban las medidas por defecto de la caja (cm) para el
-- peso volumétrico. Aditiva: columnas NULL-ables, sin default y sin tocar filas.
alter table public.categories
  add column if not exists default_length_cm numeric,
  add column if not exists default_width_cm numeric,
  add column if not exists default_height_cm numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_medidas_defecto_check') then
    alter table public.categories
      add constraint categories_medidas_defecto_check check (
        (default_weight_kg is null or default_weight_kg > 0)
        and (default_length_cm is null or default_length_cm > 0)
        and (default_width_cm is null or default_width_cm > 0)
        and (default_height_cm is null or default_height_cm > 0)
      ) not valid;
  end if;
end $$;

comment on column public.categories.default_length_cm is
  'Largo por defecto (cm) de la caja de los productos de la categoría sin medidas propias (peso volumétrico).';
comment on column public.categories.default_width_cm is
  'Ancho por defecto (cm) de la caja de los productos de la categoría sin medidas propias.';
comment on column public.categories.default_height_cm is
  'Alto por defecto (cm) de la caja de los productos de la categoría sin medidas propias.';
