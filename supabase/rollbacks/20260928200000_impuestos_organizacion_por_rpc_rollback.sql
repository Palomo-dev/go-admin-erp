-- Rollback de 20260928200000_impuestos_organizacion_por_rpc.
-- Restaura las funciones anteriores (pg_get_functiondef del 2026-09-28: solo
-- exigían ser miembro), quita las RPC nuevas y el índice, y devuelve los
-- privilegios de tabla. ADVERTENCIA: con esto un cajero vuelve a poder cambiar
-- o borrar impuestos y pueden quedar dos «por defecto».

drop function if exists public.fn_impuesto_fijar_por_defecto(integer, uuid);
drop function if exists public.fn_impuesto_cambiar_activo(integer, uuid, boolean);
drop index if exists public.uq_organization_taxes_un_por_defecto;

grant select, insert, update, delete, truncate, references, trigger on table public.organization_taxes to anon, authenticated;

create or replace function public.manage_organization_tax(p_organization_id integer, p_name text, p_rate numeric, p_description text DEFAULT NULL::text, p_is_default boolean DEFAULT false, p_is_active boolean DEFAULT true, p_template_id integer DEFAULT NULL::integer, p_id text DEFAULT NULL::text, p_tax_included boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
    v_tax_id TEXT;
    v_user_id UUID;
    v_user_has_access BOOLEAN;
    v_current_timestamp TIMESTAMPTZ := NOW();
    v_is_update BOOLEAN := p_id IS NOT NULL;
    v_id_as_uuid UUID;
BEGIN
    v_user_id := (auth.uid())::UUID;

    IF v_is_update THEN
        BEGIN
            v_id_as_uuid := p_id::UUID;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'ID de impuesto inválido',
                'code', 'INVALID_ID'
            );
        END;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE
            user_id = v_user_id AND
            organization_id = p_organization_id AND
            is_active = TRUE
    ) INTO v_user_has_access;

    IF NOT v_user_has_access THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'No tiene permisos para administrar impuestos en esta organización',
            'code', 'PERMISSION_DENIED'
        );
    END IF;

    IF v_is_update THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.organization_taxes
            WHERE id = v_id_as_uuid AND organization_id = p_organization_id
        ) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'El impuesto no existe o no pertenece a esta organización',
                'code', 'TAX_NOT_FOUND'
            );
        END IF;

        UPDATE public.organization_taxes
        SET
            name = p_name,
            rate = p_rate,
            description = p_description,
            is_default = p_is_default,
            is_active = p_is_active,
            template_id = p_template_id,
            tax_included = p_tax_included,
            updated_at = v_current_timestamp
        WHERE id = v_id_as_uuid
        RETURNING id::text INTO v_tax_id;

    ELSE
        INSERT INTO public.organization_taxes(
            organization_id, name, rate, description,
            is_default, is_active, template_id, tax_included,
            created_at, updated_at
        )
        VALUES (
            p_organization_id, p_name, p_rate, p_description,
            p_is_default, p_is_active, p_template_id, p_tax_included,
            v_current_timestamp, v_current_timestamp
        )
        RETURNING id::text INTO v_tax_id;
    END IF;

    IF p_is_default THEN
        UPDATE public.organization_taxes
        SET is_default = FALSE
        WHERE
            organization_id = p_organization_id AND
            id != v_tax_id::UUID AND
            is_default = TRUE;
    END IF;

    v_result := jsonb_build_object(
        'success', TRUE,
        'id', v_tax_id,
        'message', CASE WHEN v_is_update THEN 'Impuesto actualizado correctamente' ELSE 'Impuesto creado correctamente' END
    );

    RETURN v_result;
END;
$function$;

create or replace function public.manage_organization_tax(p_organization_id integer, p_name text, p_rate numeric, p_description text, p_is_default boolean, p_is_active boolean, p_template_id integer, p_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
    v_tax_id TEXT;
    v_user_id UUID;
    v_user_has_access BOOLEAN;
    v_current_timestamp TIMESTAMPTZ := NOW();
    v_is_update BOOLEAN := p_id IS NOT NULL;
    v_id_as_uuid UUID;
BEGIN
    v_user_id := (auth.uid())::UUID;
    IF v_is_update THEN
        BEGIN
            v_id_as_uuid := p_id::UUID;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'ID de impuesto inválido', 'code', 'INVALID_ID');
        END;
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = v_user_id AND organization_id = p_organization_id AND is_active = TRUE
    ) INTO v_user_has_access;
    IF NOT v_user_has_access THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'No tiene permisos para administrar impuestos en esta organización', 'code', 'PERMISSION_DENIED');
    END IF;
    IF v_is_update THEN
        IF NOT EXISTS (SELECT 1 FROM public.organization_taxes WHERE id = v_id_as_uuid AND organization_id = p_organization_id) THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'El impuesto no existe o no pertenece a esta organización', 'code', 'TAX_NOT_FOUND');
        END IF;
        UPDATE public.organization_taxes
        SET name = p_name, rate = p_rate, description = p_description, is_default = p_is_default,
            is_active = p_is_active, template_id = p_template_id, updated_at = v_current_timestamp
        WHERE id = v_id_as_uuid
        RETURNING id::text INTO v_tax_id;
    ELSE
        INSERT INTO public.organization_taxes(organization_id, name, rate, description, is_default, is_active, template_id, created_at, updated_at)
        VALUES (p_organization_id, p_name, p_rate, p_description, p_is_default, p_is_active, p_template_id, v_current_timestamp, v_current_timestamp)
        RETURNING id::text INTO v_tax_id;
    END IF;
    IF p_is_default THEN
        UPDATE public.organization_taxes SET is_default = FALSE
        WHERE organization_id = p_organization_id AND id != v_tax_id::UUID AND is_default = TRUE;
    END IF;
    v_result := jsonb_build_object('success', TRUE, 'id', v_tax_id,
        'message', CASE WHEN v_is_update THEN 'Impuesto actualizado correctamente' ELSE 'Impuesto creado correctamente' END);
    RETURN v_result;
END;
$function$;

create or replace function public.delete_organization_tax(p_tax_id text, p_organization_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID;
    v_user_has_access BOOLEAN;
    v_tax_exists BOOLEAN;
    v_is_default BOOLEAN;
    v_tax_id_uuid UUID;
    v_usage_count INTEGER;
BEGIN
    BEGIN
        v_tax_id_uuid := p_tax_id::UUID;
    EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'ID de impuesto inválido', 'code', 'INVALID_ID');
    END;
    v_user_id := (auth.uid())::UUID;
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = v_user_id AND organization_id = p_organization_id AND is_active = TRUE
    ) INTO v_user_has_access;
    IF NOT v_user_has_access THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'No tiene permisos para eliminar impuestos en esta organización', 'code', 'PERMISSION_DENIED');
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.organization_taxes WHERE id = v_tax_id_uuid AND organization_id = p_organization_id), is_default
    INTO v_tax_exists, v_is_default
    FROM public.organization_taxes WHERE id = v_tax_id_uuid;
    IF NOT v_tax_exists THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'El impuesto no existe o no pertenece a esta organización', 'code', 'TAX_NOT_FOUND');
    END IF;
    IF v_is_default THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'No se puede eliminar el impuesto predeterminado. Primero establezca otro impuesto como predeterminado.', 'code', 'DEFAULT_TAX_DELETION');
    END IF;
    SELECT COUNT(*) INTO v_usage_count FROM public.product_tax_relations WHERE tax_id = v_tax_id_uuid;
    IF v_usage_count > 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'No se puede eliminar el impuesto porque está siendo utilizado por ' || v_usage_count || ' producto(s).', 'code', 'TAX_IN_USE');
    END IF;
    DELETE FROM public.organization_taxes WHERE id = v_tax_id_uuid AND organization_id = p_organization_id;
    RETURN jsonb_build_object('success', TRUE, 'message', 'Impuesto eliminado correctamente');
END;
$function$;

drop function if exists public.fn_impuestos_exigir_gestion(integer);
