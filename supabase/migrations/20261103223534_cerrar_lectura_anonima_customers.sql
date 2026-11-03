-- Cerrar lectura anónima de public.customers.
--
-- Las tres políticas «Allow anon …» de la baseline iban TO public con
-- USING/WITH CHECK (true): con la anon key cualquiera leía los clientes de
-- todas las organizaciones (nombre, documento, correo, teléfono), los
-- modificaba (un UPDATE sin WHERE tocaba todas las filas) y creaba clientes en
-- cualquier organización. Como TO public incluye a authenticated, un usuario de
-- una organización también veía los clientes de las demás.
--
-- Nadie depende de ese acceso (verificado el 2026-11-03):
--   * goadmin-websites lee y escribe customers solo en el servidor, con service role;
--     en el navegador, useAuthCustomer lee la ficha propia con sesión
--     («Customers can view their own data»).
--   * El ERP lee con sesión de miembro («Organization members can manage customers»);
--     sus rutas públicas (/auth, /pos-display, /terminos, /privacy) no consultan customers.
--   * Las Edge Functions chat-widget, ai-auto-response y channel-dispatch usan service role.
--   * go-admin-sellers y go-admin-super no consultan customers.
--   * Logs del gateway: 0 peticiones anon a /rest/v1/customers; las del navegador
--     llevan rol authenticated.
--
-- Ensayo (ENSAYO_OK, con rollback): anon pasa de 100 a 0 filas visibles, su UPDATE
-- afecta 0 filas y su INSERT se rechaza; un miembro de la org 333 sigue viendo sus
-- 64 clientes y 0 ajenos; un cliente con sesión ve su ficha y 0 ajenas.
--
-- Se reasignan a service_role (que ya ignora RLS) en vez de borrarlas: el cambio es
-- aditivo y el rollback es un ALTER POLICY.
-- Rollback: supabase/rollbacks/20261103223534_cerrar_lectura_anonima_customers_rollback.sql

alter policy "Allow anon select customers by email" on public.customers to service_role;
alter policy "Allow anon update customers" on public.customers to service_role;
alter policy "Allow anon insert customers" on public.customers to service_role;

comment on policy "Allow anon select customers by email" on public.customers is
  'Desactivada el 2026-11-03 (solo service_role): era USING (true) para todos. Lectura: miembros de la org o el propio cliente.';
comment on policy "Allow anon update customers" on public.customers is
  'Desactivada el 2026-11-03 (solo service_role): era USING (true) para todos.';
comment on policy "Allow anon insert customers" on public.customers is
  'Desactivada el 2026-11-03 (solo service_role): era WITH CHECK (true) para todos.';
