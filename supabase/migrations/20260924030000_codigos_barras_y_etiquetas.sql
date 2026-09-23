-- Códigos de barras únicos por organización e impresión de etiquetas de producto.
--
-- Qué resuelve (docs/design/PARIDAD-ETIQUETAS-CATEGORIA.md §5):
--   * El generador del formulario inventaba 12 dígitos al azar + control: un
--     EAN-13 «válido» dentro del rango GS1 de otro fabricante y sin comprobar
--     que no existiera. Ahora hay UN generador, en el servidor, con prefijo y
--     correlativo por organización, que salta los códigos ya usados.
--   * `organization_barcode_settings`: formato (EAN-13 o Code128), prefijo,
--     siguiente número y longitud (Code128). Sin fila = valores por defecto
--     (EAN-13 con prefijo 20: rango GS1 20–29 reservado para uso interno, no
--     invade el de ningún fabricante).
--   * `codigos_barras_generar_faltantes`: asigna código a los productos (y sus
--     variantes) que no tienen, sin tocar los que ya tienen, en una transacción.
--   * `codigos_barras_reservar`: el botón «Generar» del formulario.
--   * `codigos_barras_verificar`: duplicados de un código escrito a mano,
--     padres y variantes incluidos.
--   * Índice exacto `(organization_id, barcode)`: el de trigramas existente
--     excluye a las variantes y no sirve para igualdad.
--   * CHECK de `print_jobs.job_type`: + 'product_label' (etiquetas a la
--     estación) y + 'shipment_guide', que el código ya insertaba y el CHECK no
--     admitía (las guías de envío a la estación fallaban siempre).
--
-- No se crea índice único: hay 148 grupos de códigos repetidos (847 filas, 748
-- de ellas variantes que heredaron el del padre). Se listan para decidir; no
-- se renumeran solos porque invalidaría etiquetas ya impresas.
--
-- Funciones SECURITY DEFINER con fn_assert_acceso_org y sin anon.

create table if not exists public.organization_barcode_settings (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  format text not null default 'ean13',
  prefix text not null default '20',
  next_number bigint not null default 1,
  code_length smallint not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint organization_barcode_settings_format_check check (format in ('ean13', 'code128')),
  constraint organization_barcode_settings_prefix_check check (prefix ~ '^[A-Z0-9-]{0,10}$'),
  constraint organization_barcode_settings_next_check check (next_number >= 1),
  constraint organization_barcode_settings_length_check check (code_length between 6 and 20)
);

comment on table public.organization_barcode_settings is
  'Numeración de códigos de barras internos por organización: formato (ean13 | code128), prefijo, siguiente número y longitud total (solo code128). Se escribe solo por codigos_barras_configurar / codigos_barras_reservar.';

alter table public.organization_barcode_settings enable row level security;

drop policy if exists organization_barcode_settings_select on public.organization_barcode_settings;
create policy organization_barcode_settings_select on public.organization_barcode_settings
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

revoke all on table public.organization_barcode_settings from anon, public;
revoke insert, update, delete on table public.organization_barcode_settings from authenticated;
grant select on table public.organization_barcode_settings to authenticated;
grant all on table public.organization_barcode_settings to service_role;

create index if not exists idx_products_org_barcode
  on public.products (organization_id, barcode)
  where barcode is not null and barcode <> '';

-- Construye el código número `p_numero` para un formato y prefijo. Pura.
-- EAN-13: prefijo + número con ceros hasta 12 dígitos + dígito de control
-- (pesos 1,3,1,3… de izquierda a derecha). Code128: prefijo + número con
-- ceros hasta `p_longitud`. NULL si el número no cabe (rango agotado).
create or replace function public.fn_codigo_barras_construir(
  p_formato text,
  p_prefijo text,
  p_numero bigint,
  p_longitud integer default 10
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_prefijo text := coalesce(p_prefijo, '');
  v_cuerpo text;
  v_suma integer := 0;
  i integer;
begin
  if p_numero is null or p_numero < 0 then
    return null;
  end if;
  if p_formato = 'ean13' then
    if v_prefijo !~ '^[0-9]{0,10}$' or length(v_prefijo) + length(p_numero::text) > 12 then
      return null;
    end if;
    v_cuerpo := v_prefijo || lpad(p_numero::text, 12 - length(v_prefijo), '0');
    for i in 1..12 loop
      v_suma := v_suma + substr(v_cuerpo, i, 1)::integer * (case when i % 2 = 1 then 1 else 3 end);
    end loop;
    return v_cuerpo || ((10 - v_suma % 10) % 10)::text;
  elsif p_formato = 'code128' then
    if length(v_prefijo) + length(p_numero::text) > coalesce(p_longitud, 10) then
      return null;
    end if;
    return v_prefijo || lpad(p_numero::text, coalesce(p_longitud, 10) - length(v_prefijo), '0');
  end if;
  return null;
end;
$$;

revoke all on function public.fn_codigo_barras_construir(text, text, bigint, integer) from public, anon;
grant execute on function public.fn_codigo_barras_construir(text, text, bigint, integer) to authenticated, service_role;

-- Interna: toma `p_cantidad` códigos libres de la numeración de la
-- organización (bloquea su fila: dos generaciones a la vez se turnan) y
-- avanza el correlativo. Salta cualquier código que ya exista en products de
-- la organización, incluidos los eliminados. No se expone.
create or replace function public._codigos_barras_tomar(p_org integer, p_cantidad integer)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg public.organization_barcode_settings%rowtype;
  v_numero bigint;
  v_codigo text;
  v_codigos text[] := '{}';
  v_intentos integer := 0;
begin
  if p_cantidad is null or p_cantidad < 1 then
    return v_codigos;
  end if;

  insert into public.organization_barcode_settings (organization_id)
  values (p_org)
  on conflict (organization_id) do nothing;

  select * into v_cfg
  from public.organization_barcode_settings
  where organization_id = p_org
  for update;

  v_numero := v_cfg.next_number;
  while coalesce(array_length(v_codigos, 1), 0) < p_cantidad loop
    v_intentos := v_intentos + 1;
    if v_intentos > p_cantidad + 100000 then
      raise exception 'No se encontraron códigos libres cerca del correlativo actual' using errcode = 'P0001';
    end if;
    v_codigo := public.fn_codigo_barras_construir(v_cfg.format, v_cfg.prefix, v_numero, v_cfg.code_length);
    if v_codigo is null then
      raise exception 'rango_agotado: la numeración con el prefijo % ya no tiene números libres', v_cfg.prefix
        using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.products p
      where p.organization_id = p_org and p.barcode = v_codigo
    ) then
      v_codigos := v_codigos || v_codigo;
    end if;
    v_numero := v_numero + 1;
  end loop;

  update public.organization_barcode_settings
  set next_number = v_numero, updated_at = now(), updated_by = auth.uid()
  where organization_id = p_org;

  return v_codigos;
end;
$$;

revoke all on function public._codigos_barras_tomar(integer, integer) from public, anon, authenticated;
grant execute on function public._codigos_barras_tomar(integer, integer) to service_role;

-- Configura formato, prefijo, siguiente número y longitud de la numeración.
create or replace function public.codigos_barras_configurar(
  p_org integer,
  p_formato text,
  p_prefijo text,
  p_siguiente bigint default null,
  p_longitud integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefijo text := upper(btrim(coalesce(p_prefijo, '')));
  v_fila public.organization_barcode_settings%rowtype;
begin
  perform public.fn_assert_acceso_org(p_org);

  if p_formato not in ('ean13', 'code128') then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  if p_formato = 'ean13' and v_prefijo !~ '^[0-9]{1,10}$' then
    raise exception 'prefijo_invalido: el prefijo de un EAN-13 son de 1 a 10 dígitos' using errcode = '22023';
  end if;
  if p_formato = 'code128' and v_prefijo !~ '^[A-Z0-9-]{0,10}$' then
    raise exception 'prefijo_invalido: el prefijo Code128 admite letras, números y guion (máx. 10)' using errcode = '22023';
  end if;
  if p_siguiente is not null and p_siguiente < 1 then
    raise exception 'siguiente_invalido' using errcode = '22023';
  end if;
  if p_longitud is not null and (p_longitud < 6 or p_longitud > 20) then
    raise exception 'longitud_invalida' using errcode = '22023';
  end if;

  insert into public.organization_barcode_settings as s
    (organization_id, format, prefix, next_number, code_length, updated_by)
  values
    (p_org, p_formato, v_prefijo, coalesce(p_siguiente, 1), coalesce(p_longitud, 10)::smallint, auth.uid())
  on conflict (organization_id) do update
    set format = excluded.format,
        prefix = excluded.prefix,
        next_number = coalesce(p_siguiente, s.next_number),
        code_length = coalesce(p_longitud::smallint, s.code_length),
        updated_at = now(),
        updated_by = auth.uid()
  returning * into v_fila;

  if public.fn_codigo_barras_construir(v_fila.format, v_fila.prefix, v_fila.next_number, v_fila.code_length) is null then
    raise exception 'rango_agotado: el prefijo y el número no caben en la longitud del código' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'format', v_fila.format,
    'prefix', v_fila.prefix,
    'next_number', v_fila.next_number,
    'code_length', v_fila.code_length
  );
end;
$$;

revoke all on function public.codigos_barras_configurar(integer, text, text, bigint, integer) from public, anon;
grant execute on function public.codigos_barras_configurar(integer, text, text, bigint, integer) to authenticated, service_role;

-- Reserva códigos libres (botón «Generar» del formulario: el producto aún no
-- existe). Un código reservado y no guardado no se reutiliza: no importa.
create or replace function public.codigos_barras_reservar(p_org integer, p_cantidad integer default 1)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  return public._codigos_barras_tomar(p_org, p_cantidad);
end;
$$;

revoke all on function public.codigos_barras_reservar(integer, integer) from public, anon;
grant execute on function public.codigos_barras_reservar(integer, integer) to authenticated, service_role;

-- Asigna código a los productos indicados (y a sus variantes) que no tienen.
-- Los que ya tienen no se tocan. Todo o nada: si la numeración se agota, no
-- queda ninguno a medias.
create or replace function public.codigos_barras_generar_faltantes(
  p_org integer,
  p_product_ids integer[],
  p_incluir_variantes boolean default true
)
returns table (product_id integer, barcode text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_ids integer[];
  v_codigos text[];
  i integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_product_ids is null or cardinality(p_product_ids) = 0 then
    return;
  end if;
  if cardinality(p_product_ids) > 5000 then
    raise exception 'demasiados_productos: máximo 5000 por vez' using errcode = '22023';
  end if;

  -- Bloquea las filas destino: un guardado concurrente del formulario espera.
  select array_agg(t.id order by t.orden_padre, t.es_variante, t.id)
  into v_ids
  from (
    select p.id,
           coalesce(p.parent_product_id, p.id) as orden_padre,
           (p.parent_product_id is not null) as es_variante
    from public.products p
    where p.organization_id = p_org
      and coalesce(p.status, 'active') <> 'deleted'
      and coalesce(btrim(p.barcode), '') = ''
      and (
        p.id = any(p_product_ids)
        or (coalesce(p_incluir_variantes, true) and p.parent_product_id = any(p_product_ids))
      )
    for update of p
  ) t;

  if v_ids is null then
    return;
  end if;

  v_codigos := public._codigos_barras_tomar(p_org, cardinality(v_ids));

  for i in 1..cardinality(v_ids) loop
    update public.products
    set barcode = v_codigos[i], updated_at = now()
    where id = v_ids[i] and organization_id = p_org;
    product_id := v_ids[i];
    barcode := v_codigos[i];
    return next;
  end loop;
end;
$$;

revoke all on function public.codigos_barras_generar_faltantes(integer, integer[], boolean) from public, anon;
grant execute on function public.codigos_barras_generar_faltantes(integer, integer[], boolean) to authenticated, service_role;

-- Productos (padres o variantes, no eliminados) de la organización que ya
-- usan `p_codigo`, salvo los de `p_excluir_ids` (el propio producto al editar).
create or replace function public.codigos_barras_verificar(
  p_org integer,
  p_codigo text,
  p_excluir_ids integer[] default '{}'
)
returns table (product_id integer, name text, sku text, parent_product_id integer, parent_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.fn_assert_acceso_org(p_org);
  if coalesce(btrim(p_codigo), '') = '' then
    return;
  end if;
  return query
  select p.id, p.name, p.sku, p.parent_product_id, padre.name
  from public.products p
  left join public.products padre on padre.id = p.parent_product_id
  where p.organization_id = p_org
    and p.barcode = btrim(p_codigo)
    and coalesce(p.status, 'active') <> 'deleted'
    and not (p.id = any(coalesce(p_excluir_ids, '{}')))
  order by p.id
  limit 5;
end;
$$;

revoke all on function public.codigos_barras_verificar(integer, text, integer[]) from public, anon;
grant execute on function public.codigos_barras_verificar(integer, text, integer[]) to authenticated, service_role;

-- print_jobs: etiquetas de producto a la estación y guías de envío.
alter table public.print_jobs drop constraint if exists print_jobs_job_type_check;
alter table public.print_jobs add constraint print_jobs_job_type_check check (
  job_type = any (array[
    'kitchen_ticket'::text, 'pre_cuenta'::text, 'sale_ticket'::text, 'electronic_invoice'::text,
    'open_cash_drawer'::text, 'shipment_guide'::text, 'product_label'::text
  ])
);
