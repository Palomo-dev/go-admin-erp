-- Modificación de la tabla organizations para soportar múltiples tipos
-- Primero creamos una tabla intermedia para la relación muchos a muchos

-- Tabla de relación entre organizaciones y tipos
CREATE TABLE IF NOT EXISTS organization_type_relations (
    organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
    organization_type_id BIGINT REFERENCES organization_types(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (organization_id, organization_type_id)
);

-- Añadimos un índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_org_type_relations_org_id ON organization_type_relations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_type_relations_type_id ON organization_type_relations(organization_type_id);

-- Añadimos comentarios para documentar
COMMENT ON TABLE organization_type_relations IS 'Relación muchos a muchos entre organizaciones y tipos de organización';
COMMENT ON COLUMN organization_type_relations.is_primary IS 'Indica si este es el tipo principal de la organización';

-- Migración de datos existentes
-- Esto tomará el type_id actual de organizations y lo migrará a la nueva estructura

DO $$
BEGIN
    -- Solo ejecutar si la columna type_id existe en la tabla organizations
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'type_id'
    ) THEN
        -- Insertar relaciones basadas en los datos existentes
        INSERT INTO organization_type_relations (organization_id, organization_type_id, is_primary)
        SELECT id, type_id, true FROM organizations WHERE type_id IS NOT NULL;
        
        -- Eliminar la columna type_id de la tabla organizations
        ALTER TABLE organizations DROP COLUMN IF EXISTS type_id;
    END IF;
END
$$;
