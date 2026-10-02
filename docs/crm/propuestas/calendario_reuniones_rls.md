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

## Revisión previa al despliegue y a la activación

El 2026-10-02 se repitió únicamente una lectura acotada de catálogo por MCP,
con `BEGIN READ ONLY`, `statement_timeout = 5s` y `lock_timeout = 1s`. Las tres
tablas conservan RLS habilitada, sin `FORCE`; el índice parcial UUID está válido
y listo. Las seis policies permisivas originales mantienen sus expresiones y
roles; su digest es `eecf05425896c260e9d5fde0f02628bb`. Las nueve policies de esta
activación todavía no existen. No se consultaron ni contaron filas comerciales
para esta revisión.

Se cotejaron los cuerpos y las ACL exactas de los siete helpers y wrappers.
El núcleo conserva MD5 `3536121421ef6ebc5e162dc1de31b187` y el helper de historia
`5eff0fe26df92a3bccf5a04e2a4be162`, ambos privados. El wrapper de sesión
`fn_crm_guardar_reunion(integer,uuid,jsonb)` conserva MD5
`e5e8aa72f82833b98336c9389a298fdc` y ejecución para `authenticated`; el de voz
`fn_crm_agendar_reunion_voz(integer,uuid,jsonb)` conserva MD5
`eae071b392273841dbd02aa01be61797` y ejecución exclusivamente para `postgres`
y `service_role`. Todos siguen siendo `SECURITY DEFINER`, propiedad de
`postgres`; los roles propietarios y de servicio conservan `BYPASSRLS`.

El código revisado corresponde a
`6647b1d5f2d1ce832419532dfd6b212e331a1b06`. El calendario de Next envía las
ediciones, cancelaciones, movimientos y cambios de duración de reuniones CRM
a `/api/crm/meetings`, cuyo servicio usa `fn_crm_guardar_reunion`. Los eventos
manuales y sus excepciones mantienen el SDK; las recurrencias excluyen reuniones
CRM. WS sigue `conversationRelayHandler` → `voiceAgentTools` → `bookMeeting` →
`fn_crm_agendar_reunion_voz`. El export legado `syncActivityToCalendar` aún
escribe directamente, pero la búsqueda de referencias no encontró consumidores
activos en `src` en esta revisión.

La condición operativa para activar es comprobar en los metadatos de despliegue
que producción sirve esas versiones canónicas tanto en Next como en WS. Si el
commit final difiere del capturado, se debe contrastar su revisión y las fuentes
de esos escritores antes de usarla; el nombre de la rama no acredita el
despliegue. También deben recargarse los clientes de calendario anteriores y
retirarse de forma ordenada las réplicas WS antiguas. Esta revisión no confirma
que ningún despliegue ya esté sirviendo la revisión indicada.

Los artefactos temporales de coordinación son:

- `/tmp/calendar-postdeploy-runtime-manifest.json`: SHA y blobs de los diez
  archivos críticos de Next y cinco de WS. Huella de Next
  `374b7142fb852fb22bcbb23a98ed038416cbe2c25a849f24afda1c8ee0bd1c39`; de WS
  `f5884ad13df61929e7c05247b7647ba642b106d8bf038a2074b745a638e2e39e`.
- `/tmp/calendar-postdeploy-preflight.sql`, MD5
  `9e2a77ecf7a3f9aaa56eda96cf65e1b6`: comprobación de catálogo ejecutada en fase
  `pre`, resultado `calendar_catalog_pre_ok`. La fase `post`, aún no ejecutada,
  verifica las nueve policies exactas y que originales, índice, cuerpos y ACL
  siguen intactos. No instala ni revierte objetos.
- `/tmp/calendar-postdeploy-smoke.sql`, MD5
  `740720241facfc4971644aa20f082e2a`: propuesta de diecisiete comprobaciones
  transaccionales posteriores a la activación; **no ejecutada**. Usa actor y
  organización activos verificados, un cliente sintético, dos eventos y una
  excepción. Comprueba RPC crear/replay/editar/cancelar, bloqueo de escrituras
  directas CRM, eventos y excepciones manuales, núcleo privado y sesión nula.
  Termina en `ROLLBACK`, sin HTTP, invitaciones, proveedores ni créditos de voz.
  La limpieza se comprueba solamente por los UUID de esas fixtures, sin barridos
  de metadata ni snapshots globales.

La activación exacta sigue teniendo MD5 `1a8e5a7d1f59075b96862ec44cbc01e8`
(3.256 bytes) y su reversión `9fea91e13dfb39e919e4ec5834ded1a1` (1.078 bytes).
El responsable del despliegue coordina esa aplicación y la comprobación final.
Ante un fallo se retiran únicamente estas nueve policies; se conserva la
expansión compatible ya aplicada. Esta revisión confirma la compatibilidad de
ACL y de los escritores, pero no añade una prueba real del proveedor ni del
wrapper de voz completo a la evidencia histórica.
