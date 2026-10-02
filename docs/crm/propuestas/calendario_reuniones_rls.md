# Protección de reuniones en calendario

Estado: expansión compatible aplicada; activación restrictiva pendiente de despliegue. El 2026-10-02 se verificaron por MCP el esquema,
las ACL, las policies y los triggers reales. `activities` tenía 1066 filas y
`calendar_events` 10, con lectura limitada a 20001 filas. Solo dos actividades
tenían `metadata.event_id`: ambas `meeting`, sin duplicados ni valores no UUID.

La activación `calendario_reuniones_rls.sql` añade nueve policies restrictivas
de escritura sobre `calendar_events`,
`activities` y `calendar_exceptions`, sin reemplazar las policies permisivas de
lectura ni el flujo de eventos manuales. Una reunión CRM se modifica mediante la
RPC de sesión; la autoría y `crm.activities.edit_any` se resuelven dentro del
núcleo existente. La clasificación también reconoce los enlaces inversos cuando
la metadata se ha dañado. Las excepciones de recurrencia siguen disponibles para
eventos manuales y rechazan reasignarse a reuniones CRM u organizaciones ajenas.

La expansión `calendario_reuniones_expansion.sql` instala primero los helpers,
el núcleo y el índice, conservando los escritores directos del calendario
actualmente desplegado. El índice único parcial reserva los UUID en
`metadata.event_id` para una sola
actividad por evento, sin distinguir organización, tipo ni mayúsculas. Las
referencias de proveedores que no son UUID, como los identificadores Stripe,
conservan su comportamiento. El núcleo bloquea primero el evento y después su
historial; cuenta todas las referencias y comprueba identidad canónica, autor,
entidad, fecha y estado antes de editar o reutilizar una reunión. La guarda
devuelve `23505` ante conflicto de negocio y evita que un reintento o un escritor
interno cree dos historias del mismo evento.

Prueba final por MCP dentro de `BEGIN; ... ROLLBACK`: 49 comprobaciones pasaron
en menos de seis segundos, con `lock_timeout = 3s` y `statement_timeout = 10s`,
incluyendo aplicación doble y reversión doble de ambas etapas. La expansión
por sí sola conservó crear, editar y eliminar por SDK un evento CRM y su
historial; después se probó la activación futura. Se comprobaron
CRUD directo bloqueado, edición propia y por administrador, replay, núcleo de
voz, eventos/excepciones manuales, rechazo de referencias ajenas, colisión UUID
en mayúsculas y ACL privadas. La reversión recuperó exactamente el cuerpo previo
del núcleo (MD5 `pg_get_functiondef`: `352683355dbe6de07e9bb96f72b0139d`), mantuvo
las ACL de los wrappers, eliminó los objetos añadidos y dejó cero fixtures.

PostgreSQL observado: `15.8` (`150008`). MD5 de los archivos finales de
expansión: SQL `2c7724a3b0cc6b0d606134a701631bd9`, rollback
`ccf934719428a71c1ee360bc92d03bc9`. MD5 de `pg_get_functiondef` durante la prueba:
núcleo `3536121421ef6ebc5e162dc1de31b187`; helper privado de historia
`5eff0fe26df92a3bccf5a04e2a4be162`. Ambos conservaron ejecución solo para
`postgres`. Los wrappers de sesión y voz conservaron sus cuerpos y ACL anteriores.

La reparación auditada de historia legada debe aplicarse antes de este índice.
Después se instala la expansión, que conserva las escrituras directas del
frontend antiguo. La activación de las nueve policies solo se ejecuta tras
desplegar los escritores canónicos del PR: activarlas antes bloquearía cambios
legítimos del calendario actual. Para revertir, primero se retiran las nueve
policies mediante `calendario_reuniones_rls.rollback.sql`; después
`calendario_reuniones_expansion.rollback.sql` recupera el núcleo y sus ACL previos.

La expansión se aplicó por MCP como versión `20261002054023`; SQL exacto,
17.875 bytes y MD5 `2c7724a3b0cc6b0d606134a701631bd9`, contrastados con
schema_migrations. Sus archivos aplicados y de reversión se registran en
supabase/migrations y supabase/rollbacks. Los cuerpos del núcleo y helper
coinciden con la prueba. Los asesores no detectan nuevos avisos de rendimiento;
el WARN 0029 de los clasificadores authenticated es intencional y conserva
las guardas de sesión y pertenencia probadas. La activación de nueve policies
continúa sin aplicar. No se ha probado la RPC completa de voz con proveedores externos; la batería solo ejercitó su núcleo compartido y
comprobó que la ACL del wrapper de voz seguía intacta. Ninguna prueba envió
invitaciones o efectuó llamadas. Las inserciones de notificaciones de calendario
quedaron dentro de la transacción revertida.
