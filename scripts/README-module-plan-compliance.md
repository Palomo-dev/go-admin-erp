# Análisis de Cumplimiento de Módulos por Plan (GO-156)

## Contexto

Actualmente el sistema solo verifica `max_modules` pero no valida si los módulos activos están incluidos en `module_config.available_modules` del plan.

**Problema detectado:**
- 6 organizaciones Pro tienen el módulo `finance` (solo incluido en Business+)
- 22 organizaciones tienen `pms_hotel` (solo incluido en Ultimate)

## Implementación

### 1. Modo de enforcement configurable

Se agregó `module_enforcement_mode` en `organization_preferences` con 3 valores:

- **`off`**: Sin control (comportamiento actual, útil para desarrollo)
- **`warn`** *(default)*: Muestra avisos pero NO bloquea la activación
- **`enforce`**: Bloquea la activación de módulos fuera del plan

### 2. Validación en `moduleManagementService`

- Nueva función `checkModulePlanCompliance()` que verifica si un módulo está en el plan
- Modificación de `activateModule()` para usar esta validación
- En modo `warn`: registra evento en `ops_audit_log` pero permite la activación
- En modo `enforce`: rechaza la activación con mensaje claro

### 3. Scripts de análisis (SOLO LECTURA)

#### Script Node.js

```bash
# Análisis básico (texto)
node scripts/analyze-module-plan-compliance.js

# Salida JSON
node scripts/analyze-module-plan-compliance.js --format=json

# Salida CSV
node scripts/analyze-module-plan-compliance.js --format=csv
```

**Requisitos:** `.env.local` con credenciales de Supabase.

**Salida esperada:**
- Total de organizaciones analizadas
- Count de organizaciones con módulos fuera de plan
- Resumen por módulo (cuántas orgs usan cada módulo no permitido)
- Detalle: org_id, plan, estado de suscripción, módulos no autorizados

**No incluye nombres de organizaciones** (repositorio público).

#### Script SQL

```bash
# Ejecutar en el dashboard de Supabase o con psql
psql $DATABASE_URL -f scripts/analyze-module-plan-compliance.sql
```

Retorna dos resultados:
1. Lista de organizaciones con módulos no autorizados
2. Resumen por módulo (count de organizaciones por módulo)

## Configuración del modo

El modo por defecto es `warn` para todas las organizaciones nuevas.

Para cambiar el modo de una organización:

```sql
UPDATE organization_preferences
SET module_enforcement_mode = 'enforce'  -- o 'off' / 'warn'
WHERE organization_id = 123;
```

## Transición a producción

**Fase 1 (actual):** Todos en modo `warn`
- Se registran avisos en `ops_audit_log`
- No se bloquea ninguna activación
- Permite identificar casos reales sin afectar operación

**Fase 2 (futura, decisión de Juan):**
- Revisar registros de `ops_audit_log` con `warning: 'module_not_in_plan'`
- Decidir caso por caso: actualizar plan o desactivar módulo
- Activar modo `enforce` solo cuando se confirme que no hay casos legítimos

## Reversión

```bash
# Aplicar rollback de la migración
psql $DATABASE_URL -f supabase/rollbacks/20260930235000_module_plan_enforcement_config.sql
```

## Matriz de planes actual

### Pro
- **Incluye:** pos, inventory
- **Max sucursales:** 1

### Business
- **Incluye:** pos, inventory, crm, finance, hrm, reports, calendar, chat
- **Max sucursales:** 5

### Ultimate
- **Incluye:** pos, inventory, crm, finance, hrm, reports, calendar, chat, notifications, integrations, pms_hotel, parking, memberships, operations, transporte
- **Max sucursales:** 15

### Enterprise
- **Incluye:** Todos los módulos (personalizable)
- **Max sucursales:** Sin límite

## Notas de seguridad

- ✅ No toca datos de producción (solo lecturas y configuración)
- ✅ No muestra nombres de organizaciones (repositorio público)
- ✅ Modo `warn` por defecto (no bloquea nada sin autorización explícita)
- ✅ Migración reversible
- ✅ Scripts de solo lectura
