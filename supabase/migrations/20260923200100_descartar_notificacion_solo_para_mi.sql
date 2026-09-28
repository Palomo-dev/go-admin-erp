-- «Descartar» una notificación la oculta solo para quien la descarta.
--
-- Hasta ahora la campana del header hacía `notifications.status = 'deleted'`:
-- la notificación desaparecía para TODA la organización cuando cualquier
-- miembro la descartaba. Decisión del dueño (2026-09-23, Figma
-- NotificationDetail 625:14683): descartar es personal, como marcar leída
-- (notification_reads).
--
-- Tabla aditiva por persona. La visibilidad de la notificación la sigue
-- decidiendo la RLS de `notifications`: la política de INSERT solo deja
-- descartar una notificación que la persona puede ver.

create table if not exists public.notification_dismissals (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

comment on table public.notification_dismissals is
  'Notificaciones que cada persona descartó de su campana. Personal: no afecta a los demás miembros.';

create index if not exists notification_dismissals_user_idx
  on public.notification_dismissals (user_id, dismissed_at desc);

alter table public.notification_dismissals enable row level security;

drop policy if exists notification_dismissals_select_own on public.notification_dismissals;
create policy notification_dismissals_select_own on public.notification_dismissals
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notification_dismissals_insert_own on public.notification_dismissals;
create policy notification_dismissals_insert_own on public.notification_dismissals
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and notification_id in (select n.id from public.notifications n)
  );

drop policy if exists notification_dismissals_delete_own on public.notification_dismissals;
create policy notification_dismissals_delete_own on public.notification_dismissals
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notification_dismissals from anon;
grant select, insert, delete on public.notification_dismissals to authenticated;
