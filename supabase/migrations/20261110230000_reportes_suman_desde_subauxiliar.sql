-- Reportes contables: el subauxiliar de 10 dígitos se ve y suma hacia arriba (pedido del Contador, 2026-11-10).
--
-- ESTADO: APLICADA el 2026-11-10 (registro 20261110212235) por el MCP con el OK del dueño.
-- md5 de prosrc tras aplicar: fn_libro_mayor_balances a7ccafc3…, fn_libro_inventarios_balances 6b0205fa…,
-- fn_auxiliar_tercero 9500fdd0…. Firma, SECURITY DEFINER, search_path y GRANT sin cambios.
-- Va después de 20261110210000_plan_cuentas_traslado_completo (tope de 10 dígitos en el plan).
-- Reversión: supabase/rollbacks/20261110230000_reportes_suman_desde_subauxiliar_rollback.sql.
-- md5 de prosrc ANTES de aplicar: fn_libro_mayor_balances 80e5cf47…, fn_libro_inventarios_balances c2e502b4…,
-- fn_auxiliar_tercero 29e9b047….
--
-- «Los reportes, el balance de prueba y la exógena deben sumar bien hacia arriba desde los 10 dígitos.»
-- Revisión de las funciones de reporte (prueba en seco en org 374 con la cadena
-- 1110 → 111005 → 11100501 → 1110050101 y un asiento manual publicado de 12.345,67 contra 4135):
--   · fn_reporte_balance_prueba, fn_saldos_cuentas, fn_plan_saldos, fn_ef_movimientos, fn_reporte_balance_general,
--     fn_reporte_estado_resultados: agrupan por la cuenta exacta de la línea (la hoja); la suma por prefijo
--     da el importe en 1110050101, 11100501, 111005, 1110, 11 y 1. Bien.
--   · fn_saldos_jerarquicos: suma por prefijo y nombra el nivel por largo (10 → «subauxiliar»). Bien.
--   · fn_auxiliar_tercero_detalle, fn_cartera_mayor_al_corte, fn_tributario_borrador_iva (2408%): por prefijo. Bien.
--   · Las demás (resultados por centro, desglose, gastos por naturaleza, cambios en el patrimonio, flujo de
--     efectivo, cierre) solo cortan en 1 o 2 dígitos. Bien.
-- Lo que falla y corrige esta migración:
--   1. fn_libro_mayor_balances y fn_libro_inventarios_balances aceptan p_largo solo en (1,)2,4,6,8: con 10
--      caían EN SILENCIO al largo 4, así que el libro no podía mostrar el subauxiliar (la suma hacia
--      arriba en 8, 6, 4, 2 sí era correcta). Ahora aceptan 1, 2, 4, 6, 8 y 10. El inventarios gana además
--      el largo 1 (clase), que el mayor ya tenía.
--   2. fn_auxiliar_tercero (resumen del auxiliar por tercero, la vista a la que cae la pantalla cuando el
--      detalle no está) filtraba la cuenta por igualdad: pedir el auxiliar 11100501 —cuenta de título desde
--      que tiene subauxiliares— devolvía 0 filas, aunque la pantalla dice «prefijo, p. ej. 1305». Ahora filtra
--      por prefijo, igual que fn_auxiliar_tercero_detalle; cada fila sigue siendo NIT + cuenta de movimiento.
-- Exógena: no hay función ni reporte de exógena en la base ni en el código (la obligación existe en el
-- calendario tributario con fuente «ninguna»). La cuenta de 10 dígitos hereda concepto_exogena del padre en
-- fn_plan_crear_cuenta_hija; cuando se construya el reporte, debe leer concepto_exogena de la hoja.
--
-- Solo se reemplazan cuerpos: misma firma, mismo SECURITY DEFINER y search_path. Los GRANT se conservan.

create or replace function public.fn_libro_mayor_balances(p_organization_id integer, p_desde date, p_hasta date, p_largo integer default 4)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  -- 10 = subauxiliar (tope del plan). Antes un 10 caía en silencio al largo 4.
  v_largo integer := case when p_largo in (1, 2, 4, 6, 8, 10) then p_largo else 4 end;
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
  -- 1 = clase y 10 = subauxiliar (tope del plan). Antes caían en silencio al largo 4.
  v_largo integer := case when p_largo in (1, 2, 4, 6, 8, 10) then p_largo else 4 end;
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
  v_cuenta text := nullif(btrim(coalesce(p_cuenta, '')), '');
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
     -- Por prefijo, como fn_auxiliar_tercero_detalle: el auxiliar 11100501 trae sus subauxiliares.
     and (v_cuenta is null or jl.account_code like v_cuenta || '%')
   group by coalesce(jl.tercero_nit, ''), jl.account_code
   order by 1, 3
   limit v_limite;
end;
$function$;
