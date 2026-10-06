-- Rollback de 20261006003830_leads_importados_departamento.sql
--
-- 1. Restaura `fn_sync_customer_to_address` tal como estaba el 2026-10-06
--    (copiada de `pg_get_functiondef`).
-- 2. Datos: vuelve a vaciar `department` SOLO donde coincide con el
--    departamento importado y no hay municipio fiscal (antes de la migración
--    todas esas direcciones tenían `department = ''`). Si alguien escribió a
--    mano exactamente el mismo departamento después de la migración, este
--    rollback también lo vacía: no hay forma de distinguirlo.

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
      department = COALESCE(v_state_name, department),
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
        COALESCE(v_state_name, ''),
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

update public.customer_addresses a
   set department = '',
       updated_at = now()
  from public.customers c
 where c.id = a.customer_id
   and c.organization_id = a.organization_id
   and a.is_default
   and a.municipality_id is null
   and a.department = trim(c.metadata->'importacion'->>'departamento');
