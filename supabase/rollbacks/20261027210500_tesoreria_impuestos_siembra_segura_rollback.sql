-- Rollback de 20261027210500: vuelve al gancho sin manejo de errores (o usa el rollback de 20261027210000 para quitarlo).
begin;
do $do$
declare v_def text := pg_get_functiondef('public.fn_sembrar_categorias_tesoreria'::regproc);
begin
  execute replace(v_def,
    E'  begin\n    perform public.fn_tesoreria_sembrar_impuestos(p_org);\n  exception when others then\n    raise warning ''fn_tesoreria_sembrar_impuestos(%) falló: %'', p_org, sqlerrm;\n  end;\n',
    E'  perform public.fn_tesoreria_sembrar_impuestos(p_org);\n');
end;
$do$;
delete from supabase_migrations.schema_migrations where version = '20261027210500';
commit;
