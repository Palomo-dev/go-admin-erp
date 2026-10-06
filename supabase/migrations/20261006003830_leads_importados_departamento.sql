-- ============================================================================
-- Aplicada el 2026-10-06 (versión 20261006003830): bug «al importar leads se
-- pierden datos». Completó el departamento en 3.189 direcciones.
-- ============================================================================
--
-- Contexto. El importador de leads escribe la ciudad en `customers.city` y el
-- departamento en `customers.metadata.importacion.departamento` (`customers`
-- no tiene columna de departamento). El trigger `trg_sync_customer_to_address`
-- crea la dirección principal en `customer_addresses`, pero solo llena
-- `department` desde el municipio fiscal (`fiscal_municipality_id`), que el
-- importador no resuelve: la dirección queda con `department = ''`.
-- Medido por SELECT el 2026-10-06: 3.189 direcciones principales de fichas
-- importadas (org 125) con el departamento vacío y el dato disponible en
-- metadata. Ninguna tiene departamento hoy.
--
-- 1. Función: si no hay municipio, el departamento sale de
--    `metadata.importacion.departamento`. Mismo cuerpo que la versión vigente
--    salvo las dos líneas marcadas «(nuevo)».
-- 2. Datos: completa `department` en las direcciones principales ya creadas.
--    Solo filas con `department` vacío: nunca pisa un valor puesto a mano.
--
-- Verificación previa (solo lectura):
--   select count(*) from customer_addresses a join customers c
--     on c.id = a.customer_id and c.organization_id = a.organization_id
--   where a.is_default and coalesce(a.department,'') = ''
--     and nullif(trim(c.metadata->'importacion'->>'departamento'),'') is not null;
--   -- 3189 el 2026-10-06
-- ============================================================================

create or replace function public.fn_sync_customer_to_address()
 returns trigger
 language plpgsql
 security definer
as $function$
DECLARE
  v_muni_name text;
  v_state_name text;
  v_country_code text;
  v_postal_code text;
  v_address_exists boolean;
  v_depto_importado text := nullif(trim(NEW.metadata->'importacion'->>'departamento'), '');  -- (nuevo)
BEGIN
  -- Solo actuar si cambió address, city o fiscal_municipality_id
  IF TG_OP = 'UPDATE' AND
     NEW.address IS NOT DISTINCT FROM OLD.address AND
     NEW.city IS NOT DISTINCT FROM OLD.city AND
     NEW.fiscal_municipality_id IS NOT DISTINCT FROM OLD.fiscal_municipality_id THEN
    RETURN NEW;
  END IF;

  -- Resolver datos del municipio si hay fiscal_municipality_id
  IF NEW.fiscal_municipality_id IS NOT NULL THEN
    SELECT m.name, m.state_name, m.country_code, m.code
    INTO v_muni_name, v_state_name, v_country_code, v_postal_code
    FROM municipalities m
    WHERE m.id = NEW.fiscal_municipality_id;
  END IF;

  -- Verificar si ya existe una dirección default
  SELECT EXISTS(
    SELECT 1 FROM customer_addresses
    WHERE customer_id = NEW.id AND is_default = true
  ) INTO v_address_exists;

  IF v_address_exists THEN
    -- Actualizar la dirección default existente
    UPDATE customer_addresses SET
      address_line1 = COALESCE(NEW.address, address_line1),
      city = COALESCE(v_muni_name, NEW.city, city),
      department = COALESCE(v_state_name, NULLIF(department, ''), v_depto_importado, department),  -- (nuevo)
      country_code = COALESCE(v_country_code, country_code),
      postal_code = COALESCE(v_postal_code, postal_code),
      municipality_id = COALESCE(NEW.fiscal_municipality_id, municipality_id),
      updated_at = NOW()
    WHERE customer_id = NEW.id AND is_default = true;
  ELSE
    -- Crear dirección default si hay al menos address o municipio
    IF NEW.address IS NOT NULL OR NEW.fiscal_municipality_id IS NOT NULL THEN
      INSERT INTO customer_addresses (
        organization_id, customer_id, label, address_line1, city,
        department, country_code, postal_code, municipality_id, is_default
      ) VALUES (
        NEW.organization_id,
        NEW.id,
        'Principal',
        COALESCE(NEW.address, ''),
        COALESCE(v_muni_name, NEW.city, ''),
        COALESCE(v_state_name, v_depto_importado, ''),
        COALESCE(v_country_code, 'CO'),
        v_postal_code,
        NEW.fiscal_municipality_id,
        true
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Datos: direcciones principales ya creadas por el importador.
update public.customer_addresses a
   set department = trim(c.metadata->'importacion'->>'departamento'),
       updated_at = now()
  from public.customers c
 where c.id = a.customer_id
   and c.organization_id = a.organization_id
   and a.is_default
   and coalesce(a.department, '') = ''
   and nullif(trim(c.metadata->'importacion'->>'departamento'), '') is not null;
