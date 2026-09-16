-- 20260915110000_drop_execute_sql.sql
-- F-sec: DROP de execute_sql(sql_query text)
--
-- Nadie la invoca por RPC en los cuatro repos (go-admin-erp,
-- go-admin-investors, go-admin-super, go-admin-sellers). Solo aparece en:
--   - src/lib/ai/assistant/actionCatalog.ts linea 502 (denylist del GO Assistant)
--   - src/__tests__/guardrails.test.ts (lista de referencia)
--   - documentacion (CLAUDE.md, PROMPT-AGENTE-INVERSIONISTAS.md)
--
-- Una funcion que ejecuta SQL arbitrario como postgres no tiene sitio
-- en una base multi-tenant, ni siquiera cerrada. Si en el futuro se
-- necesita una consulta ad-hoc para el asistente IA, debe ser una RPC
-- especifica y tipada por caso de uso, no un EXECUTE generico.
--
-- ACL antes del DROP: postgres=X/postgres | service_role=X/postgres
-- (ya revocada la exposicion a PUBLIC/anon/authenticated en produccion).
--
-- Verificacion de invocantes: ver commit 39b0fe37 (auditoria grupo b).

drop function if exists public.execute_sql(sql_query text);
