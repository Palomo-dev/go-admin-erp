-- Frente INT · Integraciones (2026-11-07). SIN APLICAR: la aprueba el dueño y la aplica el
-- coordinador por el MCP, DESPUÉS de 20261108090000_integraciones_conexiones_int.sql (de ahí salen
-- las columnas de envío de webhook_endpoints que aquí se conceden).
--
-- Cierra la lectura de secretos al navegador (análisis INTEGRACIONES-CONEXIONES §Riesgos 1-3):
--  1. integration_credentials.secret_ref: los roles anon/authenticated dejan de poder leerlo.
--     Lo leen solo el servidor (service role) y fn_get_provider_secret (service role).
--  2. webhook_endpoints.secret: igual. La firma de los envíos la hace el servidor.
--  3. integration_webhooks: la RLS dejaba gestionar por NOMBRE de rol ('owner', 'admin',
--     'Administrador'), contra la regla 6. Pasa a la misma regla que integration_credentials
--     (rol 1/2, super admin o admin.full_access, resuelto en la base). secret_ref tampoco se lee.
--
-- Aprobada por el dueño (2026-11-07) junto con el botón «Ver»: las llaves siguen en claro (no se
-- cifra nada) y se pueden ver en el detalle de la conexión. «Ver» llama a
-- POST /api/integrations/conexiones/[id]/credenciales/revelar, que lee con service role (no le
-- afectan estos privilegios) tras exigir administración y registrar auditoría en ops_audit_log.
--
-- Cómo: se quita el SELECT de tabla y se concede SELECT por columna, sin la columna secreta.
-- INSERT/UPDATE/DELETE se conservan (el formulario avanzado todavía escribe desde el navegador);
-- nadie puede leer de vuelta el secreto. anon pierde todo en las dos tablas que lo tenían.
-- Verificado con grep (go-admin-erp y goadmin-websites, 2026-11-07): ningún lector con la sesión
-- del usuario necesita el valor; los que hacían select('*') o .select() tras insertar piden ahora
-- columnas explícitas. La tienda web lee con service role (no le afecta).

begin;

-- 1. integration_credentials
revoke select on public.integration_credentials from anon, authenticated;
revoke all on public.integration_credentials from anon;
grant select (id, connection_id, credential_type, purpose, key_prefix, status, expires_at, rotated_at,
              metadata, created_at, updated_at)
  on public.integration_credentials to authenticated;

-- 2. webhook_endpoints
revoke all on public.webhook_endpoints from anon;
revoke select on public.webhook_endpoints from authenticated;
grant select (id, organization_id, name, target_url, events, is_active, created_at, updated_at,
              last_delivery_at, last_response_status, consecutive_failures)
  on public.webhook_endpoints to authenticated;

-- 3. integration_webhooks
revoke all on public.integration_webhooks from anon;
revoke select on public.integration_webhooks from authenticated;
grant select (id, connection_id, direction, url, events, signing_method, is_active, metadata,
              last_received_at, created_at, updated_at)
  on public.integration_webhooks to authenticated;

drop policy if exists "Webhooks are manageable by organization admins" on public.integration_webhooks;
drop policy if exists "Webhooks are viewable by organization admins" on public.integration_webhooks;
drop policy if exists integration_webhooks_admin_gestiona on public.integration_webhooks;
create policy integration_webhooks_admin_gestiona on public.integration_webhooks
  for all to authenticated
  using (connection_id in (
    select c.id
      from public.integration_connections c
      join public.organization_members om on om.organization_id = c.organization_id
     where om.user_id = (select auth.uid())
       and om.is_active = true
       and (om.is_super_admin = true
            or om.role_id = any (array[1, 2])
            or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access'))))
  with check (connection_id in (
    select c.id
      from public.integration_connections c
      join public.organization_members om on om.organization_id = c.organization_id
     where om.user_id = (select auth.uid())
       and om.is_active = true
       and (om.is_super_admin = true
            or om.role_id = any (array[1, 2])
            or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access'))));

commit;

-- Verificación (dentro de begin; … rollback;):
--   set local role authenticated; select secret_ref from public.integration_credentials limit 1;
--     → ERROR 42501 permission denied
--   select has_column_privilege('authenticated', 'public.webhook_endpoints', 'secret', 'select');  -- false
--   select has_column_privilege('authenticated', 'public.integration_credentials', 'key_prefix', 'select'); -- true
