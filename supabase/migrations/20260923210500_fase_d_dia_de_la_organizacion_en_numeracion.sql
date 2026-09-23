-- Fase D, grupo 2: la numeracion de documentos deja de decidir el dia en UTC.
--
-- Aqui el dia no es cosmetico: decide el consecutivo, y en Colombia el
-- consecutivo tiene implicacion fiscal (resolucion DIAN con rango y vigencia).
--
-- Verificado en el esquema antes de escribir nada (no se supuso):
--   invoice_sequences(organization_id integer, branch_id integer,
--                     valid_from date, valid_until date, ...)
--   sale_sequences   (organization_id integer, branch_id integer,
--                     reset_period text, last_reset_at timestamptz, ...)
-- Las dos funciones ya filtran por organization_id Y branch_id: la numeracion
-- es POR SUCURSAL, asi que la zona correspondiente es fn_timezone_for(org, branch)
-- y el dia fn_today_for(org, branch), no fn_today_for_org.
--
-- Defecto medido antes del cambio, con una organizacion en Pacific/Kiritimati
-- (UTC+14) y el servidor en UTC:
--   * fn_get_next_invoice_number: una resolucion con valid_from = hoy-de-la-org
--     se rechazaba con "No existe secuencia fiscal activa y vigente". Una sede
--     al este de UTC no podria facturar durante su primer dia de vigencia, ni
--     el ultimo.
--   * fn_get_next_sale_number: con reset_period='daily' y un ultimo reinicio
--     que para el negocio ya era del dia anterior, NO reinicio: devolvio
--     V-000043 en vez de V-000001.
--
-- Se conservan firma, tipo de retorno, volatilidad, SECURITY INVOKER, ausencia
-- de search_path, owner y ACL. Ningun DROP, ninguna sobrecarga nueva.

-- ---------------------------------------------------------------------------
-- fn_get_next_invoice_number(p_org_id, p_branch_id, p_document_type)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_next_invoice_number(p_org_id integer, p_branch_id integer, p_document_type text)
 RETURNS TABLE(invoice_number text, resolution_number character varying, prefix character varying, remaining integer, needs_alert boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_record invoice_sequences%ROWTYPE;
    v_next_number INTEGER;
    v_remaining INTEGER;
    v_today DATE;
BEGIN
    -- La vigencia de la resolucion se juzga con el dia calendario de la sede
    -- que emite, no con el dia UTC del servidor.
    v_today := public.fn_today_for(p_org_id, p_branch_id);

    -- Bloquear fila para evitar duplicados
    SELECT * INTO v_record
    FROM invoice_sequences s
    WHERE s.organization_id = p_org_id
      AND s.branch_id = p_branch_id
      AND s.document_type = p_document_type
      AND s.is_active = true
      AND (s.valid_from IS NULL OR s.valid_from <= v_today)
      AND (s.valid_until IS NULL OR s.valid_until >= v_today)
    ORDER BY s.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe secuencia fiscal activa y vigente para org=%, branch=%, type=%', p_org_id, p_branch_id, p_document_type;
    END IF;

    -- Calcular siguiente número
    IF v_record.current_number = 0 THEN
        v_next_number := v_record.range_start;
    ELSE
        v_next_number := v_record.current_number + 1;
    END IF;

    -- Verificar que no exceda el rango
    IF v_next_number > v_record.range_end THEN
        RAISE EXCEPTION 'Rango de facturación agotado para prefijo %. Rango: %-%. Solicitar nueva resolución DIAN.',
            v_record.prefix, v_record.range_start, v_record.range_end;
    END IF;

    -- Actualizar
    UPDATE invoice_sequences
    SET current_number = v_next_number,
        updated_at = now()
    WHERE id = v_record.id;

    -- Calcular restantes
    v_remaining := v_record.range_end - v_next_number;

    -- Retornar
    RETURN QUERY SELECT
        v_record.prefix || v_next_number::TEXT,
        v_record.resolution_number,
        v_record.prefix,
        v_remaining,
        v_remaining <= COALESCE(v_record.alert_threshold, 100);
END;
$function$;

-- ---------------------------------------------------------------------------
-- fn_get_next_sale_number(p_org_id, p_branch_id, p_sequence_type)
--
-- Los tres periodos de reinicio se comparan ahora en la zona de la sede:
-- last_reset_at es timestamptz, asi que se convierte con AT TIME ZONE antes de
-- sacarle el dia, el mes o el anio. Antes, 'yearly' y 'monthly' usaban now()
-- (que EXTRACT interpreta en la zona de la sesion, UTC) y 'daily' usaba
-- last_reset_at::date, que es el dia UTC. Si last_reset_at es NULL el
-- resultado sigue siendo NULL y no hay reinicio, igual que antes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_next_sale_number(p_org_id integer, p_branch_id integer, p_sequence_type text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_record sale_sequences%ROWTYPE;
    v_next_number INTEGER;
    v_formatted TEXT;
    v_tz TEXT;
    v_today DATE;
    v_last_local DATE;
BEGIN
    -- Bloquear fila para evitar duplicados
    SELECT * INTO v_record
    FROM sale_sequences
    WHERE organization_id = p_org_id
      AND branch_id = p_branch_id
      AND sequence_type = p_sequence_type
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe secuencia activa para org=%, branch=%, type=%', p_org_id, p_branch_id, p_sequence_type;
    END IF;

    -- Dia y zona de la sede que emite el consecutivo
    v_tz := public.fn_timezone_for(p_org_id, p_branch_id);
    v_today := public.fn_today_for(p_org_id, p_branch_id);

    -- Verificar si necesita reset
    IF v_record.reset_period IS NOT NULL THEN
        v_last_local := (v_record.last_reset_at AT TIME ZONE v_tz)::date;

        IF (v_record.reset_period = 'yearly' AND EXTRACT(YEAR FROM v_last_local) < EXTRACT(YEAR FROM v_today))
           OR (v_record.reset_period = 'monthly' AND (EXTRACT(YEAR FROM v_last_local) < EXTRACT(YEAR FROM v_today) OR EXTRACT(MONTH FROM v_last_local) < EXTRACT(MONTH FROM v_today)))
           OR (v_record.reset_period = 'daily' AND v_last_local < v_today)
        THEN
            v_record.current_number := 0;
            v_record.last_reset_at := now();
        END IF;
    END IF;

    -- Incrementar
    v_next_number := v_record.current_number + 1;

    -- Actualizar
    UPDATE sale_sequences
    SET current_number = v_next_number,
        last_reset_at = COALESCE(v_record.last_reset_at, now()),
        updated_at = now()
    WHERE id = v_record.id;

    -- Formatear resultado
    v_formatted := COALESCE(v_record.prefix, '') || LPAD(v_next_number::TEXT, v_record.padding, '0');

    RETURN v_formatted;
END;
$function$;
