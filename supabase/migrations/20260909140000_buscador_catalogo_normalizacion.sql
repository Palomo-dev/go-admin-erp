-- =============================================================================
-- Buscador de catalogo (1/2): normalizacion y columnas de busqueda
--
-- Problema que resuelve (auditoria 2026-09-09):
--   El texto del cliente se limpiaba de tildes y signos, pero los nombres del
--   catalogo los conservaban. Se comparaban lados distintos, asi que no casaban:
--     - "mens"     -> 0 resultados, cuando 2.470 productos dicen "Men's" (95% del
--                     catalogo de una tienda de calzado, inalcanzable).
--     - "cafe"     -> 51 resultados, cuando deberian ser 153 ("Cafe" y "Café").
--     - "unguento" -> 0 resultados, cuando existe "Aciclovir Ungüento".
--   Productos con tilde: tres organizaciones al 38,8%, 33,3% y 30,5%.
--
-- Solucion: normalizar AMBOS lados con la misma funcion, y materializar la forma
-- normalizada en columnas generadas para que la busqueda no pague el coste de
-- normalizar 6.000 filas en cada mensaje del chat.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) unaccent inmutable
--
-- `unaccent(regdictionary, text)` es STABLE, no IMMUTABLE, asi que Postgres no
-- la admite ni en indices ni en columnas generadas. Este envoltorio es el
-- procedimiento habitual y documentado.
--
-- OJO: si algun dia se modifica el diccionario `unaccent`, hay que reconstruir
-- las columnas generadas y los indices que dependen de esta funcion.
-- -----------------------------------------------------------------------------
create or replace function public.f_unaccent(p_texto text)
returns text
language sql
immutable
parallel safe
strict
as $fn$
  select public.unaccent('public.unaccent'::regdictionary, p_texto)
$fn$;

comment on function public.f_unaccent(text) is
  'unaccent envuelto como IMMUTABLE para poder usarlo en indices y columnas generadas.';

-- -----------------------------------------------------------------------------
-- 2) Normalizacion de busqueda
--
--   "Trail Runner Men's Performance-T - S" -> "trail runner mens performance t s"
--   "Aciclovir Ungüento"                 -> "aciclovir unguento"
--   "Pocillo Apilable Café"              -> "pocillo apilable cafe"
--
-- Los apostrofos se BORRAN (no se sustituyen por espacio) para que "Men's" se
-- vuelva "mens", que es como lo escribe el cliente. El resto de signos si pasan
-- a espacio, para no pegar palabras que estaban separadas por un guion.
-- -----------------------------------------------------------------------------
create or replace function public.normalizar_busqueda(p_texto text)
returns text
language sql
immutable
parallel safe
as $fn$
  select trim(regexp_replace(
           regexp_replace(
             replace(replace(
               lower(public.f_unaccent(coalesce(p_texto, ''))),
             '''', ''), '’', ''),
           '[^a-z0-9]+', ' ', 'g'),
         '\s+', ' ', 'g'))
$fn$;

comment on function public.normalizar_busqueda(text) is
  'Minusculas, sin tildes, sin apostrofos y con el resto de signos convertidos en espacios. Se aplica IGUAL al catalogo y a lo que escribe el cliente.';

-- -----------------------------------------------------------------------------
-- 3) Columnas de busqueda materializadas
--    Un solo ALTER para que la tabla se reescriba una vez y no tres.
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists busqueda_nombre text
    generated always as (public.normalizar_busqueda(name)) stored,
  add column if not exists busqueda_marca text
    generated always as (public.normalizar_busqueda(coalesce(brand, '') || ' ' || coalesce(reference, ''))) stored,
  add column if not exists busqueda_descripcion text
    generated always as (public.normalizar_busqueda(description)) stored;

comment on column public.products.busqueda_nombre is
  'Nombre normalizado para busqueda. Generada: no escribir a mano.';

-- -----------------------------------------------------------------------------
-- 4) Indices
--    El GIN trigram sirve tanto para `like '%x%'` como para similarity().
-- -----------------------------------------------------------------------------
create index if not exists idx_products_busqueda_nombre_trgm
  on public.products using gin (busqueda_nombre public.gin_trgm_ops);

create index if not exists idx_products_busqueda_marca_trgm
  on public.products using gin (busqueda_marca public.gin_trgm_ops);

-- Filtro previo del buscador: organizacion + activos.
create index if not exists idx_products_org_activos
  on public.products (organization_id)
  where status = 'active';
