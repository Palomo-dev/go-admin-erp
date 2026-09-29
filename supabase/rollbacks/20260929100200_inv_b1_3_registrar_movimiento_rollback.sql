-- Reversión de 20260929100200_inv_b1_3_registrar_movimiento.sql
-- Elimina fn_stock_registrar_movimiento y devuelve update_product_min_stock a su
-- definición anterior (sin search_path ni permiso de inventario; solo pertenencia).
-- No revierte datos: los ajustes aplicados, sus movimientos y asientos se quedan
-- (se corrigen con otro ajuste, como cualquier movimiento de kardex).

drop function if exists public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text);

CREATE OR REPLACE FUNCTION public.update_product_min_stock(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    item jsonb;
    v_product_id INTEGER;
    v_branch_id INTEGER;
    v_min_level NUMERIC;
    v_user_id UUID;
    v_organization_id INTEGER;
BEGIN
    -- Obtener el user_id actual
    v_user_id := auth.uid();
    
    -- Verificar que el usuario esté autenticado
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;
    
    -- Recorrer cada item en el array JSON
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Extraer valores del JSON
        v_product_id := (item->>'product_id')::INTEGER;
        v_branch_id := (item->>'branch_id')::INTEGER;
        v_min_level := (item->>'min_level')::NUMERIC;
        
        -- Obtener el organization_id del branch para validar permisos
        SELECT b.organization_id INTO v_organization_id
        FROM branches b 
        WHERE b.id = v_branch_id;
        
        -- Verificar que el usuario tenga acceso a esta organización
        IF NOT EXISTS (
            SELECT 1 FROM organization_members om 
            WHERE om.user_id = v_user_id 
            AND om.organization_id = v_organization_id
        ) THEN
            RAISE EXCEPTION 'Usuario no tiene permisos para esta organización';
        END IF;
        
        -- Verificar si ya existe el registro de stock_levels
        IF EXISTS (
            SELECT 1 FROM stock_levels 
            WHERE product_id = v_product_id AND branch_id = v_branch_id
        ) THEN
            -- Actualizar registro existente
            UPDATE stock_levels 
            SET min_level = v_min_level,
                updated_at = NOW()
            WHERE product_id = v_product_id AND branch_id = v_branch_id;
        ELSE
            -- Crear nuevo registro de stock_levels si no existe
            INSERT INTO stock_levels (
                product_id, 
                branch_id, 
                qty_on_hand, 
                qty_reserved, 
                avg_cost, 
                min_level,
                created_at,
                updated_at
            ) VALUES (
                v_product_id, 
                v_branch_id, 
                0, 
                0, 
                0, 
                v_min_level,
                NOW(),
                NOW()
            );
        END IF;
    END LOOP;
END;
$function$;

comment on function public.update_product_min_stock(jsonb) is null;
revoke all on function public.update_product_min_stock(jsonb) from anon, public;
grant execute on function public.update_product_min_stock(jsonb) to authenticated, service_role;
