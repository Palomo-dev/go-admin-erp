-- Rollback de invitaciones_codigo_fuera_del_navegador.sql (fase 2 de GO-sec 2026-09-28).
-- Devuelve a authenticated los privilegios de tabla completos y la política del invitado.

revoke select (
  id, organization_id, email, role_id, created_by, created_at,
  expires_at, used_at, status, branch_id, job_position_id
) on table public.invitations from authenticated;
revoke update (status) on table public.invitations from authenticated;
grant select, insert, update, delete on table public.invitations to authenticated;

drop policy if exists invitations_select_for_invitee on public.invitations;
create policy invitations_select_for_invitee on public.invitations
  for select to public
  using (lower(email) = lower((auth.jwt() ->> 'email'::text)));
