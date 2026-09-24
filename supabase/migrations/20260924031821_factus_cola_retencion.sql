-- Cola de facturación electrónica: documentos retenidos hasta confirmación.
--
-- Factus v2 no recibe fecha de emisión: la DIAN recibe el documento con la
-- fecha del día en que se valida. Los 8 documentos que llevan 19 a 43 días en
-- cola (facturas ya pagadas, 2 organizaciones) saldrían con la fecha de hoy,
-- no con la de la venta. Esa decisión la toma una persona, no el cron: quedan
-- retenidos (hold_reason) y la cola no los reclama hasta que un administrador
-- de su organización los libere desde la configuración de facturación.
--
-- Aditiva: una columna NULL-able y una función.

alter table public.electronic_invoicing_jobs
  add column if not exists hold_reason text;

comment on column public.electronic_invoicing_jobs.hold_reason is
  'Si no es NULL, la cola no envía el documento hasta que alguien lo libere (fn_einvoicing_liberar_job). Motivo en lenguaje humano.';

-- La cola no reclama documentos retenidos.
create or replace function public.fn_einvoicing_reclamar_jobs(
  p_worker text,
  p_limite integer default 10,
  p_job_id uuid default null
)
returns setof public.electronic_invoicing_jobs
language plpgsql
security definer
-- public (no ''): los triggers de las tablas que toca usan nombres sin esquema.
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
      and j.hold_reason is null
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

-- Liberar un documento retenido (lo llama el servidor tras comprobar sesión,
-- organización y permiso). Deja rastro en los eventos.
create or replace function public.fn_einvoicing_liberar_job(
  p_job_id uuid,
  p_organization_id integer,
  p_actor uuid
)
returns public.electronic_invoicing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.electronic_invoicing_jobs%rowtype;
  v_motivo text;
begin
  select * into v_job
  from public.electronic_invoicing_jobs
  where id = p_job_id and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Documento no encontrado en la cola de la organización' using errcode = 'P0002';
  end if;
  if v_job.hold_reason is null then
    return v_job;
  end if;

  v_motivo := v_job.hold_reason;
  update public.electronic_invoicing_jobs
     set hold_reason = null,
         next_retry_at = null
   where id = v_job.id
  returning * into v_job;

  insert into public.electronic_invoicing_events
    (job_id, organization_id, event_type, event_message, metadata)
  values (
    v_job.id,
    v_job.organization_id,
    'notification',
    'Envío autorizado: se emitirá con la fecha del día en que la DIAN lo valide',
    jsonb_build_object('liberado_por', p_actor, 'motivo_retencion', v_motivo)
  );

  return v_job;
end $$;

revoke all on function public.fn_einvoicing_reclamar_jobs(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_einvoicing_liberar_job(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_einvoicing_reclamar_jobs(text, integer, uuid) to service_role;
grant execute on function public.fn_einvoicing_liberar_job(uuid, integer, uuid) to service_role;

-- Retener los documentos que ya estaban en cola antes de este cambio.
update public.electronic_invoicing_jobs
   set hold_reason = 'En cola desde antes de activar el servicio. Factus emite con la fecha del día de envío, no con la de la venta: requiere confirmación.'
 where status = 'pending'
   and hold_reason is null
   and created_at < '2026-09-24 00:00:00+00';
