-- GO-sec (auditoría de seguridad 2026-09-24): la cola de facturación
-- electrónica solo la escribe el servidor.
--
-- ANTES: `electronic_invoicing_jobs` y `electronic_invoicing_events` tenían una
-- política `ALL` por pertenencia (y todos los privilegios para anon y
-- authenticated). Cualquier miembro de la organización, desde el navegador,
-- podía crear jobs, cambiarles el estado, QUITAR UNA RETENCIÓN
-- (`hold_reason = null`, que decide cuándo se emite ante la DIAN) o escribir
-- eventos falsos en el historial. Y el navegador escribía ahí
-- (`electronicInvoicingService.retryJob/cancelJob/createJob`,
-- `notasCreditoService.retryDianSubmission`).
--
-- AHORA:
--  - RLS de solo LECTURA por pertenencia (authenticated). Sin políticas de
--    escritura: un INSERT/UPDATE/DELETE del cliente no tiene política que lo
--    admita, y además se le quitan los privilegios (defensa en profundidad).
--  - Escriben solo `service_role` (cron `process-pending`, rutas del servidor
--    tras `withOrg` + permiso) y las funciones SECURITY DEFINER de la cola
--    (`fn_einvoicing_reclamar_jobs`, `fn_einvoicing_registrar_resultado`,
--    `fn_einvoicing_liberar_job`), que no cambian.
--  - Reintentar/cancelar a mano pasa por `fn_einvoicing_accion_manual`
--    (solo service_role; la llama `/api/factus/jobs` tras `withOrg` y el
--    permiso `finance.*` resuelto en el servidor). Comprueba de nuevo que el
--    actor es miembro activo de la organización y que el job es de ella.
--    Un reintento NO toca `hold_reason`: una retención solo la quita
--    `fn_einvoicing_liberar_job` (liberación con permiso, 90082b83).
--
-- Cambio de comportamiento documentado: el reintento manual reinicia
-- `attempt_count` (antes quedaba en `pending` con los intentos agotados y
-- `fn_einvoicing_reclamar_jobs` nunca lo volvía a tomar) y limpia el error
-- anterior. El evento usa `event_type = 'retry'`: el `'retry_scheduled'` que
-- insertaba la ruta lo rechazaba el CHECK de `electronic_invoicing_events` y
-- el error se ignoraba.
--
-- Aditiva: sin cambios de columnas ni de datos. Rollback en
-- supabase/rollbacks/20260925120000_einvoicing_cola_escritura_solo_servidor_rollback.sql

-- 1. Acción manual del servidor ------------------------------------------------

create or replace function public.fn_einvoicing_accion_manual(
  p_job_id uuid,
  p_organization_id integer,
  p_accion text,
  p_actor uuid
)
returns public.electronic_invoicing_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_job public.electronic_invoicing_jobs%rowtype;
begin
  if p_accion is null or p_accion not in ('retry', 'cancel') then
    raise exception 'Acción no válida: %', coalesce(p_accion, 'null') using errcode = '22023';
  end if;

  -- Pertenencia: la ruta ya lo resolvió con la sesión; aquí se vuelve a exigir
  -- porque esta función salta la RLS.
  if p_actor is null or not exists (
    select 1
    from public.organization_members m
    where m.user_id = p_actor
      and m.organization_id = p_organization_id
      and m.is_active = true
  ) then
    raise exception 'El usuario no pertenece a la organización' using errcode = '42501';
  end if;

  select * into v_job
  from public.electronic_invoicing_jobs
  where id = p_job_id and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Documento no encontrado en la cola de la organización' using errcode = 'P0002';
  end if;

  if p_accion = 'retry' then
    if v_job.status not in ('failed', 'cancelled', 'rejected') then
      raise exception 'Un job en estado % no se puede reintentar', v_job.status using errcode = '55000';
    end if;
    update public.electronic_invoicing_jobs
       set status = 'pending',
           attempt_count = 0,
           next_retry_at = now(),
           error_code = null,
           error_message = null,
           locked_at = null,
           locked_by = null
     where id = v_job.id
    returning * into v_job;
  else
    if v_job.status not in ('pending', 'failed') then
      raise exception 'Un job en estado % no se puede cancelar', v_job.status using errcode = '55000';
    end if;
    update public.electronic_invoicing_jobs
       set status = 'cancelled',
           locked_at = null,
           locked_by = null
     where id = v_job.id
    returning * into v_job;
  end if;

  insert into public.electronic_invoicing_events (job_id, organization_id, event_type, event_message, metadata)
  values (
    v_job.id,
    v_job.organization_id,
    case when p_accion = 'retry' then 'retry' else 'cancelled' end,
    case when p_accion = 'retry' then 'Reintento manual programado' else 'Job cancelado manualmente' end,
    jsonb_build_object('actor', p_actor, 'accion', p_accion, 'origen', 'manual')
  );

  return v_job;
end
$fn$;

comment on function public.fn_einvoicing_accion_manual(uuid, integer, text, uuid) is
  'Reintento o cancelación manual de un documento de la cola de facturación electrónica. Solo service_role: la llama /api/factus/jobs tras withOrg y el permiso finance.* del servidor. Exige que el actor sea miembro activo y que el job sea de la organización. No toca hold_reason.';

revoke all on function public.fn_einvoicing_accion_manual(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_einvoicing_accion_manual(uuid, integer, text, uuid) to service_role;

-- 2. RLS de solo lectura por pertenencia -----------------------------------------

drop policy if exists electronic_invoicing_jobs_org_isolation on public.electronic_invoicing_jobs;
drop policy if exists electronic_invoicing_jobs_select_miembros on public.electronic_invoicing_jobs;
create policy electronic_invoicing_jobs_select_miembros
  on public.electronic_invoicing_jobs
  for select
  to authenticated
  using (
    organization_id in (
      select m.organization_id
      from public.organization_members m
      where m.user_id = (select auth.uid())
        and m.is_active = true
    )
  );

comment on policy electronic_invoicing_jobs_select_miembros on public.electronic_invoicing_jobs is
  'Solo lectura por pertenencia. Las escrituras las hace el servidor (service_role o funciones SECURITY DEFINER de la cola).';

drop policy if exists electronic_invoicing_events_org_isolation on public.electronic_invoicing_events;
drop policy if exists electronic_invoicing_events_select_miembros on public.electronic_invoicing_events;
create policy electronic_invoicing_events_select_miembros
  on public.electronic_invoicing_events
  for select
  to authenticated
  using (
    job_id in (
      select j.id
      from public.electronic_invoicing_jobs j
      join public.organization_members m on m.organization_id = j.organization_id
      where m.user_id = (select auth.uid())
        and m.is_active = true
    )
  );

comment on policy electronic_invoicing_events_select_miembros on public.electronic_invoicing_events is
  'Solo lectura por pertenencia (a través del job). El historial lo escriben el servidor y los triggers/funciones de la cola.';

-- 3. Privilegios: el cliente solo lee ------------------------------------------------

revoke insert, update, delete, truncate, references, trigger on public.electronic_invoicing_jobs from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.electronic_invoicing_events from anon, authenticated;
revoke select on public.electronic_invoicing_jobs from anon;
revoke select on public.electronic_invoicing_events from anon;
grant select on public.electronic_invoicing_jobs to authenticated;
grant select on public.electronic_invoicing_events to authenticated;
