-- Endurece el gancho de 20261027210000: en el alta de una organización (trigger tr_zzz_categorias_tesoreria)
-- la siembra de subcategorías de impuestos NUNCA puede tumbar el alta (fn_puc_asegurar_cuenta hace ALTER TABLE
-- y puede chocar con eventos de trigger pendientes en chart_of_accounts). Si falla, avisa con WARNING y la org
-- queda sin subcategorías (se pueden sembrar luego con fn_tesoreria_sembrar_impuestos(org)). APLICADA en prod.
-- Rollback: supabase/rollbacks/20261027210500_tesoreria_impuestos_siembra_segura_rollback.sql
do $do$
declare
  v_def text := pg_get_functiondef('public.fn_sembrar_categorias_tesoreria'::regproc);
  v_viejo text := E'  perform public.fn_tesoreria_sembrar_impuestos(p_org);\n';
  v_nuevo text := E'  begin\n    perform public.fn_tesoreria_sembrar_impuestos(p_org);\n  exception when others then\n    raise warning ''fn_tesoreria_sembrar_impuestos(%) falló: %'', p_org, sqlerrm;\n  end;\n';
begin
  if position('raise warning ''fn_tesoreria_sembrar_impuestos' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontró el gancho de fn_tesoreria_sembrar_impuestos';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end;
$do$;
