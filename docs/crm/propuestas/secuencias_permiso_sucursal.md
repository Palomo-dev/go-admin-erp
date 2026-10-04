# Secuencias: permisos, referencias y salida atómica

Estado: **expansión compatible aplicada; 15 políticas RLS pendientes de activación después del despliegue**. El usuario autorizó cerrar estas protecciones y desplegar el flujo. Se revisaron mediante lecturas acotadas del MCP los cuerpos, firmas, ACL, helpers, columnas, constraints y políticas actuales del proyecto. El orquestador ejecutó el gate de catálogo dentro de BEGIN/ROLLBACK y el agente ejecutó, con autorización específica, la prueba funcional sobre tablas temporales. El MCP aplicó la expansión compatible como `20261002152713_crm_secuencias_permiso_sucursal_salida_atomica` el 2026-10-02; la copia exacta está en `supabase/migrations/20261002152713_crm_secuencias_permiso_sucursal_salida_atomica.sql` y su reversión en `supabase/rollbacks/20261002152713_crm_secuencias_permiso_sucursal_salida_atomica_rollback.sql`. No se realizaron pruebas HTTP, llamadas a proveedores, snapshots globales ni mutaciones de datos públicos.

## Expansión compatible

`secuencias_permiso_sucursal.sql` modifica solamente los prefijos de autorización de `fn_enroll_in_sequence` y `fn_resume_sequence_enrollment`. Reutiliza `fn_crm_exigir_permiso` con `admin.full_access` o `crm.campaigns.manage`, vincula `enrolled_by` al usuario autenticado y valida organización, referencias y sucursales mediante `app_branch_access`. Las ACL existentes permiten sólo al propietario, `authenticated` y `service_role`; no se amplían.

La comparación local automatizada verifica que retirar los prefijos añadidos devuelve las declaraciones y cuerpos nativos byte a byte. Los originales siguen siendo MD5 `1969a16b09c89b821cefa31d6f8afb31` y `2657c98e120c0394abd5bee5be237e95`. Se conserva el motor que calcula los pasos, programa el primero, deduplica la inscripción y reanuda la cadena. El cliente efectivo de inscripción sigue siendo el de la oportunidad, con `p_customer_id` como fallback cuando aquél es NULL.

El prefijo captura las referencias y bloquea cliente → oportunidad → inscripción, cuando corresponde. Usa `FOR SHARE NOWAIT` para cliente y oportunidad y `FOR UPDATE NOWAIT` para la inscripción. Revalida las referencias después de adquirir el lock y estabiliza también las sucursales y la secuencia antes de volver al motor. Los cuerpos heredados de oportunidad pueden bloquear oportunidad → cliente; `NOWAIT` impide formar un ciclo de espera con ellos o con la fusión nativa, que empieza por clientes. Un lock ocupado o una referencia cambiada producen `P0001 registro_cambio`, sin introducir `40001` ni reintentos automáticos. En reanudación y salida se rechazan un cliente de inscripción y un cliente de oportunidad distintos cuando ambos existen; un fallback o ambas referencias NULL conservan el comportamiento nativo.

El worker conserva su autorización interna por el helper canónico. Reanudación y salida toman el lock de inscripción también cuando `auth.uid()` es NULL; así ambos caminos ordenan inscripción antes de escribir sus runs. Las consultas de programación originales no se sustituyen.

No existe una RPC nativa de salida en el catálogo actual. La nueva `fn_exit_sequence_enrollment(p_org integer, p_enrollment_id uuid, p_reason text DEFAULT 'manual_unenroll') RETURNS jsonb` concentra las dos escrituras anteriores de `unenrollFromSequence`: cambia una inscripción `active|paused` a `exited` y marca sólo sus runs `pending` como `skipped`. Devuelve la fila de inscripción o NULL si no existe/no admite otra salida. Un fallo en la segunda escritura revierte la primera. El código de aplicación debe adoptar esta RPC antes de activar las restricciones posteriores. La función usa `search_path=public,pg_temp`, revoca ejecución a `PUBLIC`/`anon` y concede sólo a `authenticated`/`service_role`.

| Artefacto compatible | Bytes | MD5 |
|---|---:|---|
| SQL | 28.007 | `0563701aa3b8ed9ab71766662fddc19b` |
| Rollback | 13.805 | `630f9b20eab65fa7fc1e90dba3b2dbcf` |
| Gate de catálogo | 120.510 | `88d606ed5b11de669c96ebd83251655a` |
| Gate funcional aislado | 82.603 | `fbef7ffa9670a4b43063ad0b9cb413b9` |

Cuerpos resultantes confirmados por lectura de catálogo del orquestador: inscripción `08144f2f020143d8185ecdc6103a29da`, reanudación `4a215017a83271e5d49a0fdeb138b305`, salida `c74c86363c61614c7d73fa22ec3fc97e`. El gate de catálogo pasó **26 aserciones** en 2,8 segundos: doble aplicación, doble rollback y reaplicación de las funciones, metadatos/ACL/defaults y contrato de la nueva RPC. No ejecutó ninguna RPC de negocio ni DML público.

La prueba funcional aislada pasó **47 aserciones**: permisos/actor, sucursales/tenant/fallback, programación nativa, servicio, replay de salida, fallo tardío, configuración del manager, lectura del viewer y denegación de scheduling directo. Usó 14 tablas TEMP creadas con LIKE del esquema, actores UUID sintéticos y organizaciones 1/2 existentes sólo en esos fixtures, helpers canónicos y queue nativa clonados. Las referencias públicas aparecen únicamente en LIKE para leer metadatos; todos los IDs seriales del fixture se suministran explícitamente para no consumir secuencias públicas. También verifica intercalaciones controladas en copias `pg_temp` y el manejo de `55P03`; no equivale a una prueba entre dos conexiones concurrentes.

El primer intento aislado abortó por comparar literalmente el texto de una denegación de INSERT RLS. El segundo intento, autorizado por separado, conservó SQLSTATE `42501` y la identificación de policy/tabla para esa comprobación, manteniendo exactos los mensajes de negocio, y pasó en 2,2 segundos. El contador final exige las 47 comprobaciones antes del ROLLBACK. No hubo retries automáticos, datos de clientes, miembros/roles reales, jobs públicos ni triggers sobre tablas públicas. Los harness iniciales que proponían fixtures públicos se retiraron sin ejecutarse.

Los guards de migración exigen hashes y contratos conocidos, preservan owner, `SECURITY DEFINER`, ACL, argumentos, configuración y restantes metadatos de `pg_proc`. Sólo se normalizan los offsets `:location` del AST de defaults, comprobando además `pg_get_function_arguments`. La expansión limita locks a un segundo y statements a cuatro segundos. El rollback restaura los cuerpos originales y retira la nueva RPC; debe coordinarse con el rollback de aplicación y reabre el bypass anterior, por lo que no es una medida de protección.

## Restricciones posteriores al despliegue

La lectura del MCP confirmó que las cuatro tablas tenían políticas permisivas para miembros activos y ACL amplias. Por ello proteger sólo las RPC deja abiertas las escrituras directas. `secuencias_permiso_sucursal.rls.sql` agrega **15 políticas restrictivas** sin reemplazar las originales. La versión inicial se revisó de nuevo el 4 de octubre para cerrar la creación, eliminación y modificación de pasos por SDK; ver el delta de configuración al final:

- El UPDATE del padre conserva el permiso canónico de gestión. INSERT y DELETE directos de `sequences`, e INSERT, UPDATE y DELETE de `sequence_steps`, se deniegan a `authenticated`: se usan las RPC de configuración atómica y se evita saltar su validación de pasos mediante SDK.
- La lectura de secuencias y pasos conserva el acceso del viewer, cuyo `can_manage` puede ser false. La lectura de pasos comprueba su padre.
- La lectura de inscripciones exige referencias coherentes, mismo tenant y acceso a las sucursales del cliente y de la oportunidad. La de runs exige además que step e inscripción pertenezcan a la misma secuencia/organización.
- INSERT/UPDATE/DELETE directos de inscripciones y runs se deniegan a `authenticated`. Las RPC y workers de servicio mantienen el camino nativo autorizado. Esta restricción requiere que la salida de la aplicación ya use una única RPC.

El helper de lectura `fn_sequence_enrollment_scope` devuelve sólo un booleano de alcance ligado a `auth.uid()`, sin datos ni destinos ajenos. Usa los helpers canónicos, fija `search_path` y revoca `PUBLIC`/`anon`. No crea otro engine ni ejecuta mutaciones. Las políticas sólo agregan restricciones; la reversión retira esas políticas y el helper, dejando los originales y las ACL de tablas intactos.

| Artefacto inicial posterior al despliegue (evidencia histórica) | Bytes | MD5 |
|---|---:|---|
| SQL RLS | 15.041 | `7fbbdcd2999f571f89f433fd42f7a0dc` |
| Rollback RLS | 8.844 | `bfce4121b17ca9da3d71b8bccaa3f754` |
| Prueba de RLS sobre clones | 82.603 | `fbef7ffa9670a4b43063ad0b9cb413b9` |

Hash del helper esperado: `6725e015a9cfd72d365169cf952c3590`. Las 15 políticas se comprobaron sobre clones TEMP junto con los casos funcionales anteriores. Esta prueba acredita su comportamiento sobre fixtures; no aplicó ni revirtió políticas en tablas de producción. Su activación real exige la expansión compatible y la aplicación con salida por RPC ya publicadas. La reversión debe comprobarse y coordinarse al activar; no debe usarse sobre el runtime anterior.

## Límites de la evidencia

La revisión independiente local confirmó orden de locks, firma/DTO de salida, conservación de lectura de viewers y del worker y aislamiento del gate: sólo referencias LIKE a metadatos públicos, IDs seriales explícitos, helpers/queue privados y trigger temporal. Los dos gates PostgreSQL acabaron en ROLLBACK. El orquestador confirmó después de la aplicación los tres hashes de cuerpos, ACL, `search_path` y `SECURITY DEFINER`. Los advisors no reportaron categorías ERROR: nueve categorías de seguridad y siete de rendimiento conservan advertencias/avisos, incluida la elevación intencional de la RPC con guardas. Esto no acredita una base libre de warnings. La prueba funcional no escribió filas públicas. Siguen pendientes el despliegue y la activación real de las restricciones.

La salida impide que un worker que vuelva a leer `exited` ejecute sus runs pendientes. No rescinde instantáneamente una operación externa que otro worker haya comenzado antes de la salida. Los permisos se evalúan con los helpers nativos; esta expansión no promete revocación instantánea de autorizaciones en transacciones ya iniciadas. No se realizó una prueba de carga, una prueba entre dos conexiones, ni una prueba real de entrega al proveedor.

## Delta de configuración del 4 de octubre de 2026

La inspección de API y FKs detectó que el alta confirmaba padre y pasos en dos
peticiones, y que borrar una secuencia podía ejecutar cascadas de historial
terminal. El [delta de configuración atómica](secuencias_configuracion_atomica.md)
instalado como `20261004164911` añade dos RPC de sesión: alta de padre/pasos en
una transacción y eliminación
exclusiva de configuración sin ninguna inscripción ni run. Una secuencia con
historial se desactiva; no se borra su rastro.

La candidatura de 15 policies ahora cierra también cinco entradas directas de
configuración: INSERT/DELETE del padre e INSERT/UPDATE/DELETE de los pasos.
Su dependencia exige las dos RPC nuevas y sus hashes instalados. Las policies
originales, lecturas, helper de alcance,
inscripción/reanudación/salida y worker se conservan. SQL candidato actualizado:
14.362 bytes, MD5 `6fefc3a7a330006a69b90cfb9864c77c`, SHA-256
`4a1569d3bc55ef6f37484cb689878a50311ff09148d90fab1ef432eded0a55c1`.
El rollback RLS no cambia: 8.844 bytes, MD5
`bfce4121b17ca9da3d71b8bccaa3f754`.

Este delta de RLS todavía está **sin aplicar**. Los gates funcionales históricos
del SQL inicial no acreditan sus cinco expresiones nuevas. Las RPC compatibles
ya están instaladas y su gate TEMP pasó 39 comprobaciones; esto no activa RLS.
Publicar el runtime de Next que las usa, comprobar
las sesiones y luego activar las restricciones con su gate actualizado. No se
realizan aquí tests comerciales ni nuevas políticas en producción.

## Gate de catálogo de la candidatura actualizada

El coordinador revisó y ejecutó un único dry run MCP con BEGIN/ROLLBACK:
candidato dos veces, comprobaciones por catálogo, rollback dos veces y
verificación de restauración. Lleva límites de lock de un segundo y de statement
de cuatro segundos. El candidato y rollback se incorporan byte a byte; no
invoca RPC comerciales ni escribe filas públicas. Los snapshots y contadores
del gate son TEMP. El archivo temporal tenía 61.766 bytes, MD5
`f392fa7ee824f88458fcfc992bfb57bb` y SHA-256
`fe0b8df637143450bf7bacf06d2490187cbdd4fbca2fa341b07d455e7710c6e6`.

Pasaron **17 comprobaciones de catálogo**: número de 15 policies RESTRICTIVE,
sus roles, las cinco expresiones de configuración false, definición/ACL del
helper de alcance, policies originales, ACL de las cuatro tablas y metadatos de
los RPC preservados, doble aplicación idéntica y restauración tras cada
rollback. El resultado fue `sequence_rls_updated_catalog_dryrun_ok`. El
postcheck confirmó `restricciones_instaladas=0` y
`helper_candidato_ausente=true` después del ROLLBACK: la candidatura sigue sin
activación persistente.

Este gate no evalúa filas bajo RLS, autorización de una sesión real, dispositivos
ni dos conexiones concurrentes. **No autoriza activar las políticas** hasta
publicar y acreditar Next y el servidor de llamadas compatibles, comprobar las
sesiones y ejecutar el gate funcional correspondiente. El archivo temporal y
su generador se retiraron al concluir la comprobación, conforme a AGENTS.md.
