-- Búsqueda única de clientes (2026-09-29).
--
-- Problema: en el POS no aparecía una clienta al buscarla. La búsqueda de cada
-- pantalla era un `.or(full_name.ilike.%texto%, …)` de PostgREST:
--   1. ilike no ignora tildes: «maria» no encontraba «María».
--   2. buscaba la frase completa: «ana gomez» no encontraba «Ana María Gómez».
--   3. ORDER BY full_name + LIMIT 20 sobre un «contiene»: «val» devolvía los 20
--      primeros por orden alfabético («Aura Duval…») y «Valentina» quedaba fuera
--      sin aviso.
--   4. el texto iba crudo dentro del filtro: una coma o un paréntesis rompían la
--      consulta y la lista salía vacía.
--   5. teléfono y documento con espacios, puntos o guiones no coincidían.
--
-- Reglas (idénticas en src/lib/clientes/busqueda.ts, que usa el POS sin red):
--   · Normalizar = normalizar_busqueda(): minúsculas, sin tildes (unaccent), sin
--     apóstrofos, todo lo que no sea [a-z0-9] pasa a espacio, espacios colapsados.
--   · Palabras (fn_clientes_palabras): si el texto es solo dígitos y separadores
--     («300 123 4567», «1.234.567») es UNA palabra con sus dígitos; si no, se
--     parte por espacios y cada trozo numérico («1.234.567») queda en dígitos y
--     el resto se parte por lo que no sea [a-z0-9]. Sin repetidas, máximo 8.
--   · Coincide si TODAS las palabras están (como subcadena) en el texto de
--     búsqueda del cliente (fn_clientes_texto_busqueda): nombres, apellidos,
--     razón social, nombre comercial, correo, teléfono y documento normalizados,
--     más los dígitos del teléfono y del documento.
--   · Relevancia: 0 documento o teléfono exacto · 1 el nombre empieza por el
--     texto · 2 cada palabra empieza una palabra del nombre (nombres, apellidos,
--     razón social o nombre comercial: «val» → Valentina, Ana Valencia) · 3 el
--     resto (solo contiene: «Duval», o está en correo/teléfono/documento).
--     Después, nombre normalizado (orden binario, collate "C") e id.
--   · Texto vacío = todos los clientes (por nombre). Texto sin ninguna palabra
--     útil («(,)») = ninguno.

-- ── Palabras de la consulta ─────────────────────────────────────────────────
create or replace function public.fn_clientes_palabras(p_q text)
returns text[]
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $fn$
  with base as (
    select regexp_replace(
             replace(replace(lower(public.f_unaccent(left(coalesce(p_q, ''), 200))), '''', ''), '’', ''),
             '[^a-z0-9.+()/-]+', ' ', 'g') as t
  ),
  trozos as (
    select case
             when b.t ~ '^[0-9 .+()/-]+$' and b.t ~ '[0-9]'
               then array[regexp_replace(b.t, '[^0-9]', '', 'g')]
             else array(
               select u.tok
               from regexp_split_to_table(btrim(b.t), ' +') with ordinality as w(pal, i),
                    lateral unnest(
                      case when w.pal ~ '^[0-9.+()/-]+$'
                             then array[regexp_replace(w.pal, '[^0-9]', '', 'g')]
                           else regexp_split_to_array(regexp_replace(w.pal, '[^a-z0-9]+', ' ', 'g'), ' ')
                      end) with ordinality as u(tok, j)
               where u.tok <> ''
               order by w.i, u.j)
           end as arr
    from base b
  )
  select coalesce(array(
           select x.tok
           from (select z.tok, min(z.ord) as ord
                 from trozos t2, unnest(t2.arr) with ordinality as z(tok, ord)
                 group by z.tok) x
           order by x.ord
           limit 8), array[]::text[])
  from trozos
$fn$;

comment on function public.fn_clientes_palabras(text) is
  'Palabras de una búsqueda de clientes (sin tildes, minúsculas; número con separadores = sus dígitos). Espejo: src/lib/clientes/busqueda.ts palabrasBusqueda().';

-- ── Texto de búsqueda de un cliente (expresión del índice) ──────────────────
create or replace function public.fn_clientes_texto_busqueda(
  p_nombres text,
  p_apellidos text,
  p_razon_social text,
  p_nombre_comercial text,
  p_correo text,
  p_telefono text,
  p_documento text
)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $fn$
  select public.normalizar_busqueda(concat_ws(' ', p_nombres, p_apellidos, p_razon_social, p_nombre_comercial, p_correo, p_telefono, p_documento))
      || ' ' || regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g')
      || ' ' || regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g')
$fn$;

comment on function public.fn_clientes_texto_busqueda(text, text, text, text, text, text, text) is
  'Texto normalizado en el que se busca un cliente (índice idx_customers_busqueda_trgm). Espejo: src/lib/clientes/busqueda.ts textoBusquedaCliente().';

-- Índice aditivo: trigramas sobre la expresión normalizada.
create index if not exists idx_customers_busqueda_trgm
  on public.customers
  using gin (public.fn_clientes_texto_busqueda(first_name, last_name, company_name, trade_name, email, phone, identification_number) gin_trgm_ops);

-- ── Coincidencias con su relevancia (interna: sin acceso directo) ───────────
create or replace function public.fn_clientes_buscar_ids(
  p_org integer,
  p_q text,
  p_tipo text default null,
  p_estado text default null
)
returns table(id uuid, relevancia integer, nombre_orden text)
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_vacia boolean := btrim(coalesce(p_q, '')) = '';
  v_palabras text[] := public.fn_clientes_palabras(p_q);
  v_frase text := array_to_string(v_palabras, ' ');
  v_compacto text := array_to_string(v_palabras, '');
  v_prefijos text[];
  v_filtro text := '';
  w text;
begin
  if not v_vacia and cardinality(v_palabras) = 0 then
    return;
  end if;
  v_prefijos := array(select '% ' || x || '%' from unnest(v_palabras) x);
  -- Una condición por palabra con el patrón como literal: así el planificador
  -- usa el índice de trigramas cuando la palabra tiene 3 letras o más. Las
  -- palabras solo tienen [a-z0-9] y además van con %L.
  foreach w in array v_palabras loop
    v_filtro := v_filtro || format(
      ' and public.fn_clientes_texto_busqueda(c.first_name, c.last_name, c.company_name, c.trade_name, c.email, c.phone, c.identification_number) like %L',
      '%' || w || '%');
  end loop;

  return query execute format($q$
    select c.id,
           (case
              when $3 <> '' and (
                     replace(public.normalizar_busqueda(c.identification_number), ' ', '') = $3
                  or regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = $3
                  or (length($3) >= 7 and $3 ~ '^[0-9]+$'
                      and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') like '%%' || $3)) then 0
              when $2 <> '' and (
                     public.normalizar_busqueda(c.full_name) like $2 || '%%'
                  or public.normalizar_busqueda(c.trade_name) like $2 || '%%') then 1
              when cardinality($4) > 0
                   and (' ' || public.normalizar_busqueda(concat_ws(' ', c.first_name, c.last_name, c.company_name, c.trade_name))) like all ($4) then 2
              else 3
            end)::integer,
           public.normalizar_busqueda(c.full_name)
    from public.customers c
    where c.organization_id = $1
      and ($5::text is null or c.customer_type = $5)
      and ($6::text is null or c.status = $6)
      %s
  $q$, v_filtro)
  using p_org, v_frase, v_compacto, v_prefijos, p_tipo, p_estado;
end;
$fn$;

comment on function public.fn_clientes_buscar_ids(integer, text, text, text) is
  'Interna: coincidencias de la búsqueda única de clientes con su relevancia. La llaman fn_clientes_buscar y fn_clientes_listado (ya validan la organización).';

revoke all on function public.fn_clientes_buscar_ids(integer, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_clientes_buscar_ids(integer, text, text, text) to service_role;

-- ── RPC pública ─────────────────────────────────────────────────────────────
create or replace function public.fn_clientes_buscar(
  p_organization_id integer,
  p_q text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_tipo text default null,
  p_estado text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limite integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_desde integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_tipo is not null and p_tipo not in ('person', 'company') then
    raise exception 'Tipo de cliente no válido' using errcode = '22023';
  end if;

  with coincidencias as (
    select b.id, b.relevancia, b.nombre_orden
    from public.fn_clientes_buscar_ids(p_organization_id, p_q, p_tipo, p_estado) b
  ),
  pagina as (
    select co.*
    from coincidencias co
    order by co.relevancia, co.nombre_orden collate "C", co.id
    limit v_limite offset v_desde
  )
  select jsonb_build_object(
           'total', (select count(*) from coincidencias),
           'limite', v_limite,
           'desde', v_desde,
           'filas', coalesce((
             select jsonb_agg(to_jsonb(c) || jsonb_build_object('relevancia', p.relevancia)
                              order by p.relevancia, p.nombre_orden collate "C", p.id)
             from pagina p
             join public.customers c on c.id = p.id), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$fn$;

comment on function public.fn_clientes_buscar(integer, text, integer, integer, text, text) is
  'Búsqueda única de clientes: sin tildes, todas las palabras en cualquier campo, teléfono/documento por dígitos, orden por relevancia y total para «Mostrando N de M · Ver más».';

revoke all on function public.fn_clientes_buscar(integer, text, integer, integer, text, text) from public, anon;
grant execute on function public.fn_clientes_buscar(integer, text, integer, integer, text, text) to authenticated, service_role;
