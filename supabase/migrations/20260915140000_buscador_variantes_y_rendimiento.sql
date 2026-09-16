-- =============================================================================
-- Buscador de catalogo (3): rendimiento con catalogos grandes + tallas visibles
--
-- Diagnostico (2026-09-15, tienda de calzado con 16.551 productos activos):
--   1. "zapatillas diesel" tardaba 19 s y el PostgREST la cancelaba a los 8 s
--      (statement_timeout del rol `authenticator`). El bot respondia "no
--      encuentro las zapatillas Diesel" teniendo 6 modelos. Causa: los tres
--      LATERAL de precio/imagen/stock se evaluaban para los ~300 productos
--      relevantes ANTES del LIMIT, y filtraban por
--      `coalesce(parent_product_id, id) = raiz`, expresion sin indice: cada
--      lateral recorria los 16.551 productos de la organizacion.
--   2. El modelo solo recibia "Disponible en 5 presentaciones": nunca veia
--      cuales eran. Con un cliente pidiendo "talla 40" respondia "no tenemos
--      talla 40" sin haber visto que las tallas eran 7.5 US … 9.5 US.
--
-- Arreglo:
--   - `buscar_productos`: se recorta a p_limite ANTES de los laterales y estos
--     usan `p2.id = raiz OR p2.parent_product_id = raiz` (PK + idx_products_parent_id).
--     19.096 ms -> ~700 ms en el mismo caso.
--   - `variantes_de_productos`: lista las variantes (atributo, valor, stock,
--     precio) de los productos encontrados para que el bot pueda hablar de
--     tallas, colores y presentaciones reales.
-- =============================================================================

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
  with tokens as materialized (
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
            when c.l_sku = t.tok or c.l_ref = t.tok then 6.0
            when c.n_nombre like '% ' || t.tok || ' %' then 4.0
            when c.n_marca like '% ' || t.tok || ' %' then 3.0
            when c.n_categoria like '% ' || t.tok || ' %' then 2.5
            when length(t.tok) >= 4 and c.n_nombre like '%' || t.tok || '%' then 2.0
            when length(t.tok) >= 4 and c.n_marca  like '%' || t.tok || '%' then 1.5
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
  representantes as (
    select distinct on (raiz)
      raiz, id, name, sku, score
    from relevantes
    order by raiz,
             (parent_product_id is null) desc,
             score desc,
             id
  ),
  conteo as (
    select raiz, count(*)::integer as n from relevantes group by raiz
  ),
  -- El recorte va ANTES de precio/imagen/stock: con 300 productos relevantes
  -- los laterales se evaluaban 900 veces sobre toda la organizacion.
  top as (
    select r.*, co.n
    from representantes r
    join conteo co on co.raiz = r.raiz
    order by r.score desc, r.id
    limit greatest(coalesce(p_limite, 6), 1)
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
    r.n
  from top r
  left join lateral (
    select pp.price, pp.compare_price
    from public.products p2
    join public.product_prices pp
      on pp.product_id = p2.id and pp.effective_to is null
    where p2.organization_id = p_org
      and (p2.id = r.raiz or p2.parent_product_id = r.raiz)
    order by (p2.id = r.id) desc, pp.price asc nulls last
    limit 1
  ) pr on true
  left join lateral (
    select pi.storage_path
    from public.products p2
    join public.product_images pi on pi.product_id = p2.id
    where p2.organization_id = p_org
      and (p2.id = r.raiz or p2.parent_product_id = r.raiz)
    order by (p2.id = r.id) desc, pi.is_primary desc nulls last, pi.display_order asc nulls last
    limit 1
  ) im on true
  left join lateral (
    select sum(sl.qty_on_hand) as qty
    from public.products p2
    join public.stock_levels sl on sl.product_id = p2.id
    where p2.organization_id = p_org
      and (p2.id = r.raiz or p2.parent_product_id = r.raiz)
  ) st on true
  order by r.score desc, r.id;
$fn$;

comment on function public.buscar_productos(integer, text[], integer, real) is
  'Busqueda de catalogo: normalizada, multi-campo, con variantes agrupadas bajo su producto padre y umbral minimo. El LIMIT se aplica antes de resolver precio/imagen/stock (v3: 19 s -> <1 s en catalogos de 16k productos).';

-- -----------------------------------------------------------------------------
-- Variantes de los productos encontrados: lo que el bot necesita para hablar
-- de tallas ("7.5 US", "40"), colores o presentaciones ("100 ml") reales.
-- `variant_data` de una variante es un objeto {atributo: valor}; el del padre
-- es {types: [...]} y se ignora.
-- -----------------------------------------------------------------------------
create or replace function public.variantes_de_productos(
  p_org integer,
  p_ids bigint[],
  p_max_por_producto integer default 40
)
returns table (
  raiz bigint,
  id bigint,
  nombre text,
  atributos jsonb,
  stock numeric,
  precio numeric,
  orden integer
)
language sql
stable
set search_path = public
as $fn$
  with raices as (
    select distinct coalesce(p.parent_product_id, p.id) as raiz
    from public.products p
    where p.organization_id = p_org
      and p.id = any(coalesce(p_ids, '{}'::bigint[]))
  ),
  variantes as (
    select
      r.raiz,
      v.id,
      v.name,
      case when jsonb_typeof(v.variant_data) = 'object' and not (v.variant_data ? 'types')
           then v.variant_data else '{}'::jsonb end as atributos,
      (select sum(sl.qty_on_hand) from public.stock_levels sl where sl.product_id = v.id) as stock,
      (select pp.price from public.product_prices pp
        where pp.product_id = v.id and pp.effective_to is null
        order by pp.price asc nulls last limit 1) as precio,
      row_number() over (
        partition by r.raiz
        -- Tallas numericas en orden natural: "7.5 US" antes que "10 US".
        order by substring(coalesce(v.variant_data->>'Talla', v.variant_data->>'Tamaño', v.variant_data->>'talla', '') from '[0-9]+(?:\.[0-9]+)?')::numeric nulls last,
                 v.name
      )::integer as orden
    from raices r
    join public.products v
      on v.parent_product_id = r.raiz
     and v.organization_id = p_org
     and v.status = 'active'
  )
  select raiz, id, name, atributos, stock, precio, orden
  from variantes
  where orden <= greatest(coalesce(p_max_por_producto, 40), 1)
  order by raiz, orden;
$fn$;

comment on function public.variantes_de_productos(integer, bigint[], integer) is
  'Variantes activas (atributos, stock, precio) de los productos indicados, agrupadas por producto padre y en orden natural de talla. Para que el bot del chat pueda responder por tallas y presentaciones reales.';

revoke all on function public.variantes_de_productos(integer, bigint[], integer) from public, anon;
grant execute on function public.variantes_de_productos(integer, bigint[], integer) to service_role, authenticated;
