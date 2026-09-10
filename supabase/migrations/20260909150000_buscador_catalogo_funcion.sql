-- =============================================================================
-- Buscador de catalogo (2/2): busqueda unica, agrupada y puntuada
--
-- Sustituye a la busqueda de la Edge Function, que:
--   - lanzaba hasta 20 consultas ILIKE por mensaje (una por variante de palabra),
--   - solo miraba `name`, ignorando brand / sku / reference / description
--     aunque ya existian indices trigram para todos ellos,
--   - trataba cada variante como un producto distinto (86,6% del catalogo de la
--     Tienda de Tenis son variantes; en Reino del Hogar el 58% de los mensajes
--     con tarjetas mostraron el mismo producto repetido),
--   - no descartaba nada: una coincidencia de puntaje cero se mostraba igual.
--
-- Ahora: UNA consulta que normaliza, puntua por campo, agrupa variantes bajo su
-- producto padre y exige un umbral minimo de relevancia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Vocabulario por organizacion
--
-- Reemplaza las listas cableadas del codigo (`samsung|lg|mabe|haceb|hisense…`,
-- `nevera|lavadora|televisor|olla…`), que no sirven para la perfumeria, la
-- drogueria, la licorera ni la tienda de tenis que ya estan en la plataforma.
--
-- El tipo de organizacion NO es fuente fiable: "Donde Checho" esta registrado
-- como `restaurant` y su catalogo son "jeans kar brillos". Lo unico fiable es el
-- catalogo mismo.
-- -----------------------------------------------------------------------------
drop materialized view if exists public.org_vocabulario;

create materialized view public.org_vocabulario as
with fuente as (
  select p.organization_id,
         public.normalizar_busqueda(concat_ws(' ', p.name, p.brand, p.reference)) as texto
  from public.products p
  where p.status = 'active'
  union all
  select c.organization_id, public.normalizar_busqueda(c.name)
  from public.categories c
  where coalesce(c.is_active, true)
)
select f.organization_id,
       t.palabra,
       count(*)::integer as frecuencia
from fuente f
cross join lateral unnest(string_to_array(f.texto, ' ')) as t(palabra)
where length(t.palabra) >= 3
group by 1, 2;

create unique index org_vocabulario_pk
  on public.org_vocabulario (organization_id, palabra);
create index org_vocabulario_trgm
  on public.org_vocabulario using gin (palabra public.gin_trgm_ops);

comment on materialized view public.org_vocabulario is
  'Palabras que aparecen en el catalogo de cada organizacion (nombre, marca, referencia y categorias). Sirve para decidir si el cliente esta hablando de productos y para corregir erratas sin listas cableadas.';

create or replace function public.refrescar_org_vocabulario()
returns void
language sql
security definer
set search_path = public
as $fn$
  refresh materialized view concurrently public.org_vocabulario;
$fn$;

comment on function public.refrescar_org_vocabulario() is
  'Refresca el vocabulario. Pensada para pg_cron; CONCURRENTLY no bloquea lecturas.';

-- -----------------------------------------------------------------------------
-- 2) ¿Que palabras del cliente existen en el catalogo de esta organizacion?
--    Con correccion de erratas por similitud, en vez de un mapa fijo de
--    electrodomesticos (`labadora -> lavadora`).
-- -----------------------------------------------------------------------------
create or replace function public.palabras_de_catalogo(
  p_org integer,
  p_palabras text[],
  p_umbral_similitud real default 0.6
)
returns table (palabra_cliente text, palabra_catalogo text, exacta boolean)
language sql
stable
set search_path = public
as $fn$
  with entrada as (
    select distinct public.normalizar_busqueda(w) as w
    from unnest(coalesce(p_palabras, '{}'::text[])) as w
  ),
  filtrada as (
    select w from entrada where length(w) >= 3
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

comment on function public.palabras_de_catalogo(integer, text[], real) is
  'De las palabras que escribio el cliente, devuelve las que nombran algo del catalogo de esa organizacion, corrigiendo erratas por similitud trigram.';

-- -----------------------------------------------------------------------------
-- 3) La busqueda
-- -----------------------------------------------------------------------------
create or replace function public.buscar_productos(
  p_org integer,
  p_tokens text[],
  p_limite integer default 6,
  p_umbral real default 2.0
)
returns table (
  id bigint,
  nombre text,
  sku text,
  precio numeric,
  precio_anterior numeric,
  imagen text,
  stock numeric,
  puntaje real,
  presentaciones integer
)
language sql
stable
set search_path = public
as $fn$
  with tokens as (
    select distinct public.normalizar_busqueda(w) as tok
    from unnest(coalesce(p_tokens, '{}'::text[])) as w
  ),
  tokens_utiles as (
    select tok from tokens where length(tok) >= 2
  ),
  candidatos as (
    select
      p.id,
      p.name,
      p.sku,
      p.parent_product_id,
      coalesce(p.parent_product_id, p.id) as raiz,
      ' ' || p.busqueda_nombre || ' '      as n_nombre,
      ' ' || p.busqueda_marca || ' '       as n_marca,
      ' ' || p.busqueda_descripcion || ' ' as n_desc,
      ' ' || public.normalizar_busqueda(coalesce(cat.name, '')) || ' ' as n_categoria,
      lower(coalesce(p.sku, ''))           as l_sku,
      lower(coalesce(p.reference, ''))     as l_ref
    from public.products p
    left join public.categories cat on cat.id = p.category_id
    where p.organization_id = p_org
      and p.status = 'active'
  ),
  puntuados as (
    select c.*,
      (
        select coalesce(sum(
          case
            -- Codigo exacto: el cliente dijo el SKU o la referencia.
            when c.l_sku = t.tok or c.l_ref = t.tok then 6.0
            -- Palabra completa en el nombre: la senal mas fuerte.
            when c.n_nombre like '% ' || t.tok || ' %' then 4.0
            -- Palabra completa en marca o referencia.
            when c.n_marca like '% ' || t.tok || ' %' then 3.0
            -- La categoria ayuda cuando el catalogo esta en otro idioma que el
            -- cliente: la Tienda de Tenis tiene productos "On Running Men's"
            -- pero su categoria se llama "Calzado".
            when c.n_categoria like '% ' || t.tok || ' %' then 2.5
            -- Subcadena: solo con cuerpo suficiente. Con 3 letras casa cualquier
            -- cosa (fue la causa del caso "Hila" -> "Apilable").
            when length(t.tok) >= 4 and c.n_nombre like '%' || t.tok || '%' then 2.0
            when length(t.tok) >= 4 and c.n_marca  like '%' || t.tok || '%' then 1.5
            -- La descripcion aporta, pero por si sola no basta para mostrar nada.
            when length(t.tok) >= 4 and c.n_desc   like '%' || t.tok || '%' then 0.75
            else 0
          end), 0)::real
        from tokens_utiles t
      ) as score
    from candidatos c
  ),
  relevantes as (
    select * from puntuados where score >= p_umbral
  ),
  -- Agrupamos variantes bajo su producto padre ANTES de recortar, para que un
  -- solo producto no ocupe las 6 tarjetas con sus tallas o presentaciones.
  representantes as (
    select distinct on (raiz)
      raiz, id, name, sku, score
    from relevantes
    order by raiz,
             (parent_product_id is null) desc,  -- preferimos el padre
             score desc,
             id
  ),
  conteo as (
    select raiz, count(*)::integer as n from relevantes group by raiz
  )
  select
    r.id,
    r.name,
    r.sku,
    pr.price,
    pr.compare_price,
    im.storage_path,
    st.qty,
    r.score,
    co.n
  from representantes r
  join conteo co on co.raiz = r.raiz
  -- Precio: el del representante; si el padre no tiene precio propio, el mas
  -- bajo del grupo (asi un padre sin precio no aparece en 0).
  left join lateral (
    select pp.price, pp.compare_price
    from public.products p2
    join public.product_prices pp
      on pp.product_id = p2.id and pp.effective_to is null
    where p2.organization_id = p_org
      and coalesce(p2.parent_product_id, p2.id) = r.raiz
    order by (p2.id = r.id) desc, pp.price asc nulls last
    limit 1
  ) pr on true
  left join lateral (
    select pi.storage_path
    from public.products p2
    join public.product_images pi on pi.product_id = p2.id
    where p2.organization_id = p_org
      and coalesce(p2.parent_product_id, p2.id) = r.raiz
    order by (p2.id = r.id) desc, pi.is_primary desc nulls last, pi.display_order asc nulls last
    limit 1
  ) im on true
  left join lateral (
    select sum(sl.qty_on_hand) as qty
    from public.products p2
    join public.stock_levels sl on sl.product_id = p2.id
    where p2.organization_id = p_org
      and coalesce(p2.parent_product_id, p2.id) = r.raiz
  ) st on true
  order by r.score desc, r.id
  limit greatest(coalesce(p_limite, 6), 1);
$fn$;

comment on function public.buscar_productos(integer, text[], integer, real) is
  'Busqueda de catalogo: normalizada, multi-campo (nombre, marca, sku, referencia, descripcion), con variantes agrupadas bajo su producto padre y umbral minimo de relevancia. Una sola consulta.';

grant execute on function public.buscar_productos(integer, text[], integer, real) to service_role, authenticated;
grant execute on function public.palabras_de_catalogo(integer, text[], real) to service_role, authenticated;
grant select on public.org_vocabulario to service_role, authenticated;
