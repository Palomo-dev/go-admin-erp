-- Rollback de crm_v4_f00_42 — elimina el índice parcial de idempotencia de salientes.
--
-- `DROP INDEX CONCURRENTLY` no cabe en la transacción de `apply_migration`; aquí va
-- `DROP INDEX IF EXISTS` (ACCESS EXCLUSIVE breve sobre public.messages: bloquea
-- lecturas y escrituras solo el instante del DROP). Si se prefiere sin bloqueo,
-- a mano fuera de transacción:
--   drop index concurrently if exists public.idx_messages_org_client_request_id;
--
-- Cubre las dos formas de creación (con o sin CONCURRENTLY): el índice es el mismo.
-- El código (`findByClientRequestId`) sigue funcionando sin el índice, solo más lento.
-- Idempotente. Sin credenciales.

drop index if exists public.idx_messages_org_client_request_id;
