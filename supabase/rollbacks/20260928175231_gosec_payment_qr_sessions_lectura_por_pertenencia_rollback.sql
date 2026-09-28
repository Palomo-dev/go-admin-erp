-- Rollback de 20260928175231_gosec_payment_qr_sessions_lectura_por_pertenencia.
-- Devuelve la política y los privilegios tal como estaban el 2026-09-28. OJO: con
-- ella la página «Sesiones QR» vuelve a salir vacía (nadie fija
-- app.current_organization_id). No toca datos.

drop policy if exists payment_qr_sessions_lectura_miembros on public.payment_qr_sessions;
create policy payment_qr_sessions_org_isolation on public.payment_qr_sessions
  for all to public
  using (organization_id = (current_setting('app.current_organization_id', true))::integer)
  with check (organization_id = (current_setting('app.current_organization_id', true))::integer);

grant select, insert, update, delete, truncate on table public.payment_qr_sessions to anon, authenticated;
