-- Widgets del Inicio para Ventas, Logística y Transporte (Figma «03» › Inicio, sección
-- 2915:45356; aprobado por el dueño el 2026-11-23). El único tablero del ERP es Inicio: los
-- tres módulos entran como filas de «Módulos» con su panel desplegado.
--
-- 1. `fn_inicio_modulos_resumen` (misma firma, mismos permisos):
--    - Logística: nueva fila si el módulo `logistica` está activo, la persona tiene
--      `logistica.view` y ve toda la operación. Las cifras salen del servicio del módulo.
--    - Transporte: además de `transport.trips.view` (que no existe en `permissions`), la abre
--      `transporte.view`, el permiso real del módulo. Agrega `hay_viajes` y `hay_vehiculos`
--      para el estado «Sin datos».
--    El resto de la función queda igual (copiada de la definición viva).
-- 2. `fn_inicio_ventas_widget`: cifras del panel de Ventas sobre la regla de «Todas las ventas».
--
-- Sin tablas ni columnas nuevas. Reversión: supabase/rollbacks/20261123205707_…_rollback.sql.

CREATE OR REPLACE FUNCTION public.fn_inicio_modulos_resumen(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_desde_anterior timestamp with time zone, p_hasta_anterior timestamp with time zone, p_branch_id integer DEFAULT NULL::integer, p_omitir text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_zona text;
  v_hoy date;
  v_ini_hoy timestamptz;
  v_ini_manana timestamptz;
  v_moneda text;
  v_sucursales integer[];
  v_activos text[];
  v_modulos jsonb := '[]'::jsonb;
  v_x jsonb;
  v_omitir text[] := coalesce(p_omitir, array[]::text[]);
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
     or p_desde_anterior is null or p_hasta_anterior is null or p_hasta_anterior <= p_desde_anterior then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
      raise exception 'Sucursal no válida' using errcode = '22023';
    end if;
    if auth.uid() is not null and not public.app_branch_access(p_branch_id) then
      raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
    end if;
    v_sucursales := array[p_branch_id];
  else
    select coalesce(array_agg(b.id), array[]::integer[]) into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and (auth.uid() is null or public.app_branch_access(b.id));
  end if;

  select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota') into v_zona
    from public.organizations o where o.id = p_organization_id;
  v_zona := coalesce(v_zona, 'America/Bogota');
  v_hoy := (now() at time zone v_zona)::date;
  v_ini_hoy := v_hoy::timestamp at time zone v_zona;
  v_ini_manana := (v_hoy + 1)::timestamp at time zone v_zona;
  v_moneda := upper(public.fn_moneda_base_organizacion(p_organization_id));

  select coalesce(array_agg(om.module_code), array[]::text[]) into v_activos
    from public.organization_modules om
   where om.organization_id = p_organization_id and om.is_active = true;

  -- ── Finanzas ──────────────────────────────────────────────────────────────
  if 'finance' = any (v_activos) and not ('finance' = any (v_omitir)) and public.fn_caja_puede(p_organization_id, 'finance.view') then
    begin
      v_x := public.fn_cxc_listado(
        p_organization_id,
        jsonb_strip_nulls(jsonb_build_object('estado', 'abiertas', 'origen', 'todos', 'sucursal', p_branch_id)),
        'antiguedad_desc', 1, 1);
      v_modulos := v_modulos || jsonb_build_object(
        'codigo', 'finance',
        'cartera_vencida', coalesce((v_x #>> '{resumen,vencida}')::numeric, 0),
        'cuentas_vencidas', coalesce((v_x #>> '{resumen,cuentas_vencidas}')::integer, 0),
        'por_cobrar', coalesce((v_x #>> '{resumen,por_cobrar}')::numeric, 0),
        'monedas_cartera', coalesce(v_x #> '{resumen,monedas}', '[]'::jsonb),
        'dias_mas_vieja', coalesce((v_x #>> '{filas,0,dias}')::integer, 0),
        'por_pagar_7d', (
          select jsonb_build_object(
                   'total', coalesce(sum(ap.balance), 0),
                   'cuentas', count(*),
                   'monedas', coalesce(jsonb_agg(distinct upper(coalesce(nullif(btrim(ip.currency), ''), v_moneda))) filter (where ap.id is not null), '[]'::jsonb))
            from public.accounts_payable ap
            left join public.invoice_purchase ip on ip.id = ap.invoice_id
           where ap.organization_id = p_organization_id
             and coalesce(ap.balance, 0) > 0
             and coalesce(ap.status, '') not in ('paid', 'cancelled', 'void')
             and ap.due_date < v_ini_hoy + interval '8 days'
             and (case when p_branch_id is null then (ap.branch_id is null or ap.branch_id = any (v_sucursales))
                       else ap.branch_id = p_branch_id end)
        )
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'finance', 'error', true);
    end;
  end if;

  -- ── Ventas (POS) ──────────────────────────────────────────────────────────
  if 'pos' = any (v_activos) and not ('pos' = any (v_omitir))
     and (public.fn_caja_puede(p_organization_id, 'pos.view')
          or public.fn_caja_puede(p_organization_id, 'sales_management')
          or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    begin
      v_x := public.fn_inicio_ventas_periodo(p_organization_id, p_desde, p_hasta, p_desde_anterior, p_hasta_anterior, p_branch_id);
      v_modulos := v_modulos || jsonb_build_object(
        'codigo', 'pos',
        'neto', coalesce((v_x #>> '{actual,neto}')::numeric, 0),
        'neto_anterior', coalesce((v_x #>> '{anterior,neto}')::numeric, 0),
        'ventas_cobradas', coalesce((v_x #>> '{actual,ventas_cobradas}')::integer, 0),
        'ticket_promedio', coalesce((v_x #>> '{actual,ticket_promedio}')::numeric, 0),
        'monedas', coalesce(v_x -> 'monedas', '[]'::jsonb),
        'cajas_abiertas', (
          select count(*) from public.cash_sessions cs
           where cs.organization_id = p_organization_id and cs.status = 'open'
             and cs.branch_id = any (v_sucursales)),
        'cajas_de_dias_anteriores', (
          select count(*) from public.cash_sessions cs
           where cs.organization_id = p_organization_id and cs.status = 'open'
             and cs.branch_id = any (v_sucursales) and cs.opened_at < v_ini_hoy)
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'pos', 'error', true);
    end;
  end if;

  -- ── Inventario ────────────────────────────────────────────────────────────
  if 'inventory' = any (v_activos) and not ('inventory' = any (v_omitir)) and public.fn_caja_puede(p_organization_id, 'inventory.view') then
    begin
      v_x := public.fn_stock_listado(
        p_organization_id,
        case when p_branch_id is null then '{}'::jsonb
             else jsonb_build_object('sucursales', jsonb_build_array(p_branch_id)) end,
        0, 1);
      v_modulos := v_modulos || jsonb_build_object(
        'codigo', 'inventory',
        'productos', coalesce((v_x #>> '{kpis,productos}')::integer, 0),
        'agotados', coalesce((v_x #>> '{kpis,agotados}')::integer, 0),
        'bajo_minimo', coalesce((v_x #>> '{kpis,bajo_minimo}')::integer, 0),
        'negativos', coalesce((v_x #>> '{kpis,negativos}')::integer, 0),
        -- El valor del inventario va en la moneda base (costos de la organización).
        'valor', case when public.fn_caja_puede(p_organization_id, 'inventory.costs.view')
                      then coalesce((v_x #>> '{kpis,valor}')::numeric, 0) end,
        'moneda', v_moneda
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'inventory', 'error', true);
    end;
  end if;

  -- ── CRM (oportunidades de toda la organización: casi ninguna tiene sucursal)
  if 'crm' = any (v_activos) and not ('crm' = any (v_omitir)) and public.fn_caja_puede(p_organization_id, 'crm.opportunities.view') then
    begin
      v_modulos := v_modulos || (
        select jsonb_build_object(
          'codigo', 'crm',
          'abiertas', count(*) filter (where o.status = 'open'),
          'sin_tocar_7d', count(*) filter (
             where o.status = 'open'
               and coalesce(o.last_contact_at, o.updated_at, o.created_at) < now() - interval '7 days'),
          'ganadas_periodo', count(*) filter (
             where o.status = 'won' and o.closed_at >= p_desde and o.closed_at < p_hasta),
          'pipeline', coalesce((
             select jsonb_object_agg(moneda, total) from (
               select upper(coalesce(nullif(btrim(o2.currency), ''), v_moneda)) as moneda, sum(coalesce(o2.amount, 0)) as total
                 from public.opportunities o2
                where o2.organization_id = p_organization_id and o2.record_type = 'deal' and o2.status = 'open'
                group by 1) m), '{}'::jsonb),
          'clientes_nuevos', (
             select count(*) from public.customers c
              where c.organization_id = p_organization_id
                and c.created_at >= p_desde and c.created_at < p_hasta)
        )
          from public.opportunities o
         where o.organization_id = p_organization_id and o.record_type = 'deal'
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'crm', 'error', true);
    end;
  end if;

  -- ── RRHH ──────────────────────────────────────────────────────────────────
  if 'hrm' = any (v_activos) and not ('hrm' = any (v_omitir)) and public.fn_caja_puede(p_organization_id, 'hr.employees.view') then
    begin
      v_modulos := v_modulos || jsonb_build_object(
        'codigo', 'hrm',
        'personas_activas', (
          select count(*) from public.employments e
            join public.organization_members om on om.id = e.organization_member_id
           where om.organization_id = p_organization_id and e.status = 'active'
             and (p_branch_id is null or e.branch_id = p_branch_id)),
        'ausencias_por_aprobar', (
          select count(*) from public.leave_requests l
           where l.organization_id = p_organization_id and l.status = 'requested'),
        'ausentes_hoy', (
          select count(distinct l.employment_id) from public.leave_requests l
           where l.organization_id = p_organization_id and l.status in ('approved', 'taken')
             and v_hoy between l.start_date and l.end_date),
        'turnos_hoy', (
          select count(*) from public.shift_assignments sa
           where sa.organization_id = p_organization_id and sa.work_date = v_hoy
             and coalesce(sa.status, 'scheduled') not in ('cancelled', 'swapped')
             and (p_branch_id is null or sa.branch_id = p_branch_id))
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'hrm', 'error', true);
    end;
  end if;

  -- ── Hotel (PMS) ───────────────────────────────────────────────────────────
  if 'pms_hotel' = any (v_activos) and not ('pms_hotel' = any (v_omitir)) and public.fn_caja_puede(p_organization_id, 'pms.reservations.view') then
    begin
      v_modulos := v_modulos || (
        select jsonb_build_object(
          'codigo', 'pms_hotel',
          'llegadas_hoy', count(*) filter (where r.checkin = v_hoy and r.status in ('tentative', 'confirmed', 'checked_in', 'checked_out')),
          'llegadas_pendientes', count(*) filter (where r.checkin = v_hoy and r.status in ('tentative', 'confirmed')),
          'salidas_hoy', count(*) filter (where r.checkout = v_hoy and r.status in ('checked_in', 'checked_out')),
          'en_casa', count(*) filter (where r.status = 'checked_in'))
          from public.reservations r
         where r.organization_id = p_organization_id
           and (case when p_branch_id is null then (r.branch_id is null or r.branch_id = any (v_sucursales))
                     else r.branch_id = p_branch_id end)
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'pms_hotel', 'error', true);
    end;
  end if;

  -- ── Membresías (gimnasio) ─────────────────────────────────────────────────
  if 'memberships' = any (v_activos) and not ('memberships' = any (v_omitir)) and public.fn_caja_puede(p_organization_id, 'memberships.view') then
    begin
      v_modulos := v_modulos || (
        select jsonb_build_object(
          'codigo', 'memberships',
          'activas', count(*) filter (where m.status = 'active' and m.end_date >= now()),
          'por_vencer_7d', count(*) filter (where m.status = 'active' and m.end_date >= now() and m.end_date < v_ini_hoy + interval '8 days'),
          'en_mora', count(*) filter (where m.status = 'past_due'))
          from public.memberships m
         where m.organization_id = p_organization_id
           and (p_branch_id is null or m.branch_id is null or m.branch_id = p_branch_id)
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'memberships', 'error', true);
    end;
  end if;

  -- ── Logística ─────────────────────────────────────────────────────────────
  -- Las cifras del panel las calcula el servicio del módulo con las mismas reglas de
  -- Por despachar, Seguimiento y Cuadres (src/lib/dashboard/logisticaInicio.server.ts).
  -- Aquí solo se decide si la fila aparece: módulo activo, permiso de ver envíos y que
  -- la persona vea toda la operación (un domiciliario solo ve lo suyo: fn_logistica_ve_todo).
  if 'logistica' = any (v_activos) and not ('logistica' = any (v_omitir))
     and public.fn_caja_puede(p_organization_id, 'logistica.view')
     and public.fn_logistica_ve_todo(p_organization_id) then
    begin
      v_modulos := v_modulos || jsonb_build_object(
        'codigo', 'logistica',
        'hay_envios', exists (select 1 from public.shipments s where s.organization_id = p_organization_id));
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'logistica', 'error', true);
    end;
  end if;

  -- ── Transporte ────────────────────────────────────────────────────────────
  if 'transport' = any (v_activos) and not ('transport' = any (v_omitir))
     and (public.fn_caja_puede(p_organization_id, 'transporte.view')
          or public.fn_caja_puede(p_organization_id, 'transport.trips.view')) then
    begin
      v_modulos := v_modulos || (
        select jsonb_build_object(
          'codigo', 'transport',
          'viajes_hoy', count(*) filter (where coalesce(t.status, '') <> 'cancelled'),
          'en_curso', count(*) filter (where t.status in ('boarding', 'in_transit')),
          'retrasados', count(*) filter (where coalesce(t.delay_minutes, 0) > 0 and coalesce(t.status, '') <> 'cancelled'),
          'completados', count(*) filter (where t.status = 'completed'),
          -- ¿Hay algo que mostrar? Sin viajes ni vehículos nunca, el panel es el estado «Sin datos».
          'hay_viajes', exists (select 1 from public.trips t2 where t2.organization_id = p_organization_id),
          'hay_vehiculos', exists (select 1 from public.vehicles v where v.organization_id = p_organization_id))
          from public.trips t
         where t.organization_id = p_organization_id and t.trip_date = v_hoy
           and (p_branch_id is null or t.branch_id = p_branch_id)
      );
    exception
      when insufficient_privilege then null;
      when others then v_modulos := v_modulos || jsonb_build_object('codigo', 'transport', 'error', true);
    end;
  end if;

  return jsonb_build_object(
    'zona', v_zona,
    'dia', v_hoy,
    'moneda', v_moneda,
    'calculado_en', now(),
    'modulos', v_modulos
  );
end;
$function$;

-- ─── Widget «Ventas» del Inicio ─────────────────────────────────────────────
-- Cifras del panel desplegado de Ventas (todos los canales). Reutiliza la regla única de
-- «Todas las ventas» (`pos_ventas_filtradas`: canal y estado de cada venta) y la de pedidos
-- web por atender (`fn_inicio_pedidos_web_pendientes`); aquí solo se agrega. Ventas
-- «efectivas» = ni anuladas ni borradores, el mismo criterio de `pos_ventas_cifras`.
--   periodo / anterior : el periodo del selector del Inicio y el anterior equivalente.
--   hoy / semana       : hoy (rango que manda el servidor con la regla del Inicio) y el mismo
--                        día de la semana pasada hasta esta misma hora.
--   por_canal / por_sede (del periodo), pedidos por atender y si hubo alguna venta.
create or replace function public.fn_inicio_ventas_widget(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_desde_anterior timestamptz,
  p_hasta_anterior timestamptz,
  p_hoy_desde timestamptz,
  p_hoy_hasta timestamptz,
  p_branch_id integer default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sucursales integer[];
  v_corte timestamptz;
  v_periodo jsonb;
  v_por_canal jsonb;
  v_por_sede jsonb;
  v_anterior jsonb;
  v_hoy jsonb;
  v_semana jsonb;
  v_pedidos jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
     or p_desde_anterior is null or p_hasta_anterior is null or p_hasta_anterior <= p_desde_anterior
     or p_hoy_desde is null or p_hoy_hasta is null or p_hoy_hasta <= p_hoy_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' or p_hoy_hasta - p_hoy_desde > interval '2 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Quien vende ve lo vendido (la misma regla que pos_ventas_cifras y fn_inicio_ventas_rango).
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);
  v_corte := least(now(), p_hoy_hasta);

  with f as materialized (
    select x.canal, x.branch_id, x.total
      from public.pos_ventas_filtradas(
        p_organization_id, v_sucursales, p_desde, p_hasta, null, null, null, null, null, null,
        null, null, null, false, false, false, null) x
     where x.estado not in ('anulada', 'borrador')
  )
  select jsonb_build_object(
           'ventas', round(coalesce((select sum(total) from f), 0), 2),
           'efectivas', (select count(*) from f),
           'ticket_promedio', case when (select count(*) from f) > 0
                                   then round((select sum(total) from f) / (select count(*) from f), 2) else 0 end),
         coalesce((select jsonb_agg(jsonb_build_object('canal', g.canal, 'ventas', g.v, 'efectivas', g.n) order by g.v desc, g.canal)
                     from (select canal, count(*) as n, round(coalesce(sum(total), 0), 2) as v from f group by canal) g), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', g.branch_id, 'nombre', b.name, 'ventas', g.v, 'efectivas', g.n) order by g.v desc, b.name)
                     from (select branch_id, count(*) as n, round(coalesce(sum(total), 0), 2) as v from f group by branch_id) g
                     join public.branches b on b.id = g.branch_id), '[]'::jsonb)
    into v_periodo, v_por_canal, v_por_sede;

  select jsonb_build_object('ventas', round(coalesce(sum(x.total), 0), 2), 'efectivas', count(*))
    into v_anterior
    from public.pos_ventas_filtradas(
      p_organization_id, v_sucursales, p_desde_anterior, p_hasta_anterior, null, null, null, null, null, null,
      null, null, null, false, false, false, null) x
   where x.estado not in ('anulada', 'borrador');

  if p_hoy_desde = p_desde and p_hoy_hasta = p_hasta then
    v_hoy := v_periodo - 'ticket_promedio';
  else
    select jsonb_build_object('ventas', round(coalesce(sum(x.total), 0), 2), 'efectivas', count(*))
      into v_hoy
      from public.pos_ventas_filtradas(
        p_organization_id, v_sucursales, p_hoy_desde, p_hoy_hasta, null, null, null, null, null, null,
        null, null, null, false, false, false, null) x
     where x.estado not in ('anulada', 'borrador');
  end if;

  select jsonb_build_object('ventas', round(coalesce(sum(x.total), 0), 2), 'efectivas', count(*))
    into v_semana
    from public.pos_ventas_filtradas(
      p_organization_id, v_sucursales, p_hoy_desde - interval '7 days', v_corte - interval '7 days', null, null, null, null, null, null,
      null, null, null, false, false, false, null) x
   where x.estado not in ('anulada', 'borrador');

  begin
    v_pedidos := public.fn_inicio_pedidos_web_pendientes(p_organization_id, p_branch_id, 30);
  exception
    when others then v_pedidos := null;
  end;

  return jsonb_build_object(
    'moneda', upper(public.fn_moneda_base_organizacion(p_organization_id)),
    'periodo', v_periodo,
    'anterior', v_anterior,
    'hoy', v_hoy,
    'semana', v_semana,
    'por_canal', v_por_canal,
    'por_sede', v_por_sede,
    'sucursales', coalesce(array_length(v_sucursales, 1), 0),
    'pedidos', v_pedidos,
    'hay_ventas', exists (select 1 from public.sales s
                           where s.organization_id = p_organization_id and s.branch_id = any (v_sucursales)),
    'calculado_en', now());
end;
$function$;

revoke all on function public.fn_inicio_ventas_widget(integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_inicio_ventas_widget(integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, integer) to authenticated, service_role;
