-- Rollback de 20261021145732_correo_limite_plan_y_cron_pendiente.sql
--
-- Quita el cron compra-pendiente-sitio. Los trabajos que esta migracion
-- marco por el limite del plan vuelven a pending con el texto generico:
-- el worker anterior los reintenta. No restaura un last_error distinto
-- que hubieran tenido antes, porque todos tenian ese texto.
-- No borra dominios en el proveedor ni toca los que ya estaban verificados.

set lock_timeout = '10s';

do $uns$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'compra-pendiente-sitio';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end
$uns$;

create or replace function public.fn_reclamar_jobs_correo_tienda(
  p_organization_id integer default null,
  p_lote integer default 5
)
returns table (
  job_id uuid,
  organization_id integer,
  organization_domain_id uuid,
  accion text,
  creado_en timestamptz,
  intentos integer,
  id_proveedor text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $job$
#variable_conflict use_column
declare
  v_lote integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_lote := least(greatest(coalesce(p_lote, 5), 1), 10);
  perform set_config('lock_timeout', '4s', true);
  perform set_config('statement_timeout', '8s', true);

  update public.email_domain_jobs
     set status = 'pending', updated_at = now()
   where status = 'running'
     and updated_at < now() - interval '15 minutes'
     and (p_organization_id is null or email_domain_jobs.organization_id = p_organization_id);

  return query
  with candidatos as (
    select j.id
      from public.email_domain_jobs j
     where j.status = 'pending'
       and j.run_after <= now()
       and (p_organization_id is null or j.organization_id = p_organization_id)
     order by j.run_after, j.created_at
     limit v_lote
       for update of j skip locked
  ),
  tomados as (
    update public.email_domain_jobs j
       set status = 'running',
           attempts = j.attempts + 1,
           updated_at = now()
      from candidatos c
     where j.id = c.id
    returning j.id, j.organization_id, j.organization_domain_id, j.accion,
              j.created_at, j.attempts, j.provider_domain_id
  )
  select t.id, t.organization_id, t.organization_domain_id, t.accion,
         t.created_at, t.attempts, t.provider_domain_id
    from tomados t;
end;
$job$;

revoke all on function public.fn_reclamar_jobs_correo_tienda(integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_reclamar_jobs_correo_tienda(integer, integer)
  to service_role;

update public.email_domain_jobs
   set status = 'pending',
       last_error = 'El proveedor no creó el dominio.',
       run_after = now(),
       updated_at = now()
 where accion = 'provisionar_correo'
   and status = 'failed'
   and last_error = 'El plan de correo no admite más dominios. validation_error: You have reached the domain limit of your plan. Upgrade to add more.';

update public.email_domains
   set status = 'pending',
       last_error = 'El proveedor no creó el dominio.',
       updated_at = now()
 where status = 'failed'
   and provider_domain_id is null
   and last_error = 'El plan de correo no admite más dominios. validation_error: You have reached the domain limit of your plan. Upgrade to add more.';

reset lock_timeout;
