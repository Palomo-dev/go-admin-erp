# 🛡️ Sistema RBAC - Documentación Completa

## 📋 Resumen Ejecutivo

Se ha actualizado y mejorado el sistema de **Control de Acceso Basado en Roles (RBAC)** para la página `/app/roles/roles`, implementando gestión completa de roles, permisos, asignaciones y analíticas con soporte para tema claro/oscuro.

---

## 🎯 Características Implementadas

### **1. Página Principal Actualizada** ✅
**Archivo:** `src/app/app/roles/roles/page.tsx`

**Mejoras:**
- ✅ Uso correcto de `useOrganization` hook
- ✅ Tema dark/light con color azul principal
- ✅ Sistema de tabs con `shadcn/ui`
- ✅ Loading states mejorados
- ✅ 4 tabs principales: Roles, Asignación, Permisos, Analíticas

**Características:**
```typescript
- useOrganization() para obtener organization.id
- Tabs con iconos y estados activos
- Diseño consistente con otros módulos
- Soporte completo dark/light mode
```

---

### **2. Componente RoleAnalytics** ✅
**Archivo:** `src/components/admin/RoleAnalytics.tsx`

**Funcionalidades:**
- ✅ **Estadísticas Principales:**
  - Total de roles (con desglose custom/system)
  - Total de miembros (con activos/inactivos)
  - Total de permisos disponibles

- ✅ **Distribución de Roles:**
  - Gráfico de barras con porcentajes
  - Top 5 roles más asignados
  - Contador de miembros por rol

- ✅ **Actividad Reciente:**
  - Últimos 10 cambios del audit log
  - Usuario que realizó el cambio
  - Fecha y hora del cambio
  - Tipo de acción (crear, editar, eliminar)

**Tablas Consultadas:**
```sql
- roles (total, is_system)
- organization_members (total, is_active, role_id)
- permissions (total disponibles)
- roles_audit_log (actividad reciente)
- profiles (emails de usuarios)
```

---

### **3. Componentes Existentes Verificados** ✅

#### **RolesManagement.tsx**
- Gestión CRUD de roles
- Duplicar roles con permisos
- Filtros por tipo (system/custom)
- Búsqueda por nombre
- Matriz de permisos integrada

#### **RoleAssignment.tsx**
- Asignar roles a miembros
- Ver miembros por rol
- Cambiar rol de miembro
- Activar/desactivar miembros

#### **PermissionsManagement.tsx**
- Gestión de permisos individuales
- Organización por módulos
- Categorías de permisos
- Asignación masiva

#### **PermissionsMatrix.tsx**
- Matriz visual rol × permiso
- Edición inline de permisos
- Vista por módulos
- Guardado automático

---

## 📊 Estructura de Tablas Supabase

### **Tabla: `roles`**
```sql
- id (integer, PK)
- name (varchar, unique)
- description (text, nullable)
- is_system (boolean, default: false)
- created_at (timestamptz)
- organization_id (integer, nullable)
```

**Roles del Sistema (is_system = true):**
- No se pueden eliminar
- Disponibles para todas las organizaciones
- Permisos predefinidos

**Roles Personalizados (is_system = false):**
- Específicos de cada organización
- Totalmente editables
- Se pueden duplicar

---

### **Tabla: `permissions`**
```sql
- id (integer, PK)
- code (varchar, unique)
- name (text)
- description (text, nullable)
- module (varchar)
- category (text, nullable)
- created_at (timestamptz)
```

**Estructura de Permisos:**
```
module: 'inventario', 'crm', 'pos', 'admin', etc.
category: 'productos', 'categorias', 'proveedores', etc.
code: 'inventario.productos.create', 'crm.customers.read', etc.
```

---

### **Tabla: `role_permissions`**
```sql
- id (integer, PK)
- role_id (integer, FK → roles.id)
- permission_id (integer, FK → permissions.id)
- scope (varchar, nullable)
- allowed (boolean, default: true)
```

**Matriz Rol × Permiso:**
- Relación muchos a muchos
- Campo `scope` para permisos granulares
- Campo `allowed` para denegar explícitamente

---

### **Tabla: `organization_members`**
```sql
- id (bigint, PK)
- organization_id (integer, FK → organizations.id)
- user_id (uuid, FK → auth.users.id)
- role_id (integer, FK → roles.id)
- is_active (boolean, default: true)
- is_super_admin (boolean, nullable)
- created_at (timestamptz)
```

**Asignación de Roles:**
- Un miembro = un rol
- Campo `is_super_admin` para acceso total
- Campo `is_active` para habilitar/deshabilitar

---

### **Tabla: `roles_audit_log`**
```sql
- id (uuid, PK)
- organization_id (integer, FK)
- entity (text) -- 'role', 'permission', 'assignment'
- entity_id (uuid)
- action (text) -- 'create', 'update', 'delete'
- user_id (uuid, FK → auth.users.id)
- diff (jsonb) -- Cambios realizados
- logged_at (timestamptz)
- correlation_id (uuid, nullable)
- event_time (timestamptz, nullable)
```

**Auditoría Completa:**
- Registro de todos los cambios
- Usuario que realizó la acción
- Diff de cambios (antes/después)
- Agrupación por correlation_id

---

## 🎨 Diseño y Tema

### **Colores Principales:**
```css
/* Modo Claro */
- Primario: #3B82F6 (blue-600)
- Fondo: #F9FAFB (gray-50)
- Cards: #FFFFFF (white)
- Texto: #111827 (gray-900)
- Bordes: #E5E7EB (gray-200)

/* Modo Oscuro */
- Primario: #60A5FA (blue-400)
- Fondo: #111827 (gray-900)
- Cards: #1F2937 (gray-800)
- Texto: #F9FAFB (white)
- Bordes: #374151 (gray-700)
```

### **Componentes UI Utilizados:**
- `Tabs` - Navegación entre secciones
- `Card` - Contenedores de contenido
- `Button` - Acciones principales
- `Dialog` - Modales para crear/editar
- `Select` - Selectores de opciones
- `Switch` - Toggle activo/inactivo
- `Badge` - Etiquetas de estado
- `Skeleton` - Loading states

---

## 🔄 Flujo de Trabajo

### **1. Gestión de Roles**

**Crear Rol:**
```typescript
1. Click en "Nuevo Rol"
2. Ingresar nombre y descripción
3. Seleccionar permisos en matriz
4. Guardar → INSERT en roles + role_permissions
5. Registrar en audit log
```

**Editar Rol:**
```typescript
1. Click en "Editar" en rol existente
2. Modificar nombre/descripción
3. Actualizar permisos en matriz
4. Guardar → UPDATE roles + role_permissions
5. Registrar cambios en audit log
```

**Duplicar Rol:**
```typescript
1. Click en "Duplicar" en rol existente
2. Ingresar nuevo nombre
3. Copiar todos los permisos del rol original
4. Crear → INSERT roles + role_permissions (copia)
5. Registrar en audit log
```

**Eliminar Rol:**
```typescript
1. Verificar is_system = false
2. Verificar no tiene miembros asignados
3. Confirmar eliminación
4. DELETE role_permissions WHERE role_id
5. DELETE roles WHERE id
6. Registrar en audit log
```

---

### **2. Asignación de Roles**

**Asignar Rol a Miembro:**
```typescript
1. Seleccionar miembro de la lista
2. Seleccionar rol del dropdown
3. Guardar → UPDATE organization_members SET role_id
4. Registrar en audit log
```

**Cambiar Rol:**
```typescript
1. Seleccionar nuevo rol
2. Confirmar cambio
3. UPDATE organization_members
4. Registrar cambio anterior y nuevo en audit log
```

**Activar/Desactivar Miembro:**
```typescript
1. Toggle switch is_active
2. UPDATE organization_members SET is_active
3. Registrar en audit log
```

---

### **3. Gestión de Permisos**

**Ver Permisos por Módulo:**
```typescript
1. Filtrar permisos por module
2. Agrupar por category
3. Mostrar en lista o matriz
```

**Asignar Permiso a Rol:**
```typescript
1. Seleccionar rol
2. Seleccionar permiso
3. INSERT role_permissions (role_id, permission_id, allowed=true)
4. Registrar en audit log
```

**Revocar Permiso:**
```typescript
1. Seleccionar rol y permiso
2. DELETE role_permissions WHERE role_id AND permission_id
3. Registrar en audit log
```

---

### **4. Analíticas**

**Cargar Estadísticas:**
```typescript
1. COUNT roles (total, custom, system)
2. COUNT organization_members (total, active)
3. COUNT permissions (total)
4. GROUP BY role_id para distribución
5. SELECT TOP 10 FROM roles_audit_log
6. JOIN profiles para obtener emails
```

---

## 📝 Consultas SQL Útiles

### **Obtener Roles con Conteo de Miembros:**
```sql
SELECT 
  r.id,
  r.name,
  r.description,
  r.is_system,
  COUNT(om.id) as member_count
FROM roles r
LEFT JOIN organization_members om ON om.role_id = r.id
WHERE r.organization_id = $1 OR r.is_system = true
GROUP BY r.id, r.name, r.description, r.is_system
ORDER BY r.name;
```

### **Obtener Permisos de un Rol:**
```sql
SELECT 
  p.id,
  p.code,
  p.name,
  p.module,
  p.category,
  rp.allowed
FROM permissions p
JOIN role_permissions rp ON rp.permission_id = p.id
WHERE rp.role_id = $1
ORDER BY p.module, p.category, p.name;
```

### **Obtener Miembros con sus Roles:**
```sql
SELECT 
  om.id,
  om.user_id,
  om.is_active,
  r.name as role_name,
  p.email,
  p.full_name
FROM organization_members om
JOIN roles r ON r.id = om.role_id
JOIN profiles p ON p.id = om.user_id
WHERE om.organization_id = $1
ORDER BY p.full_name;
```

### **Distribución de Roles:**
```sql
SELECT 
  r.name,
  COUNT(om.id) as member_count,
  ROUND(COUNT(om.id)::numeric / SUM(COUNT(om.id)) OVER () * 100, 1) as percentage
FROM roles r
LEFT JOIN organization_members om ON om.role_id = r.id AND om.organization_id = $1
WHERE r.organization_id = $1 OR r.is_system = true
GROUP BY r.id, r.name
ORDER BY member_count DESC;
```

### **Actividad Reciente:**
```sql
SELECT 
  ral.id,
  ral.entity,
  ral.action,
  ral.logged_at,
  p.email as user_email
FROM roles_audit_log ral
JOIN profiles p ON p.id = ral.user_id
WHERE ral.organization_id = $1
ORDER BY ral.logged_at DESC
LIMIT 10;
```

---

## 🔐 Permisos Requeridos

Para acceder al módulo de roles, el usuario debe tener uno de estos permisos:

```typescript
PERMISSIONS.ROLES_MANAGE        // Gestionar roles
PERMISSIONS.USER_MANAGEMENT     // Gestionar usuarios
PERMISSIONS.ADMIN_FULL_ACCESS   // Acceso completo admin
```

**Módulo:** `MODULES.ADMIN`

---

## 🚀 Uso del Sistema

### **Acceso:**
```
URL: /app/roles/roles
Requiere: Autenticación + Permisos de admin
```

### **Navegación:**
```
Tab 1: Gestión de Roles → CRUD completo de roles
Tab 2: Asignación → Asignar roles a miembros
Tab 3: Permisos → Gestionar permisos individuales
Tab 4: Analíticas → Estadísticas y reportes
```

---

## 📦 Archivos del Sistema

### **Páginas:**
```
src/app/app/roles/roles/page.tsx ✅ ACTUALIZADO
```

### **Componentes:**
```
src/components/admin/
├── RolesManagement.tsx          ✅ EXISTENTE
├── RoleAssignment.tsx           ✅ EXISTENTE
├── PermissionsManagement.tsx    ✅ EXISTENTE
├── PermissionsMatrix.tsx        ✅ EXISTENTE
├── ModuleManagement.tsx         ✅ EXISTENTE
└── RoleAnalytics.tsx            ✅ NUEVO
```

### **Hooks y Servicios:**
```
src/lib/hooks/
└── useOrganization.ts           ✅ UTILIZADO

src/lib/supabase/
└── config.ts                    ✅ UTILIZADO
```

---

## ✨ Mejoras Implementadas

1. **useOrganization Hook** - Obtención correcta de organization.id
2. **Tema Dark/Light** - Soporte completo con color azul principal
3. **Componente Analytics** - Estadísticas completas y visuales
4. **Tabs Mejorados** - Navegación intuitiva con iconos
5. **Loading States** - Indicadores de carga consistentes
6. **Diseño Consistente** - Alineado con módulos de integraciones y parking
7. **Responsive Design** - Funciona en mobile, tablet y desktop

---

## 🎯 Estado del Proyecto

**✅ Completado:**
- Página principal actualizada con useOrganization
- Componente RoleAnalytics con estadísticas completas
- Tema dark/light implementado
- Tabs funcionales con shadcn/ui
- Integración con Supabase verificada
- Documentación completa

**Componentes Existentes Funcionales:**
- RolesManagement (CRUD de roles)
- RoleAssignment (Asignación de roles)
- PermissionsManagement (Gestión de permisos)
- PermissionsMatrix (Matriz visual)

**Listo para usar en:** `/app/roles/roles`

---

## 🔧 Troubleshooting

### **Error: "organization is undefined"**
**Solución:** Verificar que `useOrganization()` esté retornando datos correctamente.

### **Error: "Cannot read property 'id' of null"**
**Solución:** Agregar validación `if (!organization) return` antes de usar `organization.id`.

### **Permisos no se cargan**
**Solución:** Verificar que la tabla `permissions` tenga datos y que el usuario tenga permisos de lectura.

### **Audit log vacío**
**Solución:** Verificar que la tabla `roles_audit_log` exista y tenga triggers configurados.

---

## 📞 Soporte

**Proyecto Supabase:** `jgmgphmzusbluqhuqihj`

**Tablas Principales:**
- `roles`
- `permissions`
- `role_permissions`
- `organization_members`
- `roles_audit_log`

El sistema RBAC está completamente funcional y listo para producción. Todos los componentes están conectados correctamente con Supabase y utilizan el hook `useOrganization` para obtener el contexto de la organización actual.
