-- PREPARADO, NO APLICADO. Solo para rollback coordinado mediante MCP.
-- ADVERTENCIA: reabre escritura directa de clientes bajo las políticas RLS
-- existentes. Aplicar antes de volver a desplegar un runtime que escriba con sesión.
-- Restaura los grants de tabla observados por MCP el 2026-09-19:
-- anon/authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
-- sin grant option. SELECT no fue revocado; PUBLIC no tenía grants explícitos.
-- No había ACL por columna. No reconstruye grants personalizados posteriores
-- a esa inspección: si hay deriva, revisar/restaurar el snapshot del despliegue.
-- No restaura ni modifica filas, políticas, funciones o permisos service_role.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant insert, update, delete, truncate, references, trigger
  on table public.ai_agent_actions to anon, authenticated;

commit;
