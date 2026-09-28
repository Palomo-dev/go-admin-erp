-- Clientes: listado paginado en el servidor, estado activo/inactivo y acciones
-- masivas transaccionales (rediseño de /app/clientes, 2026-09-24).
--
-- Por qué:
-- 1. El listado traía 10 clientes y calculaba saldo, compras y folios en el
--    navegador con 6 consultas por página; filtros y orden se aplicaban solo
--    sobre la página cargada. Con organizaciones de 18.063 clientes, búsqueda,
--    filtros, orden y paginación tienen que ir al servidor en UNA llamada.
-- 2. `customers` no tenía estado: «Desactivar» era un onClick vacío. Decisión
--    del dueño (docs/design/CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md, decisión 4):
--    columna nueva `status`; `lifecycle_stage` (etapa comercial del CRM) no se toca.
-- 3. Eliminar era un DELETE duro masivo desde el navegador que arrastraba en
--    cascada saldos a favor, consentimientos y conversaciones. Decisión 5: solo
--    se elimina un cliente SIN ninguna relación; lo demás se inactiva.
-- 4. Etiquetar y cambiar roles hacían un UPDATE por cliente desde el navegador.
--
-- Todas las funciones son SECURITY DEFINER con fn_assert_acceso_org, permiso
-- resuelto en el servidor y REVOKE a anon/public en esta misma migración.

-- ── 1. Estado del cliente (aditivo) ─────────────────────────────────────────
alter table public.customers add column if not exists status text not null default 'active';
alter table public.customers add column if not exists inactivated_at timestamptz null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_status_check') then
    alter table public.customers
      add constraint customers_status_check check (status in ('active', 'inactive', 'merged'));
  end if;
end $$;

comment on column public.customers.status is
  'Estado operativo: active, inactive (conserva historia y cartera; se puede cobrar) o merged (reservado para la unificación). No es la etapa comercial: esa es lifecycle_stage.';
comment on column public.customers.inactivated_at is 'Cuándo se marcó inactivo (null si está activo).';

create index if not exists idx_customers_org_status on public.customers (organization_id, status);
-- sales no tenía índice por cliente y el listado agrega por cliente.
create index if not exists idx_sales_customer_id on public.sales (customer_id) where customer_id is not null;

-- ── 2. Permiso resuelto en el servidor ──────────────────────────────────────
-- Pasa si el usuario es dueño de la organización o si CUALQUIERA de los códigos
-- está permitido por su cargo o su rol (check_user_permission, con precedencia).
create or replace function public.fn_clientes_exigir_permiso(p_org integer, p_codigos text[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  -- Sin usuario solo llega aquí el service role: fn_assert_acceso_org ya
  -- rechazó a anon y a authenticated sin sesión.
  if v_uid is null then
    return;
  end if;
  if exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) then
    return;
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.check_user_permission(v_uid, p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'No tienes permiso para esta acción sobre clientes' using errcode = '42501';
end;
$$;

-- ── 3. Listado ──────────────────────────────────────────────────────────────
-- Una llamada: filtra, agrega (cartera, compras, folios cerrados), ordena y
-- pagina. `total_filas` es el total del filtro (count(*) over ()).
create or replace function public.fn_clientes_listado(
  p_org integer,
  p_branch integer default null,
  p_busqueda text default null,
  p_tipo text default null,
  p_rol text default null,
  p_etiqueta text default null,
  p_municipio uuid default null,
  p_saldo text default null,
  p_estado text default 'active',
  p_orden text default 'nombre',
  p_direccion text default 'asc',
  p_limite integer default 20,
  p_desplazamiento integer default 0,
  p_ids uuid[] default null
)
returns table (
  id uuid,
  customer_type text,
  first_name text,
  last_name text,
  full_name text,
  company_name text,
  trade_name text,
  email text,
  phone text,
  identification_type text,
  identification_number text,
  dv integer,
  address text,
  city text,
  notes text,
  tags text[],
  roles text[],
  preferences jsonb,
  avatar_url text,
  fiscal_responsibilities text[],
  fiscal_municipality_id uuid,
  municipio_nombre text,
  parent_customer_id uuid,
  lifecycle_stage text,
  status text,
  created_at timestamptz,
  contacto_nombre text,
  contacto_cargo text,
  saldo numeric,
  facturas_abiertas integer,
  facturas_vencidas integer,
  dias_vencido integer,
  estado_cartera text,
  compras integer,
  total_compras numeric,
  ultima_compra timestamptz,
  dias_desde_ultima_compra integer,
  plazo_dias integer,
  total_filas bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_hoy date;
  v_termino text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_patron text;
  v_digitos text;
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
    v_patron := '%' || replace(replace(replace(public.f_unaccent(lower(v_termino)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digitos := regexp_replace(v_termino, '\D', '', 'g');
    if length(v_digitos) < 3 then
      v_digitos := null;
    end if;
  end if;

  return query
  with filtro as (
    select c.*
    from public.customers c
    where c.organization_id = p_org
      and (p_branch is null or c.branch_id = p_branch)
      and (p_ids is null or c.id = any(p_ids))
      and (coalesce(p_estado, 'active') = 'todos' or c.status = coalesce(p_estado, 'active'))
      and (p_tipo is null or c.customer_type = p_tipo)
      and (p_rol is null or p_rol = any(c.roles))
      and (p_etiqueta is null or p_etiqueta = any(c.tags))
      and (p_municipio is null or c.fiscal_municipality_id = p_municipio)
      and (
        v_patron is null
        or public.f_unaccent(lower(coalesce(c.full_name, ''))) like v_patron
        or public.f_unaccent(lower(coalesce(c.company_name, ''))) like v_patron
        or public.f_unaccent(lower(coalesce(c.trade_name, ''))) like v_patron
        or lower(coalesce(c.email, '')) like v_patron
        or lower(coalesce(c.identification_number, '')) like v_patron
        or coalesce(c.phone, '') like v_patron
        or (v_digitos is not null and (
              regexp_replace(coalesce(c.identification_number, ''), '\D', '', 'g') like '%' || v_digitos || '%'
           or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digitos || '%'))
      )
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
$$;

-- ── 4. Resumen (KPIs y subtítulo) ───────────────────────────────────────────
create or replace function public.fn_clientes_resumen(p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_hoy date;
  v_mes timestamptz;
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_org;
  v_tz := coalesce(v_tz, 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  v_mes := (date_trunc('month', v_hoy::timestamp)) at time zone v_tz;

  with cli as (
    select c.id, c.status, c.created_at
    from public.customers c
    where c.organization_id = p_org and (p_branch is null or c.branch_id = p_branch)
  ),
  cartera as (
    select ar.customer_id,
           sum(ar.balance) as saldo,
           sum(ar.balance) filter (where ar.status = 'overdue'
             or (ar.due_date is not null and (ar.due_date at time zone v_tz)::date < v_hoy)) as vencido
    from public.accounts_receivable ar
    join cli on cli.id = ar.customer_id
    where ar.organization_id = p_org and ar.balance > 0
    group by ar.customer_id
  )
  select jsonb_build_object(
    'total', (select count(*) from cli where cli.status = 'active'),
    'inactivos', (select count(*) from cli where cli.status = 'inactive'),
    'nuevos_mes', (select count(*) from cli where cli.status = 'active' and cli.created_at >= v_mes),
    'con_saldo', (select count(*) from cartera where cartera.saldo > 0),
    'vencidos', (select count(*) from cartera where coalesce(cartera.vencido, 0) > 0),
    'cartera_total', coalesce((select sum(cartera.saldo) from cartera), 0),
    'cartera_vencida', coalesce((select sum(cartera.vencido) from cartera), 0)
  ) into v_res;
  return v_res;
end;
$$;

-- ── 5. Opciones de filtro (catálogo completo, no la página cargada) ────────
create or replace function public.fn_clientes_opciones_filtro(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  select jsonb_build_object(
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('valor', x.valor, 'etiqueta', x.etiqueta) order by x.orden, x.valor)
      from (
        select cr.code as valor, cr.label as etiqueta, cr.sort_order as orden from public.customer_roles cr
        union
        select distinct r as valor, r as etiqueta, 1000 as orden
        from public.customers c, unnest(c.roles) r
        where c.organization_id = p_org and r not in (select code from public.customer_roles)
      ) x), '[]'::jsonb),
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('valor', t.tag, 'cantidad', t.n) order by t.tag)
      from (
        select tg as tag, count(*) as n
        from public.customers c, unnest(c.tags) tg
        where c.organization_id = p_org and btrim(tg) <> ''
        group by tg
      ) t), '[]'::jsonb),
    'municipios', coalesce((
      select jsonb_agg(jsonb_build_object('valor', m.id, 'etiqueta', m.name || coalesce(' - ' || m.state_name, ''), 'cantidad', u.n)
                       order by m.name)
      from (
        select c.fiscal_municipality_id as mid, count(*) as n
        from public.customers c
        where c.organization_id = p_org and c.fiscal_municipality_id is not null
        group by c.fiscal_municipality_id
      ) u
      join public.municipalities m on m.id = u.mid), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- ── 6. Etiquetas y roles masivos (un UPDATE, no uno por cliente) ────────────
create or replace function public.fn_clientes_etiqueta_masiva(
  p_org integer, p_ids uuid[], p_etiqueta text, p_quitar boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etiqueta text := btrim(coalesce(p_etiqueta, ''));
  v_n integer;
begin
  perform public.fn_clientes_exigir_permiso(p_org, array['crm.customers.edit', 'customer_management']);
  if v_etiqueta = '' or length(v_etiqueta) > 60 then
    raise exception 'La etiqueta debe tener entre 1 y 60 caracteres' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_quitar then
    update public.customers c
       set tags = array_remove(c.tags, v_etiqueta), updated_at = now()
     where c.organization_id = p_org and c.id = any(p_ids) and v_etiqueta = any(c.tags);
  else
    update public.customers c
       set tags = array_append(coalesce(c.tags, array[]::text[]), v_etiqueta), updated_at = now()
     where c.organization_id = p_org and c.id = any(p_ids) and not (v_etiqueta = any(coalesce(c.tags, array[]::text[])));
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.fn_clientes_rol_masivo(
  p_org integer, p_ids uuid[], p_rol text, p_quitar boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  perform public.fn_clientes_exigir_permiso(p_org, array['crm.customers.edit', 'customer_management']);
  if not exists (select 1 from public.customer_roles cr where cr.code = p_rol) then
    raise exception 'Rol desconocido' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_quitar then
    update public.customers c
       set roles = array_remove(c.roles, p_rol), updated_at = now()
     where c.organization_id = p_org and c.id = any(p_ids) and p_rol = any(c.roles);
  else
    update public.customers c
       set roles = array_append(coalesce(c.roles, array[]::text[]), p_rol), updated_at = now()
     where c.organization_id = p_org and c.id = any(p_ids) and not (p_rol = any(coalesce(c.roles, array[]::text[])));
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── 7. Activar / inactivar ──────────────────────────────────────────────────
create or replace function public.fn_clientes_cambiar_estado(p_org integer, p_ids uuid[], p_estado text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  perform public.fn_clientes_exigir_permiso(p_org, array['crm.customers.edit', 'customer_management']);
  if p_estado not in ('active', 'inactive') then
    raise exception 'Estado no válido' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;
  update public.customers c
     set status = p_estado,
         inactivated_at = case when p_estado = 'inactive' then now() else null end,
         updated_at = now()
   where c.organization_id = p_org and c.id = any(p_ids) and c.status in ('active', 'inactive') and c.status <> p_estado;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── 8. Eliminar solo lo que no tiene ninguna relación ───────────────────────
-- Recorre TODAS las llaves foráneas que apuntan a customers (se leen de
-- pg_constraint: una tabla nueva queda cubierta sin tocar esta función), más
-- las referencias sin FK y las polimórficas. Con p_confirmar = false solo
-- clasifica; con true borra los que no tienen relaciones y devuelve el resto.
create or replace function public.fn_clientes_eliminar(p_org integer, p_ids uuid[], p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_fk record;
  v_ref uuid[];
  v_rel jsonb := '{}'::jsonb;  -- { "<customer_id>": ["tabla", ...] }
  v_id uuid;
  v_borrables uuid[] := array[]::uuid[];
  v_bloqueados jsonb := '[]'::jsonb;
  v_n integer := 0;
begin
  perform public.fn_clientes_exigir_permiso(p_org, array['crm.customers.delete']);

  select coalesce(array_agg(c.id), array[]::uuid[]) into v_ids
  from public.customers c
  where c.organization_id = p_org and c.id = any(coalesce(p_ids, array[]::uuid[]));

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('eliminados', 0, 'eliminables', '[]'::jsonb, 'bloqueados', '[]'::jsonb);
  end if;

  -- Llaves foráneas (incluida la autorreferencia parent_customer_id).
  for v_fk in
    select c.conrelid::regclass::text as tabla, a.attname as columna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.customers'::regclass
  loop
    execute format('select coalesce(array_agg(distinct %1$I), array[]::uuid[]) from %2$s where %1$I = any($1)', v_fk.columna, v_fk.tabla)
      into v_ref using v_ids;
    foreach v_id in array v_ref loop
      v_rel := jsonb_set(v_rel, array[v_id::text],
                         coalesce(v_rel -> v_id::text, '[]'::jsonb) || to_jsonb(v_fk.tabla), true);
    end loop;
  end loop;

  -- Referencias sin llave foránea y polimórficas (CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md §C.3).
  for v_fk in
    select * from (values
      ('health_score_snapshots', 'select customer_id from public.health_score_snapshots where customer_id = any($1)'),
      ('email_messages', 'select to_customer_id from public.email_messages where to_customer_id = any($1)'),
      ('mobile_call_bridges', 'select customer_id from public.mobile_call_bridges where customer_id = any($1)'),
      ('restaurant_reservations', 'select customer_id from public.restaurant_reservations where customer_id = any($1)'),
      ('activities', 'select related_id from public.activities where related_type in (''customer'', ''cliente'') and related_id = any($1)'),
      ('notes', 'select related_id from public.notes where related_type in (''customer'', ''cliente'') and related_id = any($1)'),
      ('tasks', 'select related_to_id from public.tasks where related_to_type in (''customer'', ''cliente'') and related_to_id = any($1)'),
      ('documents', 'select related_id::uuid from public.documents where related_type in (''customer'', ''cliente'') and related_id = any($1::text[])')
    ) as t(tabla, consulta)
  loop
    execute format('select coalesce(array_agg(distinct x), array[]::uuid[]) from (%s) s(x)', v_fk.consulta)
      into v_ref using v_ids;
    foreach v_id in array v_ref loop
      v_rel := jsonb_set(v_rel, array[v_id::text],
                         coalesce(v_rel -> v_id::text, '[]'::jsonb) || to_jsonb(v_fk.tabla), true);
    end loop;
  end loop;

  foreach v_id in array v_ids loop
    if v_rel ? v_id::text then
      v_bloqueados := v_bloqueados || jsonb_build_object(
        'id', v_id,
        'nombre', (select c.full_name from public.customers c where c.id = v_id),
        'relaciones', (select jsonb_agg(distinct e) from jsonb_array_elements_text(v_rel -> v_id::text) e)
      );
    else
      v_borrables := v_borrables || v_id;
    end if;
  end loop;

  if p_confirmar and coalesce(array_length(v_borrables, 1), 0) > 0 then
    delete from public.customers c where c.organization_id = p_org and c.id = any(v_borrables);
    get diagnostics v_n = row_count;
  end if;

  return jsonb_build_object(
    'eliminados', v_n,
    'eliminables', to_jsonb(v_borrables),
    'bloqueados', v_bloqueados
  );
end;
$$;

-- ── 9. Privilegios: nada para anon ni public ────────────────────────────────
revoke all on function public.fn_clientes_exigir_permiso(integer, text[]) from public, anon;
revoke all on function public.fn_clientes_listado(integer, integer, text, text, text, text, uuid, text, text, text, text, integer, integer, uuid[]) from public, anon;
revoke all on function public.fn_clientes_resumen(integer, integer) from public, anon;
revoke all on function public.fn_clientes_opciones_filtro(integer) from public, anon;
revoke all on function public.fn_clientes_etiqueta_masiva(integer, uuid[], text, boolean) from public, anon;
revoke all on function public.fn_clientes_rol_masivo(integer, uuid[], text, boolean) from public, anon;
revoke all on function public.fn_clientes_cambiar_estado(integer, uuid[], text) from public, anon;
revoke all on function public.fn_clientes_eliminar(integer, uuid[], boolean) from public, anon;

grant execute on function public.fn_clientes_listado(integer, integer, text, text, text, text, uuid, text, text, text, text, integer, integer, uuid[]) to authenticated, service_role;
grant execute on function public.fn_clientes_resumen(integer, integer) to authenticated, service_role;
grant execute on function public.fn_clientes_opciones_filtro(integer) to authenticated, service_role;
grant execute on function public.fn_clientes_etiqueta_masiva(integer, uuid[], text, boolean) to authenticated, service_role;
grant execute on function public.fn_clientes_rol_masivo(integer, uuid[], text, boolean) to authenticated, service_role;
grant execute on function public.fn_clientes_cambiar_estado(integer, uuid[], text) to authenticated, service_role;
grant execute on function public.fn_clientes_eliminar(integer, uuid[], boolean) to authenticated, service_role;
grant execute on function public.fn_clientes_exigir_permiso(integer, text[]) to service_role;
