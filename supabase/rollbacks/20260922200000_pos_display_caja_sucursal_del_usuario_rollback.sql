-- Reversion de 20260922200000_pos_display_caja_sucursal_del_usuario.sql.
-- Devuelve pos_display_caja_recibe / pos_display_caja_envia a la forma de
-- 20260922180000_pos_display_caja_solo_terminal_activa.sql: basta con VER una
-- terminal activa, es decir, pertenencia a la organizacion sin filtro de
-- sucursal ni de rol.
--
-- AVISO: al revertir, el canal `pos-display:<uuid>` de cualquier terminal
-- activa vuelve a estar abierto a cualquier miembro activo de la organizacion,
-- que podra leer el carrito en vivo e inyectar mensajes `up` validos. Revertir
-- solo si la politica estricta deja fuera a cajeros legitimos, y en ese caso
-- lo que hay que arreglar son sus asignaciones de sucursal.

drop policy if exists pos_display_caja_recibe on realtime.messages;
create policy pos_display_caja_recibe on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.is_active
        and t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
    )
  );

drop policy if exists pos_display_caja_envia on realtime.messages;
create policy pos_display_caja_envia on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.is_active
        and t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
    )
  );
