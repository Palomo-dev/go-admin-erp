-- Reversión de 20260909231333_go_assistant_f0_agent_actions_y_settings.sql
-- Elimina las dos tablas del asistente. `ai_assistant_messages.action_id` y
-- `ai_assistant_conversations` (F1) dependen de `ai_agent_actions`: revertir
-- primero 20260910060040 o aceptar el CASCADE.
drop table if exists public.ai_assistant_settings cascade;
drop table if exists public.ai_agent_actions cascade;
