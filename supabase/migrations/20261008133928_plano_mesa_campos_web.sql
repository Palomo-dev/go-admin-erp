-- Plantilla «Café de especialidad» · M2 (fase F3): campos web de la mesa.
--
-- - is_web_bookable: la mesa se puede elegir en el plano de «Reservas» del sitio.
--   Por defecto true (decisión del dueño: todas las mesas se reservan en la web).
--   En false se ve en el plano, pero no se toca.
-- - web_min_party / web_max_party: personas para reservarla en la web. NULL = de 1
--   a la capacidad de la mesa.
--
-- Aditiva: dos columnas NULL-ables y un booleano con DEFAULT (solo metadatos en
-- Postgres 15; no reescribe la tabla).

alter table public.restaurant_tables
  add column if not exists is_web_bookable boolean not null default true,
  add column if not exists web_min_party integer,
  add column if not exists web_max_party integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.restaurant_tables'::regclass
       and conname = 'restaurant_tables_web_party_check'
  ) then
    alter table public.restaurant_tables
      add constraint restaurant_tables_web_party_check check (
        (web_min_party is null or web_min_party >= 1)
        and (web_max_party is null or web_max_party >= 1)
        and (web_min_party is null or web_max_party is null or web_min_party <= web_max_party)
      );
  end if;
end $$;

comment on column public.restaurant_tables.is_web_bookable is
  'Se puede elegir en el plano de «Reservas» del sitio. En false se ve, pero no se toca.';
comment on column public.restaurant_tables.web_min_party is
  'Mínimo de personas para reservarla en la web. NULL = 1.';
comment on column public.restaurant_tables.web_max_party is
  'Máximo de personas para reservarla en la web. NULL = la capacidad de la mesa.';
