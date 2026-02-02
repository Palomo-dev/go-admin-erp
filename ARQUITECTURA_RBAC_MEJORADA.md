# 🏗️ Arquitectura RBAC Mejorada - Análisis Completo

## 📊 Estado Actual de las Tablas

### **Tablas Existentes Analizadas:**

```
✅ roles                    (con organization_id nullable)
✅ permissions              (globales)
✅ role_permissions         (roles → permissions)
✅ organization_members     (users → roles, UN SOLO ROL)
✅ member_permissions       (permisos directos con CRUD granular)
✅ employee_permissions     (permisos por empleado/branch)
✅ member_branches          (miembros → sucursales)
✅ job_positions            (cargos HRM, sin conexión a permisos)
```

---

## 🔍 Análisis de Estructura Actual

### **1. Tabla `roles`**
```sql
roles:
  - id (PK)
  - name
  - description
  - is_system (boolean)
  - organization_id (integer, nullable) ✅ YA EXISTE
  - created_at
```

**Estado:** ✅ Buena base
**Problema:** Mezcla roles sistema (organization_id = NULL) con roles de org (organization_id = X)

---

### **2. Tabla `permissions`**
```sql
permissions:
  - id (PK)
  - code (unique)
  - name
  - description
  - module
  - category
  - created_at
```

**Estado:** ✅ Excelente - Permisos globales reutilizables
**No requiere cambios**

---

### **3. Tabla `role_permissions`**
```sql
role_permissions:
  - id (PK)
  - role_id (FK → roles)
  - permission_id (FK → permissions)
  - scope (FK → scopes_catalog)
  - allowed (boolean)
```

**Estado:** ✅ Buena - Matriz rol × permiso
**Mejora:** Agregar `organization_id` para filtrar por org

---

### **4. Tabla `organization_members`**
```sql
organization_members:
  - id (PK)
  - organization_id (FK → organizations)
  - user_id (FK → profiles/users)
  - role_id (FK → roles) ⚠️ UN SOLO ROL
  - is_super_admin (boolean)
  - is_active (boolean)
  - created_at
```

**Estado:** ⚠️ Limitado - Solo un rol por miembro
**Problema:** No vincula con job_positions

---

### **5. Tabla `member_permissions`** ⭐ MUY BUENA
```sql
member_permissions:
  - id (PK)
  - organization_id (FK → organizations)
  - member_id (FK → organization_members)
  - permission_id (FK → permissions)
  - can_view (boolean)
  - can_create (boolean)
  - can_edit (boolean)
  - can_delete (boolean)
  - created_at
```

**Estado:** ✅ Excelente - Permisos CRUD granulares
**Uso:** Permisos adicionales directos a miembros

---

### **6. Tabla `employee_permissions`**
```sql
employee_permissions:
  - id (PK)
  - profile_id (FK → profiles)
  - permission_id (FK → permissions)
  - organization_id (FK → organizations)
  - branch_id (FK → branches)
  - granted_by (FK → profiles)
  - created_at
  - updated_at
```

**Estado:** ⚠️ Duplica funcionalidad de member_permissions
**Problema:** Confusión entre employee_permissions y member_permissions

---

### **7. Tabla `member_branches`**
```sql
member_branches:
  - id (PK)
  - organization_member_id (FK → organization_members)
  - branch_id (FK → branches)
```

**Estado:** ✅ Buena - Miembros pueden estar en múltiples sucursales

---

### **8. Tabla `job_positions`**
```sql
job_positions:
  - id (uuid, PK)
  - organization_id (FK → organizations)
  - department_id (FK → departments)
  - code
  - name
  - description
  - level
  - min_salary / max_salary
  - requirements (jsonb)
  - is_active
  - created_at / updated_at
```

**Estado:** ✅ Excelente estructura HRM
**Problema:** ❌ NO HAY CONEXIÓN CON PERMISOS/ROLES

---

## ✅ Propuesta de Mejora (Manteniendo Tablas Actuales)

### **Cambio 1: Crear `role_templates` (Nueva)**

```sql
CREATE TABLE role_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),  -- 'administrative', 'operational', 'technical'
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_role_templates_code ON role_templates(code);

COMMENT ON TABLE role_templates IS 'Templates globales para crear roles en organizaciones';
COMMENT ON COLUMN role_templates.code IS 'Código único (admin, manager, employee, etc)';
```

**Ejemplos:**
```sql
INSERT INTO role_templates (code, name, description, category) VALUES
('super_admin', 'Super Administrador', 'Acceso total', 'administrative'),
('admin', 'Administrador', 'Administración general', 'administrative'),
('manager', 'Gerente', 'Gestión de equipo', 'operational'),
('supervisor', 'Supervisor', 'Supervisión', 'operational'),
('employee', 'Empleado', 'Operativo básico', 'operational'),
('viewer', 'Visualizador', 'Solo lectura', 'administrative');
```

---

### **Cambio 2: Mejorar `roles` (Agregar columna)**

```sql
-- Agregar columna para vincular con template
ALTER TABLE roles 
  ADD COLUMN template_id INTEGER REFERENCES role_templates(id) ON DELETE SET NULL,
  ADD COLUMN is_active BOOLEAN DEFAULT true,
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX idx_roles_organization ON roles(organization_id);
CREATE INDEX idx_roles_template ON roles(template_id);

-- Constraint: roles del sistema no tienen organization_id
ALTER TABLE roles 
  ADD CONSTRAINT check_system_role_org 
  CHECK (
    (is_system = true AND organization_id IS NULL) OR 
    (is_system = false AND organization_id IS NOT NULL)
  );

COMMENT ON COLUMN roles.template_id IS 'Template base del rol (nullable para roles custom)';
COMMENT ON COLUMN roles.organization_id IS 'NULL = rol sistema, NOT NULL = rol de organización';
```

**Uso:**
```sql
-- Roles del sistema (is_system=true, organization_id=NULL)
INSERT INTO roles (name, description, is_system, template_id)
SELECT name, description, true, id FROM role_templates WHERE is_system = true;

-- Roles de organización (is_system=false, organization_id=X)
INSERT INTO roles (name, description, is_system, organization_id, template_id)
VALUES ('Gerente de Ventas', 'Gerente del área comercial', false, 1, 
  (SELECT id FROM role_templates WHERE code = 'manager'));
```

---

### **Cambio 3: Crear `job_position_roles` (Nueva)**

```sql
CREATE TABLE job_position_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id UUID NOT NULL REFERENCES job_positions(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  -- Permisos adicionales específicos del cargo
  scope JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(job_position_id, role_id)
);

CREATE INDEX idx_job_pos_roles_position ON job_position_roles(job_position_id);
CREATE INDEX idx_job_pos_roles_role ON job_position_roles(role_id);

COMMENT ON TABLE job_position_roles IS 'Roles asignados a cargos (job_positions)';
COMMENT ON COLUMN job_position_roles.scope IS 'Permisos adicionales o restricciones del cargo';
COMMENT ON COLUMN job_position_roles.priority IS 'Prioridad para resolver conflictos';
```

**Uso:**
```sql
-- Gerente de Ventas = Rol "Gerente" + Rol "Ventas"
INSERT INTO job_position_roles (job_position_id, role_id, priority)
VALUES 
  ('uuid-gerente-ventas', (SELECT id FROM roles WHERE name = 'Gerente' AND organization_id = 1), 10),
  ('uuid-gerente-ventas', (SELECT id FROM roles WHERE name = 'Ventas' AND organization_id = 1), 5);
```

---

### **Cambio 4: Mejorar `organization_members` (Agregar columna)**

```sql
-- Agregar job_position_id para vincular con cargos
ALTER TABLE organization_members
  ADD COLUMN job_position_id UUID REFERENCES job_positions(id) ON DELETE SET NULL,
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX idx_org_members_job_position ON organization_members(job_position_id);

COMMENT ON COLUMN organization_members.role_id IS 'Rol principal del miembro';
COMMENT ON COLUMN organization_members.job_position_id IS 'Cargo del miembro (hereda roles del cargo)';
```

---

### **Cambio 5: Crear `member_roles` (Nueva - Múltiples Roles)**

```sql
CREATE TABLE member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id BIGINT NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  -- Scope y metadata
  scope JSONB DEFAULT '{}',
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(member_id, role_id)
);

CREATE INDEX idx_member_roles_member ON member_roles(member_id);
CREATE INDEX idx_member_roles_role ON member_roles(role_id);
CREATE INDEX idx_member_roles_expires ON member_roles(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE member_roles IS 'Roles adicionales asignados a miembros (además del rol principal y roles del cargo)';
COMMENT ON COLUMN member_roles.expires_at IS 'Fecha de expiración para roles temporales';
```

---

### **Cambio 6: Consolidar Permisos (Decisión)**

**Problema:** Tenemos `member_permissions` y `employee_permissions` que hacen lo mismo.

**Opción A - Usar `member_permissions` (Recomendada):**
```sql
-- Mantener member_permissions (tiene CRUD granular)
-- Deprecar employee_permissions

-- Migrar datos de employee_permissions a member_permissions
INSERT INTO member_permissions (organization_id, member_id, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 
  ep.organization_id,
  om.id as member_id,
  ep.permission_id,
  true, true, true, true  -- Asumir todos los permisos
FROM employee_permissions ep
JOIN organization_members om ON om.user_id = ep.profile_id AND om.organization_id = ep.organization_id
WHERE NOT EXISTS (
  SELECT 1 FROM member_permissions mp 
  WHERE mp.member_id = om.id AND mp.permission_id = ep.permission_id
);

-- Luego eliminar employee_permissions
-- DROP TABLE employee_permissions;
```

**Opción B - Usar `employee_permissions`:**
```sql
-- Agregar columnas CRUD a employee_permissions
ALTER TABLE employee_permissions
  ADD COLUMN can_view BOOLEAN DEFAULT true,
  ADD COLUMN can_create BOOLEAN DEFAULT true,
  ADD COLUMN can_edit BOOLEAN DEFAULT true,
  ADD COLUMN can_delete BOOLEAN DEFAULT true;

-- Deprecar member_permissions
```

**Recomendación:** Opción A - `member_permissions` tiene mejor estructura

---

## 🔄 Arquitectura Final Propuesta

### **Jerarquía de Permisos:**

```
1. role_templates (templates globales)
   └── roles (instancias por org, vinculadas a template)
       ├── role_permissions (permisos del rol)
       │   └── permissions (catálogo global)
       │
       ├── job_position_roles (roles del cargo)
       │   └── job_positions (cargos HRM)
       │       └── organization_members (miembros con cargo)
       │
       └── member_roles (roles adicionales directos)
           └── organization_members (miembros)

2. member_permissions (permisos directos CRUD granular)
   └── organization_members
       └── permissions

3. member_branches (miembros en sucursales)
   └── organization_members
       └── branches
```

---

## 🎯 Resolución de Permisos (Algoritmo)

```typescript
function getUserPermissions(userId: string, organizationId: number): Permission[] {
  const member = getOrganizationMember(userId, organizationId)
  let allPermissions: Permission[] = []
  
  // 1. Permisos del rol principal (organization_members.role_id)
  if (member.role_id) {
    const rolePerms = getRolePermissions(member.role_id)
    allPermissions.push(...rolePerms)
  }
  
  // 2. Permisos del cargo (job_position → job_position_roles → roles)
  if (member.job_position_id) {
    const jobPositionRoles = getJobPositionRoles(member.job_position_id)
    jobPositionRoles.forEach(jpr => {
      const rolePerms = getRolePermissions(jpr.role_id)
      allPermissions.push(...rolePerms)
    })
  }
  
  // 3. Permisos de roles adicionales (member_roles)
  const additionalRoles = getMemberRoles(member.id)
  additionalRoles.forEach(mr => {
    if (mr.is_active && (!mr.expires_at || mr.expires_at > now())) {
      const rolePerms = getRolePermissions(mr.role_id)
      allPermissions.push(...rolePerms)
    }
  })
  
  // 4. Permisos directos granulares (member_permissions)
  const directPerms = getMemberPermissions(member.id)
  allPermissions.push(...directPerms)
  
  // 5. Resolver conflictos y duplicados
  return resolveAndMergePermissions(allPermissions)
}
```

---

## 📋 Resumen de Cambios

### **Tablas Nuevas (3):**
```
✅ role_templates          - Templates globales de roles
✅ job_position_roles      - Vincular cargos con roles
✅ member_roles            - Múltiples roles por miembro
```

### **Tablas Modificadas (2):**
```
✅ roles                   - Agregar template_id, is_active, constraint
✅ organization_members    - Agregar job_position_id
```

### **Tablas Sin Cambios (4):**
```
✅ permissions             - Perfecto como está
✅ role_permissions        - Funciona bien
✅ member_permissions      - Excelente estructura CRUD
✅ member_branches         - No requiere cambios
```

### **Tablas a Deprecar (1):**
```
⚠️ employee_permissions    - Duplica member_permissions
```

---

## 🎨 Ejemplos de Uso

### **Ejemplo 1: Crear Organización Nueva**

```sql
-- 1. Crear roles base desde templates
INSERT INTO roles (name, description, is_system, organization_id, template_id)
SELECT 
  name, 
  description, 
  false,  -- No es sistema
  2,      -- organization_id
  id      -- template_id
FROM role_templates 
WHERE is_system = true;

-- 2. Copiar permisos de roles sistema a roles de org
INSERT INTO role_permissions (role_id, permission_id, scope, allowed)
SELECT 
  new_roles.id,
  rp.permission_id,
  rp.scope,
  rp.allowed
FROM roles new_roles
JOIN role_templates rt ON rt.id = new_roles.template_id
JOIN roles system_roles ON system_roles.template_id = rt.id AND system_roles.is_system = true
JOIN role_permissions rp ON rp.role_id = system_roles.id
WHERE new_roles.organization_id = 2;
```

---

### **Ejemplo 2: Gerente de Ventas con Permisos Granulares**

```sql
-- 1. Crear cargo
INSERT INTO job_positions (organization_id, name, level)
VALUES (1, 'Gerente de Ventas', 'Senior')
RETURNING id;  -- uuid-gv

-- 2. Asignar roles al cargo
INSERT INTO job_position_roles (job_position_id, role_id, priority)
VALUES 
  ('uuid-gv', (SELECT id FROM roles WHERE name = 'Gerente' AND organization_id = 1), 10),
  ('uuid-gv', (SELECT id FROM roles WHERE name = 'Ventas' AND organization_id = 1), 5);

-- 3. Asignar cargo a miembro
UPDATE organization_members 
SET job_position_id = 'uuid-gv'
WHERE id = 123;

-- 4. Agregar rol temporal adicional
INSERT INTO member_roles (member_id, role_id, expires_at)
VALUES (123, (SELECT id FROM roles WHERE name = 'Aprobador Financiero'), now() + interval '30 days');

-- 5. Agregar permiso directo granular
INSERT INTO member_permissions (organization_id, member_id, permission_id, can_view, can_create, can_edit, can_delete)
VALUES (1, 123, (SELECT id FROM permissions WHERE code = 'finance.reports.confidential'), true, false, false, false);

-- Resultado: 
-- Permisos de "Gerente" + "Ventas" + "Aprobador Financiero" (temporal) + permiso directo de solo lectura
```

---

### **Ejemplo 3: Consultar Permisos de Usuario**

```sql
-- Obtener todos los permisos de un usuario
WITH user_permissions AS (
  -- Permisos del rol principal
  SELECT DISTINCT p.*, 'role_principal' as source, 1 as priority
  FROM organization_members om
  JOIN role_permissions rp ON rp.role_id = om.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE om.user_id = 'user-uuid' AND om.organization_id = 1 AND rp.allowed = true
  
  UNION
  
  -- Permisos de roles del cargo
  SELECT DISTINCT p.*, 'job_position' as source, 2 as priority
  FROM organization_members om
  JOIN job_position_roles jpr ON jpr.job_position_id = om.job_position_id
  JOIN role_permissions rp ON rp.role_id = jpr.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE om.user_id = 'user-uuid' AND om.organization_id = 1 AND jpr.is_active = true AND rp.allowed = true
  
  UNION
  
  -- Permisos de roles adicionales
  SELECT DISTINCT p.*, 'member_role' as source, 3 as priority
  FROM organization_members om
  JOIN member_roles mr ON mr.member_id = om.id
  JOIN role_permissions rp ON rp.role_id = mr.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE om.user_id = 'user-uuid' AND om.organization_id = 1 
    AND mr.is_active = true 
    AND (mr.expires_at IS NULL OR mr.expires_at > now())
    AND rp.allowed = true
  
  UNION
  
  -- Permisos directos granulares
  SELECT DISTINCT p.*, 'member_permission' as source, 4 as priority
  FROM organization_members om
  JOIN member_permissions mp ON mp.member_id = om.id
  JOIN permissions p ON p.id = mp.permission_id
  WHERE om.user_id = 'user-uuid' AND om.organization_id = 1
    AND (mp.can_view = true OR mp.can_create = true OR mp.can_edit = true OR mp.can_delete = true)
)
SELECT * FROM user_permissions
ORDER BY module, category, code;
```

---

## ✅ Ventajas de Esta Arquitectura

1. ✅ **Mantiene tablas actuales** - No descarta nada existente
2. ✅ **Agrega solo 3 tablas nuevas** - Mínimo impacto
3. ✅ **Templates reutilizables** - role_templates para todas las orgs
4. ✅ **Roles por organización** - roles.organization_id bien definido
5. ✅ **Permisos granulares por cargo** - job_position_roles conecta HRM con RBAC
6. ✅ **Múltiples roles por usuario** - member_roles + role_id principal
7. ✅ **Permisos CRUD granulares** - member_permissions con can_view/create/edit/delete
8. ✅ **Roles temporales** - member_roles.expires_at
9. ✅ **Sin duplicación** - Templates se instancian, no se copian
10. ✅ **Separación clara** - Sistema vs Organización bien definido

---

## 🚀 Plan de Implementación

### **Fase 1: Crear Tablas Nuevas**
```sql
1. CREATE TABLE role_templates
2. ALTER TABLE roles (agregar template_id, constraint)
3. CREATE TABLE job_position_roles
4. ALTER TABLE organization_members (agregar job_position_id)
5. CREATE TABLE member_roles
```

### **Fase 2: Migrar Datos**
```sql
1. Crear templates desde roles is_system=true
2. Vincular roles existentes con templates
3. Migrar employee_permissions a member_permissions
```

### **Fase 3: Actualizar Código**
```sql
1. Actualizar servicios de roles
2. Actualizar lógica de resolución de permisos
3. Actualizar componentes UI
```

### **Fase 4: Limpieza**
```sql
1. Deprecar employee_permissions
2. Actualizar documentación
3. Crear funciones helper para resolución de permisos
```

---

## 📝 Conclusión

Esta arquitectura:
- ✅ Mantiene todas las tablas actuales
- ✅ Agrega solo lo necesario (role_templates, job_position_roles, member_roles)
- ✅ Mejora las conexiones existentes
- ✅ Separa claramente roles sistema vs organización
- ✅ Conecta HRM (job_positions) con RBAC
- ✅ Permite permisos granulares por cargo
- ✅ Soporta múltiples roles por usuario
- ✅ Es escalable y mantenible

**Listo para implementar con mínimo impacto en código existente.**
