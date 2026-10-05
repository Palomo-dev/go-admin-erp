# Llamadas: expansión transaccional aplicada por MCP

La expansión se aplicó por MCP como versión `20261002054759`, después de
94 comprobaciones reales en BEGIN/ROLLBACK. SQL exacto, MD5 y 54.269 bytes
contrastados con schema_migrations; cuerpos y permisos verificados después de
aplicar. Registro en supabase/migrations/20261002060000_crm_llamadas_atomicas.sql
y reversión correspondiente en supabase/rollbacks. El runtime canónico puede
activar CRM_CALL_ATOMIC_RPC_ENABLED=true; sus gates Node y API finales siguen
en cierre. Las policies restrictivas de acceso directo continúan diferidas
hasta desplegar los escritores nuevos.

La propuesta guarda llamada, actividad y tarea de seguimiento en una transacción.
La disposición usa el usuario autenticado, pertenencia activa y
`crm.activities.edit_any` para llamadas ajenas o sin autor; `crm.calls.view_all`
permite lectura. La clave de intención del diálogo se conserva al reintentar y se
renueva al editar/reabrir. Un recibo privado mantiene la respuesta original sin
volver a aplicar una disposición antigua ni duplicar la tarea. Cambiar datos de
una clave ya usada debe producir 409.

El callback recibe un snapshot tipado y el parche de `callStateMachine`; SQL no
reimplementa esa máquina. Un conflicto devuelve la fila actual para recalcular.
El snapshot compara 20 campos tipados, incluidos grabación, consentimiento,
modalidad de puente, timbrado, fuente de duración y coste; cambiar solo una bandera
o un coste también obliga a recalcular sobre la fila actual.
Snapshot y notas extensas viajan en JSON del body, porque los filtros de URL de
PostgREST exceden su límite con notas válidas de 20.000 caracteres. El enriquecimiento completo
se escribe dentro de la RPC y devuelve `activity_id/created`, sin un UPDATE Node
posterior. El servicio exige JWT `service_role` y las funciones privadas no tienen
grants de API. Los contactos de cliente y oportunidad usan el mismo cierre real
pasado, sin retroceder; también se conservan seguimiento y temperatura.

Mientras la variable siga apagada, el escritor anterior tiene guardas de autoría,
relectura y CAS, pero **sigue sin ser una transacción de varias tablas ni un
seguimiento idempotente**. La metadata/nota extensa se rechaza con 503 antes de un
UPDATE que dejaría una fila imposible de actualizar por URL. Al retirar los
escritores de contacto Node, SQL 59 acredita `started_at` vía la actividad; el
cierre, `next_contact_at` y temperatura requieren la nueva RPC. Por ello estas
rutas permanecen bloqueadas para rollout: no se acredita un flujo completo con
la variable apagada.

La verificación final real por MCP aprobó 94 casos en `BEGIN/ROLLBACK`, incluida
la aplicación doble, rollback doble, reaplicación y restauración del cuerpo anterior
de `fn_crm_registrar_actividad` (`md5(prosrc)=e76ba851d5f9da2210a06de0af0c5630`).
Se comprobaron los once cuerpos de función, sus permisos y `search_path` antes y
después de reaplicar. El rollback revocó las diez APIs nuevas y restauró la ACL
anterior de la RPC genérica. La lectura posterior confirmó cero fixtures, cero
constraints temporales y ausencia de las APIs, recibos y políticas propuestos.
Se probaron intercalados de snapshots obsoletos en secuencia; esto no acredita una
prueba con dos conexiones en paralelo. Los 13 casos de consentimiento verificaron
acta, banderas e historial, reintentos, retirada, avisos tardíos, grabación existente,
permisos y rollback completo ante fallos posteriores. La expansión ya está aplicada.
Los UUID de análisis,
transcripción y grabación llegan únicamente desde el enriquecimiento interno
service role y se validan contra `organization_id` y `call_id`. Un análisis con
transcripción comprueba además la relación de esa transcripción con la llamada.
Las columnas de `calls`, `activities`, `call_analyses`, `call_transcripts`,
`call_recordings`, `organization_members`, `tasks`, `customers` y `opportunities`
se verificaron por MCP después de recuperarse la conexión el 2 de octubre de 2026.

El candidato comprobado contiene 54.269 bytes UTF-8 y su MD5 es
`00b68ec23425460998276951fd02ad24`; el rollback contiene 9.742 bytes y su MD5 es
`aa67c80b9257a0d589278ca9d34831f1`. Las políticas separadas de acceso directo no se
activaron. El dry-run no modificó llamadas reales ni ejecutó proveedores de voz,
envíos de correo o escrituras de Storage.

`calls.cost_amount` es `numeric` y `calls.cost_currency` es `text NOT NULL` en el
esquema vivo comprobado por MCP. La whitelist y el UPDATE del callback también
incluyen `provider_call_sid`, necesario para persistir el SID de una llamada puente
sin borrar metadata concurrente. El esquema comprobado y los tests de contrato
no reemplazan la prueba MCP de la RPC real.

La RPC canónica `fn_crm_crear_tarea(integer,jsonb)` acepta una descripción de hasta
5.000 caracteres. La tarea conserva ese máximo y la nota completa de hasta 20.000
caracteres permanece en llamada e historial. La disposición histórica más nueva
tiene prioridad sobre un resumen IA; el resultado IA se usa cuando no hay resultado
manual. Las funciones canónicas de pertenencia, permisos y tareas se verificaron
por MCP, incluida su firma y ACL, y se reutilizan sin implementar otro escritor.

La vinculación completa llamada e historial en una transacción y conserva grabaciones,
notas y metadata. Reutiliza `crm_create_opportunity` para crear oportunidades y un
INSERT preparado compartido con el alta de leads para crear clientes. El recibo de
vinculación es independiente del de disposición: un reintento antiguo devuelve su
respuesta original y conserva el enlace más reciente. Completar referencias faltantes
es válido; reemplazar o borrar una referencia existente requiere otro flujo.

La creación por sesión usa `fn_crm_crear_llamada`: exige miembro activo y el autor de
la sesión, valida referencias de la organización y guarda el historial terminado en
la misma transacción. `crm.calls.create` no existe en el esquema comprobado; no se
inventa ese permiso. El coste se escribe por el callback de servicio. La RPC genérica
de actividades rechaza `call_id` y `metadata.call_id`; conserva las llamadas manuales
sin enlace técnico. El historial técnico solo se deriva del núcleo de llamadas.

Las APIs de consentimiento guardan acta y banderas, o retiran ambos, bajo el bloqueo
de la llamada y en la misma transacción. Conservan la primera acta y su fecha. Una
grabación existente impide retirar la evidencia; una retirada previa impide que un
aviso tardío vuelva a marcar el consentimiento. No se atribuye aviso acreditado a
un acta `unverified_announcement`.

`llamadas_acceso_directo.sql` y su rollback son una propuesta de activación separada:
restringen lectura de llamadas a autor o `crm.calls.view_all` y cierran escrituras
directas de llamadas e historial técnico desde `authenticated`. Las escrituras
manuales sin enlace y las RPC legítimas se probaron con el rol real de API. **No
aplicar estas políticas antes de desplegar los escritores nuevos**: el runtime previo
inserta llamadas con el cliente de sesión. No se activaron estas restricciones.

El cambio del guardado final de liquidación solo evita borrar metadata concurrente
con un snapshot viejo; la atomicidad/idempotencia monetaria de cobro, uso y
reembolso sigue fuera de esta propuesta. Transcripción/análisis y notificaciones
mantienen sus contratos propios: un fallo de historial detiene acciones posteriores,
pero el conjunto análisis+acciones+notificación no es una transacción.

La grabación manual conserva llamada/audio si falla después el historial y reporta
el error; no devuelve éxito ni borra evidencia ya guardada. La propuesta no convierte
Storage y Postgres en una transacción distribuida.

Asesores posteriores: no hay nuevos avisos de rendimiento en las APIs/recibos.
El WARN 0029 de las funciones authenticated SECURITY DEFINER es intencional:
sesión, pertenencia, referencias y permiso de edición se comprueban en la RPC
y se probaron con roles PostgreSQL reales. PUBLIC y anon no tienen EXECUTE;
los núcleos/recibos privados no conceden acceso a roles API. No se han realizado
llamadas reales ni pruebas de dos conexiones concurrentes en esta batería.
