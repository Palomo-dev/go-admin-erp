-- Rollback de 20260930160300_crm_ola1_customers_lead.sql
--
-- Quita el trigger de último contacto, los índices, las restricciones y las
-- columnas de lead de `customers`.
--
-- DATOS: se pierde lo escrito en esas columnas desde la migración
-- (responsables, origen, score, último contacto y descartes). No hay copia:
-- si hace falta conservarlo, exportarlo antes (select id, owner_id, lead_source,
-- lead_score, icp_band, last_contact_at, lead_discarded_at, lead_discard_reason,
-- lead_discarded_by from customers where ...).
--
-- ORDEN: revertir antes 20260930160600 (RPC de oportunidades), 20260930160900
-- (KPI) y 20260930161100 (web_capture_lead), que leen o escriben estas columnas.

drop trigger if exists trg_activities_ultimo_contacto_cliente on public.activities;
drop function if exists public.fn_activities_ultimo_contacto_cliente();

drop index if exists public.idx_customers_org_owner;
drop index if exists public.idx_customers_org_lifecycle_created;

alter table public.customers drop constraint if exists customers_lead_score_range;
alter table public.customers drop constraint if exists customers_lead_source_check;
alter table public.customers drop constraint if exists customers_lead_discarded_by_fkey;
alter table public.customers drop constraint if exists customers_owner_id_fkey;

alter table public.customers
  drop column if exists lead_discarded_by,
  drop column if exists lead_discard_reason,
  drop column if exists lead_discarded_at,
  drop column if exists last_contact_at,
  drop column if exists icp_band,
  drop column if exists lead_score,
  drop column if exists lead_source,
  drop column if exists owner_id;
