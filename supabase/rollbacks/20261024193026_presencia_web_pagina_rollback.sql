-- Desactivar primero personas viendo / retirar API antes de revertir.
-- Solo elimina presencia efímera: no afecta visitas históricas ni ventas.
do $$
declare trabajo bigint;
begin
  select jobid into trabajo from cron.job where jobname = 'website-presencia-expirada';
  if trabajo is not null then perform cron.unschedule(trabajo); end if;
end;
$$;
drop function if exists public.website_registrar_presencia(integer,text,text);
drop table if exists public.website_active_views;
