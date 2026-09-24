-- Rollback de 20260924031821_factus_cola_retencion.
--
-- ADVERTENCIA: al borrar hold_reason, los documentos retenidos quedan libres y
-- la cola los enviará en cuanto su organización tenga el servicio activo (con
-- la fecha del día de envío). Si eso no se quiere, cancele esos jobs antes.

drop function if exists public.fn_einvoicing_liberar_job(uuid, integer, uuid);

-- fn_einvoicing_reclamar_jobs sin el filtro de retención (versión de 20260924031326).
create or replace function public.fn_einvoicing_reclamar_jobs(
  p_worker text,
  p_limite integer default 10,
  p_job_id uuid default null
)
returns setof public.electronic_invoicing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_worker), '') = '' then
    raise exception 'p_worker es obligatorio' using errcode = '22023';
  end if;

  return query
  with candidatos as (
    select j.id
    from public.electronic_invoicing_jobs j
    join public.electronic_invoicing_config c
      on c.organization_id = j.organization_id
     and c.provider = 'factus'
     and c.is_active
     and c.service_status = 'active'
     and c.credentials_secret_id is not null
    where j.provider = 'factus'
      and (p_job_id is null or j.id = p_job_id)
      and (
        (j.status = 'pending'
          and j.attempt_count < j.max_attempts
          and (j.next_retry_at is null or j.next_retry_at <= now()))
        or (j.status = 'processing' and j.locked_at is not null and j.locked_at < now() - interval '10 minutes')
      )
    order by coalesce(j.next_retry_at, j.created_at)
    limit greatest(1, least(coalesce(p_limite, 10), 50))
    for update of j skip locked
  )
  update public.electronic_invoicing_jobs j
     set status = 'processing',
         locked_at = now(),
         locked_by = p_worker
    from candidatos
   where j.id = candidatos.id
  returning j.*;
end $$;

revoke all on function public.fn_einvoicing_reclamar_jobs(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_einvoicing_reclamar_jobs(text, integer, uuid) to service_role;

alter table public.electronic_invoicing_jobs drop column if exists hold_reason;
