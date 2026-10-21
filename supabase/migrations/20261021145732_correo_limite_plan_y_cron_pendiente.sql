-- El alta de dominios de tienda recibio 403 del proveedor: el plan no
-- admite mas dominios. El worker guardaba un texto generico y reintentaba
-- cada 15 minutos. Esos trabajos quedan en error hasta Reintentar.
-- No toca dominios que ya estan verificados ni borra nada en el proveedor.
--
-- El correo de compra pendiente dejo de salir cuando se desprogramo
-- compra-pendiente-sitio. Vuelve el mismo horario, contra la funcion que
-- ya manda el secreto del vault. El reclamo de la cola de dominios prioriza
-- quien todavia no se intento.
--
-- Sin credenciales.

set lock_timeout = '10s';

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
     order by j.attempts, j.created_at
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
   set status = 'failed',
       last_error = 'El plan de correo no admite más dominios. validation_error: You have reached the domain limit of your plan. Upgrade to add more.',
       updated_at = now()
 where accion = 'provisionar_correo'
   and status in ('pending', 'running')
   and last_error = 'El proveedor no creó el dominio.';

update public.email_domains
   set status = 'failed',
       last_error = 'El plan de correo no admite más dominios. validation_error: You have reached the domain limit of your plan. Upgrade to add more.',
       last_check_at = now(),
       updated_at = now()
 where status = 'pending'
   and provider_domain_id is null
   and last_error = 'El proveedor no creó el dominio.';

do $cron$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'compra-pendiente-sitio';
  if v_job is null then
    perform cron.schedule(
      'compra-pendiente-sitio',
      '*/15 * * * *',
      $cmd$select public.fn_websites_cron_post('/api/cron/carritos-abandonados')$cmd$
    );
  end if;
end
$cron$;

do $prueba$
declare
  n integer;
  v_job bigint;
begin
  select count(*) into n
    from public.email_domain_jobs
   where status in ('pending', 'running')
     and last_error = 'El proveedor no creó el dominio.';
  if n <> 0 then
    raise exception 'quedo un trabajo reintentando el limite del plan';
  end if;

  select count(*) into n
    from public.email_domains
   where status = 'verified'
     and last_error like 'El plan de correo no admite más dominios.%';
  if n <> 0 then
    raise exception 'se marco como limite un dominio que ya estaba verificado';
  end if;

  select jobid into v_job from cron.job where jobname = 'compra-pendiente-sitio';
  if v_job is null then
    raise exception 'el cron de compra pendiente no quedo programado';
  end if;

  if position(
    'order by j.attempts, j.created_at' in pg_get_functiondef('public.fn_reclamar_jobs_correo_tienda(integer,integer)'::regprocedure)
  ) = 0 then
    raise exception 'el reclamo no prioriza los intentos nuevos';
  end if;

  select count(*) into n from public.fn_reclamar_jobs_correo_tienda(-1, 1);
  if n <> 0 then
    raise exception 'un id inexistente no debe reclamar trabajos';
  end if;
end
$prueba$;

reset lock_timeout;
