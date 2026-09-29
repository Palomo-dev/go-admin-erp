-- Reversión de 20260929180100_clientes_busqueda_columna.sql
-- Aplicar DESPUÉS de la reversión de 20260929180200. Deja la base como la dejó
-- 20260929180000 (índice de expresión, sin columna customers.search_text).

-- fn_clientes_buscar_ids lee search_text: se vuelve a la versión de 180000
-- antes de quitar la columna.
drop index if exists public.idx_customers_search_text_trgm;

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

revoke all on function public.fn_clientes_buscar_ids(integer, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_clientes_buscar_ids(integer, text, text, text) to service_role;

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

revoke all on function public.fn_clientes_buscar(integer, text, integer, integer, text, text) from public, anon;
grant execute on function public.fn_clientes_buscar(integer, text, integer, integer, text, text) to authenticated, service_role;

alter table public.customers drop column if exists search_text;
drop function if exists public.fn_clientes_texto_busqueda(text, text, text, text, text, text, text, text);

create index if not exists idx_customers_busqueda_trgm
  on public.customers
  using gin (public.fn_clientes_texto_busqueda(first_name, last_name, company_name, trade_name, email, phone, identification_number) gin_trgm_ops);
