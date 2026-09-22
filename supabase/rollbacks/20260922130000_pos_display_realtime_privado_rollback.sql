-- Reversión de 20260922130000_pos_display_realtime_privado.sql.
-- Deja realtime.messages sin políticas (estado anterior: RLS activa, cero
-- políticas), quita el índice del token y restaura el trigger de updated_at
-- sin condición (vuelve a bumpear con el latido). No hay datos que restaurar.

drop policy if exists pos_display_pantalla_recibe on realtime.messages;
drop policy if exists pos_display_pantalla_envia on realtime.messages;
drop policy if exists pos_display_caja_recibe on realtime.messages;
drop policy if exists pos_display_caja_envia on realtime.messages;

drop index if exists public.pos_terminal_secrets_display_token_hash_idx;

drop trigger if exists pos_terminals_set_updated_at on public.pos_terminals;
create trigger pos_terminals_set_updated_at
  before update on public.pos_terminals
  for each row
  execute function public.update_updated_at_column();
