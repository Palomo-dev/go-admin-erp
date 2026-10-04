# Correcciones de la revisión del PR 280

Registro: 4 de octubre de 2026, America/Bogota. Rama
`feat/crm-flujo-completo`, [PR 280](https://github.com/Palomo-dev/go-admin-erp/pull/280).
Complementa los registros históricos; no convierte sus verificaciones locales
en resultados de CI ni acredita igualdad visual con Figma.

## Integración con main

Se integra `26293cde31a015a43ed8ccee2d784286164369c0`, preservando las dos
correcciones señaladas: productos sin variantes en el diálogo de documentos
(`10f16461`) y eliminación del requisito de RNE en campañas de voz (`26293cde`).
Las resoluciones conservan reservas, versionado, consentimiento, bajas y
conciliación financiera del CRM. La propuesta separada de Voces/Campañas del
PR 305 no se incorpora a este trabajo.

## Cifras en las vistas montadas

Los gráficos, embudo, tabla mensual y widget de meta de Pipeline usan el
servicio común de pronóstico. Ya no calculan por su cuenta con `stages[0]`
ni sustituyen una probabilidad cero por uno o cien.

- Ponderado de abiertas: importe convertido × `stages.probability / 100`.
  Las relaciones embebidas se normalizan tanto si llegan como objeto como
  arreglo. Una abierta al 100 % aporta todo su importe y sigue abierta.
- Las ganadas no se incluyen por defecto en el pronóstico de abiertas.
  Cada fila se agrega una vez. Las consultas paginan de 500 en 500 con orden
  estable, conservando tenant, pipeline, etapa y período en todas las páginas.
- Una lectura posterior fallida impide publicar totales parciales. Una tasa
  de conversión ausente o inválida tampoco produce una suma de monedas sin
  convertir. La meta respeta su moneda y período mensual, trimestral o anual.
- Cargas retiradas no sustituyen datos del contexto nuevo. Textos y avisos
  de estas vistas tienen traducciones es/en/fr/pt. Se conserva su composición.

Las regresiones incluyen 0/25/100 %, objeto/arreglo, estados abiertos/ganados,
doble conteo, conversión fallida, períodos, cambio de contexto y 1.501 filas,
incluidas oportunidades sin fecha después del límite de 1.000.

## Campañas de voz

Se elimina la constancia/lista RNE como requisito en despacho, diagnóstico,
tarjetas, detalle y creación. Las bajas voluntarias y el consentimiento del
motor vigente siguen siendo obligatorios. El módulo de campañas de mensajes
conserva su contrato independiente.

Los valores nuevos compartidos son 120 contactos/día, 40/hora y 5 llamadas
concurrentes. Ambos formularios permiten elegirlos con el mismo componente.
La concurrencia se limita también a la configuración efectiva de la
organización; una lectura desconocida bloquea esa elección. Las cuotas de
campañas existentes no se sobrescriben al editar.

Cuatro cuerpos PostgreSQL exigían todavía RNE y uno conservaba 50/20/3. Se
aplicó la alineación compatible, conservando guards, locks, cuotas, reservas,
idempotencia y ACL. El rollback guarda las definiciones completas anteriores.

## Secuencias e integridad

Crear padre/pasos y borrar configuración sin uso pasan por RPC atómicas.
Cualquier inscripción o run bloquea el borrado y conserva el historial,
incluidos estados terminales. Desactivar impide nuevas inscripciones; no
cancela una inscripción que ya estaba ejecutándose.

SMS nuevo se deshabilita y rechaza porque no tiene proveedor. Salidas no
soportadas y `steps` en PATCH reciben 400 explícito. Registros históricos se
siguen leyendo. Las RPC validan sesión, permiso, actor, referencias del tenant,
canales y forma de la DSL. Las restricciones candidatas obligan a usar estos
escritores; **todavía no están activadas**.

## PostgreSQL aplicado y límites de reversión

| Versión MCP real | Cambio compatible | Reversión |
| --- | --- | --- |
| `20261004164119` | RNE opcional y defaults de campañas | Restaura cuatro cuerpos completos y comprueba metadatos/ACL. |
| `20261004164911` | RPC de configuración atómica de Secuencias | Retira únicamente las dos RPC nuevas; conserva filas e historial. |

SQL exacto y rollbacks se versionan juntos. Se comprobó doble aplicación y
reversión en BEGIN/ROLLBACK, seguido de hashes y ACL persistentes. El gate
funcional de Secuencias pasó 39 comprobaciones con tablas exclusivamente TEMP;
la guarda de permiso era un fixture, sin sesión real ni prueba de concurrencia
entre conexiones. No se ejecutaron pruebas sobre filas comerciales ni proveedores.

Se bloquea el rollback que devolvía acceso anónimo a `mv_crm_forecast`;
no se ofrece reabrir una vista sin aislamiento como recuperación.
El candidato actualizado de 15 restricciones de Secuencias pasó 17
comprobaciones de catálogo con doble aplicación/reversión en BEGIN/ROLLBACK;
el postcheck confirmó cero restricciones instaladas y helper candidato ausente.
No sustituye probar las filas bajo RLS con la sesión de gestión real.
La [auditoría de BD](AUDITORIA-BD-CIERRE-PR-280.md) distingue las 41 tablas
sin policies, con acceso directo denegado, de las 59 restricciones pendientes.
No todos los rollbacks históricos restauran datos/cuerpos: varios son
desactivaciones con requisitos de coordinación documentados.

## CI y validación

El workflow web ejecuta borradores y sus compuertas no admiten
`continue-on-error`. Comprueba tipos globales, seis zonas horarias y la suite
completa en UTC/Bogotá en dos particiones por zona. Publica JSON, logs y
resúmenes; usa fixtures sin credenciales de base/proveedores de producción.

ESLint compara todo `src` con el SHA real de la base usando las mismas reglas
y dependencias. Cada error nuevo bloquea aunque otro se haya retirado;
no se declara limpio el legado global. Se verifican fuentes estables,
configuración sin cambios y checkout limpio en Actions. Seis tests del gate
comprueban movimientos de líneas, duplicados y diagnósticos inválidos.

Resultados locales sobre la fuente final (Node 24.19.0):

| Comprobación | Resultado |
| --- | --- |
| Jest global UTC | 19.195 casos / 1.140 suites aprobados; 8 casos / 1 suite omitidos existentes; salida 0. |
| TypeScript global | `tsc --noEmit`, salida 0, heap 8192. |
| Zonas horarias | 809 casos / 26 suites en cada una de UTC, Bogotá, México, Madrid, Santiago y Katmandú; todas aprobadas. |
| ESLint de los archivos de código cambiados | 54 archivos, sin errores ni advertencias. |
| Gate ESLint global | Base `26293cde`: 2.519 errores / 394 avisos; snapshot local: 2.337 / 381; cero errores nuevos, 182 retirados; configuración y fuentes estables. |
| Tests del gate ESLint | 6 aprobados. |
| Build web final | Salida 0; Next 15.5.9, 367 páginas estáticas, optimización y trazas completas. |

La auditoría global anterior acredita el snapshot local durante la integración;
su HEAD de referencia aún era `86ad0bed`. No se atribuye ese snapshot al SHA
anterior ni se declara cero deuda global. Actions exige el checkout limpio del
commit que comprueba. CI usa Node 22 para satisfacer las versiones mínimas de
las dependencias actuales; la evidencia local no acredita paridad de runtime.
El build usa heap 6144 y `NEXT_SKIP_TYPECHECK=1`; tipos y lint se ejecutaron
por separado. La copia sigue `.vercelignore`: 12.409 archivos incluidos y
187 excluidos, conserva el protocolo compartido de Electron y excluye el
subproyecto móvil. Sus 6.698 archivos de producción coinciden por SHA-256 con
la fuente final. Reutiliza dependencias locales; los avisos conocidos de
runtime/configuración y el parche opcional SWC fallido por DNS no impidieron
compilar. Sólo documentación y workflow cambiaron después de congelar esa
fuente. La ejecución local no sustituye GitHub Actions; el estado del commit
publicado se comprueba después del push y se registra en el PR.

## Cierre pendiente de producción

Siguen sin activar 15 restricciones de Secuencias, 9 de Calendario y 35 de
llamadas/derivados/Storage. Requieren Next y WS compatibles publicados y retirar
réplicas/clientes antiguos antes de cerrar escrituras directas. El conector
Vercel devuelve 403 por el alcance del equipo; el rol administrador del ERP
no resuelve esa autorización de la plataforma. Railway sirve todavía el
runtime de master, no el commit final de este PR.

No se acredita un recorrido con sesión real, correo, WhatsApp, llamada externa,
móvil físico ni Electron en su sistema operativo. El portal externo de Partners
no está implementado: [alcance de Secuencias/Partners](SECUENCIAS-PARTNERS-ALCANCE.md).
La revisión visual histórica de 135 referencias conserva sus límites y hashes;
estos cambios funcionales no constituyen una nueva revisión píxel a píxel.
