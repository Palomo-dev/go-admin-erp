-- Búsqueda única de clientes · ajuste de rendimiento (2026-09-29).
--
-- Medido en la organización más grande (org 2, 18.063 clientes) con
-- 20260929180000: el índice de expresión servía para palabras de 3+ letras
-- (1-3 ms), pero con 1-2 letras («a», «an», «zz») no hay trigramas y la
-- expresión se recalculaba fila a fila: 400-800 ms, más el cálculo de la
-- relevancia (varias normalizaciones por fila).
--
-- Solución: el texto de búsqueda se guarda en una columna generada
-- (`customers.search_text`, aditiva) con todo lo que necesitan el filtro, la
-- relevancia y el orden, y el índice de trigramas va sobre ella:
--
--   ' ' || nombre || ' | ' || correo teléfono documento || ' :' || doc_compacto
--   || ': ;' || doc_digitos || '; =' || tel_digitos || '='
--
--   · nombre: nombres, apellidos, razón social y nombre comercial normalizados
--     (empresa: razón social y nombre comercial primero). Empieza por espacio
--     para que « val» marque el comienzo de una palabra.
--   · Solo hay un «|»: «% val%|%» = «val» empieza una palabra del NOMBRE.
--   · «:doc:», «;dígitos del doc;», «=dígitos del teléfono=»: documento o
--     teléfono exacto sin confundirlos con el resto.
--   · Las palabras de búsqueda solo tienen [a-z0-9]: nunca casan con « | : ; =».
--
-- Espejo exacto en src/lib/clientes/busqueda.ts (textoBusquedaCliente), que
-- usa el POS sin red sobre el catálogo local.

drop index if exists public.idx_customers_busqueda_trgm;
drop function if exists public.fn_clientes_texto_busqueda(text, text, text, text, text, text, text);

create or replace function public.fn_clientes_texto_busqueda(
  p_tipo text,
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
  select ' ' || public.normalizar_busqueda(
                  case when p_tipo = 'company'
                         then concat_ws(' ', p_razon_social, p_nombre_comercial, p_nombres, p_apellidos)
                       else concat_ws(' ', p_nombres, p_apellidos, p_razon_social, p_nombre_comercial)
                  end)
      || ' | ' || public.normalizar_busqueda(concat_ws(' ', p_correo, p_telefono, p_documento))
      || ' :' || replace(public.normalizar_busqueda(p_documento), ' ', '') || ':'
      || ' ;' || regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g') || ';'
      || ' =' || regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g') || '='
$fn$;

comment on function public.fn_clientes_texto_busqueda(text, text, text, text, text, text, text, text) is
  'Texto de búsqueda de un cliente (columna generada customers.search_text). Espejo: src/lib/clientes/busqueda.ts textoBusquedaCliente().';

alter table public.customers
  add column if not exists search_text text
  generated always as (public.fn_clientes_texto_busqueda(
    customer_type, first_name, last_name, company_name, trade_name, email, phone, identification_number)) stored;

comment on column public.customers.search_text is
  'Generada: texto normalizado de la búsqueda única de clientes (fn_clientes_buscar). No se escribe.';

create index if not exists idx_customers_search_text_trgm
  on public.customers using gin (search_text gin_trgm_ops);

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
  -- «% val%|%»: la palabra empieza una palabra del nombre (antes del único «|»).
  v_prefijos := array(select '% ' || x || '%|%' from unnest(v_palabras) x);
  -- Una condición por palabra con el patrón como literal (%L): el planificador
  -- usa el índice de trigramas cuando la palabra tiene 3 letras o más.
  foreach w in array v_palabras loop
    v_filtro := v_filtro || format(' and c.search_text like %L', '%' || w || '%');
  end loop;

  return query execute format($q$
    select c.id,
           (case
              when $3 <> '' and (
                     c.search_text like '%%:' || $3 || ':%%'
                  or c.search_text like '%%;' || $3 || ';%%'
                  or c.search_text like '%%=' || $3 || '=%%'
                  or (length($3) >= 7 and $3 ~ '^[0-9]+$' and c.search_text like '%%' || $3 || '=')) then 0
              when $2 <> '' and c.search_text like ' ' || $2 || '%%' then 1
              when cardinality($4) > 0 and c.search_text like all ($4) then 2
              else 3
            end)::integer,
           c.search_text
    from public.customers c
    where c.organization_id = $1
      and ($5::text is null or c.customer_type = $5)
      and ($6::text is null or c.status = $6)
      %s
  $q$, v_filtro)
  using p_org, v_frase, v_compacto, v_prefijos, p_tipo, p_estado;
end;
$fn$;

revoke all on function public.fn_clientes_buscar_ids(integer, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_clientes_buscar_ids(integer, text, text, text) to service_role;

-- La RPC no devuelve la columna técnica.
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
             select jsonb_agg((to_jsonb(c) - 'search_text') || jsonb_build_object('relevancia', p.relevancia)
                              order by p.relevancia, p.nombre_orden collate "C", p.id)
             from pagina p
             join public.customers c on c.id = p.id), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$fn$;

revoke all on function public.fn_clientes_buscar(integer, text, integer, integer, text, text) from public, anon;
grant execute on function public.fn_clientes_buscar(integer, text, integer, integer, text, text) to authenticated, service_role;
