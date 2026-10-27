begin;
create or replace function public.trg_fn_sembrar_configuracion_contable()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_sembrar_configuracion_contable(new.id);
  return new;
end;
$function$;
drop function if exists public.fn_sembrar_mapeo_impuestos(integer);
delete from supabase_migrations.schema_migrations where version = '20261027211000';
commit;
