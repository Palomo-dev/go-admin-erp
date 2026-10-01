-- Revierte 20261001180000_avisos_miembro.
-- Borra la tabla y los avisos ya creados. No los restaura.

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'avisos-miembro' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

drop trigger if exists trg_avisos_miembro_tarea on public.tasks;
drop trigger if exists trg_avisos_miembro_oportunidad on public.opportunities;
drop trigger if exists trg_avisos_miembro_proteger on public.member_notices;

drop function if exists public.fn_avisos_miembro_tarea();
drop function if exists public.fn_avisos_miembro_oportunidad();
drop function if exists public.fn_avisos_miembro_proteger();
drop function if exists public.fn_avisos_miembro_poner(integer, uuid, uuid, text, text, uuid, text, text, text, text);
drop function if exists public.fn_avisos_miembro_nombre(uuid);
drop function if exists public.fn_avisos_miembro_es_miembro(integer, uuid);

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'member_notices'
  ) then
    alter publication supabase_realtime drop table public.member_notices;
  end if;
end $$;

drop table if exists public.member_notices;
