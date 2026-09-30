# Análisis de Cumplimiento de Módulos por Plan (GO-156)

## Contexto

Actualmente el sistema solo verifica `max_modules` pero no valida si los módulos activos están incluidos en `module_config.available_modules` del plan.

**Problema detectado:**
- 6 organizaciones Pro tienen el módulo `finance` (solo incluido en Business+)
- 22 organizaciones tienen `pms_hotel` (solo incluido en Ultimate)

## Implementación

### 1. Modo de enforcement configurable (controlado solo por la plataforma)

**SEGURIDAD:** El modo NO vive en `organization_preferences` porque los admins de la org pueden escribir ahí. Se crearon dos tablas nuevas que solo `service_role` puede escribir:

#### `platform_settings` (configuración global)
- Singleton (solo 1 fila, `id = 1`)
- `module_enforcement_mode`: `off` | `warn` (default) | `enforce`
- RLS: solo `service_role` puede escribir; `authenticated` puede leer

#### `module_enforcement_exceptions` (excepciones por organización)
- Una fila por organización con excepción
- `enforcement_mode`: modo específico para esa org
- `reason`: motivo de la excepción (ej: "cliente de pago anual")
- `expires_at`: fecha de expiración (NULL = permanente)
- RLS: solo `service_role` puede escribir; miembros de la org pueden leer su excepción

**Prioridad de resolución:**
1. Si hay excepción válida para la org → usar su modo
2. Si no → usar modo global de `platform_settings`

### 2. Protección de suscripciones activas

**En modo `enforce`, NUNCA se bloquea a:**
- Organizaciones con suscripción de pago activa
- Organizaciones con suscripción anual activa

Esto protege a clientes pagantes de bloqueos automáticos sin decisión explícita de Juan.

### 3. Validación en código

- Nueva función `getEnforcementMode()` que resuelve el modo según la prioridad
- Nueva función `isProtectedFromEnforcement()` que verifica suscripciones activas
- Modificación de `checkModulePlanCompliance()` para usar ambas
- Validación integrada en `activateModule()`
- **NUEVO:** Hook y componente `ModuleAccessWarning` para mostrar aviso al entrar al módulo
- **NUEVO:** Endpoint `/api/modules/check-access` para verificar acceso desde el cliente

#### Validación al entrar al módulo (no solo al activar)

En modo `warn`: muestra `<ModuleAccessWarning />` discreto sin bloquear
En modo `enforce`: bloquea con redirect a `/app/plan` (pero desactivado para suscripciones activas)

### 4. Scripts de análisis (SOLO LECTURA)

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
- **NUEVO:** Count de organizaciones protegidas (pago/anual)
- Resumen por módulo (cuántas orgs usan cada módulo no permitido)
- Detalle: org_id, plan, estado, ciclo de facturación, si está protegida, módulos no autorizados
- **NUEVO:** Matriz de planes leída directamente de la tabla `plans` (sin duplicación)

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

### Cambiar modo global

**Solo service_role** (desde backend o SQL directo):

```sql
-- Ver modo global actual
SELECT module_enforcement_mode FROM platform_settings WHERE id = 1;

-- Cambiar modo global
UPDATE platform_settings
SET 
  module_enforcement_mode = 'enforce',  -- o 'off' / 'warn'
  updated_at = NOW(),
  updated_by = auth.uid()
WHERE id = 1;
```

### Crear excepción para una organización

**Solo service_role:**

```sql
-- Crear excepción permanente
INSERT INTO module_enforcement_exceptions (organization_id, enforcement_mode, reason)
VALUES (123, 'off', 'Cliente de pago anual - decisión de Juan');

-- Crear excepción temporal (expira en 30 días)
INSERT INTO module_enforcement_exceptions (organization_id, enforcement_mode, reason, expires_at)
VALUES (456, 'warn', 'Piloto - revisar en 30 días', NOW() + INTERVAL '30 days');

-- Ver excepciones activas
SELECT 
  mee.organization_id,
  o.name,
  mee.enforcement_mode,
  mee.reason,
  mee.expires_at,
  mee.created_at
FROM module_enforcement_exceptions mee
JOIN organizations o ON o.id = mee.organization_id
WHERE mee.expires_at IS NULL OR mee.expires_at > NOW()
ORDER BY mee.created_at DESC;
```

## Transición a producción

**Fase 1 (actual):** Todos en modo `warn`
- Se registran avisos en `ops_audit_log`
- No se bloquea ninguna activación
- Permite identificar casos reales sin afectar operación

**Fase 2 (futura, decisión de Juan):**
- Revisar registros de `ops_audit_log` con `warning: 'module_not_in_plan'`
- Decidir caso por caso: actualizar plan o desactivar módulo
- Crear excepciones en `module_enforcement_exceptions` donde se requiera
- Activar modo `enforce` SOLO cuando se confirme que no hay casos legítimos

## Reversión

```bash
# Aplicar rollback de la migración
psql $DATABASE_URL -f supabase/rollbacks/20260930235000_module_plan_enforcement_config.sql
```

## Matriz de planes (fuente única de verdad)

**Fuente:** Tabla `plans`, columna `module_config.available_modules`

Los scripts leen directamente de esta tabla. No hay duplicación.

### Pro
- **Incluye:** pos, inventory
- **Max sucursales:** 1

### Business
- **Incluye:** pos, inventory, crm, finance, hrm, reports, calendar, chat
- **Max sucursales:** 5

### Ultimate
- **Incluye:** pos, inventory, crm, finance, hrm, reports, calendar, chat, notifications, integrations, pms_hotel, parking, memberships, operations, transporte
- **Max sucursales:** 15

**Confirmado:** `parking`, `memberships`, `operations` y `transporte` SÍ son solo de Ultimate (consultado desde `plans.module_config`).

### Enterprise
- **Incluye:** Todos los módulos (personalizable)
- **Max sucursales:** Sin límite

## Uso del componente de aviso

Para mostrar el aviso discreto al entrar a un módulo:

```tsx
import { ModuleAccessWarning } from '@/components/modules/ModuleAccessCheck';

export default function MyModulePage() {
  return (
    <div>
      <ModuleAccessWarning moduleCode="finance" />
      {/* Resto del contenido del módulo */}
    </div>
  );
}
```

## Notas de seguridad

- ✅ Modo controlado SOLO por la plataforma (service_role)
- ✅ No toca datos de producción (solo estructura y configuración)
- ✅ No muestra nombres de organizaciones (repositorio público)
- ✅ Modo `warn` por defecto (no bloquea nada sin autorización explícita)
- ✅ Suscripciones activas/anuales protegidas de bloqueo automático
- ✅ Migración reversible
- ✅ Scripts de solo lectura
- ✅ Matriz de planes sin duplicación (leída de `plans`)
