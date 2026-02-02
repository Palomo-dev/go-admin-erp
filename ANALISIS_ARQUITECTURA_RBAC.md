# 🔍 Análisis Crítico: Arquitectura RBAC

## ❌ Problemas Identificados en la Estructura Actual

### **1. Tabla `roles` - Diseño Problemático**

```sql
roles:
  - id (PK)
  - name
  - description
  - is_system (boolean)
  - organization_id (nullable) ⚠️ PROBLEMA
```

**Problemas:**
1. ❌ **Duplicación de datos**: Cada organización que quiere un "Gerente" debe crear su propio rol
2. ❌ **Inconsistencia**: `organization_id` nullable causa confusión (¿es template o instancia?)
3. ❌ **No hay separación clara** entre roles template y roles de organización
4. ❌ **Difícil mantenimiento**: Actualizar un template no actualiza las copias
5. ❌ **No hay vínculo con cargos (job_positions)**: Permisos no están ligados a la estructura organizacional real

### **2. Falta de Granularidad con Cargos**

```sql
job_positions:
  - id (uuid)
  - organization_id
  - name
  - level
  - department_id
  ❌ NO HAY RELACIÓN CON PERMISOS
```

**Problema:**
- Los cargos (job_positions) son entidades HRM separadas
- No hay forma de asignar permisos específicos por cargo
- Un "Gerente de Ventas" y un "Gerente de TI" tienen que compartir el mismo rol "Gerente"

### **3. Tabla `organization_members` - Limitación**

```sql
organization_members:
  - role_id (FK → roles) ⚠️ UN SOLO ROL
  ❌ No permite múltiples roles
  ❌ No vincula con job_position
```

---

## ✅ Arquitectura Propuesta: Sistema de 3 Capas

### **Capa 1: Role Templates (Globales)**

```sql
CREATE TABLE role_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,  -- 'admin', 'manager', 'employee', 'viewer'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  category VARCHAR(50),  -- 'administrative', 'operational', 'technical'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE role_templates IS 'Templates globales de roles reutilizables';
COMMENT ON COLUMN role_templates.code IS 'Código único del template (ej: admin, manager)';
COMMENT ON COLUMN role_templates.is_system IS 'Templates del sistema no se pueden eliminar';
```

**Ejemplos de Templates:**
```sql
INSERT INTO role_templates (code, name, description, is_system, category) VALUES
('super_admin', 'Super Administrador', 'Acceso total al sistema', true, 'administrative'),
('admin', 'Administrador', 'Administración general', true, 'administrative'),
('manager', 'Gerente', 'Gestión de equipo y operaciones', true, 'operational'),
('supervisor', 'Supervisor', 'Supervisión de operaciones', true, 'operational'),
('employee', 'Empleado', 'Acceso básico operativo', true, 'operational'),
('viewer', 'Visualizador', 'Solo lectura', true, 'administrative');
```

---

### **Capa 2: Organization Roles (Instancias por Organización)**

```sql
CREATE TABLE organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES role_templates(id) ON DELETE SET NULL,
  
  -- Datos personalizables
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_org_roles_org ON organization_roles(organization_id);
CREATE INDEX idx_org_roles_template ON organization_roles(template_id);

COMMENT ON TABLE organization_roles IS 'Roles específicos de cada organización basados en templates';
COMMENT ON COLUMN organization_roles.template_id IS 'Template base (nullable para roles custom)';
```

**Ventajas:**
- ✅ Cada organización tiene sus propias instancias de roles
- ✅ Pueden basarse en templates o ser completamente custom
- ✅ Nombre personalizable por organización
- ✅ No hay duplicación en tabla global

---

### **Capa 3: Job Position Roles (Permisos Granulares por Cargo)**

```sql
CREATE TABLE job_position_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id UUID NOT NULL REFERENCES job_positions(id) ON DELETE CASCADE,
  organization_role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE CASCADE,
  
  -- Scope específico del cargo
  scope JSONB DEFAULT '{}',  -- Permisos adicionales o restricciones
  priority INTEGER DEFAULT 0,  -- Para resolver conflictos de múltiples roles
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(job_position_id, organization_role_id)
);

CREATE INDEX idx_job_pos_roles_position ON job_position_roles(job_position_id);
CREATE INDEX idx_job_pos_roles_role ON job_position_roles(organization_role_id);

COMMENT ON TABLE job_position_roles IS 'Roles asignados a cargos específicos';
COMMENT ON COLUMN job_position_roles.scope IS 'Permisos adicionales o restricciones del cargo';
COMMENT ON COLUMN job_position_roles.priority IS 'Prioridad para resolver conflictos (mayor = más prioritario)';
```

**Ventajas:**
- ✅ Un cargo puede tener múltiples roles
- ✅ Permisos granulares por cargo
- ✅ "Gerente de Ventas" ≠ "Gerente de TI"
- ✅ Scope permite personalización por cargo

---

### **Capa 4: Member Assignments (Asignación a Usuarios)**

```sql
-- Actualizar organization_members
ALTER TABLE organization_members 
  DROP COLUMN role_id,  -- Eliminar rol único
  ADD COLUMN job_position_id UUID REFERENCES job_positions(id);

-- Nueva tabla para múltiples roles directos
CREATE TABLE member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id BIGINT NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  organization_role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE CASCADE,
  
  -- Scope específico del miembro
  scope JSONB DEFAULT '{}',
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,  -- Roles temporales
  
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(member_id, organization_role_id)
);

CREATE INDEX idx_member_roles_member ON member_roles(member_id);
CREATE INDEX idx_member_roles_role ON member_roles(organization_role_id);

COMMENT ON TABLE member_roles IS 'Roles adicionales asignados directamente a miembros';
COMMENT ON COLUMN member_roles.expires_at IS 'Fecha de expiración para roles temporales';
```

**Ventajas:**
- ✅ Miembro hereda roles de su cargo (job_position)
- ✅ Puede tener roles adicionales directos
- ✅ Roles temporales con expiración
- ✅ Auditoría de quién otorgó el rol

---

### **Tabla de Permisos (Sin Cambios Mayores)**

```sql
-- permissions se mantiene igual
permissions:
  - id
  - code (unique)
  - name
  - description
  - module
  - category
  
-- Actualizar role_permissions para usar organization_roles
CREATE TABLE organization_role_permissions (
  id SERIAL PRIMARY KEY,
  organization_role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  scope VARCHAR(255),  -- Scope específico del permiso
  allowed BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_role_id, permission_id, scope)
);

CREATE INDEX idx_org_role_perms_role ON organization_role_permissions(organization_role_id);
CREATE INDEX idx_org_role_perms_perm ON organization_role_permissions(permission_id);
```

---

## 🔄 Flujo de Resolución de Permisos

### **Algoritmo de Resolución:**

```typescript
function getUserPermissions(userId: string, organizationId: number): Permission[] {
  // 1. Obtener member
  const member = getMember(userId, organizationId)
  
  // 2. Obtener permisos del cargo (job_position)
  let permissions = []
  if (member.job_position_id) {
    const jobPositionRoles = getJobPositionRoles(member.job_position_id)
    permissions.push(...getPermissionsFromRoles(jobPositionRoles))
  }
  
  // 3. Obtener permisos de roles directos
  const memberRoles = getMemberRoles(member.id)
  permissions.push(...getPermissionsFromRoles(memberRoles))
  
  // 4. Resolver conflictos (prioridad: member_roles > job_position_roles)
  return resolveConflicts(permissions)
}
```

### **Ejemplo Práctico:**

```
Usuario: Juan Pérez
Cargo: Gerente de Ventas
Organization: ACME Corp

Permisos Heredados del Cargo:
├── organization_role: "Gerente" (template: manager)
│   ├── crm.customers.read
│   ├── crm.customers.create
│   ├── crm.opportunities.manage
│   └── reports.sales.view
│
└── organization_role: "Ventas" (custom)
    ├── pos.sales.create
    ├── pos.sales.refund
    └── inventory.products.view

Permisos Directos Adicionales:
└── organization_role: "Aprobador Financiero" (temporal, expira en 30 días)
    ├── finance.invoices.approve
    └── finance.payments.authorize

Permisos Totales: 11 permisos únicos
```

---

## 📊 Comparación: Antes vs Después

### **Antes (Estructura Actual):**
```
roles (global + org mixed)
  └── role_permissions
        └── permissions

organization_members
  └── role_id (UN SOLO ROL)

job_positions (desconectado)
```

**Problemas:**
- ❌ Duplicación de roles por organización
- ❌ Un solo rol por miembro
- ❌ Cargos sin permisos
- ❌ No hay templates reutilizables

---

### **Después (Estructura Propuesta):**
```
role_templates (templates globales)
  └── organization_roles (instancias por org)
        ├── organization_role_permissions
        │     └── permissions
        │
        ├── job_position_roles (roles del cargo)
        │     └── job_positions
        │
        └── member_roles (roles directos)
              └── organization_members
```

**Ventajas:**
- ✅ Templates reutilizables
- ✅ Sin duplicación
- ✅ Múltiples roles por miembro
- ✅ Permisos granulares por cargo
- ✅ Roles temporales
- ✅ Herencia clara: Template → Org Role → Job Position → Member

---

## 🎯 Casos de Uso Resueltos

### **Caso 1: Crear Organización Nueva**
```sql
-- 1. Crear roles base desde templates
INSERT INTO organization_roles (organization_id, template_id, name)
SELECT 2, id, name FROM role_templates WHERE is_system = true;

-- 2. Copiar permisos de templates (si existen)
-- 3. Organización lista con roles base
```

### **Caso 2: Gerente de Ventas vs Gerente de TI**
```sql
-- Cargo: Gerente de Ventas
INSERT INTO job_position_roles (job_position_id, organization_role_id)
VALUES 
  ('uuid-gv', 'role-gerente'),
  ('uuid-gv', 'role-ventas');

-- Cargo: Gerente de TI
INSERT INTO job_position_roles (job_position_id, organization_role_id)
VALUES 
  ('uuid-git', 'role-gerente'),
  ('uuid-git', 'role-tecnologia');

-- Resultado: Mismos permisos de "Gerente" + permisos específicos de su área
```

### **Caso 3: Rol Temporal**
```sql
-- Asignar "Aprobador Financiero" por 30 días
INSERT INTO member_roles (member_id, organization_role_id, expires_at)
VALUES (123, 'role-aprobador', now() + interval '30 days');

-- Job automático revisa expires_at y desactiva roles vencidos
```

### **Caso 4: Actualizar Template**
```sql
-- Actualizar template "manager"
UPDATE role_templates SET description = 'Nueva descripción' WHERE code = 'manager';

-- Las organization_roles mantienen su vínculo con template_id
-- Pueden optar por sincronizar o mantener personalización
```

---

## 🔧 Migraciones Necesarias

### **Migración 1: Crear Nuevas Tablas**
```sql
-- 1. role_templates
-- 2. organization_roles
-- 3. job_position_roles
-- 4. member_roles
-- 5. organization_role_permissions
```

### **Migración 2: Migrar Datos Existentes**
```sql
-- 1. Convertir roles is_system=true en role_templates
-- 2. Convertir roles con organization_id en organization_roles
-- 3. Migrar role_permissions a organization_role_permissions
-- 4. Migrar organization_members.role_id a member_roles
```

### **Migración 3: Limpiar Tablas Antiguas**
```sql
-- 1. DROP TABLE role_permissions
-- 2. ALTER TABLE roles RENAME TO roles_deprecated
-- 3. ALTER TABLE organization_members DROP COLUMN role_id
```

---

## 💡 Recomendación Final

### **Opción A: Migración Completa (Recomendada)**
- ✅ Arquitectura limpia y escalable
- ✅ Sin duplicación de datos
- ✅ Permisos granulares por cargo
- ✅ Múltiples roles por usuario
- ⚠️ Requiere migración de datos
- ⚠️ Actualizar código existente

### **Opción B: Híbrida (Transición)**
- Mantener `roles` actual como deprecated
- Crear nuevas tablas en paralelo
- Migrar gradualmente
- ⚠️ Complejidad temporal

### **Opción C: Mantener Actual (No Recomendada)**
- ❌ Problemas de duplicación persisten
- ❌ No hay granularidad por cargo
- ❌ Limitación de un rol por usuario

---

## 🚀 Plan de Implementación

### **Fase 1: Preparación**
1. Crear nuevas tablas sin afectar existentes
2. Crear funciones de migración
3. Probar en ambiente de desarrollo

### **Fase 2: Migración**
1. Ejecutar migración de datos
2. Verificar integridad
3. Actualizar índices y constraints

### **Fase 3: Actualización de Código**
1. Actualizar servicios de roles
2. Actualizar componentes UI
3. Actualizar lógica de permisos

### **Fase 4: Limpieza**
1. Deprecar tablas antiguas
2. Actualizar documentación
3. Entrenar usuarios

---

## 📝 Conclusión

La arquitectura propuesta resuelve todos los problemas identificados:

✅ **Separación clara**: Templates → Org Roles → Job Position Roles → Member Roles
✅ **Sin duplicación**: Templates reutilizables, instancias por organización
✅ **Granularidad**: Permisos específicos por cargo
✅ **Flexibilidad**: Múltiples roles, roles temporales, herencia clara
✅ **Escalabilidad**: Fácil agregar nuevos templates o roles
✅ **Mantenibilidad**: Estructura lógica y bien documentada

**Recomendación:** Implementar Opción A (Migración Completa) para tener una base sólida y escalable a largo plazo.
