-- POS de doble pantalla — Fase 4
-- Calificación del cliente (1-5) tomada en la pantalla del cliente al final
-- de la venta. Sin datos personales: solo el número, la terminal y la venta.
-- Ver docs/pos-doble-pantalla/PLAN.md §6.3. Migración aditiva.

create table if not exists public.pos_display_feedback (
  id               uuid primary key default gen_random_uuid(),
  organization_id  integer not null references public.organizations(id) on delete cascade,
  branch_id        integer not null references public.branches(id) on delete cascade,
  terminal_id      uuid not null references public.pos_terminals(id) on delete cascade,
  -- Puede quedar null si el cliente calificó y la venta se borró después
  -- (on delete set null): la calificación se conserva para el informe.
  sale_id          uuid references public.sales(id) on delete set null,
  rating           smallint not null check (rating between 1 and 5),
  created_at       timestamptz not null default now()
);

comment on table public.pos_display_feedback is
  'Calificación 1-5 dada por el cliente en la pantalla del cliente del POS. Sin datos personales.';

create index if not exists pos_display_feedback_org_created_idx
  on public.pos_display_feedback (organization_id, created_at desc);

-- Una calificación por venta y terminal: la pantalla puede reintentar el envío.
create unique index if not exists pos_display_feedback_venta_unica
  on public.pos_display_feedback (terminal_id, sale_id)
  where sale_id is not null;

alter table public.pos_display_feedback enable row level security;

-- Lectura para miembros de la organización (informe). La escritura la hace
-- solo el servidor con service role tras validar sesión o token de pantalla.
drop policy if exists pos_display_feedback_select on public.pos_display_feedback;
create policy pos_display_feedback_select on public.pos_display_feedback
  for select to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

revoke all on public.pos_display_feedback from anon;
revoke insert, update, delete on public.pos_display_feedback from authenticated;
