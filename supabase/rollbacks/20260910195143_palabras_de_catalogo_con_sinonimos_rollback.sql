-- Reversion de 20260910195143_palabras_de_catalogo_con_sinonimos
--
-- Devuelve `palabras_de_catalogo` a la version que solo mira el vocabulario y la
-- similitud, sin consultar sinonimos. Las tablas `org_sinonimos` y
-- `sinonimos_base` quedan intactas: se dejan de leer, no se borran.
--
-- Efecto: "zapatillas" vuelve a no encontrar nada en una tienda de calzado.

create or replace function public.palabras_de_catalogo(
  p_org integer,
  p_palabras text[],
  p_umbral_similitud real default 0.6
)
returns table (palabra_cliente text, palabra_catalogo text, exacta boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  with permiso as (
    select (
      auth.uid() is null
      or exists (
        select 1 from public.organization_members m
        where m.user_id = auth.uid()
          and m.organization_id = p_org
          and m.is_active
      )
    ) as puede
  ),
  entrada as (
    select distinct public.normalizar_busqueda(w) as w
    from unnest(coalesce(p_palabras, '{}'::text[])) as w
  ),
  filtrada as (
    select w from entrada, permiso where permiso.puede and length(w) >= 3
  )
  select f.w,
         coalesce(exacta.palabra, aprox.palabra),
         exacta.palabra is not null
  from filtrada f
  left join lateral (
    select v.palabra from public.org_vocabulario v
    where v.organization_id = p_org and v.palabra = f.w
    limit 1
  ) exacta on true
  left join lateral (
    select v.palabra from public.org_vocabulario v
    where v.organization_id = p_org
      and exacta.palabra is null
      and public.similarity(v.palabra, f.w) >= p_umbral_similitud
    order by public.similarity(v.palabra, f.w) desc, v.frecuencia desc
    limit 1
  ) aprox on true
  where coalesce(exacta.palabra, aprox.palabra) is not null;
$fn$;

drop view if exists public.consultas_sin_resultado;
