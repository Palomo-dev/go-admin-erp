# Salud: configuración, cola y mediciones atómicas

Propuesta verificada en el proyecto autorizado por MCP el 2026-10-02. No aplicada por el subagente; la aplicación real y sus archivos de migración/reversión quedan a cargo del coordinador.

SQL congelado: `salud_atomica.sql`, MD5 `96ef176efd86e55dac83032e91ae1f4e`. Reversión: `salud_atomica.rollback.sql`, MD5 `6abe027da8e241dda10f6487dcbae322`.

El esquema real tiene `health_score_configs`, `health_score_snapshots`, `customers`, `crm_events` y `outbound_jobs`. Los snapshots no tienen FK al cliente; la nueva lectura acotada usa la clave `(organization_id, customer_id)` y el índice existente del historial. No se añaden tablas, columnas ni tipos de job.

Las rutas de configuración y recálculo exigen `requireOrgAdminOrPermission`, incluido `admin.full_access`. La base comprueba pertenencia activa y ese mismo permiso canónico. La configuración exige versión observada, factores y bandas válidos; se guarda junto con un evento y un job `crm_event` mediante el productor existente `fn_emit_crm_event`. El botón responde 202 con los identificadores persistidos. Su consumidor registrado usa el mismo cálculo del cron; una configuración reemplazada deja obsoleto el evento anterior.

«Medir ahora» y su alias histórico comprueban el permiso de editar clientes y el acceso de sucursal con la sesión antes de usar el escritor de servicio. La RPC de escritura sólo permite `service_role`; `anon` y `authenticated` no pueden enviar puntajes calculados. Las lecturas de métricas conservan la sesión/RLS. El cálculo permanece en `healthBands.ts`; SQL valida formato, organización, cliente, sucursal y versiones, sin implementar una segunda fórmula.

Cada lote de hasta 200 clientes guarda score y snapshot dentro de una única transacción. La configuración y el último snapshot observados se comprueban bajo bloqueo; una medición antigua no puede pisar una posterior. El reintento idéntico no duplica historial. Un error posterior revierte todas las escrituras del lote. El cron procesa lotes y mantiene rotación/presupuesto; la atomicidad corresponde a cada lote, no a toda una organización de tamaño ilimitado.

Verificación terminada:

- 226 pruebas focales en 18 suites, tanto en UTC como en America/Bogota: formularios, lecturas, factores desactivados, rutas, permisos, recálculo, consumo del evento, últimos snapshots, lotes y presupuesto.
- 84 assertions reales distintas en una batería BEGIN/ROLLBACK por MCP. Montaje, aplicación dos veces, reversión dos veces y reaplicación conservando fixtures y ACL.
- ACL exactas; ejecución rechazada para anon y para la falsificación de puntajes desde authenticated; solicitudes de usuario rechazadas desde service_role. Administración por permiso personalizado, organización ajena, sucursales asignada/denegada y sucursal ajena al cliente.
- Configuración inválida, pesos cero válidos, versiones obsoletas, duplicados, intervalo sin cambios, medición antigua y replay del mismo timestamp. Una configuración ausente se crea y encola; una segunda creación obsoleta entra en conflicto.
- Fallo tardío de outbox: configuración, evento y job se conservan sin cambios. Fallo tardío del segundo cliente: score y snapshots de ambos clientes se revierten. Las verificaciones comparan filas y conteos reales.
- Historial de 5002 snapshots: la lectura del último registro del cliente conserva su id y score.
- Consulta independiente después de ROLLBACK: funciones originales ausentes, cero clientes/sucursales/rol/trigger de prueba. Ningún proveedor, correo, llamada ni cobro ejecutado.
- ESLint de los archivos propios y `git diff --check` limpios. El coordinador ejecuta los gates globales de TypeScript, build y navegador.

La prueba no simula dos conexiones simultáneas; los bloqueos y conflictos se ejercitaron mediante versiones y reintentos secuenciales reales. Las rutas mantienen errores explícitos y no presentan una solicitud encolada como una medición terminada.


Aplicación por MCP confirmada: versión real `20261002062052`, nombre crm_salud_mediciones_atomicas, archivo `supabase/migrations/20261002064000_crm_salud_mediciones_atomicas.sql`, un statement y SQL MD5 `96ef176efd86e55dac83032e91ae1f4e`. Reversión exacta en `supabase/rollbacks/20261002064000_crm_salud_mediciones_atomicas.rollback.sql`, MD5 `6abe027da8e241dda10f6487dcbae322`. ACL y cuerpos instalados contrastados: configurar 4edd5ca75caeb1d5cf41b584b26c7050, encolar 887c89c2978270c4ccfe1e2e73eb22dd, writer fbb2260368146583c6e9a288c75a9040, lectura base 6413dac7422c0caf1095ba767ac0ed67, validador 163f0a56f08e6959babbbbf555ce8f24, administración c151dabcc2fe76144a1d704d49698b42. Asesores sin nuevos avisos de rendimiento; WARN0029 para configurar/encolar intencional con sesión/membresía/admin.full_access comprobados, sin PUBLIC/anon. Helpers privados y scores calculados sólo service_role. Runtime del PR aún requiere despliegue; las policies de tablas antiguas deben endurecerse después de actualizar consumidores.
