-- Reversión de 20261108093000_integraciones_secretos_solo_servidor.sql: devuelve los privilegios
-- de tabla y las políticas por nombre de rol tal como estaban (incluido lo de anon). No toca datos.

begin;

revoke select on public.integration_credentials from authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.integration_credentials to authenticated;

revoke select on public.webhook_endpoints from authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.webhook_endpoints to anon, authenticated;

revoke select on public.integration_webhooks from authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.integration_webhooks to anon, authenticated;

drop policy if exists integration_webhooks_admin_gestiona on public.integration_webhooks;
create policy "Webhooks are manageable by organization admins" on public.integration_webhooks
  for all to authenticated
  using (connection_id in (
    select c.id from public.integration_connections c
      join public.organization_members om on c.organization_id = om.organization_id
      join public.roles r on om.role_id = r.id
     where om.user_id = auth.uid()
       and (r.name)::text = any (array['owner', 'admin', 'Administrador'])));
create policy "Webhooks are viewable by organization admins" on public.integration_webhooks
  for select to authenticated
  using (connection_id in (
    select c.id from public.integration_connections c
      join public.organization_members om on c.organization_id = om.organization_id
      join public.roles r on om.role_id = r.id
     where om.user_id = auth.uid()
       and (r.name)::text = any (array['owner', 'admin', 'Administrador'])));

commit;
