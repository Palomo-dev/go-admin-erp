-- crm_v4_f00_42 — índice parcial para la clave de idempotencia de WhatsApp (F0-JOBS r4, QA r3 punto 1 / tester r3 T-2)
--
-- ESTADO: PENDIENTE DE APLICAR. La ronda r4 de JOBS es de solo lectura sobre la BD;
-- el orquestador/dueño la aplica tras revisar este SQL (ver «Bloqueo esperado»).
--
-- Qué resuelve. `findByClientRequestId` (src/lib/services/crm/whatsapp/outboundService.ts)
-- es la única consulta que decide si un envío programado / un reintento YA se hizo:
--   where organization_id = $1 and direction = 'outbound'
--     and created_at >= now() - 7 d and metadata->>'client_request_id' = $2
-- Hoy no hay ningún índice sobre `metadata` (verificado en pg_indexes el 2026-09-15):
-- la consulta entra por idx_messages_organization (organization_id, created_at desc)
-- y filtra en memoria los 7 días de la org. Desde r4 esa consulta es fail-closed
-- (un error ⇒ JobRetryableError, nunca «no enviado»), así que un timeout ya no
-- provoca un segundo envío, pero sí retrasa el job: el índice la hace O(1).
--
-- Índice parcial: solo salientes con clave (hoy 0 de 258 899 filas la tienen:
-- el índice nace vacío y solo crece con los envíos de F16/JOBS que fijan la clave).
-- Expresión (metadata->>'client_request_id') idéntica a la del filtro de PostgREST
-- (`.eq('metadata->>client_request_id', …)`), para que el planificador la use.
-- Predicado `(metadata->>'client_request_id') is not null` y NO `metadata ? 'client_request_id'`
-- (lo que proponía el QA): el planificador solo usa un índice parcial si puede
-- demostrar el predicado a partir del WHERE de la consulta; `expr = $2` (operador
-- estricto) implica `expr is not null`, pero no implica el operador `?`. Con `?`
-- el índice existiría y la consulta seguiría sin usarlo.
--
-- Bloqueo esperado. `CREATE INDEX CONCURRENTLY` no puede ejecutarse dentro de una
-- transacción y `apply_migration` del MCP envuelve el SQL en una; por eso aquí va
-- `CREATE INDEX IF NOT EXISTS` (sin CONCURRENTLY). Toma SHARE lock sobre
-- public.messages mientras recorre la tabla UNA vez (258 899 filas, ~353 MB con
-- índices): las lecturas siguen; los INSERT/UPDATE/DELETE de `messages` (webhooks
-- entrantes de WhatsApp/IG/FB y envíos) esperan. Estimación: segundos, no minutos,
-- en el plan actual. Recomendación: aplicar fuera del horario comercial de las
-- orgs (todas en America/Bogota: p. ej. 03:00–05:00 UTC-5) o, si se prefiere cero
-- bloqueo, ejecutar a mano fuera de transacción (SQL editor / psql):
--   create index concurrently if not exists idx_messages_org_client_request_id
--     on public.messages (organization_id, (metadata->>'client_request_id'))
--     where direction = 'outbound' and (metadata->>'client_request_id') is not null;
-- y después registrar esta versión en schema_migrations. Ambas formas dejan el
-- mismo índice; el rollback las cubre por igual.
--
-- Idempotente (IF NOT EXISTS). Sin credenciales ni nombres de organizaciones cliente.

create index if not exists idx_messages_org_client_request_id
  on public.messages (organization_id, (metadata->>'client_request_id'))
  where direction = 'outbound' and (metadata->>'client_request_id') is not null;

comment on index public.idx_messages_org_client_request_id is
  'Idempotencia de salientes por metadata.client_request_id (F16 sendWhatsApp / F0-JOBS handler whatsapp). Parcial: solo outbound con clave.';

-- Verificación sugerida tras aplicar:
--   select indexdef from pg_indexes where indexname = 'idx_messages_org_client_request_id';
--   explain (costs off) select id from public.messages
--     where organization_id = 1 and direction = 'outbound'
--       and metadata->>'client_request_id' = 'job:x' and created_at >= now() - interval '7 days';
--   (debe aparecer «Index Scan using idx_messages_org_client_request_id»)
