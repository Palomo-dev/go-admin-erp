-- Devoluciones del POS: lectura del rediseño aprobado el 2026-11-21 (Figma
-- `873:573997`, sección «Devoluciones — listado, estados y móvil»; spec
-- docs/design/POS-VENTAS-DEVOLUCIONES-CXC-PEDIDOS.md §3 y §6).
--
--  1. `pos_devoluciones_filtradas(...)` (interna: solo service_role): la ÚNICA
--     regla de qué devoluciones cumplen los filtros del listado (periodo por
--     fecha de la devolución, búsqueda, estado, método de reintegro y motivo),
--     con su venta, factura, nota crédito, cliente, motivo y unidades. La usan
--     el listado y las cifras, para que «N devoluciones» sea siempre el mismo
--     número en la tabla y en el KPI.
--  2. `pos_devoluciones_listado(...)`: el listado paginado y ordenado.
--  3. `pos_devoluciones_cifras(...)`: los 4 KPI del Figma sobre LAS DEVOLUCIONES
--     LISTADAS: devuelto en el periodo (solo procesadas) y su reparto por
--     método, número de devoluciones con unidades y parciales, ventas del
--     periodo en las mismas sucursales (base del «% sobre las ventas») y
--     motivo principal.
--  4. `pos_ventas_para_devolver(...)`: el buscador de «Nueva devolución». Corrige
--     D10 y D11 de la spec: busca en la base por número de factura, cliente,
--     documento o teléfono (no filtra en memoria 20 ventas) y una venta con
--     devoluciones previas sigue apareciendo mientras le queden unidades.
--     Solo ventas `paid`: es lo que acepta `procesar_devolucion`.
--  5. `pos_motivos_devolucion_usos(org)`: cuántas devoluciones usan cada motivo
--     (columna «Usos» de Motivos y «desactivar en vez de borrar»).
--
-- La caja abierta del diálogo «Crear devolución» NO se calcula aquí: se lee con
-- `fn_caja_abierta_para`, la misma regla de `procesar_devolucion`.
--
-- Todas con `fn_assert_acceso_org`, sucursal validada con `pos_ventas_sucursales`
-- (`app_branch_access`) y sin grant a anon. Unidades desde `return_lines`
-- (todas las devoluciones de la base pasan por `procesar_devolucion`, que las
-- escribe; el 2026-11-21 había 0 devoluciones en el proyecto).

create or replace function public.pos_devoluciones_filtradas(
  p_organization_id integer,
  p_sucursales integer[],
  p_desde timestamptz,
  p_hasta timestamptz,
  p_busqueda text,
  p_estados text[],
  p_metodos text[],
  p_motivos integer[]
)
returns table (
  id integer,
  branch_id integer,
  sale_id uuid,
  user_id uuid,
  fecha timestamptz,
  status text,
  metodo text,
  cash_session_id integer,
  total numeric,
  impuesto numeric,
  unidades numeric,
  unidades_vendidas numeric,
  reason_id integer,
  motivo_codigo text,
  motivo_nombre text,
  motivo_texto text,
  factura_id uuid,
  factura_numero text,
  nc_id uuid,
  nc_numero text,
  nc_estado text,
  cliente_id uuid,
  cliente_nombre text,
  cliente_tipo_documento text,
  cliente_documento text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with base as (
    select r.id, r.branch_id, r.sale_id, r.user_id,
           coalesce(r.return_date, r.created_at) as fecha,
           coalesce(r.status, 'processed') as status,
           coalesce(r.refund_method, 'sin_definir') as metodo,
           r.cash_session_id, r.total_refund as total, r.reason_id, r.reason as motivo_texto,
           r.credit_note_invoice_id,
           s.customer_id,
           (select i.id from public.invoice_sales i
             where i.sale_id = r.sale_id and coalesce(i.document_type, 'invoice') <> 'credit_note'
             order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1) as factura_id,
           coalesce((select sum(l.quantity) from public.return_lines l where l.return_id = r.id), 0) as unidades,
           coalesce((select sum(l.tax_amount) from public.return_lines l where l.return_id = r.id), 0) as impuesto,
           coalesce((select sum(si.quantity) from public.sale_items si where si.sale_id = r.sale_id), 0) as unidades_vendidas
      from public.returns r
      join public.sales s on s.id = r.sale_id
     where r.organization_id = p_organization_id
       and r.branch_id = any (p_sucursales)
       and (p_desde is null or coalesce(r.return_date, r.created_at) >= p_desde)
       and (p_hasta is null or coalesce(r.return_date, r.created_at) <= p_hasta)
       and (p_estados is null or coalesce(r.status, 'processed') = any (p_estados))
       and (p_metodos is null or coalesce(r.refund_method, 'sin_definir') = any (p_metodos))
       and (p_motivos is null or r.reason_id = any (p_motivos))
  ),
  calculada as (
    select b.*,
           rr.code::text as motivo_codigo,
           rr.name::text as motivo_nombre,
           fi.number as factura_numero,
           nc.number as nc_numero,
           nc.status as nc_estado,
           c.full_name as cliente_nombre,
           coalesce(nullif(c.identification_type, ''), c.doc_type) as cliente_tipo_documento,
           coalesce(nullif(c.identification_number, ''), c.doc_number) as cliente_documento
      from base b
      left join public.return_reasons rr on rr.id = b.reason_id and rr.organization_id = p_organization_id
      left join public.invoice_sales fi on fi.id = b.factura_id
      left join public.invoice_sales nc on nc.id = b.credit_note_invoice_id
      left join public.customers c on c.id = b.customer_id
  )
  select x.id, x.branch_id, x.sale_id, x.user_id, x.fecha, x.status, x.metodo, x.cash_session_id,
         x.total, x.impuesto, x.unidades, x.unidades_vendidas, x.reason_id, x.motivo_codigo, x.motivo_nombre,
         x.motivo_texto, x.factura_id, x.factura_numero, x.credit_note_invoice_id, x.nc_numero, x.nc_estado,
         x.customer_id, x.cliente_nombre, x.cliente_tipo_documento, x.cliente_documento
    from calculada x
   where p_busqueda is null
      or ('DEV-' || lpad(x.id::text, 6, '0')) ilike p_busqueda
      or x.id::text ilike p_busqueda
      or x.factura_numero ilike p_busqueda
      or x.nc_numero ilike p_busqueda
      or x.cliente_nombre ilike p_busqueda
      or x.cliente_documento ilike p_busqueda
      or x.motivo_nombre ilike p_busqueda
$$;

comment on function public.pos_devoluciones_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], integer[]) is
  'Interna (solo service_role): devoluciones que cumplen los filtros del listado de /app/pos/devoluciones, con venta, factura, NC, cliente, motivo y unidades. p_busqueda llega ya como patrón ILIKE escapado. La usan pos_devoluciones_listado y pos_devoluciones_cifras.';

revoke all on function public.pos_devoluciones_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], integer[]) from public, anon, authenticated;
grant execute on function public.pos_devoluciones_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], integer[]) to service_role;

-- Quién ve las devoluciones: quien vende, quien devuelve o quien ve reportes de ventas.
create or replace function public.pos_devoluciones_puede_ver(p_organization_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is null
      or public.fn_caja_puede(p_organization_id, 'pos.view')
      or public.fn_caja_puede(p_organization_id, 'pos.refund')
      or public.fn_caja_puede(p_organization_id, 'sales_management')
      or public.fn_caja_puede(p_organization_id, 'reports.sales')
$$;

revoke all on function public.pos_devoluciones_puede_ver(integer) from public, anon, authenticated;
grant execute on function public.pos_devoluciones_puede_ver(integer) to service_role;

create or replace function public.pos_devoluciones_listado(
  p_organization_id integer,
  p_branch_id integer default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_busqueda text default null,
  p_estados text[] default null,
  p_metodos text[] default null,
  p_motivos integer[] default null,
  p_orden text default 'fecha',
  p_direccion text default 'desc',
  p_limite integer default 25,
  p_desplazamiento integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sucursales integer[];
  v_limite integer := least(greatest(coalesce(p_limite, 25), 1), 100);
  v_desp integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_total integer;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.pos_devoluciones_puede_ver(p_organization_id) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);

  with filtrada as (
    select * from public.pos_devoluciones_filtradas(
      p_organization_id, v_sucursales, p_desde, p_hasta, public.pos_ventas_patron(p_busqueda),
      p_estados, p_metodos, p_motivos)
  ),
  pagina as (
    select x.*,
           row_number() over (
             order by
               case when p_orden = 'total' and p_direccion = 'asc' then x.total end asc nulls last,
               case when p_orden = 'total' and p_direccion <> 'asc' then x.total end desc nulls last,
               case when p_orden = 'numero' and p_direccion = 'asc' then x.id end asc nulls last,
               case when p_orden = 'numero' and p_direccion <> 'asc' then x.id end desc nulls last,
               case when p_direccion = 'asc' then x.fecha end asc nulls last,
               x.fecha desc nulls last,
               x.id desc
           ) as posicion,
           count(*) over () as total_filas
      from filtrada x
  )
  select coalesce(max(p.total_filas), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'fecha', p.fecha,
           'estado', p.status,
           'metodo', p.metodo,
           'caja_sesion_id', p.cash_session_id,
           'total', p.total,
           'impuesto', p.impuesto,
           'unidades', p.unidades,
           'unidades_vendidas', p.unidades_vendidas,
           'motivo', jsonb_build_object('id', p.reason_id, 'codigo', p.motivo_codigo, 'nombre', p.motivo_nombre, 'texto', p.motivo_texto),
           'venta', jsonb_build_object('id', p.sale_id, 'factura_id', p.factura_id, 'factura_numero', p.factura_numero),
           'nota_credito', case when p.nc_id is null then null
                                else jsonb_build_object('id', p.nc_id, 'numero', p.nc_numero, 'estado', p.nc_estado) end,
           'cliente', case when p.cliente_id is null then null
                           else jsonb_build_object('id', p.cliente_id, 'nombre', p.cliente_nombre,
                                                   'tipo_documento', p.cliente_tipo_documento, 'documento', p.cliente_documento) end,
           'sucursal', jsonb_build_object('id', p.branch_id, 'nombre', (select b.name from public.branches b where b.id = p.branch_id))
         ) order by p.posicion) filter (where p.posicion > v_desp and p.posicion <= v_desp + v_limite), '[]'::jsonb)
    into v_total, v_filas
    from pagina p;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

comment on function public.pos_devoluciones_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[], text, text, integer, integer) is
  'Listado de devoluciones del POS (/app/pos/devoluciones), paginado y ordenado en la base. Organización con fn_assert_acceso_org; sucursal con app_branch_access.';

revoke all on function public.pos_devoluciones_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[], text, text, integer, integer) from public, anon;
grant execute on function public.pos_devoluciones_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[], text, text, integer, integer) to authenticated, service_role;

create or replace function public.pos_devoluciones_cifras(
  p_organization_id integer,
  p_branch_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_busqueda text default null,
  p_estados text[] default null,
  p_metodos text[] default null,
  p_motivos integer[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sucursales integer[];
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  if not public.pos_devoluciones_puede_ver(p_organization_id) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);

  with f as (
    select * from public.pos_devoluciones_filtradas(
      p_organization_id, v_sucursales, p_desde, p_hasta, public.pos_ventas_patron(p_busqueda),
      p_estados, p_metodos, p_motivos)
  ),
  pr as (select * from f where f.status = 'processed'),
  metodos as (
    select coalesce(jsonb_agg(jsonb_build_object('metodo', m.metodo, 'total', m.total, 'n', m.n) order by m.total desc), '[]'::jsonb) as lista
      from (select pr.metodo, sum(pr.total) as total, count(*) as n from pr group by pr.metodo) m
  ),
  motivo as (
    select pr.reason_id, max(coalesce(pr.motivo_nombre, '')) as nombre, max(pr.motivo_codigo) as codigo, count(*) as n
      from pr where pr.reason_id is not null
     group by pr.reason_id
     order by count(*) desc, sum(pr.total) desc
     limit 1
  ),
  ventas as (
    select coalesce(sum(s.total), 0) as total
      from public.sales s
     where s.organization_id = p_organization_id
       and s.branch_id = any (v_sucursales)
       and s.sale_date >= p_desde and s.sale_date <= p_hasta
       and s.status not in ('void', 'cancelled', 'draft')
  )
  select jsonb_build_object(
    'devuelto', coalesce((select sum(pr.total) from pr), 0),
    'devoluciones', (select count(*) from f),
    'procesadas', (select count(*) from pr),
    'unidades', coalesce((select sum(pr.unidades) from pr), 0),
    'parciales', (select count(*) from pr where pr.unidades < pr.unidades_vendidas),
    'por_metodo', (select lista from metodos),
    'ventas', (select total from ventas),
    'motivo_principal', (select jsonb_build_object('id', m.reason_id, 'nombre', nullif(m.nombre, ''), 'codigo', m.codigo, 'n', m.n) from motivo m)
  ) into v_res;

  return v_res;
end;
$$;

comment on function public.pos_devoluciones_cifras(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[]) is
  'KPI del listado de devoluciones del POS sobre las devoluciones listadas (mismos filtros): devuelto (procesadas) por método, número, unidades, parciales, ventas del periodo en las mismas sucursales y motivo principal.';

revoke all on function public.pos_devoluciones_cifras(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[]) from public, anon;
grant execute on function public.pos_devoluciones_cifras(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[]) to authenticated, service_role;

create or replace function public.pos_ventas_para_devolver(
  p_organization_id integer,
  p_branch_id integer default null,
  p_busqueda text default null,
  p_limite integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sucursales integer[];
  v_patron text := public.pos_ventas_patron(p_busqueda);
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if auth.uid() is not null and not public.fn_caja_puede(p_organization_id, 'pos.refund') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);

  with base as (
    select s.id, s.branch_id, s.sale_date, s.total, s.customer_id,
           (select i.id from public.invoice_sales i
             where i.sale_id = s.id and coalesce(i.document_type, 'invoice') <> 'credit_note'
             order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1) as factura_id
      from public.sales s
     where s.organization_id = p_organization_id
       and s.branch_id = any (v_sucursales)
       and s.status = 'paid'
  ),
  calculada as (
    select b.*, fi.number as factura_numero,
           c.full_name as cliente_nombre,
           coalesce(nullif(c.identification_type, ''), c.doc_type) as cliente_tipo_documento,
           coalesce(nullif(c.identification_number, ''), c.doc_number) as cliente_documento,
           c.phone as cliente_telefono
      from base b
      left join public.invoice_sales fi on fi.id = b.factura_id
      left join public.customers c on c.id = b.customer_id
  ),
  elegida as (
    select x.*
      from calculada x
     where v_patron is null
        or x.factura_numero ilike v_patron
        or x.cliente_nombre ilike v_patron
        or x.cliente_documento ilike v_patron
        or x.cliente_telefono ilike v_patron
        or x.id::text ilike v_patron
     order by x.sale_date desc nulls last
     limit v_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'fecha', e.sale_date,
           'total', e.total,
           'factura_id', e.factura_id,
           'numero', e.factura_numero,
           'sucursal_id', e.branch_id,
           'cliente', case when e.customer_id is null then null
                           else jsonb_build_object('id', e.customer_id, 'nombre', e.cliente_nombre,
                                                   'tipo_documento', e.cliente_tipo_documento, 'documento', e.cliente_documento) end,
           'productos', (select count(*) from public.sale_items si where si.sale_id = e.id),
           'unidades', coalesce((select sum(si.quantity) from public.sale_items si where si.sale_id = e.id), 0),
           'devueltas', coalesce((select sum(l.quantity) from public.return_lines l
                                    join public.returns r on r.id = l.return_id
                                   where r.sale_id = e.id and r.status = 'processed'), 0)
         ) order by e.sale_date desc nulls last), '[]'::jsonb)
    into v_filas
    from elegida e;

  return v_filas;
end;
$$;

comment on function public.pos_ventas_para_devolver(integer, integer, text, integer) is
  'Buscador de «Nueva devolución»: ventas pagadas por número de factura, cliente, documento o teléfono, con unidades vendidas y ya devueltas. Una venta con devoluciones previas sigue apareciendo (D11). Exige pos.refund.';

revoke all on function public.pos_ventas_para_devolver(integer, integer, text, integer) from public, anon;
grant execute on function public.pos_ventas_para_devolver(integer, integer, text, integer) to authenticated, service_role;

create or replace function public.pos_motivos_devolucion_usos(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select coalesce(jsonb_object_agg(u.reason_id::text, u.n), '{}'::jsonb) into v
    from (select r.reason_id, count(*) as n
            from public.returns r
           where r.organization_id = p_organization_id and r.reason_id is not null
           group by r.reason_id) u;
  return v;
end;
$$;

comment on function public.pos_motivos_devolucion_usos(integer) is
  'Devoluciones que usan cada motivo (returns.reason_id → n), para la columna «Usos» de Motivos de devolución y para desactivar en vez de borrar.';

revoke all on function public.pos_motivos_devolucion_usos(integer) from public, anon;
grant execute on function public.pos_motivos_devolucion_usos(integer) to authenticated, service_role;
