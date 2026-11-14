-- Reversión de 20261113221213_ai_training_feedback_valoracion_chat.
--
-- Advertencia de datos: quitar `motivo` y `organization_id` pierde el motivo
-- de cada 👎 (el voto y el comentario quedan en feedback_type y notes). Antes
-- de la migración la tabla tenía 0 filas. El código que los escribe
-- (`/api/chat/ai/trabajos/[id]/valoracion`) y los lee (IA › Trabajos) también
-- hay que revertirlo.

drop index if exists public.idx_ai_training_feedback_org;
drop index if exists public.uq_ai_training_feedback_trabajo_miembro;
alter table public.ai_training_feedback drop constraint if exists ai_training_feedback_motivo_check;
alter table public.ai_training_feedback drop column if exists motivo;
alter table public.ai_training_feedback drop column if exists organization_id;
