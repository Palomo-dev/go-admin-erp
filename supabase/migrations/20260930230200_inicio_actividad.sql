-- Inicio igual al Figma (tanda 4, 2026-09-30): «Actividad reciente» con los
-- filtros Todo · Ventas · Facturas · Clientes · Inventario y paginación
-- («1–4 de 15 movimientos» + «Ir a»), leída en el servidor.
--
-- Antes el navegador pedía las 5 últimas filas de cinco tablas SIN periodo,
-- las mezclaba y cortaba en 15: ni el total ni los filtros eran reales, y los
-- mostraba a cualquiera que viera el panel aunque no tuviera permiso de ese
-- módulo. Ahora:
-- - Periodo [p_desde, p_hasta) y sucursal del selector del inicio (las
--   sucursales a las que la persona tiene acceso con «Todas»).
-- - Cada tipo solo si su módulo está activo y la persona tiene su permiso de
--   lectura (fn_caja_puede; administración pasa): venta (pos.view /
--   sales_management / reports.sales), factura (finance.view), cliente
--   (crm.customers.view / customer_management; «clientes» es módulo base),
--   stock (inventory.view), reserva (pms.reservations.view).
-- - Conteo por tipo (los chips y el total de la paginación) y UNA página
--   ordenada por fecha; el detalle (autor, producto, sucursal) solo se lee
--   para las filas de la página.
--
-- SECURITY DEFINER con fn_assert_acceso_org, sin anon.

create or replace function public.fn_inicio_actividad(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_branch_id integer default null,
  p_tipo text default null,
  p_limite integer default 4,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sucursales integer[];
  v_activos text[];
  v_tipos text[] := array[]::text[];
  v_filtro text[];
  v_moneda text;
  v_sin_sesion boolean := auth.uid() is null;
  v_r jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 50 or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Paginación inválida' using errcode = '22023';
  end if;
  if p_tipo is not null and p_tipo not in ('venta', 'factura', 'cliente', 'stock', 'reserva') then
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
      raise exception 'Sucursal no válida' using errcode = '22023';
    end if;
    if not v_sin_sesion and not public.app_branch_access(p_branch_id) then
      raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
    end if;
    v_sucursales := array[p_branch_id];
  else
    select coalesce(array_agg(b.id), array[]::integer[]) into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and (v_sin_sesion or public.app_branch_access(b.id));
  end if;

  select coalesce(array_agg(om.module_code), array[]::text[]) into v_activos
    from public.organization_modules om
   where om.organization_id = p_organization_id and om.is_active = true;

  if 'pos' = any (v_activos) and (v_sin_sesion
       or public.fn_caja_puede(p_organization_id, 'pos.view')
       or public.fn_caja_puede(p_organization_id, 'sales_management')
       or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    v_tipos := v_tipos || 'venta'::text;
  end if;
  if 'finance' = any (v_activos) and (v_sin_sesion or public.fn_caja_puede(p_organization_id, 'finance.view')) then
    v_tipos := v_tipos || 'factura'::text;
  end if;
  if v_sin_sesion
     or public.fn_caja_puede(p_organization_id, 'crm.customers.view')
     or public.fn_caja_puede(p_organization_id, 'customer_management') then
    v_tipos := v_tipos || 'cliente'::text;
  end if;
  if 'inventory' = any (v_activos) and (v_sin_sesion or public.fn_caja_puede(p_organization_id, 'inventory.view')) then
    v_tipos := v_tipos || 'stock'::text;
  end if;
  if 'pms_hotel' = any (v_activos) and (v_sin_sesion or public.fn_caja_puede(p_organization_id, 'pms.reservations.view')) then
    v_tipos := v_tipos || 'reserva'::text;
  end if;

  v_filtro := case when p_tipo is null then v_tipos
                   when p_tipo = any (v_tipos) then array[p_tipo]
                   else array[]::text[] end;
  v_moneda := upper(public.fn_moneda_base_organizacion(p_organization_id));

  with base as (
    select 'venta'::text as tipo, s.id::text as id, s.sale_date as fecha
      from public.sales s
     where 'venta' = any (v_tipos)
       and s.organization_id = p_organization_id
       and s.branch_id = any (v_sucursales)
       and s.status <> 'draft'
       and s.sale_date >= p_desde and s.sale_date < p_hasta
    union all
    select 'factura', i.id::text, i.created_at
      from public.invoice_sales i
     where 'factura' = any (v_tipos)
       and i.organization_id = p_organization_id
       and i.branch_id = any (v_sucursales)
       and i.status <> 'draft'
       and i.created_at >= p_desde and i.created_at < p_hasta
    union all
    -- Los clientes casi nunca tienen sucursal: sin ella cuentan en todas.
    select 'cliente', c.id::text, c.created_at
      from public.customers c
     where 'cliente' = any (v_tipos)
       and c.organization_id = p_organization_id
       and (c.branch_id is null or c.branch_id = any (v_sucursales))
       and c.created_at >= p_desde and c.created_at < p_hasta
    union all
    select 'stock', m.id::text, m.created_at
      from public.stock_movements m
     where 'stock' = any (v_tipos)
       and m.organization_id = p_organization_id
       and m.branch_id = any (v_sucursales)
       and m.created_at >= p_desde and m.created_at < p_hasta
    union all
    select 'reserva', r.id::text, r.created_at
      from public.reservations r
     where 'reserva' = any (v_tipos)
       and r.organization_id = p_organization_id
       and r.branch_id = any (v_sucursales)
       and r.created_at >= p_desde and r.created_at < p_hasta
  ),
  conteos as (
    select tipo, count(*) as n from base group by tipo
  ),
  pagina as (
    select * from base
     where tipo = any (v_filtro)
     order by fecha desc, tipo, id
     limit p_limite offset p_offset
  ),
  filas as (
    select p.fecha, p.tipo, p.id,
           jsonb_build_object('tipo', p.tipo, 'id', p.id, 'fecha', p.fecha)
           || coalesce(case p.tipo
                when 'venta' then (
                  select jsonb_build_object(
                           'monto', s.total, 'moneda', v_moneda, 'estado', s.status,
                           'canal', case when s.web_order_id is not null or s.source = 'web' then 'web'
                                         when s.table_session_id is not null then 'mesa'
                                         else 'pos' end,
                           'autor', nullif(btrim(concat_ws(' ', btrim(pr.first_name),
                                     case when nullif(btrim(pr.last_name), '') is not null then left(btrim(pr.last_name), 1) || '.' end)), ''),
                           'sucursal', b.name)
                    from public.sales s
                    left join public.profiles pr on pr.id = s.user_id
                    left join public.branches b on b.id = s.branch_id
                   where s.id = p.id::uuid)
                when 'factura' then (
                  select jsonb_build_object(
                           'numero', i.number, 'monto', i.total,
                           'moneda', upper(coalesce(nullif(btrim(i.currency), ''), v_moneda)),
                           'estado', i.status, 'sucursal', b.name)
                    from public.invoice_sales i
                    left join public.branches b on b.id = i.branch_id
                   where i.id = p.id::uuid)
                when 'cliente' then (
                  select jsonb_build_object('nombre', nullif(btrim(c.full_name), ''))
                    from public.customers c
                   where c.id = p.id::uuid)
                when 'stock' then (
                  select jsonb_build_object(
                           'direccion', m.direction, 'cantidad', m.qty, 'origen', m.source,
                           'producto', pd.name, 'sucursal', b.name)
                    from public.stock_movements m
                    left join public.products pd on pd.id = m.product_id
                    left join public.branches b on b.id = m.branch_id
                   where m.id = p.id::integer)
                when 'reserva' then (
                  select jsonb_build_object('estado', r.status::text, 'sucursal', b.name)
                    from public.reservations r
                    left join public.branches b on b.id = r.branch_id
                   where r.id = p.id::uuid)
              end, '{}'::jsonb) as fila
      from pagina p
  )
  select jsonb_build_object(
    'tipos', to_jsonb(v_tipos),
    'conteos', coalesce((select jsonb_object_agg(tipo, n) from conteos), '{}'::jsonb),
    'total', coalesce((select sum(n) from conteos where tipo = any (v_filtro)), 0),
    'filas', coalesce((select jsonb_agg(fila order by fecha desc, tipo, id) from filas), '[]'::jsonb)
  ) into v_r;

  return v_r;
end;
$$;

comment on function public.fn_inicio_actividad(integer, timestamptz, timestamptz, integer, text, integer, integer) is
  'Inicio, «Actividad reciente»: ventas, facturas, clientes, movimientos de stock y reservas del periodo y la sucursal, solo de los módulos activos con permiso de lectura; conteo por tipo y una página ordenada por fecha.';

revoke all on function public.fn_inicio_actividad(integer, timestamptz, timestamptz, integer, text, integer, integer) from public, anon;
grant execute on function public.fn_inicio_actividad(integer, timestamptz, timestamptz, integer, text, integer, integer) to authenticated, service_role;
