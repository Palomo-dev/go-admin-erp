-- Aplicada el 2026-10-06 con apply_migration (versión 20261006170233).
-- Parte 2 de 3 de avisos_cliente_pedidos_web: políticas de lectura para los miembros y
-- grant select. Sin el «drop policy if exists» del borrador: las tablas eran nuevas.
-- El cuerpo bajo la línea de guiones es el texto exacto aplicado (md5 4593dbf9be887778a657d29c543f5c51).
-- ------------------------------------------------------------------------
create policy web_order_notice_settings_select on public.web_order_notice_settings
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active));
create policy web_order_notices_select on public.web_order_notices
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active));
grant select on public.web_order_notice_settings to authenticated;
grant select on public.web_order_notices to authenticated;
