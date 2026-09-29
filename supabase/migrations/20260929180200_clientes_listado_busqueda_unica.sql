-- fn_clientes_listado usa la búsqueda única de clientes (2026-09-29).
--
-- Antes buscaba por su cuenta (frase completa con unaccent + dígitos de 3+):
-- «gomez ana» o «Gómez, Ana» no encontraban a «Ana María Gómez». Ahora la
-- coincidencia sale de fn_clientes_buscar_ids (las mismas reglas que
-- fn_clientes_buscar y que el POS sin red) y hay un orden nuevo,
-- p_orden = 'relevancia' (documento/teléfono exacto, nombre que empieza por el
-- texto, palabra del nombre que empieza por el texto, el resto; después
-- nombre). El servicio lo pide cuando hay texto y la pantalla no eligió orden.
-- Todo lo demás (filtros, cartera, compras, paginación) queda igual.

create or replace function public.fn_clientes_listado(p_org integer, p_branch integer DEFAULT NULL::integer, p_busqueda text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_rol text DEFAULT NULL::text, p_etiqueta text DEFAULT NULL::text, p_municipio uuid DEFAULT NULL::uuid, p_saldo text DEFAULT NULL::text, p_estado text DEFAULT 'active'::text, p_orden text DEFAULT 'nombre'::text, p_direccion text DEFAULT 'asc'::text, p_limite integer DEFAULT 20, p_desplazamiento integer DEFAULT 0, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, customer_type text, first_name text, last_name text, full_name text, company_name text, trade_name text, email text, phone text, identification_type text, identification_number text, dv integer, address text, city text, notes text, tags text[], roles text[], preferences jsonb, avatar_url text, fiscal_responsibilities text[], fiscal_municipality_id uuid, municipio_nombre text, parent_customer_id uuid, lifecycle_stage text, status text, created_at timestamp with time zone, contacto_nombre text, contacto_cargo text, saldo numeric, facturas_abiertas integer, facturas_vencidas integer, dias_vencido integer, estado_cartera text, compras integer, total_compras numeric, ultima_compra timestamp with time zone, dias_desde_ultima_compra integer, plazo_dias integer, total_filas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_tz text;
  v_hoy date;
  v_termino text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 1000);
  v_desde integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_dir text := case when lower(coalesce(p_direccion, 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_orden text := coalesce(p_orden, 'nombre');
begin
  perform public.fn_assert_acceso_org(p_org);

  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_org;
  v_tz := coalesce(v_tz, 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;

  if v_termino is not null then
    v_termino := left(v_termino, 200);
  end if;

  return query
  with coincidencias as (
    -- Búsqueda única: mismas reglas que fn_clientes_buscar (y el POS sin red).
    select b.id as x_id, b.relevancia as x_relevancia
    from public.fn_clientes_buscar_ids(p_org, v_termino) b
    where v_termino is not null
  ),
  filtro as (
    select c.*, co.x_relevancia
    from public.customers c
    left join coincidencias co on co.x_id = c.id
    where c.organization_id = p_org
      and (p_branch is null or c.branch_id = p_branch)
      and (p_ids is null or c.id = any(p_ids))
      and (coalesce(p_estado, 'active') = 'todos' or c.status = coalesce(p_estado, 'active'))
      and (p_tipo is null or c.customer_type = p_tipo)
      and (p_rol is null or p_rol = any(c.roles))
      and (p_etiqueta is null or p_etiqueta = any(c.tags))
      and (p_municipio is null or c.fiscal_municipality_id = p_municipio)
      and (v_termino is null or co.x_id is not null)
  ),
  cartera as (
    select ar.customer_id,
           sum(ar.balance) filter (where ar.balance > 0) as saldo,
           count(*) filter (where ar.balance > 0) as abiertas,
           count(*) filter (where ar.balance > 0 and (ar.status = 'overdue'
                              or (ar.due_date is not null and (ar.due_date at time zone v_tz)::date < v_hoy))) as vencidas,
           max(v_hoy - (ar.due_date at time zone v_tz)::date)
             filter (where ar.balance > 0 and ar.due_date is not null and (ar.due_date at time zone v_tz)::date < v_hoy) as dias,
           bool_or(ar.balance > 0 and ar.status = 'partial') as parcial
    from public.accounts_receivable ar
    where ar.organization_id = p_org and ar.customer_id in (select f.id from filtro f)
    group by ar.customer_id
  ),
  ventas as (
    select s.customer_id, count(*) as n, sum(coalesce(s.total, 0)) as total, max(s.sale_date) as ultima
    from public.sales s
    where s.organization_id = p_org and s.status <> 'void' and s.customer_id in (select f.id from filtro f)
    group by s.customer_id
  ),
  folios_cerrados as (
    -- El listado anterior contaba cada folio cerrado de una reserva como una compra.
    select r.customer_id, count(*) as n, sum(coalesce(fi.total, 0)) as total, max(fo.created_at) as ultima
    from public.folios fo
    join public.reservations r on r.id = fo.reservation_id
    left join lateral (select sum(i.amount) as total from public.folio_items i where i.folio_id = fo.id) fi on true
    where r.organization_id = p_org and fo.status::text = 'closed' and r.customer_id in (select f.id from filtro f)
    group by r.customer_id
  ),
  plazo as (
    select distinct on (i.customer_id) i.customer_id, i.payment_terms
    from public.invoice_sales i
    where i.organization_id = p_org and i.customer_id in (select f.id from filtro f)
    order by i.customer_id, i.created_at desc nulls last
  ),
  base as (
    select f.*,
           coalesce(ca.saldo, 0)::numeric as x_saldo,
           coalesce(ca.abiertas, 0)::integer as x_abiertas,
           coalesce(ca.vencidas, 0)::integer as x_vencidas,
           coalesce(ca.dias, 0)::integer as x_dias,
           (coalesce(v.n, 0) + coalesce(fc.n, 0))::integer as x_compras,
           (coalesce(v.total, 0) + coalesce(fc.total, 0))::numeric as x_total,
           greatest(v.ultima, fc.ultima) as x_ultima,
           pl.payment_terms as x_plazo,
           case
             when coalesce(ca.vencidas, 0) > 0 then 'vencido'
             when coalesce(ca.abiertas, 0) > 0 and coalesce(ca.parcial, false) then 'parcial'
             when coalesce(ca.abiertas, 0) > 0 then 'pendiente'
             when coalesce(v.n, 0) + coalesce(fc.n, 0) > 0 then 'al_dia'
             when f.lifecycle_stage = 'lead' then 'lead'
             else 'sin_compras'
           end as x_estado_cartera
    from filtro f
    left join cartera ca on ca.customer_id = f.id
    left join ventas v on v.customer_id = f.id
    left join folios_cerrados fc on fc.customer_id = f.id
    left join plazo pl on pl.customer_id = f.id
  ),
  filtrada as (
    select b.*, count(*) over () as x_total_filas
    from base b
    where p_saldo is null
       or (p_saldo = 'con_saldo' and b.x_saldo > 0)
       or (p_saldo = 'sin_saldo' and b.x_saldo <= 0)
       or (p_saldo = 'vencido' and b.x_vencidas > 0)
  ),
  pagina as (
    select q.*
    from filtrada q
    order by
      case when v_orden = 'relevancia' then q.x_relevancia end asc nulls last,
      case when v_orden = 'saldo' and v_dir = 'asc' then q.x_saldo end asc nulls last,
      case when v_orden = 'saldo' and v_dir = 'desc' then q.x_saldo end desc nulls last,
      case when v_orden = 'ventas' and v_dir = 'asc' then q.x_total end asc nulls last,
      case when v_orden = 'ventas' and v_dir = 'desc' then q.x_total end desc nulls last,
      case when v_orden = 'ultima_compra' and v_dir = 'asc' then q.x_ultima end asc nulls last,
      case when v_orden = 'ultima_compra' and v_dir = 'desc' then q.x_ultima end desc nulls last,
      case when v_orden = 'creado' and v_dir = 'asc' then q.created_at end asc nulls last,
      case when v_orden = 'creado' and v_dir = 'desc' then q.created_at end desc nulls last,
      case when v_orden = 'nombre' and v_dir = 'desc' then lower(q.full_name) end desc nulls last,
      lower(q.full_name) asc nulls last,
      q.id
    limit v_limite offset v_desde
  )
  select
    p.id, p.customer_type, p.first_name, p.last_name, p.full_name, p.company_name, p.trade_name,
    p.email, p.phone, p.identification_type, p.identification_number, p.dv, p.address, p.city,
    p.notes, p.tags, p.roles, p.preferences, p.avatar_url, p.fiscal_responsibilities,
    p.fiscal_municipality_id,
    case when m.id is null then null else m.name || coalesce(' - ' || m.state_name, '') end,
    p.parent_customer_id, p.lifecycle_stage, p.status, p.created_at,
    ct.nombre, ct.cargo,
    p.x_saldo, p.x_abiertas, p.x_vencidas, p.x_dias, p.x_estado_cartera,
    p.x_compras, p.x_total, p.x_ultima,
    case when p.x_ultima is null then null else (v_hoy - (p.x_ultima at time zone v_tz)::date) end,
    p.x_plazo,
    p.x_total_filas
  from pagina p
  left join public.municipalities m on m.id = p.fiscal_municipality_id
  left join lateral (
    select nullif(btrim(coalesce(per.first_name, '') || ' ' || coalesce(per.last_name, '')), '') as nombre,
           l.position as cargo
    from public.customer_company_links l
    join public.customers per on per.id = l.person_id
    where p.customer_type = 'company' and l.company_id = p.id
    order by l.is_primary desc nulls last, l.created_at
    limit 1
  ) ct on true
  order by
    case when v_orden = 'relevancia' then p.x_relevancia end asc nulls last,
    case when v_orden = 'saldo' and v_dir = 'asc' then p.x_saldo end asc nulls last,
    case when v_orden = 'saldo' and v_dir = 'desc' then p.x_saldo end desc nulls last,
    case when v_orden = 'ventas' and v_dir = 'asc' then p.x_total end asc nulls last,
    case when v_orden = 'ventas' and v_dir = 'desc' then p.x_total end desc nulls last,
    case when v_orden = 'ultima_compra' and v_dir = 'asc' then p.x_ultima end asc nulls last,
    case when v_orden = 'ultima_compra' and v_dir = 'desc' then p.x_ultima end desc nulls last,
    case when v_orden = 'creado' and v_dir = 'asc' then p.created_at end asc nulls last,
    case when v_orden = 'creado' and v_dir = 'desc' then p.created_at end desc nulls last,
    case when v_orden = 'nombre' and v_dir = 'desc' then lower(p.full_name) end desc nulls last,
    lower(p.full_name) asc nulls last,
    p.id;
end;
$function$;
