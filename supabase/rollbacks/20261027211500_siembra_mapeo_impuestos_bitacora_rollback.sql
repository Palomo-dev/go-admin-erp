-- Vuelve al trigger de 20261027211000 (solo WARNING). Conserva la tabla si tiene filas (evidencia); bórrala a mano si se quiere.
begin;
create or replace function public.trg_fn_sembrar_configuracion_contable()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_sembrar_configuracion_contable(new.id);
  begin
    perform public.fn_sembrar_mapeo_impuestos(new.id);
  exception when others then
    raise warning 'fn_sembrar_mapeo_impuestos(%) falló: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;
drop function if exists public.fn_reintentar_siembra_mapeo(integer);
do $$ begin
  if not exists (select 1 from public.bitacora_siembra_org) then
    drop table public.bitacora_siembra_org;
  end if;
end $$;
delete from supabase_migrations.schema_migrations where version = '20261027211500';
commit;
