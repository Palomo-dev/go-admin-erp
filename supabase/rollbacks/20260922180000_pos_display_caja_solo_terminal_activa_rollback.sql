-- Reversión de 20260922180000_pos_display_caja_solo_terminal_activa.sql.
-- Restaura pos_display_caja_recibe / pos_display_caja_envia tal como las dejó
-- 20260922130000_pos_display_realtime_privado.sql (sin `is_active` y con la
-- expresión regular solo en minúsculas). No hay datos que restaurar.

drop policy if exists pos_display_caja_recibe on realtime.messages;
create policy pos_display_caja_recibe on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')::uuid
    )
  );

drop policy if exists pos_display_caja_envia on realtime.messages;
create policy pos_display_caja_envia on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.pos_terminals t
      where t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')::uuid
    )
  );
