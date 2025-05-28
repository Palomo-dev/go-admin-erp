-- Mejora de la estructura de sucursales (branches) para organizaciones
-- Añadimos columnas necesarias para una gestión más completa

-- Aseguramos que exista la tabla branches
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'branches') THEN
        CREATE TABLE branches (
            id BIGSERIAL PRIMARY KEY,
            organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            address TEXT,
            city VARCHAR(100),
            state VARCHAR(100),
            country VARCHAR(100),
            postal_code VARCHAR(20),
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            phone VARCHAR(50),
            email VARCHAR(255),
            manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            is_main BOOLEAN DEFAULT false
        );
    END IF;
END
$$;

-- Añadimos columnas adicionales si no existen
ALTER TABLE branches 
    ADD COLUMN IF NOT EXISTS tax_identification VARCHAR(100),
    ADD COLUMN IF NOT EXISTS opening_hours JSONB,
    ADD COLUMN IF NOT EXISTS features JSONB,
    ADD COLUMN IF NOT EXISTS capacity INTEGER,
    ADD COLUMN IF NOT EXISTS branch_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS zone VARCHAR(100);

-- Añadimos índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_branches_organization_id ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON branches(manager_id);
CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status);
CREATE INDEX IF NOT EXISTS idx_branches_branch_type ON branches(branch_type);

-- Comentarios para documentar la tabla y sus columnas
COMMENT ON TABLE branches IS 'Sucursales físicas de las organizaciones';
COMMENT ON COLUMN branches.tax_identification IS 'Identificación fiscal específica de la sucursal';
COMMENT ON COLUMN branches.opening_hours IS 'Horarios de apertura en formato JSON {day: {open: "09:00", close: "18:00"}}';
COMMENT ON COLUMN branches.features IS 'Características especiales de la sucursal en formato JSON';
COMMENT ON COLUMN branches.capacity IS 'Capacidad máxima de la sucursal (personas, mesas, etc.)';
COMMENT ON COLUMN branches.branch_type IS 'Tipo específico de sucursal (principal, secundaria, almacén, etc.)';
COMMENT ON COLUMN branches.zone IS 'Zona geográfica o de negocio donde se ubica la sucursal';

-- Trigger para actualizar el campo updated_at
CREATE OR REPLACE FUNCTION update_branch_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_branch_timestamp ON branches;

CREATE TRIGGER set_branch_timestamp
BEFORE UPDATE ON branches
FOR EACH ROW
EXECUTE FUNCTION update_branch_timestamp();
