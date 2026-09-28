-- Rollback de 20260925120000_einvoicing_cola_escritura_solo_servidor.sql
--
-- Restaura EXACTAMENTE el estado anterior (vuelve a abrir la escritura de la
-- cola a cualquier miembro de la organización, que es el hallazgo de
-- seguridad que la migración cerró). Solo para una emergencia: antes de
-- aplicarlo, revertir también en el código `/api/factus/jobs` (usa
-- `fn_einvoicing_accion_manual`, que este rollback elimina).
--
-- No revierte datos: los reintentos/cancelaciones hechos con la función
-- nueva quedan como están.

-- Políticas anteriores (ALL por pertenencia, sin WITH CHECK)
drop policy if exists electronic_invoicing_jobs_select_miembros on public.electronic_invoicing_jobs;
drop policy if exists electronic_invoicing_jobs_org_isolation on public.electronic_invoicing_jobs;
create policy electronic_invoicing_jobs_org_isolation
  on public.electronic_invoicing_jobs
  using (
    organization_id in (
      select organization_members.organization_id
      from organization_members
      where organization_members.user_id = auth.uid()
        and organization_members.is_active = true
    )
  );

drop policy if exists electronic_invoicing_events_select_miembros on public.electronic_invoicing_events;
drop policy if exists electronic_invoicing_events_org_isolation on public.electronic_invoicing_events;
create policy electronic_invoicing_events_org_isolation
  on public.electronic_invoicing_events
  using (
    job_id in (
      select electronic_invoicing_jobs.id
      from electronic_invoicing_jobs
      where electronic_invoicing_jobs.organization_id in (
        select organization_members.organization_id
        from organization_members
        where organization_members.user_id = auth.uid()
          and organization_members.is_active = true
      )
    )
  );

-- Privilegios anteriores (todos para anon y authenticated)
grant select, insert, update, delete, truncate, references, trigger on public.electronic_invoicing_jobs to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.electronic_invoicing_events to anon, authenticated;

drop function if exists public.fn_einvoicing_accion_manual(uuid, integer, text, uuid);
