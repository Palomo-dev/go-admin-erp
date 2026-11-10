-- Reversión de 20261110230000_reportes_suman_desde_subauxiliar.sql.
--
-- Devuelve los tres cuerpos a su versión anterior (md5 de prosrc: fn_libro_mayor_balances 80e5cf47…,
-- fn_libro_inventarios_balances c2e502b4…, fn_auxiliar_tercero 29e9b047…). Misma firma: los GRANT no cambian.
-- Efecto: el largo 10 vuelve a caer en silencio al 4 en los libros y el resumen del auxiliar por tercero
-- vuelve a filtrar la cuenta por igualdad.

create or replace function public.fn_libro_mayor_balances(p_organization_id integer, p_desde date, p_hasta date, p_largo integer default 4)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  v_largo integer := case when p_largo in (1, 2, 4, 6, 8) then p_largo else 4 end;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.ini, r.fin into v_ini, v_fin from public.fn_ef_rango(p_organization_id, p_desde, p_hasta) r;
  return (
    with antes as (
      select left(m.cod, v_largo) as codigo, sum(m.debitos - m.creditos) as saldo
        from public.fn_ef_movimientos(p_organization_id, null, v_ini, false) m group by 1
    ), per as (
      select left(m.cod, v_largo) as codigo, sum(m.debitos) as debitos, sum(m.creditos) as creditos
        from public.fn_ef_movimientos(p_organization_id, v_ini, v_fin, false) m group by 1
    ), filas as (
      select coalesce(a.codigo, p.codigo) as codigo, coalesce(a.saldo, 0) as inicial,
             coalesce(p.debitos, 0) as debitos, coalesce(p.creditos, 0) as creditos
        from antes a full join per p on p.codigo = a.codigo
    )
    select jsonb_build_object(
      'filas', coalesce(jsonb_agg(jsonb_build_object(
        'codigo', f.codigo,
        'nombre', (select c.name from public.chart_of_accounts c
                    where c.organization_id = p_organization_id and replace(c.account_code, '-', '') = f.codigo limit 1),
        'inicial', round(f.inicial, 2), 'debitos', round(f.debitos, 2), 'creditos', round(f.creditos, 2),
        'final', round(f.inicial + f.debitos - f.creditos, 2)
      ) order by f.codigo) filter (where f.inicial <> 0 or f.debitos <> 0 or f.creditos <> 0), '[]'::jsonb),
      'debitos', round(coalesce(sum(f.debitos), 0), 2),
      'creditos', round(coalesce(sum(f.creditos), 0), 2)
    ) from filas f
  );
end;
$function$;

create or replace function public.fn_libro_inventarios_balances(p_organization_id integer, p_corte date, p_largo integer default 4)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fin timestamptz;
  v_largo integer := case when p_largo in (2, 4, 6, 8) then p_largo else 4 end;
begin
  perform public.fn_ef_exigir_lectura(p_organization_id);
  select r.fin into v_fin from public.fn_ef_rango(p_organization_id, p_corte, p_corte) r;
  return (
    with mov as (select m.cod, m.creditos - m.debitos as neto
                   from public.fn_ef_movimientos(p_organization_id, null, v_fin, false) m),
    filas as (
      select left(m.cod, v_largo) as codigo,
             sum(case when m.cod like '1%' then -m.neto else m.neto end) as saldo
        from mov m where left(m.cod, 1) in ('1', '2', '3') group by 1
    )
    select jsonb_build_object(
      'corte', p_corte,
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', f.codigo,
        'nombre', (select c.name from public.chart_of_accounts c
                    where c.organization_id = p_organization_id and replace(c.account_code, '-', '') = f.codigo limit 1),
        'saldo', round(f.saldo, 2)
      ) order by f.codigo) from filas f where abs(f.saldo) >= 0.005), '[]'::jsonb),
      'activo', round(coalesce((select sum(saldo) from filas where codigo like '1%'), 0), 2),
      'pasivo', round(coalesce((select sum(saldo) from filas where codigo like '2%'), 0), 2),
      'patrimonio', round(coalesce((select sum(saldo) from filas where codigo like '3%'), 0), 2),
      'resultado_abierto', round(coalesce((select sum(neto) from mov where left(cod, 1) in ('4', '5', '6', '7')), 0), 2),
      'activos_fijos', (select count(*) from public.fixed_assets a where a.organization_id = p_organization_id)
    )
  );
end;
$function$;

create or replace function public.fn_auxiliar_tercero(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_cuenta text default null::text, p_limite integer default 500)
 returns table(tercero_nit text, tercero_nombre text, account_code text, debit numeric, credit numeric)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 500), 1), 2000);
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return query
  select coalesce(jl.tercero_nit, ''),
         coalesce(max(jl.tercero_nombre), ''),
         jl.account_code,
         coalesce(sum(jl.debit), 0),
         coalesce(sum(jl.credit), 0)
    from public.journal_lines jl
    join public.journal_entries je
      on je.id = jl.journal_entry_id
     and je.organization_id = p_organization_id
   where jl.organization_id = p_organization_id
     and je.posted is true
     and je.entry_date >= p_desde
     and je.entry_date <= p_hasta
     and (p_cuenta is null or p_cuenta = '' or jl.account_code = p_cuenta)
   group by coalesce(jl.tercero_nit, ''), jl.account_code
   order by 1, 3
   limit v_limite;
end;
$function$;
