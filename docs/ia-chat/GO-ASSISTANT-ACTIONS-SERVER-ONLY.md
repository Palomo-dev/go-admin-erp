# GO Assistant: escritura de propuestas solo desde servidor

**Estado: preparado, NO aplicado.** Inspección de solo lectura por MCP el
2026-09-19, proyecto `jgmgphmzusbluqhuqihj`. No se ha probado ejecutando el DDL,
ni siquiera dentro de una transacción con rollback. No hay cambio en producción.

## Evidencia y alcance

La tabla `public.ai_agent_actions` tiene RLS activo; propietario `postgres`.
`anon`, `authenticated` y `service_role` tienen SELECT, INSERT, UPDATE, DELETE,
TRUNCATE, REFERENCES y TRIGGER, sin grant option. No hay grants explícitos a
PUBLIC, ACL por columna ni membresías heredadas de `anon`/`authenticated`.
`has_any_column_privilege` da true por los grants de tabla, no por ACL propias.

Se conservan los grants SELECT y todas las políticas RLS existentes, incluida
la lectura por autor o administrador de la organización. Se revocan los otros
seis privilegios de PUBLIC, anon y authenticated, también INSERT/UPDATE/REFERENCES
por columna. Se mantienen intactos service_role, propietario y cron.
Las políticas INSERT/UPDATE quedan sin grant utilizable por clientes; no se
borran, para permitir un rollback exacto de permisos.

La única función pública encontrada por referencia literal a esta tabla es
`fn_expire_ai_agent_actions()`: SECURITY DEFINER, no ejecutable por anon ni
authenticated. Esta revisión no demuestra ausencia de SQL dinámico indirecto.

## Escritores revisados en el código local

| Archivo | Operación sobre acciones | Cliente local observado |
| --- | --- | --- |
| `src/lib/ai/agent/runAgent.ts` | INSERT de propuesta | `getServiceClient()` |
| `src/app/api/ai-assistant/chat/route.ts` | INSERT de propuesta fallback | `getServiceClient()` |
| `src/app/api/ai-assistant/execute-action/route.ts` | UPDATE de toma, caducidad, rechazo y resultado | `actionStore = getServiceClient()` |
| `src/app/api/ai-assistant/reject-action/route.ts` | UPDATE de rechazo | `getServiceClient()` |
| `src/app/api/ai-assistant/undo-action/route.ts` | UPDATE de deshacer/restaurar estado | `actionStore = getServiceClient()` |

No se detectó escritura de esta tabla con cliente de sesión en estos callers
locales. `src/lib/ai/assistant/correction.ts` solo hace SELECT con sesión y debe
seguir así. `undoService.ts` realiza compensaciones de negocio con sesión, no
escrituras de propuestas. No trasladar los servicios de negocio a service_role.
**Código local no equivale a runtime desplegado**: el despliegue antiguo aún
necesita los grants de sesión. También debe actualizarse cualquier servidor
de voz/worker que empaquete `runAgent` antes de aplicar la revocación.

## Orden de despliegue obligatorio

1. **Desplegar código server-store primero.** Verificar los cinco escritores,
   sesión/autor/tenant en cada operación privilegiada, filtros de permisos y
   módulos, confirmación e idempotencia. Comprobar presencia de credenciales
   exclusivamente en servidor, sin imprimirlas. Drenar instancias y workers
   antiguos; evitar tráfico a despliegues previos. Probar propuesta vía stream
   y fallback, confirmación, rechazo/corrección y deshacer antes del DDL.
2. **Revalidar por MCP** grants de tabla, ACL de columna, herencia, RLS y funciones
   privilegiadas. Si difieren del snapshot anterior, revisar el rollback antes
   de continuar. En staging probar migración, segunda aplicación y rollback
   usando MCP. Obtener autorización explícita para producción.
3. **Aplicar por MCP `apply_migration`** el contenido exacto de
   `supabase/migrations/20260919020000_go_assistant_actions_server_only.sql`.
   No usar `supabase db push` ni aplicación automática por Git. Registrar la
   versión real devuelta por MCP; el prefijo del archivo no prueba aplicación.
   El SQL contiene verificaciones que abortan la transacción si quedan grants
   efectivos de escritura o falta SELECT/RLS o el acceso de service_role.
4. **Smoke después de aplicar**, con sesión real y datos sintéticos en una
   organización de prueba autorizada: crear propuesta, confirmar una sola vez,
   reintentar sin duplicar, rechazar, corregir en el mismo hilo y deshacer una
   acción reversible. Comprobar que historial/SELECT sigue funcionando y otra
   organización no puede leer ni modificar la propuesta. Con clientes anon y
   authenticated, INSERT/UPDATE/DELETE directos deben ser denegados aun siendo
   autor; verificar también permisos efectivos por columna y TRUNCATE mediante
   consultas, **sin ejecutar TRUNCATE**. Los tests de aislamiento deben usar dos
   usuarios no administradores, cada uno miembro únicamente de su organización.

Consulta de verificación (solo lectura; repetir por MCP tras aplicar):

```sql
select role_name,
  has_table_privilege(role_name, 'public.ai_agent_actions', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.ai_agent_actions', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.ai_agent_actions', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.ai_agent_actions', 'DELETE') as can_delete,
  has_table_privilege(role_name, 'public.ai_agent_actions', 'TRUNCATE') as can_truncate,
  has_any_column_privilege(role_name, 'public.ai_agent_actions', 'INSERT') as column_insert,
  has_any_column_privilege(role_name, 'public.ai_agent_actions', 'UPDATE') as column_update
from unnest(array['anon', 'authenticated', 'service_role']) as role_name;
```

Esperado: anon/authenticated conservan solo `can_select=true` entre estas
columnas; service_role mantiene sus permisos. SELECT permitido no elimina RLS.

## Reversión

Si el smoke falla, preferir corregir el runtime. Si es imprescindible regresar
al anterior, aplicar primero por MCP
`supabase/rollbacks/20260919020000_go_assistant_actions_server_only_rollback.sql`,
verificar grants, y solo después revertir el código. Reabre los privilegios
previos de clientes y su riesgo; requiere autorización explícita. No cambia ni
restaura datos. No restaura concesiones por columna agregadas después del
snapshot; capturarlas antes de aplicar si existe deriva.

Referencia: [semántica de REVOKE en PostgreSQL 15](https://www.postgresql.org/docs/15/sql-revoke.html).
