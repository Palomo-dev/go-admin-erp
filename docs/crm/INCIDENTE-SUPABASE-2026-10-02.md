# Incidente Supabase durante las pruebas del CRM

Las pruebas sobre la API de Actividades de la fase 59 provocaron una tormenta de reintentos SQL: una colisión deliberada de clave devolvía `40001`, reservado para fallos de serialización transitorios. PostgREST reintentó la transacción en vez de devolver el conflicto de negocio. Los logs consultados por el orquestador registran **52.811 errores `40001`** entre `2026-10-02 01:40:47.325` y `01:49:35.511` UTC, equivalentes al **1 de octubre, 20:40:47.325–20:49:35.511 en America/Bogota**. Son errores SQL repetidos; ese conteo no representa 52.811 acciones distintas del usuario.

La clasificación se corrigió por MCP a las `01:49:35` UTC, versión `20261002014935`, mediante `20261002015000_crm_reintentos_conflicto_negocio.sql`. Sólo se cambió aquel conflicto a `23505`; la misma API pasó de `500` a `409 reintento_con_datos_distintos`. MD5 del SQL: `92759723d34dbbcce8f0b9f36749eb04`; reversión: `bfa1ce13986d4af4c7e348b665ad3a53`. La reversión técnica reintroduce el defecto y no debe usarse para recuperar producción.

## Evidencia y capa que multiplicó el error

Los scripts privados `crm-actividades59-api.cjs`, `crm-actividades59-api-retry.cjs` y `crm-actividades59-task-api.cjs` contienen secuencias finitas. Cada helper realiza un `fetch` y no tiene bucles de reintento. La prueba de Actividades hace siete POST hasta el caso conflictivo; después del arreglo continúa con feed, edición e historial. La de Tareas hace cuatro POST. El archivo llamado `api-retry` es una nueva ejecución explícita de la prueba, no un bucle dentro del script.

El código instalado era `supabase-js 2.49.8` y `postgrest-js 1.19.4`; su `PostgrestBuilder` realiza un único `_fetch` y no incorpora el reintento automático de versiones posteriores. La ruta invoca la RPC nativa una vez. Por tanto, estos componentes locales no contienen el multiplicador observado. Los errores SQL proceden de PostgREST, no de `mgmt-api`.

La [guía oficial de Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b), consultada durante la investigación, describe precisamente este mecanismo: un `RAISE` manual con `40001` hace que PostgREST reintente una sola petición como múltiples transacciones y sature los logs. Recomienda `P0001` o `PT409`. La guía menciona PostgREST 14 y una corrección en 16; los logs de este proyecto muestran `12.2.3`. No se atribuye al proyecto una versión distinta ni se presume que actualizarlo esté disponible o resuelva por sí solo el incidente.

| Evidencia privada | Hora UTC del archivo | Resultado observado |
| --- | --- | --- |
| `crm-actividades59-api.log` | 02 Oct 01:42:52.356 | La aserción esperaba 409 y recibió 500. |
| `crm-actividades59-api-retry.log` | 02 Oct 01:47:16.772 | 401/403/400/400/201/201 y finalmente 500; la secuencia termina al fallar. |
| `crm-actividades59-api-final.log` | 02 Oct 01:49:40.389 | Conflicto 409; creación deduplicada, feed, edición e historial completos. |
| `crm-actividades59-task-api.log` | 02 Oct 01:50:42.714 | Creación deduplicada, conflicto 409 y responsable ajeno 404. |

Las horas anteriores son modificaciones de archivos locales, no timestamps independientes de inicio de petición. `PROGRESS.md`, fase 59, y `docs/crm/PLAN-FIGMA-A-CODIGO.md` ya registraban el defecto y la corrección. Se conservaron los logs privados para corroborar la secuencia; este informe no publica cookies, credenciales, clientes ni identificadores de prueba.

## Los errores posteriores

El orquestador contó siete errores `23505` en una ventana más amplia, del 1 Oct 20:40 UTC al 2 Oct 05:20 UTC. Se atribuyen con contexto exacto **cuatro** a las pruebas negativas de la fase 59: tres de Actividades entre `01:49:35.516` y `01:49:38.227` UTC, y uno de Tareas a `01:50:42.342` UTC. Los otros tres no tienen atribución confirmada y no se presentan como parte de la misma prueba.

El `P0002 responsable_no_encontrado` de `01:50:42.678` UTC corresponde al caso negativo que envía un responsable ajeno; la API devolvió el 404 esperado. Esa evidencia no demuestra un problema de permisos del administrador en una operación normal. Estos cuatro conflictos y aquel 404 tienen un volumen acotado y un resultado esperado; no justifican los 52.811 errores anteriores.

## Realtime: relación temporal, causalidad pendiente

A las `04:14:05.716` UTC una prueba SQL de historial creó `history60_baseline` con agregaciones globales `jsonb_agg(to_jsonb(...))` de clientes, oportunidades, actividades y eventos de calendario, además de `LOCK TABLE ... SHARE ROW EXCLUSIVE`. Era una prueba pesada en la base real.

Después aparecen errores `CheckOids` desde `04:16:18`, `DatabaseConnectionDown` desde `04:16:40` y timeouts de consultas entre `04:18:07` y `04:40:59` UTC. La proximidad hace plausible que la prueba haya contribuido a la carga o los bloqueos. **No hay métricas históricas de CPU, memoria o bloqueo suficientes para demostrar causalidad.** Este episodio ocurre más de dos horas después de la tormenta de la fase 59; no se confunden ambos conteos ni se atribuyen a una caída del proveedor sin evidencia. Las agregaciones globales se retiraron en la fase 61 y los gates posteriores se acotaron a sus fixtures.

## Estado y corrección de recurrencia

La investigación local del `2026-10-02 13:08:48` UTC encontró **cero procesos vivos** ejecutando los tres scripts API59. Esto prueba el estado de esos procesos locales, no sustituye una comprobación de backends en Postgres. La documentación de Supabase advierte que cambiar una función no garantiza detener transacciones que ya estaban en vuelo; cualquier cancelación debe identificar el backend exacto. No se cancelaron procesos ni se reinició el proyecto durante esta investigación.

Se pausaron las pruebas y escrituras generales en Supabase. La revisión de recurrencia comenzó con una lectura por MCP de nueve definiciones y sus metadatos; no se repitieron peticiones HTTP ni consultas globales. Esa lectura confirmó **17 `RAISE 40001` deterministas en nueve RPC** de Llamadas, PHONE, Equipo, Red comercial y Objeciones. Identidades ya usa `P0001` en su versión actual.

El delta `propuestas/crm_conflictos_sqlstate.sql` cambia únicamente esas 17 clasificaciones a `P0001`, que el mapeo nativo de la API convierte a 409. Exige firmas y hashes anteriores exactos, conserva catálogo/ACL/search_path y admite reaplicación. El orquestador autorizó un primer gate y dos diagnósticos acotados de metadatos: los tres terminaron en rollback, sin invocar RPC comerciales ni HTTP. El primer comparador detectó posiciones distintas del parser en el AST de un default; los diagnósticos confirmaron defaults y argumentos iguales. Se ajustó sólo aquella comparación para preservar el AST salvo posiciones y comparar también los argumentos deparseados.

El gate privado corregido pasó **98 aserciones en 1,9 segundos** dentro de `BEGIN/ROLLBACK`, con timeout de cuatro segundos y excepciones instrumentadas en `pg_temp`, sin invocar RPC de negocio, filas comerciales ni HTTP. Su MD5 era `9f86ec78f15464de296d151abdb35f0d`; se retiró el SQL temporal después de registrar la evidencia.

El orquestador aplicó la corrección por MCP, versión **`20261002131611`**, SQL MD5 `f1761fc00b6173ad2696f340d1d38618`, reversión exacta `89ef8a680f9246785838b7ee85539902`. La lectura posterior confirmó los nueve hashes finales y sus permisos, propietario y search_path. Es una corrección de código de error sobre funciones existentes, sin datos comerciales modificados ni llamadas a proveedores. Estas comprobaciones de recuperación no reanudan las pruebas generales ni las cargas del CRM en la base real.

El guardrail local `src/__tests__/guardrail-sqlstate-conflictos.test.ts` rechaza nuevos `RAISE` manuales de serialización y admite los archivos históricos sólo por hash exacto. No se reescriben migraciones aplicadas. Las pruebas locales del mapeo de `P0001` confirman respuestas 409 con código de negocio y sin detalles SQL privados; PHONE verifica también una única llamada de control. El delta aplicado cierra la clasificación incorrecta de estas nueve RPC. Esta evidencia no sustituye la verificación pendiente de otros flujos del CRM ni demuestra la causa del episodio de Realtime.
