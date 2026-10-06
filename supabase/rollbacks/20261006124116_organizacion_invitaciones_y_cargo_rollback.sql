-- Rollback de 20261006120000_organizacion_invitaciones_y_cargo.
-- Restaura la estructura. NO revierte datos: las invitaciones que la función o
-- la tarea marcaron `expired` siguen así (eran `pending` vencidas, que no se
-- podían aceptar). Si hiciera falta: update invitations set status = 'pending'
-- where status = 'expired';  — revisarlo antes, porque quitaría el CHECK de facto.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'invitaciones_marcar_vencidas';
  end if;
end $$;

drop function if exists public.fn_miembro_cambiar_cargo(bigint, uuid);
drop function if exists public.fn_invitaciones_marcar_vencidas();
drop index if exists public.invitations_pendiente_unica;
drop index if exists public.invitations_organization_id_idx;
alter table public.invitations drop constraint if exists invitations_status_check;
