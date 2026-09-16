-- Reversión de 20260910060040_go_assistant_f1_conversaciones_y_mensajes.sql
-- Elimina el historial de conversaciones del asistente. `ai_attachments` (F4)
-- referencia conversaciones: revertir primero 20260910210000 o aceptar SET NULL/CASCADE.
drop trigger if exists trg_ai_assistant_touch_conversation on public.ai_assistant_messages;
drop function if exists public.fn_ai_assistant_touch_conversation();
drop table if exists public.ai_assistant_messages cascade;
drop table if exists public.ai_assistant_conversations cascade;
