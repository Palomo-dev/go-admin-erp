-- CRM ola 1 · M3 — reuniones vinculadas a la oportunidad (plan §3.5 y §7.3).
--
-- `calendar_events` no tenía `opportunity_id`: la reunión creada desde una
-- oportunidad solo lo guardaba en `metadata.opportunity_id`, que no se puede
-- indexar ni proteger con FK. La tarjeta «Conexiones» del detalle y la línea
-- de tiempo necesitan listar las reuniones de una oportunidad.
--
-- · Columna NULL-able con FK ON DELETE SET NULL (borrar la oportunidad no
--   borra la reunión del calendario).
-- · Relleno desde metadata.opportunity_id, solo si la oportunidad existe y es
--   de la MISMA organización que el evento.
-- · Índice parcial (organization_id, opportunity_id, start_at desc).
--
-- Aditiva. Rollback: supabase/rollbacks/20260930160400_crm_ola1_calendar_events_opportunity_rollback.sql

alter table public.calendar_events
  add column if not exists opportunity_id uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calendar_events_opportunity_id_fkey' and conrelid = 'public.calendar_events'::regclass) then
    alter table public.calendar_events
      add constraint calendar_events_opportunity_id_fkey
      foreign key (opportunity_id) references public.opportunities(id) on delete set null;
  end if;
end
$$;

comment on column public.calendar_events.opportunity_id is
  'CRM ola 1 (M3): oportunidad a la que pertenece la reunión (meetingsService la escribe). Sustituye a metadata.opportunity_id.';

create index if not exists idx_calendar_events_org_opportunity
  on public.calendar_events (organization_id, opportunity_id, start_at desc)
  where opportunity_id is not null;

update public.calendar_events e
   set opportunity_id = o.id
  from public.opportunities o
 where e.opportunity_id is null
   and e.metadata ? 'opportunity_id'
   and (e.metadata ->> 'opportunity_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and o.id = (e.metadata ->> 'opportunity_id')::uuid
   and o.organization_id = e.organization_id;
