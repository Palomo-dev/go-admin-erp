-- `palabras_de_catalogo` ahora consulta, en este orden:
--   1. la palabra tal cual esta en el catalogo (exacta)
--   2. un sinonimo propio de la organizacion
--   3. un sinonimo de la base generica, SOLO si apunta a algo que esa
--      organizacion tiene de verdad
--   4. similitud trigram (erratas)
--
-- El orden importa: lo exacto manda sobre el sinonimo, y el sinonimo sobre la
-- correccion de erratas, que es la senal mas debil.
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
         coalesce(exacta.palabra, propio.apunta_a, generico.apunta_a, aprox.palabra),
         exacta.palabra is not null
  from filtrada f
  left join lateral (
    select v.palabra from public.org_vocabulario v
    where v.organization_id = p_org and v.palabra = f.w
    limit 1
  ) exacta on true
  left join lateral (
    select s.apunta_a from public.org_sinonimos s
    join public.org_vocabulario v
      on v.organization_id = p_org and v.palabra = s.apunta_a
    where exacta.palabra is null
      and s.organization_id = p_org
      and s.termino = f.w
    limit 1
  ) propio on true
  left join lateral (
    -- La base generica solo surte efecto si el destino existe en ESTE catalogo.
    select b.apunta_a from public.sinonimos_base b
    join public.org_vocabulario v
      on v.organization_id = p_org and v.palabra = b.apunta_a
    where exacta.palabra is null and propio.apunta_a is null
      and b.termino = f.w
    limit 1
  ) generico on true
  left join lateral (
    select v.palabra from public.org_vocabulario v
    where v.organization_id = p_org
      and exacta.palabra is null and propio.apunta_a is null and generico.apunta_a is null
      and public.similarity(v.palabra, f.w) >= p_umbral_similitud
    order by public.similarity(v.palabra, f.w) desc, v.frecuencia desc
    limit 1
  ) aprox on true
  where coalesce(exacta.palabra, propio.apunta_a, generico.apunta_a, aprox.palabra) is not null;
$fn$;

revoke all on function public.palabras_de_catalogo(integer, text[], real) from public, anon;
grant execute on function public.palabras_de_catalogo(integer, text[], real) to authenticated, service_role;

-- Informe para el comerciante: que preguntaron los clientes y no se encontro.
-- Es la fuente honesta para llenar `org_sinonimos`: datos reales, no adivinanzas.
create or replace view public.consultas_sin_resultado as
select
  m.organization_id,
  t.palabra,
  count(*) as veces,
  max(m.created_at) as ultima_vez
from public.messages m
cross join lateral unnest(string_to_array(public.normalizar_busqueda(m.content), ' ')) as t(palabra)
where m.role = 'customer'
  and m.created_at > now() - interval '90 days'
  and length(t.palabra) >= 4
  and t.palabra !~ '^[0-9]+$'
  and not exists (
    select 1 from public.org_vocabulario v
    where v.organization_id = m.organization_id and v.palabra = t.palabra
  )
  and not exists (
    select 1 from public.org_sinonimos s
    where s.organization_id = m.organization_id and s.termino = t.palabra
  )
group by 1, 2
having count(*) >= 3;

alter view public.consultas_sin_resultado set (security_invoker = true);
revoke all on public.consultas_sin_resultado from anon;
grant select on public.consultas_sin_resultado to authenticated, service_role;

comment on view public.consultas_sin_resultado is
  'Palabras que los clientes escribieron y no existen en el catalogo ni como sinonimo. Sirve para llenar org_sinonimos con datos reales.';
