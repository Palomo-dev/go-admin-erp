-- Devuelve la guarda anterior: pertenencia a la organización, sin rol.
-- No reabre periodos ni borra asientos de cierre.

do $mig$
declare
  v_sql text;
  v_name text;
  v_nuevo text := 'perform public.fn_assert_acceso_org(p_organization_id);';
  v_viejo text := 'perform public.fn_finanzas_exigir_permiso(p_organization_id, array[''accounting.reverse'']);';
  v_veces integer;
begin
  foreach v_name in array array['fn_cierre_periodo','fn_reabrir_periodo','fn_cierre_ejercicio']
  loop
    select pg_get_functiondef(p.oid) into v_sql
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    v_veces := (length(v_sql) - length(replace(v_sql, v_viejo, ''))) / length(v_viejo);
    if v_veces <> 1 then
      raise exception 'guarda_inesperada % %', v_name, v_veces;
    end if;
    execute replace(v_sql, v_viejo, v_nuevo);
  end loop;
end
$mig$;
