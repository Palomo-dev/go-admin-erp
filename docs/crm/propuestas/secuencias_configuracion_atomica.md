# Secuencias: configuración atómica sin perder historial

Estado: **RPC compatibles aplicadas; 15 políticas RLS pendientes**. El
coordinador las instaló por MCP como `20261004164911` el 4 de octubre de 2026.
La copia exacta está en
`supabase/migrations/20261004164911_crm_secuencias_configuracion_atomica.sql` y
su reversión en
`supabase/rollbacks/20261004164911_crm_secuencias_configuracion_atomica_rollback.sql`.
No se invocaron operaciones comerciales ni proveedores. La API anterior
confirmaba el padre y después los pasos en peticiones
distintas; al fallar la segunda, intentaba borrar el padre sin comprobar el
rollback. La eliminación consultaba inscripciones vivas y borraba pasos/padre
en peticiones distintas, con una carrera de inscripción y cascadas de historial.

## Contrato con el runtime

- `fn_crm_create_sequence(p_org integer,p_input jsonb) RETURNS jsonb`: devuelve
  la secuencia y sus `steps[]` ordenados, confirmados en una transacción.
- `fn_crm_delete_sequence(p_org integer,p_sequence_id uuid) RETURNS boolean`:
  devuelve false si no existe una secuencia de esa organización; sólo elimina
  configuración sin uso. Cualquier inscripción, también completada o salida,
  o run vinculado produce `P0001 secuencia_con_historial` (409). Para una
  secuencia usada se conserva la opción existente de desactivar.

Ambas exigen sesión, pertenencia y permiso canónico
`admin.full_access|crm.campaigns.manage` mediante `fn_crm_exigir_permiso`.
`created_by` se deriva de `auth.uid()` y no admite suplantar al actor. La ACL
permite exclusivamente `postgres` y `authenticated`; no hay consumidor de
servicio inventado. `SECURITY DEFINER` y `search_path=public,pg_temp` se usan
para ejecutar estas operaciones detrás de las restricciones posteriores,
con guardas internas de sesión y organización y sin acceso anónimo.

La creación valida objeto/campos permitidos, nombre 2–200, máximo 50 pasos,
tipos/retardos/orden único, canales disponibles (sin SMS), salidas nativas
`won_lost|opted_out`, autor, pipeline/etapa coherentes y plantillas del tenant.
Conserva las formas históricas de salida string/`{type:...}`, los defaults
`is_active=true`, `pause_on_reply=true` y el trigger nativo de alcance de
segmentos. El paso `condition` conserva condición no vacía y
`continue_on_error=false`. El RPC valida también la estructura de grupos/reglas,
profundidad máxima 6, los mismos 51 campos y 17 operadores de
`conditionsDsl.ts`, incluido el prefijo `event.payload.`; no admite guardar
un campo/operador rechazado por la API mediante SDK directo. Esta comprobación
es de forma y capacidades, no un evaluador: la decisión y ejecución de la DSL
siguen exclusivamente en el motor TypeScript existente.

Errores: `42501` para sesión/permiso/actor; `22023` para input inválido;
`P0002` para pipeline/etapa/plantilla ausente o ajena; `P0001 registro_cambio`
para locks ocupados; `P0001 secuencia_con_historial` para eliminación de una
secuencia usada. Un padre con pasos de otro tenant produce
`P0001 secuencia_referencias_invalidas` y no dispara cascadas.

## Locks y FKs verificados

PostgreSQL tiene FK `sequence_steps.sequence_id` y
`sequence_enrollments.sequence_id` con `ON DELETE CASCADE`; los runs tienen
cascadas tanto por step como por enrollment. Son referencias UUID simples,
no FKs compuestas por tenant. Por eso la eliminación revisa las referencias
del padre autorizado incluso si el hijo tiene una organización incoherente,
sin devolver sus filas al cliente.

Se toma `FOR UPDATE NOWAIT` sobre el padre y después sus pasos. El inscriptor
autenticado vigente ya toma `FOR SHARE NOWAIT` sobre ese mismo padre; el
reanudador y la salida toman inscripción primero y luego padre con NOWAIT.
NOWAIT evita que la nueva operación forme un ciclo esperando una inscripción
o un paso ocupado. Los caminos de servicio no tienen el mismo SHARE explícito,
pero su INSERT debe adquirir KEY SHARE por la FK: no puede publicar una
inscripción o un run sobre configuración borrada. No se añade un advisory lock
que los escritores existentes no compartan ni se afirma una prueba real entre
dos conexiones; la evidencia aquí es lectura del catálogo y revisión del plan.

## Cierre del acceso directo pendiente

La candidatura de 15 policies conserva el mismo número y las policies
originales. Las cinco restricciones de configuración pasan a false: INSERT y
DELETE de `sequences`, e INSERT, UPDATE y DELETE de `sequence_steps`. El UPDATE
del padre conserva el permiso de gestión y las lecturas mantienen sus permisos.
Esto obliga a usar las dos RPC para crear/borrar y evita alterar los pasos por
SDK saltándose la validación de canales, referencias y DSL. La activación
comprueba la presencia y hashes de ambas RPC.

**No activar esas policies antes de instalar las RPC y publicar el runtime que
las consume.** Las comprobaciones funcionales históricas de la candidatura
original no acreditan el comportamiento funcional de las cinco expresiones
nuevas. El dry run actualizado pasó 17 comprobaciones de catálogo, con doble
aplicación/reversión y ROLLBACK; no evaluó filas ni sesiones reales. Hay que
ejecutar el gate funcional correspondiente y comprobar la sesión de gestión tras
el despliegue. No se ha activado ninguna policy por esta revisión.

## Reversión y evidencia

| Artefacto | Bytes | SHA-256 |
| --- | ---: | --- |
| `secuencias_configuracion_atomica.sql` | 16.574 | `47a18d2c83c2d2484ad727aa4929988289b6ea7617b183d0560fb4699ea732fb` |
| `secuencias_configuracion_atomica.rollback.sql` | 1.320 | `2731822abfd23814f8475907947820ec5f4e88699e48e5e89b8174775012afc0` |

Cuerpos instalados y confirmados: create MD5 `e25f34b6cc65dc56a570c89fc00c79b5`, delete
`02f758864eb2cad36225b980e97cfc82`. Las guardas impiden sobrescribir o retirar
otra versión de estas funciones. El postcheck exige body, propietario, ACL y
search_path exactos. El rollback sólo retira las RPC nuevas; no borra las
secuencias creadas ni recupera configuración eliminada por la acción del
usuario. Antes de retirarlas hay que coordinar el runtime y las restricciones
RLS; no se reabre el borrado directo de historial como recuperación.

Verificado: columnas, tipos, defaults, constraints, FKs, trigger de segmentos,
helper de permiso y locks de las funciones nativas. El coordinador ejecutó por
MCP el dry run de estos bytes con doble aplicación, denegación `sin_sesion` de
ambas funciones, doble rollback y ROLLBACK final. Después de la instalación
persistente confirmó ambos cuerpos y ACL: sólo `postgres` y `authenticated`,
sin EXECUTE de `anon` ni `service_role`.

El gate funcional aislado pasó **39 comprobaciones** en una sola ejecución MCP
con BEGIN/ROLLBACK. Creó exclusivamente tablas/FKs/filas TEMP: alta ordenada,
defaults, autor, referencias propias y ajenas, DSL, SMS rechazado, fallo tardío
que revierte padre/pasos, conservación de los cuatro estados de historial,
referencias legadas incoherentes y eliminación de configuración sin uso. Las
dos funciones se copiaron byte a byte salvo `public.` → `pg_temp.`; una
verificación local comprobó esa correspondencia exacta. El archivo temporal
tenía 27.139 bytes y SHA-256
`3f9b7525aacb3f5b2fff8a7bd9ef4429ba89cfbe3f6224663e6407823de61a67`;
se retiró después conforme a AGENTS.md.

La guarda de permiso del gate es un fixture con UUID y organizaciones
sintéticas: **no acredita autorización con sesión real ni concurrencia entre
dos conexiones**. No se crearon organizaciones, usuarios, jobs ni filas
públicas, ni se consumieron secuencias públicas. Siguen pendientes el despliegue
compatible, gate funcional de las cinco nuevas expresiones RLS, activación de las 15
políticas y recorrido con sesión real. No se probaron proveedores comerciales.
