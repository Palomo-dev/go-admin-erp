-- Reporte «Pesos manuales» del POS (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.9 y §10).
--
-- Auditoría de las líneas vendidas con el peso escrito a mano
-- (`sale_items.notes->'pesaje'->>'origen' = 'manual'`), agrupadas por día
-- (zona horaria de la organización), cajero y unidad.
--
-- Permiso resuelto en el servidor (CLAUDE.md, regla 6): dueño de la
-- organización, «Reportes de Ventas» (`reports.sales`) o «Configurar
-- básculas» (`pos.basculas.configurar`). Nunca por el nombre del rol.
--
-- Aditiva: una función nueva y un índice parcial (hoy 0 filas lo cumplen).

create index if not exists idx_sale_items_pesaje_manual
  on public.sale_items (sale_id)
  where (notes -> 'pesaje' ->> 'origen') = 'manual';

create or replace function public.pos_reporte_pesos_manuales(
  p_org integer,
  p_desde date,
  p_hasta date,
  p_branch integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_tz    text;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);

  if v_uid is not null and not (
       exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid)
    or public.check_user_permission(v_uid, p_org, 'reports.sales')
    or public.check_user_permission(v_uid, p_org, 'pos.basculas.configurar')
  ) then
    raise exception 'sin_permiso_reporte_pesos' using errcode = '42501',
      detail = 'El reporte de pesos manuales necesita «Reportes de Ventas» o «Configurar básculas».';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'rango_demasiado_largo' using errcode = '22023',
      detail = 'El reporte admite hasta 367 días.';
  end if;

  -- Días calendario de la organización → instantes (nunca el día UTC).
  v_tz    := public.fn_timezone_for(p_org);
  v_desde := (p_desde::timestamp at time zone v_tz);
  v_hasta := ((p_hasta + 1)::timestamp at time zone v_tz);

  with lineas as (
    select (s.sale_date at time zone v_tz)::date as dia,
           s.user_id,
           upper(btrim(coalesce(nullif(si.notes -> 'pesaje' ->> 'unidad', ''), p.unit_code, 'KG'))) as unidad,
           si.quantity,
           si.total,
           (si.notes -> 'pesaje' ->> 'autorizado_por') is not null as autorizada
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      left join public.products p on p.id = si.product_id
     where s.organization_id = p_org
       and s.sale_date >= v_desde
       and s.sale_date < v_hasta
       and s.status <> 'void'
       and (p_branch is null or s.branch_id = p_branch)
       and (si.notes -> 'pesaje' ->> 'origen') = 'manual'
  ),
  grupos as (
    select dia, user_id, unidad,
           count(*)                           as lineas,
           sum(quantity)                      as cantidad,
           sum(total)                         as importe,
           count(*) filter (where autorizada) as autorizadas
      from lineas
     group by dia, user_id, unidad
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'dia',         g.dia,
           'usuario_id',  g.user_id,
           'cajero',      coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.email),
           'unidad',      g.unidad,
           'lineas',      g.lineas,
           'cantidad',    g.cantidad,
           'importe',     g.importe,
           'autorizadas', g.autorizadas
         ) order by g.dia desc, g.lineas desc, g.user_id), '[]'::jsonb)
    into v_filas
    from grupos g
    left join public.profiles pr on pr.id = g.user_id;

  return jsonb_build_object(
    'zona',  v_tz,
    'desde', p_desde,
    'hasta', p_hasta,
    'filas', v_filas
  );
end;
$function$;

comment on function public.pos_reporte_pesos_manuales(integer, date, date, integer) is
  'Reporte «Pesos manuales» del POS: líneas con notes.pesaje.origen = manual por día (zona de la organización), cajero y unidad. Permiso: dueño, reports.sales o pos.basculas.configurar.';

revoke all on function public.pos_reporte_pesos_manuales(integer, date, date, integer) from public, anon;
grant execute on function public.pos_reporte_pesos_manuales(integer, date, date, integer) to authenticated, service_role;
