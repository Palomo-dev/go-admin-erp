-- Presupuesto contra lo real. La versión anterior sumaba borradores, comparaba solo el código
-- exacto (un presupuesto en 5105 quedaba en cero si el gasto estaba en un auxiliar) y contaba el
-- asiento de cierre como movimiento real. Ahora:
--  * solo presupuestos aprobados (approved, active o closed; draft nunca);
--  * lo real sale del mayor, sumado por prefijo de la cuenta presupuestada y sin cierre;
--  * lo que tiene movimiento y no está presupuestado se conserva, solo en cuentas de resultado.
-- budget_lines.actual_amount no se usa: el mayor es la única fuente de lo real.
create or replace function public.fn_reporte_presupuesto_vs_real(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org integer := p_organization_id::integer;
  v_tiene_presupuesto boolean;
  v_borradores integer;
  v_repetidos boolean;
  v_tz text;
  v_mes_desde date;
  v_mes_hasta date;
  v_detalle jsonb;
begin
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  if not exists (
    select 1 from public.organization_members om
    where om.user_id = (select auth.uid())
      and om.organization_id = p_organization_id
      and om.is_active = true
  ) then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;

  -- Alcance de sucursal (ver reporte_exigir_alcance_sucursal).
  perform public.reporte_exigir_alcance_sucursal(p_organization_id, null);

  select exists (select 1 from public.budgets b
                  where b.organization_id = v_org and b.status in ('approved', 'active', 'closed')),
         (select count(*) from public.budgets b where b.organization_id = v_org and b.status = 'draft'),
         exists (select 1 from public.budgets b
                  where b.organization_id = v_org and b.status in ('approved', 'active', 'closed')
                  group by b.fiscal_year having count(*) > 1)
    into v_tiene_presupuesto, v_borradores, v_repetidos;

  v_tz := coalesce(public.fn_timezone_for(v_org, null), 'America/Bogota');
  v_mes_desde := date_trunc('month', p_from at time zone v_tz)::date;
  v_mes_hasta := date_trunc('month', p_to at time zone v_tz)::date;

  with reales as (
    select m.account_code, m.cod, m.debitos - m.creditos as neto
      from public.fn_ef_movimientos(v_org, p_from, p_to + interval '1 microsecond', true) m
     where left(m.cod, 1) in ('4', '5', '6', '7')
  ), presupuestos as (
    select bl.account_code, replace(btrim(bl.account_code), '-', '') as cod,
           coalesce(sum(bl.planned_amount), 0) as presupuesto
      from public.budget_lines bl
      join public.budgets b on b.id = bl.budget_id and b.organization_id = v_org
     where bl.organization_id = v_org
       and b.status in ('approved', 'active', 'closed')
       and (
         (bl.period between 1 and 12
           and make_date(b.fiscal_year, bl.period, 1) between v_mes_desde and v_mes_hasta)
         or (bl.period is null
           and make_date(b.fiscal_year, 1, 1) >= v_mes_desde
           and make_date(b.fiscal_year, 12, 1) <= v_mes_hasta)
       )
     group by bl.account_code
  ), filas as (
    select p.account_code, p.presupuesto,
           coalesce((select sum(r.neto) from reales r where r.cod like p.cod || '%'), 0) as neto,
           exists (select 1 from presupuestos o where o.cod <> p.cod and p.cod like o.cod || '%') as solapada,
           true as presupuestada
      from presupuestos p
    union all
    select r.account_code, 0, r.neto, false, false
      from reales r
     where abs(r.neto) >= 0.005
       and not exists (select 1 from presupuestos p where r.cod like p.cod || '%')
  ), vista as (
    select f.account_code, f.presupuesto, f.solapada, f.presupuestada,
           coalesce(ca.name, f.account_code) as nombre,
           coalesce(ca.type, case when f.account_code like '4%' then 'income' else 'expense' end) as tipo,
           case when coalesce(ca.type, case when f.account_code like '4%' then 'income' else 'expense' end) = 'income'
                then -1 else 1 end * f.neto as real_mayor
      from filas f
      left join public.chart_of_accounts ca
        on ca.organization_id = v_org and ca.account_code = f.account_code
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta', v.account_code,
           'nombre', v.nombre,
           'tipo', v.tipo,
           'presupuesto', v.presupuesto,
           'real', v.real_mayor,
           'diferencia', v.real_mayor - v.presupuesto,
           'variacion', case when v.presupuesto <> 0
                             then round((v.real_mayor - v.presupuesto) / v.presupuesto * 100, 2) end,
           'presupuestada', v.presupuestada,
           'solapada', v.solapada
         ) order by v.account_code), '[]'::jsonb)
    into v_detalle
    from vista v;

  return jsonb_build_object(
    'tiene_presupuesto', v_tiene_presupuesto,
    'borradores', v_borradores,
    'varios_por_anio', v_repetidos,
    'detalle', v_detalle
  );
end;
$function$;
