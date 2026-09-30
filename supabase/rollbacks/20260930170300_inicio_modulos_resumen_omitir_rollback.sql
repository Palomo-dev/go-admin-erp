-- Reversión de 20260930170300_inicio_modulos_resumen_omitir.sql: vuelve a la
-- versión de seis argumentos (cuerpo exacto de 20260930170200). No toca datos.
-- Antes de aplicarla, desplegar un código que no mande `p_omitir`.

drop function if exists public.fn_inicio_modulos_resumen(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer, text[]);

create or replace function public.fn_inicio_modulos_resumen(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_desde_anterior timestamptz,
  p_hasta_anterior timestamptz,
  p_branch_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
  if 'finance' = any (v_activos) and public.fn_caja_puede(p_organization_id, 'finance.view') then
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
  if 'pos' = any (v_activos)
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
  if 'inventory' = any (v_activos) and public.fn_caja_puede(p_organization_id, 'inventory.view') then
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
  if 'crm' = any (v_activos) and public.fn_caja_puede(p_organization_id, 'crm.opportunities.view') then
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
  if 'hrm' = any (v_activos) and public.fn_caja_puede(p_organization_id, 'hr.employees.view') then
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
  if 'pms_hotel' = any (v_activos) and public.fn_caja_puede(p_organization_id, 'pms.reservations.view') then
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
  if 'memberships' = any (v_activos) and public.fn_caja_puede(p_organization_id, 'memberships.view') then
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

  -- ── Transporte ────────────────────────────────────────────────────────────
  if 'transport' = any (v_activos) and public.fn_caja_puede(p_organization_id, 'transport.trips.view') then
    begin
      v_modulos := v_modulos || (
        select jsonb_build_object(
          'codigo', 'transport',
          'viajes_hoy', count(*) filter (where coalesce(t.status, '') <> 'cancelled'),
          'en_curso', count(*) filter (where t.status in ('boarding', 'in_transit')),
          'retrasados', count(*) filter (where coalesce(t.delay_minutes, 0) > 0 and coalesce(t.status, '') <> 'cancelled'),
          'completados', count(*) filter (where t.status = 'completed'))
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
$$;

comment on function public.fn_inicio_modulos_resumen(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) is
  'Resumen por módulo del inicio (filas plegadas y panel desplegado): solo módulos activos y con permiso de lectura, sucursal del header, zona de la organización, sin sumar monedas distintas.';

revoke all on function public.fn_inicio_modulos_resumen(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_inicio_modulos_resumen(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) to authenticated, service_role;
