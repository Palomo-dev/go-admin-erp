-- Chat › IA: 👍/👎 de la respuesta sugerida (Figma 93-chat-pendientes-03).
--
-- Se reutiliza `ai_training_feedback` (existía vacía: 0 filas el 2026-11-13),
-- ligada a `ai_jobs` por `ai_job_id`. 👍 = feedback_type 'correct', 👎 =
-- 'incorrect' (valores que ya admite su CHECK); el comentario va en `notes`.
-- Cambios aditivos:
--   - `organization_id` NULL-able: la escribe el servidor con la organización
--     de la sesión (la tabla nació sin ella; las políticas siguen yendo por
--     `ai_jobs`).
--   - `motivo` NULL-able: el chip de «¿Qué falló?».
--   - un voto por persona y trabajo (índice único), para que votar de nuevo
--     reemplace el voto anterior.
-- Escritura: solo el servidor (`/api/chat/ai/trabajos/[id]/valoracion`), que
-- valida que el trabajo sea de la organización de la sesión.

alter table public.ai_training_feedback
  add column if not exists organization_id integer null references public.organizations(id) on delete cascade,
  add column if not exists motivo text null;

alter table public.ai_training_feedback
  drop constraint if exists ai_training_feedback_motivo_check;
alter table public.ai_training_feedback
  add constraint ai_training_feedback_motivo_check
  check (motivo is null or motivo = any (array['dato_incorrecto', 'no_respondio', 'tono', 'muy_larga', 'otro']));

comment on column public.ai_training_feedback.motivo is
  'Chat › IA: motivo del 👎 (dato_incorrecto, no_respondio, tono, muy_larga, otro). NULL en el 👍.';
comment on column public.ai_training_feedback.organization_id is
  'Organización del trabajo de IA; la escribe el servidor con la de la sesión.';

create unique index if not exists uq_ai_training_feedback_trabajo_miembro
  on public.ai_training_feedback (ai_job_id, feedback_by_member_id);
create index if not exists idx_ai_training_feedback_org
  on public.ai_training_feedback (organization_id, created_at desc);
