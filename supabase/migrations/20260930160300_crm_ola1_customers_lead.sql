-- CRM ola 1 · M1 — datos del lead en `customers` (plan §3.5 y §7.3, decisiones D2 y D3).
--
-- D2 (2026-09-29): un lead ES un cliente con lifecycle_stage = 'lead'. La fila
-- de la tabla Leads del Figma pide responsable, origen, score, último contacto
-- y «Descartar lead»; `customers` no tenía dónde guardarlos.
--
--   owner_id            responsable del lead/cliente (FK profiles, como
--                       opportunities.salesperson_id). Lo escribe la
--                       asignación automática del alta de leads.
--   lead_source         origen con catálogo (CHECK). Espejo en
--                       src/lib/crm/enums.ts (LEAD_SOURCES) y db-checks.json.
--   lead_score          0–100, calculado por el servidor desde el ICP (D3).
--   icp_band            banda ICP del lead (A/B/C de icp_profiles.band).
--   last_contact_at     último contacto; lo mantiene el trigger de
--                       `activities` (tipos de contacto), para cualquier
--                       escritor, no solo la ruta de actividades.
--   lead_discarded_at / lead_discard_reason / lead_discarded_by
--                       descarte con motivo SIN tocar el CHECK de
--                       lifecycle_stage.
--
-- Rellenos (solo donde la columna está vacía):
--   · lead_source 'whatsapp' desde metadata.source = 'whatsapp_qr' (6 filas).
--     `web_order` (clientes de pedidos web) NO se copia: son compradores, no
--     prospectos, y marcarlos con origen los haría pasar por leads activos.
--   · lead_source y owner_id desde la oportunidad record_type='lead' más
--     reciente del cliente (33 clientes): así el importador y la pantalla
--     Leads los reconocen como leads ya trabajados.
--   · last_contact_at desde las actividades de contacto existentes.
--
-- Aditiva: columnas NULL-ables, CHECK sobre columna nueva, índices nuevos.
-- Rollback: supabase/rollbacks/20260930160300_crm_ola1_customers_lead_rollback.sql

alter table public.customers
  add column if not exists owner_id uuid null,
  add column if not exists lead_source text null,
  add column if not exists lead_score integer null,
  add column if not exists icp_band text null,
  add column if not exists last_contact_at timestamptz null,
  add column if not exists lead_discarded_at timestamptz null,
  add column if not exists lead_discard_reason text null,
  add column if not exists lead_discarded_by uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_owner_id_fkey' and conrelid = 'public.customers'::regclass) then
    alter table public.customers
      add constraint customers_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_lead_discarded_by_fkey' and conrelid = 'public.customers'::regclass) then
    alter table public.customers
      add constraint customers_lead_discarded_by_fkey foreign key (lead_discarded_by) references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_lead_source_check' and conrelid = 'public.customers'::regclass) then
    alter table public.customers
      add constraint customers_lead_source_check check (lead_source = any (array[
        'web_form', 'web_order', 'whatsapp', 'instagram', 'facebook', 'referral', 'import',
        'inbound_call', 'outbound', 'manual', 'email', 'event', 'partner', 'other'
      ]::text[]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_lead_score_range' and conrelid = 'public.customers'::regclass) then
    alter table public.customers
      add constraint customers_lead_score_range check (lead_score between 0 and 100);
  end if;
end
$$;

comment on column public.customers.owner_id is 'CRM ola 1 (M1): responsable del lead o cliente. Lo asigna el servidor (asignación automática o crm.leads.assign).';
comment on column public.customers.lead_source is 'CRM ola 1 (M1): origen del lead con catálogo (CHECK customers_lead_source_check; espejo LEAD_SOURCES en src/lib/crm/enums.ts).';
comment on column public.customers.lead_score is 'CRM ola 1 (M1, D3): score 0-100 calculado por el servidor desde el ICP (icpService).';
comment on column public.customers.icp_band is 'CRM ola 1 (M1, D3): banda ICP del lead (icp_profiles.band).';
comment on column public.customers.last_contact_at is 'CRM ola 1 (M1): último contacto; lo mantiene trg_activities_ultimo_contacto_cliente.';
comment on column public.customers.lead_discarded_at is 'CRM ola 1 (M1): lead descartado (sin tocar lifecycle_stage). NULL = activo.';
comment on column public.customers.lead_discard_reason is 'CRM ola 1 (M1): motivo del descarte.';
comment on column public.customers.lead_discarded_by is 'CRM ola 1 (M1): quién descartó el lead.';

create index if not exists idx_customers_org_lifecycle_created
  on public.customers (organization_id, lifecycle_stage, created_at desc);
create index if not exists idx_customers_org_owner
  on public.customers (organization_id, owner_id) where owner_id is not null;

-- ── último contacto: trigger en activities ─────────────────────────────────
create or replace function public.fn_activities_ultimo_contacto_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_customer uuid;
  v_at timestamptz := coalesce(new.occurred_at, new.created_at, now());
begin
  if new.activity_type not in ('call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'ai_call') then
    return new;
  end if;
  if new.related_type = 'customer' then
    v_customer := new.related_id;
  elsif new.related_type = 'opportunity' then
    select o.customer_id into v_customer
      from public.opportunities o
     where o.id = new.related_id and o.organization_id = new.organization_id;
  end if;
  if v_customer is null then
    return new;
  end if;
  -- Nunca hacia atrás, nunca otro inquilino.
  update public.customers c
     set last_contact_at = v_at
   where c.id = v_customer
     and c.organization_id = new.organization_id
     and (c.last_contact_at is null or c.last_contact_at < v_at);
  return new;
end;
$$;

revoke all on function public.fn_activities_ultimo_contacto_cliente() from public, anon, authenticated;

drop trigger if exists trg_activities_ultimo_contacto_cliente on public.activities;
create trigger trg_activities_ultimo_contacto_cliente
  after insert on public.activities
  for each row execute function public.fn_activities_ultimo_contacto_cliente();

-- ── Rellenos ────────────────────────────────────────────────────────────────
update public.customers c
   set lead_source = 'whatsapp'
 where c.lead_source is null
   and c.metadata ->> 'source' = 'whatsapp_qr';

with ultima as (
  select distinct on (o.customer_id)
         o.customer_id, o.organization_id, o.salesperson_id,
         case lower(coalesce(o.source, ''))
           when 'website' then 'web_form'
           when 'web' then 'web_form'
           when 'referral' then 'referral'
           when 'referido' then 'referral'
           when 'importacion' then 'import'
           when 'manual_erp' then 'manual'
           when 'whatsapp' then 'whatsapp'
           else 'other'
         end as fuente
    from public.opportunities o
   where o.record_type = 'lead' and o.customer_id is not null
   order by o.customer_id, o.created_at desc
)
update public.customers c
   set lead_source = coalesce(c.lead_source, u.fuente),
       owner_id = coalesce(c.owner_id, u.salesperson_id)
  from ultima u
 where c.id = u.customer_id
   and c.organization_id = u.organization_id
   and (c.lead_source is null or (c.owner_id is null and u.salesperson_id is not null));

with contactos as (
  select coalesce(case when a.related_type = 'customer' then a.related_id end, o.customer_id) as customer_id,
         a.organization_id,
         max(coalesce(a.occurred_at, a.created_at)) as ultimo
    from public.activities a
    left join public.opportunities o
      on a.related_type = 'opportunity' and o.id = a.related_id and o.organization_id = a.organization_id
   where a.activity_type in ('call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'ai_call')
   group by 1, 2
)
update public.customers c
   set last_contact_at = k.ultimo
  from contactos k
 where k.customer_id is not null
   and c.id = k.customer_id
   and c.organization_id = k.organization_id
   and (c.last_contact_at is null or c.last_contact_at < k.ultimo);
