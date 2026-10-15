## Tests de verificación para gosec_roles_por_organizacion

## Contexto

Esta migración cierra la brecha de seguridad multi-tenant agregando `organization_id` a la tabla `roles`, permitiendo que cada organización gestione sus propios roles personalizados mientras mantiene roles del sistema compartidos (organization_id = NULL).

## Datos verificados en producción ANTES de la migración

```sql
-- Roles existentes (ejecutado 2026-09-30)
SELECT id, name, is_system, created_at
FROM roles
ORDER BY id;

-- Resultado:
-- id | name                    | is_system | created_at
-- ---+-------------------------+-----------+---------------------------
-- 1  | Super Admin             | true      | 2025-05-04 20:26:49.587634+00
-- 2  | Admin de organización   | true      | 2025-05-04 20:26:49.587634+00
-- 3  | Cliente                 | true      | 2025-05-04 20:26:49.587634+00
-- 4  | Empleado                | true      | 2025-05-04 20:26:49.587634+00
-- 5  | Manager                 | true      | 2025-05-04 20:26:49.587634+00

-- Uso de roles por organización
SELECT 
  r.id,
  r.name,
  r.is_system,
  COUNT(DISTINCT om.organization_id) as org_count,
  COUNT(om.id) as member_count
FROM roles r
LEFT JOIN organization_members om ON om.role_id = r.id
GROUP BY r.id, r.name, r.is_system
ORDER BY r.id;

-- Resultado:
-- id | name                    | is_system | org_count | member_count
-- ---+-------------------------+-----------+-----------+-------------
-- 1  | Super Admin             | true      | 0         | 0
-- 2  | Admin de organización   | true      | 86        | 99
-- 3  | Cliente                 | true      | 0         | 0
-- 4  | Empleado                | true      | 7         | 42
-- 5  | Manager                 | true      | 1         | 1

-- Conclusión: NO hay roles personalizados (is_system = false)
-- El backfill es trivial: los 5 roles existentes se quedan con organization_id = NULL
```

## Prerequisitos para testing

Necesitarás:
1. Dos organizaciones de prueba (org A con id 9990 y org B con id 9991)
2. Un usuario admin en org A (NO platform admin)
3. Un usuario admin en org B (NO platform admin)
4. Un usuario platform admin (en la tabla `platform_admins` con status 'active')

## Tests ANTES de aplicar la migración (estado actual vulnerable)

### Setup inicial

```sql
-- Crear dos organizaciones de prueba si no existen
INSERT INTO organizations (id, name) 
VALUES (9990, 'Test Org A'), (9991, 'Test Org B')
ON CONFLICT (id) DO NOTHING;

-- Nota: No creamos roles de prueba aún porque antes de la migración
-- no existe organization_id
```

### Test 1: Verificar que un admin de org A PUEDE crear roles (vulnerabilidad)

```sql
-- Configura la sesión como un admin de org A (NO platform admin)
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_a]", "role": "authenticated", "organization_id": 9990}';
SET LOCAL role TO authenticated;

-- Intenta crear un rol (debería FUNCIONAR en el estado actual)
INSERT INTO roles (name, description, is_system)
VALUES ('Test Role Vulnerable A', 'Rol creado por admin de org A', false)
RETURNING id; -- Anota este ID como test_role_id_a

-- Si esto funciona, la vulnerabilidad está confirmada
```

### Test 2: Verificar que un admin de org B PUEDE ver y modificar ese rol (vulnerabilidad)

```sql
-- Configura la sesión como un admin de org B
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_b]", "role": "authenticated", "organization_id": 9991}';
SET LOCAL role TO authenticated;

-- Intenta VER el rol creado por org A (debería FUNCIONAR - vulnerabilidad)
SELECT id, name, description FROM roles WHERE id = [test_role_id_a];

-- Intenta MODIFICAR el rol creado por org A (debería FUNCIONAR - vulnerabilidad)
UPDATE roles
SET description = 'Modificado por admin de org B - esto es la vulnerabilidad'
WHERE id = [test_role_id_a];

-- Si esto funciona, la vulnerabilidad está confirmada
```

## Tests DESPUÉS de aplicar la migración (estado seguro)

### Test 3: Verificar estructura de la tabla roles

```sql
-- Verificar que organization_id existe y es del tipo correcto
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'roles'
  AND column_name = 'organization_id';

-- Resultado esperado:
-- column_name      | data_type | is_nullable | column_default
-- -----------------+-----------+-------------+---------------
-- organization_id  | integer   | YES         | NULL

-- Verificar índices
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'roles'
  AND indexname LIKE '%org%';

-- Resultado esperado:
-- idx_roles_organization_id (con WHERE organization_id IS NOT NULL)
-- idx_roles_org_name_unique (unique sobre organization_id, LOWER(name))
```

### Test 4: Verificar backfill - roles del sistema con organization_id = NULL

```sql
-- Todos los roles del sistema deben tener organization_id = NULL
SELECT id, name, is_system, organization_id
FROM roles
WHERE is_system = true
ORDER BY id;

-- Resultado esperado: 5 roles, todos con organization_id = NULL
-- id | name                    | is_system | organization_id
-- ---+-------------------------+-----------+----------------
-- 1  | Super Admin             | true      | NULL
-- 2  | Admin de organización   | true      | NULL
-- 3  | Cliente                 | true      | NULL
-- 4  | Empleado                | true      | NULL
-- 5  | Manager                 | true      | NULL
```

### Test 5: Admin de org A puede crear rol personalizado de SU organización

```sql
-- Configura la sesión como un admin de org A
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_a]", "role": "authenticated", "organization_id": 9990}';
SET LOCAL role TO authenticated;

-- Intenta crear un rol personalizado de org A (debería FUNCIONAR ahora)
INSERT INTO roles (name, description, is_system, organization_id)
VALUES ('Vendedor', 'Rol de vendedor para org A', false, 9990)
RETURNING id; -- Anota como test_role_vendedor_a

-- Resultado esperado: SUCCESS
```

### Test 6: Admin de org A NO puede crear rol de otra organización

```sql
-- Configura la sesión como un admin de org A
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_a]", "role": "authenticated", "organization_id": 9990}';
SET LOCAL role TO authenticated;

-- Intenta crear un rol de org B (debería FALLAR)
INSERT INTO roles (name, description, is_system, organization_id)
VALUES ('Vendedor Org B', 'Intento de crear rol para otra org', false, 9991);

-- Resultado esperado: ERROR por violación de RLS
-- new row violates row-level security policy for table "roles"
```

### Test 7: Admin de org B NO puede ver roles de org A

```sql
-- Configura la sesión como un admin de org B
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_b]", "role": "authenticated", "organization_id": 9991}';
SET LOCAL role TO authenticated;

-- Intenta ver el rol "Vendedor" de org A (debería NO aparecer)
SELECT id, name, organization_id
FROM roles
WHERE name = 'Vendedor';

-- Resultado esperado: 0 filas (el rol de org A no es visible para org B)
```

### Test 8: Admin de org B SÍ puede ver roles del sistema

```sql
-- Configura la sesión como un admin de org B
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_b]", "role": "authenticated", "organization_id": 9991}';
SET LOCAL role TO authenticated;

-- Intenta ver roles del sistema (debería FUNCIONAR)
SELECT id, name, organization_id
FROM roles
WHERE organization_id IS NULL
ORDER BY id;

-- Resultado esperado: los 5 roles del sistema son visibles
```

### Test 9: Admin de org B NO puede modificar rol de org A

```sql
-- Configura la sesión como un admin de org B
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_b]", "role": "authenticated", "organization_id": 9991}';
SET LOCAL role TO authenticated;

-- Intenta modificar el rol "Vendedor" de org A (debería FALLAR)
UPDATE roles
SET description = 'Intento de modificar rol de otra org'
WHERE id = [test_role_vendedor_a];

-- Resultado esperado: ERROR por violación de RLS
-- No rows were updated (o error RLS si la query intenta actualizar)
```

### Test 10: Admin NO puede cambiar organization_id de un rol existente

```sql
-- Configura la sesión como un admin de org A
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_a]", "role": "authenticated", "organization_id": 9990}';
SET LOCAL role TO authenticated;

-- Intenta cambiar organization_id del rol (debería FALLAR por trigger)
UPDATE roles
SET organization_id = 9991
WHERE id = [test_role_vendedor_a];

-- Resultado esperado: ERROR del trigger
-- No se puede cambiar organization_id de un rol existente
```

### Test 11: NO se puede asignar a un miembro un rol de otra organización

```sql
-- Configura la sesión como service role para poder insertar
SET LOCAL role TO service_role;

-- Intenta asignar un rol de org A a un miembro de org B (debería FALLAR por trigger)
INSERT INTO organization_members (
  id, user_id, organization_id, role_id, is_active
)
VALUES (
  gen_random_uuid(),
  '[user_id_any]',
  9991, -- Org B
  [test_role_vendedor_a], -- Rol de org A
  true
);

-- Resultado esperado: ERROR del trigger fn_org_members_validate_role
-- No se puede asignar rol X de org 9990 a miembro de org 9991
```

### Test 12: SÍ se puede asignar un rol del sistema a cualquier organización

```sql
-- Configura la sesión como service role
SET LOCAL role TO service_role;

-- Intenta asignar rol "Empleado" (sistema, id 4) a miembro de org B (debería FUNCIONAR)
INSERT INTO organization_members (
  id, user_id, organization_id, role_id, is_active
)
VALUES (
  gen_random_uuid(),
  '[user_id_any]',
  9991, -- Org B
  4, -- Empleado (rol del sistema)
  true
);

-- Resultado esperado: SUCCESS
```

### Test 13: NO se puede borrar un rol con miembros asignados

```sql
-- Configura la sesión como service role
SET LOCAL role TO service_role;

-- Primero crear un rol y asignar un miembro
INSERT INTO roles (name, description, is_system, organization_id)
VALUES ('Rol Con Miembros', 'Rol para probar borrado', false, 9990)
RETURNING id; -- Anota como test_role_con_miembros

INSERT INTO organization_members (
  id, user_id, organization_id, role_id, is_active
)
VALUES (
  gen_random_uuid(),
  '[user_id_any]',
  9990,
  [test_role_con_miembros],
  true
);

-- Ahora intenta borrar el rol (debería FALLAR por trigger)
DELETE FROM roles WHERE id = [test_role_con_miembros];

-- Resultado esperado: ERROR del trigger fn_roles_prevent_delete_with_members
-- No se puede eliminar el rol porque tiene N miembros asignados
```

### Test 14: Platform admin SÍ puede crear roles del sistema

```sql
-- Configura la sesión como un platform admin
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_platform_admin]", "role": "authenticated"}';
SET LOCAL role TO authenticated;

-- Intenta crear un rol del sistema (debería FUNCIONAR)
INSERT INTO roles (name, description, is_system, organization_id)
VALUES ('Nuevo Rol Sistema', 'Rol del sistema creado por platform admin', true, NULL)
RETURNING id;

-- Resultado esperado: SUCCESS
```

### Test 15: Platform admin SÍ puede modificar roles de cualquier organización

```sql
-- Configura la sesión como un platform admin
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_platform_admin]", "role": "authenticated"}';
SET LOCAL role TO authenticated;

-- Intenta modificar el rol "Vendedor" de org A (debería FUNCIONAR)
UPDATE roles
SET description = 'Modificado por platform admin - esto es correcto'
WHERE id = [test_role_vendedor_a];

-- Resultado esperado: SUCCESS
```

### Test 16: Gestión de permisos de roles personalizados

```sql
-- Configura la sesión como un admin de org A
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_a]", "role": "authenticated", "organization_id": 9990}';
SET LOCAL role TO authenticated;

-- Intenta agregar un permiso al rol "Vendedor" de org A (debería FUNCIONAR)
INSERT INTO role_permissions (role_id, permission_id, allowed)
VALUES ([test_role_vendedor_a], 1, true);

-- Resultado esperado: SUCCESS
```

### Test 17: Admin NO puede gestionar permisos de roles de otra org

```sql
-- Configura la sesión como un admin de org B
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_b]", "role": "authenticated", "organization_id": 9991}';
SET LOCAL role TO authenticated;

-- Intenta modificar permisos del rol "Vendedor" de org A (debería FALLAR)
UPDATE role_permissions
SET allowed = false
WHERE role_id = [test_role_vendedor_a] AND permission_id = 1;

-- Resultado esperado: ERROR por violación de RLS o 0 rows updated
```

### Test 18: Admin NO puede gestionar permisos de roles del sistema

```sql
-- Configura la sesión como un admin de org A
SET LOCAL request.jwt.claims TO '{"sub": "[user_id_admin_org_a]", "role": "authenticated", "organization_id": 9990}';
SET LOCAL role TO authenticated;

-- Intenta modificar permisos del rol "Admin de organización" (sistema, id 2)
INSERT INTO role_permissions (role_id, permission_id, allowed)
VALUES (2, 1, true);

-- Resultado esperado: ERROR por violación de RLS
```

## Cleanup

```sql
-- Limpia los datos de prueba (como service role)
SET LOCAL role TO service_role;

-- Primero borrar los miembros que usan los roles de prueba
DELETE FROM organization_members 
WHERE organization_id IN (9990, 9991) 
  AND role_id NOT IN (1, 2, 3, 4, 5);

-- Luego borrar los permisos de roles de prueba
DELETE FROM role_permissions 
WHERE role_id IN (
  SELECT id FROM roles WHERE organization_id IN (9990, 9991)
);

-- Luego borrar los roles de prueba
DELETE FROM roles WHERE organization_id IN (9990, 9991);

-- Finalmente borrar las organizaciones de prueba
DELETE FROM organizations WHERE id IN (9990, 9991);
```

## Flujos de la app que deben probarse manualmente

Después de aplicar la migración, verifica estos flujos en la UI:

1. **Onboarding / Registro de nueva organización**:
   - Crea una cuenta nueva
   - Verifica que la organización se crea correctamente
   - Verifica que el usuario inicial tiene un rol del sistema asignado
   - Verifica que NO se intenta crear roles personalizados automáticamente

2. **Pantalla de roles (`/app/roles`)**:
   - Como admin de organización A:
     - Verifica que ves los roles del sistema (5 roles)
     - Verifica que ves los roles personalizados de tu organización
     - Verifica que NO ves roles personalizados de org B
     - Verifica que puedes crear un nuevo rol personalizado
     - Verifica que puedes editar roles personalizados de tu org
     - Verifica que NO puedes editar roles del sistema
     - Verifica que NO puedes editar roles de org B

3. **Asignación de roles a miembros**:
   - Como admin de organización A:
     - Ve a la pantalla de gestión de miembros
     - Verifica que puedes asignar roles del sistema a miembros
     - Verifica que puedes asignar roles personalizados de tu org
     - Verifica que NO aparecen roles de org B en el selector

4. **Gestión de permisos de roles**:
   - Como admin de organización A:
     - Edita un rol personalizado de tu org
     - Verifica que puedes cambiar sus permisos
     - Intenta editar un rol del sistema
     - Verifica que NO puedes cambiar permisos de roles del sistema

5. **Platform admin (si existe)**:
   - Como platform admin:
     - Verifica que SÍ puedes crear roles del sistema
     - Verifica que SÍ puedes modificar roles de cualquier organización
     - Verifica que SÍ puedes modificar permisos de roles del sistema

## Consultas de diagnóstico

```sql
-- Ver todas las políticas actuales en las tablas afectadas
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('roles', 'role_permissions', 'permissions')
ORDER BY tablename, policyname;

-- Ver distribución de roles por organización
SELECT 
  COALESCE(r.organization_id::text, 'SISTEMA') as org,
  COUNT(*) as role_count,
  COUNT(*) FILTER (WHERE r.is_system = true) as system_roles,
  COUNT(*) FILTER (WHERE r.is_system = false) as custom_roles
FROM roles r
GROUP BY r.organization_id
ORDER BY r.organization_id NULLS FIRST;

-- Ver asignación de roles a miembros
SELECT 
  r.id as role_id,
  r.name as role_name,
  COALESCE(r.organization_id::text, 'SISTEMA') as role_org,
  r.is_system,
  COUNT(om.id) as member_count,
  COUNT(DISTINCT om.organization_id) as used_by_orgs
FROM roles r
LEFT JOIN organization_members om ON om.role_id = r.id
GROUP BY r.id, r.name, r.organization_id, r.is_system
ORDER BY r.organization_id NULLS FIRST, r.id;

-- Verificar que no hay roles huérfanos o inconsistentes
SELECT 
  r.id,
  r.name,
  r.organization_id,
  r.is_system,
  CASE
    WHEN r.is_system = true AND r.organization_id IS NOT NULL 
      THEN 'ERROR: Rol del sistema con organization_id'
    WHEN r.is_system = false AND r.organization_id IS NULL 
      THEN 'ERROR: Rol personalizado sin organization_id'
    ELSE 'OK'
  END as validation
FROM roles r
WHERE 
  (r.is_system = true AND r.organization_id IS NOT NULL)
  OR (r.is_system = false AND r.organization_id IS NULL);

-- Resultado esperado: 0 filas (todos los roles son consistentes)

-- Verificar triggers instalados
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE '%role%'
  AND event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

## Riesgos y precauciones

### Riesgo BAJO - Backfill simple
- Solo hay 5 roles del sistema, ningún rol personalizado
- El backfill es trivial: todos se quedan con `organization_id = NULL`
- NO hay duplicación ni remapeo necesario

### Riesgo MEDIO - Cambio en UI de gestión de roles
- La pantalla `/app/roles` debe actualizarse para incluir `organization_id`
- Los servicios `roleService` y `rolesManagementService` deben filtrar por org

### Riesgo ALTO si se ejecuta antes de actualizar la app
- Si la migración se aplica pero la app NO se actualiza:
  - Los admins NO podrán crear roles personalizados (faltará organization_id)
  - La UI mostrará errores al intentar crear roles
- **Solución**: Desplegar app y migración juntos, o aplicar migración después del deploy de app

### Orden de aplicación recomendado
1. Desplegar código de app actualizado (con organization_id en forms)
2. Aplicar migración en staging y probar
3. Aplicar migración en producción
4. Verificar que todo funciona
5. Monitorear logs de errores RLS
