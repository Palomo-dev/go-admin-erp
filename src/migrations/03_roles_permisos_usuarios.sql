-- Mejora de la estructura de roles y permisos para el sistema
-- Implementación de super admin, admin de organización, empleados y clientes

-- Aseguramos que los roles del sistema estén correctamente definidos
INSERT INTO roles (name, description, is_system_role, created_at)
VALUES 
    ('super_admin', 'Administrador del sistema con acceso a todas las organizaciones', true, now()),
    ('org_admin', 'Administrador de organización con control total sobre su organización', true, now()),
    ('employee', 'Empleado con acceso limitado según permisos asignados', true, now()),
    ('manager', 'Gerente con acceso ampliado a funciones administrativas', true, now()),
    ('customer', 'Cliente final de la organización', true, now())
ON CONFLICT (name) 
DO UPDATE SET 
    description = EXCLUDED.description,
    is_system_role = EXCLUDED.is_system_role;

-- Mejora de la tabla profiles para incluir información sobre el rol en la organización
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS job_title VARCHAR(100),
    ADD COLUMN IF NOT EXISTS department VARCHAR(100),
    ADD COLUMN IF NOT EXISTS permissions JSONB,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false;

-- Tabla para asignar permisos específicos a los empleados
CREATE TABLE IF NOT EXISTS employee_permissions (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
    organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES branches(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_employee_permissions_profile ON employee_permissions(profile_id);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_org ON employee_permissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_branch ON employee_permissions(branch_id);

-- Comentarios documentación
COMMENT ON TABLE employee_permissions IS 'Permisos específicos asignados a empleados por sucursal y organización';
COMMENT ON COLUMN profiles.job_title IS 'Cargo o puesto del empleado dentro de la organización';
COMMENT ON COLUMN profiles.department IS 'Departamento al que pertenece el empleado';
COMMENT ON COLUMN profiles.permissions IS 'Configuración de permisos personalizados en formato JSON';
COMMENT ON COLUMN profiles.branch_id IS 'Sucursal principal a la que está asignado el empleado';
COMMENT ON COLUMN profiles.is_owner IS 'Indica si el usuario es propietario de la organización (puede gestionar suscripciones)';

-- Trigger para actualizar campo updated_at
CREATE OR REPLACE FUNCTION update_employee_permissions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_employee_permissions_timestamp ON employee_permissions;

CREATE TRIGGER set_employee_permissions_timestamp
BEFORE UPDATE ON employee_permissions
FOR EACH ROW
EXECUTE FUNCTION update_employee_permissions_timestamp();
