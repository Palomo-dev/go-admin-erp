-- Rollback de 20260930160400_crm_ola1_calendar_events_opportunity.sql
--
-- Quita índice, FK y columna. El dato no se pierde para las reuniones creadas
-- por meetingsService, que siguen guardando metadata.opportunity_id; las que se
-- hayan vinculado solo por la columna pierden el vínculo.

drop index if exists public.idx_calendar_events_org_opportunity;
alter table public.calendar_events drop constraint if exists calendar_events_opportunity_id_fkey;
alter table public.calendar_events drop column if exists opportunity_id;
