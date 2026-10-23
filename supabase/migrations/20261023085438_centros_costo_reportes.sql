create or replace function public.fn_estado_resultados_centro(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_centro uuid default null,
  p_incluir_hijos boolean default true
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_centros jsonb;
  v_sin jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  if auth.uid() is not null then
    perform public.reporte_exigir_alcance_sucursal(p_organization_id, null::bigint);
  end if;

  with recursive movimientos as (
    select jl.cost_center_id as centro_id,
           case
             when ca.type = 'income' then 'ingreso'
             when left(ca.account_code, 1) in ('6', '7') then 'costo'
             else 'gasto'
           end as rubro,
           case when ca.type = 'income' then -1 else 1 end * (
             public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
             - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)
           ) as monto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      join public.chart_of_accounts ca
        on ca.account_code = jl.account_code
       and ca.organization_id = p_organization_id
     where je.organization_id = p_organization_id
       and je.entry_date >= p_from
       and je.entry_date <= p_to
       and je.posted
       and ca.type in ('income', 'expense')
  ),
  propios as (
    select centro_id,
           coalesce(sum(monto) filter (where rubro = 'ingreso'), 0) as ingresos,
           coalesce(sum(monto) filter (where rubro = 'costo'), 0) as costos,
           coalesce(sum(monto) filter (where rubro = 'gasto'), 0) as gastos
      from movimientos
     group by centro_id
  ),
  arbol as (
    select c.id as raiz, c.id as nodo, 0 as profundidad
      from public.cost_centers c
     where c.organization_id = p_organization_id
    union all
    select a.raiz, h.id, a.profundidad + 1
      from arbol a
      join public.cost_centers h
        on h.parent_id = a.nodo
       and h.organization_id = p_organization_id
     where a.nodo is not null
       and a.profundidad < 50
  ),
  acumulado as (
    select a.raiz as centro_id,
           coalesce(sum(p.ingresos), 0) as ingresos,
           coalesce(sum(p.costos), 0) as costos,
           coalesce(sum(p.gastos), 0) as gastos
      from arbol a
      left join propios p on p.centro_id = a.nodo
     group by a.raiz
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'centro_id', c.id,
           'codigo', c.code,
           'nombre', c.name,
           'parent_id', c.parent_id,
           'ingresos', coalesce(pr.ingresos, 0),
           'costos', coalesce(pr.costos, 0),
           'gastos', coalesce(pr.gastos, 0),
           'utilidad', coalesce(pr.ingresos, 0) - coalesce(pr.costos, 0) - coalesce(pr.gastos, 0),
           'acumulado_ingresos', coalesce(ac.ingresos, 0),
           'acumulado_costos', coalesce(ac.costos, 0),
           'acumulado_gastos', coalesce(ac.gastos, 0),
           'acumulado_utilidad', coalesce(ac.ingresos, 0) - coalesce(ac.costos, 0) - coalesce(ac.gastos, 0)
         ) order by c.code), '[]'::jsonb)
    into v_centros
    from public.cost_centers c
    left join propios pr on pr.centro_id = c.id
    left join acumulado ac on ac.centro_id = c.id
   where c.organization_id = p_organization_id
     and (
       p_centro is null
       or c.id = p_centro
       or (
         coalesce(p_incluir_hijos, true)
         and c.id in (
           with recursive hijos as (
             select h.id, 1 as profundidad from public.cost_centers h
              where h.parent_id = p_centro and h.organization_id = p_organization_id
             union all
             select h.id, x.profundidad + 1 from public.cost_centers h
             join hijos x on h.parent_id = x.id
            where h.organization_id = p_organization_id
              and x.profundidad < 50
           )
           select id from hijos
         )
       )
     );

  select jsonb_build_object(
           'centro_id', null,
           'codigo', null,
           'nombre', 'Sin centro',
           'ingresos', coalesce(sum(ingresos), 0),
           'costos', coalesce(sum(costos), 0),
           'gastos', coalesce(sum(gastos), 0),
           'utilidad', coalesce(sum(ingresos), 0) - coalesce(sum(costos), 0) - coalesce(sum(gastos), 0)
         )
    into v_sin
    from (
      select coalesce(sum(monto) filter (where rubro = 'ingreso'), 0) as ingresos,
             coalesce(sum(monto) filter (where rubro = 'costo'), 0) as costos,
             coalesce(sum(monto) filter (where rubro = 'gasto'), 0) as gastos
        from (
          select case
                   when ca.type = 'income' then 'ingreso'
                   when left(ca.account_code, 1) in ('6', '7') then 'costo'
                   else 'gasto'
                 end as rubro,
                 case when ca.type = 'income' then -1 else 1 end * (
                   public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
                   - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)
                 ) as monto
            from public.journal_lines jl
            join public.journal_entries je on je.id = jl.journal_entry_id
            join public.chart_of_accounts ca
              on ca.account_code = jl.account_code
             and ca.organization_id = p_organization_id
           where je.organization_id = p_organization_id
             and je.entry_date >= p_from
             and je.entry_date <= p_to
             and je.posted
             and ca.type in ('income', 'expense')
             and jl.cost_center_id is null
        ) s
    ) t;

  return jsonb_build_object(
    'centros', v_centros,
    'sin_centro', v_sin
  );
end;
$fn$;

create or replace function public.fn_comparativo_centros(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_centros uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_columnas jsonb;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  if auth.uid() is not null then
    perform public.reporte_exigir_alcance_sucursal(p_organization_id, null::bigint);
  end if;

  with movimientos as (
    select coalesce(jl.cost_center_id::text, 'sin_centro') as clave,
           case
             when ca.type = 'income' then 'ingresos'
             when left(ca.account_code, 1) in ('6', '7') then 'costos'
             else 'gastos'
           end as rubro,
           case when ca.type = 'income' then -1 else 1 end * (
             public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
             - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)
           ) as monto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      join public.chart_of_accounts ca
        on ca.account_code = jl.account_code
       and ca.organization_id = p_organization_id
     where je.organization_id = p_organization_id
       and je.entry_date >= p_from
       and je.entry_date <= p_to
       and je.posted
       and ca.type in ('income', 'expense')
  ),
  columnas as (
    select c.id::text as clave, c.code as codigo, c.name as nombre, c.code as orden
      from public.cost_centers c
     where c.organization_id = p_organization_id
       and (p_centros is null or c.id = any (p_centros))
    union all
    select 'sin_centro', null, 'Sin centro', 'zzzz'
  ),
  rubros as (
    select * from (values ('ingresos'), ('costos'), ('gastos'), ('utilidad')) as r(rubro)
  ),
  celdas as (
    select col.clave, col.codigo, col.nombre, col.orden, ru.rubro,
           case ru.rubro
             when 'utilidad' then
               coalesce(sum(m.monto) filter (where m.rubro = 'ingresos'), 0)
               - coalesce(sum(m.monto) filter (where m.rubro = 'costos'), 0)
               - coalesce(sum(m.monto) filter (where m.rubro = 'gastos'), 0)
             else coalesce(sum(m.monto) filter (where m.rubro = ru.rubro), 0)
           end as monto
      from columnas col
      cross join rubros ru
      left join movimientos m on m.clave = col.clave
     group by col.clave, col.codigo, col.nombre, col.orden, ru.rubro
  )
  select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'codigo', codigo, 'nombre', nombre) order by orden), '[]'::jsonb)
    into v_columnas
    from (select distinct clave, codigo, nombre, orden from columnas) c;

  select coalesce(jsonb_agg(jsonb_build_object(
           'rubro', rubro,
           'montos', montos,
           'total', total
         ) order by case rubro when 'ingresos' then 1 when 'costos' then 2 when 'gastos' then 3 else 4 end), '[]'::jsonb)
    into v_filas
    from (
      select rubro,
             jsonb_object_agg(clave, monto) as montos,
             sum(monto) as total
        from celdas
       group by rubro
    ) f;

  return jsonb_build_object('columnas', v_columnas, 'filas', v_filas);
end;
$fn$;

revoke all on function public.fn_repartir_monto(integer, integer, text, uuid, uuid, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.fn_distribucion_linea_org() from public, anon;
revoke all on function public.fn_distribucion_suma_100() from public, anon;
revoke all on function public.fn_journal_linea_heredar_centro() from public, anon;
revoke all on function public.fn_estado_resultados_centro(bigint, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke all on function public.fn_comparativo_centros(bigint, timestamptz, timestamptz, uuid[]) from public, anon;

grant execute on function public.fn_distribucion_linea_org() to authenticated, service_role;
grant execute on function public.fn_distribucion_suma_100() to authenticated, service_role;
grant execute on function public.fn_journal_linea_heredar_centro() to authenticated, service_role;
grant execute on function public.fn_estado_resultados_centro(bigint, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
grant execute on function public.fn_comparativo_centros(bigint, timestamptz, timestamptz, uuid[]) to authenticated, service_role;

do $grants$
declare
  v_firma regprocedure;
begin
  foreach v_firma in array array[
    'public.fn_repartir_monto(integer,integer,text,uuid,uuid,numeric,numeric,numeric,numeric)'::regprocedure,
    'public.fn_journal_linea_heredar_centro()'::regprocedure,
    'public.fn_estado_resultados_centro(bigint,timestamptz,timestamptz,uuid,boolean)'::regprocedure,
    'public.fn_comparativo_centros(bigint,timestamptz,timestamptz,uuid[])'::regprocedure
  ]
  loop
    execute format('grant execute on function %s to %I, postgres, service_role', v_firma, current_user);
  end loop;
end
$grants$;

do $prueba$
declare
  v_a uuid;
  v_b uuid;
  v_dist uuid;
  v_cuenta text;
  v_na text;
  v_n integer;
  v_suma numeric;
  v_centro uuid;
begin
  select c.id into v_a from public.cost_centers c where c.organization_id = 140 and c.code = '100';
  select c.id into v_b
    from public.cost_centers c
   where c.organization_id = 140 and c.code <> '100' and c.is_active
   order by c.code
   limit 1;
  if v_a is null or v_b is null then
    raise exception 'la org 140 no tiene dos centros para probar el reparto';
  end if;
  select a.account_code into v_cuenta
    from public.chart_of_accounts a
   where a.organization_id = 140 and a.centro_costo_modo = 'obligatorio'
   order by a.account_code
   limit 1;
  select a.account_code into v_na
    from public.chart_of_accounts a
   where a.organization_id = 140 and a.centro_costo_modo = 'no_aplica'
   order by a.account_code
   limit 1;
  insert into public.cost_center_distributions (organization_id, nombre, activo)
  values (140, 'prueba-reparto', true)
  returning id into v_dist;
  insert into public.cost_center_distribution_lines (distribution_id, cost_center_id, porcentaje)
  values (v_dist, v_a, 60), (v_dist, v_b, 40);
  select count(*), coalesce(sum(r.debito), 0)
    into v_n, v_suma
    from public.fn_repartir_monto(140, null::integer, v_cuenta, null::uuid, v_dist, 100, 0, 100, 0) r;
  if v_n <> 2 or v_suma <> 100 then
    raise exception 'reparto 60/40 no cuadra: % filas, suma %', v_n, v_suma;
  end if;
  select r.cost_center_id into v_centro
    from public.fn_repartir_monto(140, null::integer, v_na, v_a, v_dist, 10, 0, 10, 0) r
   limit 1;
  if v_centro is not null then
    raise exception 'una cuenta no_aplica recibió centro';
  end if;
  delete from public.cost_center_distributions where id = v_dist;
end
$prueba$;
