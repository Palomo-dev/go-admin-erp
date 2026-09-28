-- Rollback de 20260928210000_impuestos_iniciales_pais_de_la_organizacion.
-- Restaura el cuerpo anterior EXACTO (leído con pg_get_functiondef el
-- 2026-09-28): filtro 'CO' que no copia nada y solo exige pertenencia.
-- No toca datos (la migración no escribió filas).

CREATE OR REPLACE FUNCTION public.initialize_organization_taxes(org_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
    -- Insertar impuestos predefinidos para la nueva organización
    INSERT INTO public.organization_taxes (
        organization_id,
        template_id,
        name,
        rate,
        description,
        is_default,
        is_active
    )
    SELECT
        org_id,
        tt.id,
        tt.name,
        tt.rate,
        tt.description,
        CASE WHEN tt.code = 'IVA_19' THEN true ELSE false END,
        true
    FROM
        public.tax_templates tt
    WHERE
        tt.country = 'CO'
        AND (tt.valid_to IS NULL OR tt.valid_to > NOW());
END;
$function$;

comment on function public.initialize_organization_taxes(integer) is null;
