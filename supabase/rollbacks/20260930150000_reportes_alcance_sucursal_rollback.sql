-- Revierte 20260930150000_reportes_alcance_sucursal.sql.
-- Quita la llamada a reporte_exigir_alcance_sucursal de cada fn_reporte_* y
-- borra la función. Vuelve a la guarda solo de pertenencia: un gerente de una
-- sucursal podrá otra vez pedir el consolidado o la sucursal de otro.
-- No toca datos.

do $rollback$
declare
  r record;
  v_def text;
  v_nueva text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fn_reporte\_%'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when position('reporte_exigir_alcance_sucursal' in v_def) = 0;

    v_nueva := regexp_replace(
      v_def,
      '\n\n  -- Alcance de sucursal \(ver reporte_exigir_alcance_sucursal\)\.\n  PERFORM public\.reporte_exigir_alcance_sucursal\(p_organization_id, (p_branch_id|NULL)\);',
      ''
    );

    if v_nueva = v_def then
      raise exception 'No se reconoce la llamada insertada en %', r.proname;
    end if;

    execute v_nueva;
  end loop;
end;
$rollback$;

drop function if exists public.reporte_exigir_alcance_sucursal(bigint, bigint);
