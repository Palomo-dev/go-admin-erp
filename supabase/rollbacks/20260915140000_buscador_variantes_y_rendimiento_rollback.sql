-- Reversion de 20260915140000_buscador_variantes_y_rendimiento.sql
-- Restaura buscar_productos tal como quedo en 20260909150000 (v2, laterales
-- antes del LIMIT) y elimina variantes_de_productos.
-- OJO: la v2 tarda ~19 s en catalogos de 16k productos; solo revertir si la v3
-- devuelve resultados incorrectos.

drop function if exists public.variantes_de_productos(integer, bigint[], integer);

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
            -- cliente: una tienda de calzado tiene su catalogo en ingles
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
