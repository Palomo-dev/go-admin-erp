-- Reversion de 20260923210500_fase_d_dia_de_la_organizacion_en_numeracion.sql
--
-- Devuelve las dos funciones de numeracion a su cuerpo anterior, el que juzga
-- la vigencia de la resolucion y el reinicio del consecutivo con el dia UTC.
-- Solo CREATE OR REPLACE: firma, tipo de retorno, volatilidad, SECURITY
-- INVOKER, owner y ACL se conservan solos.
--
-- Aplicar esta reversion devuelve dos fallos fiscales para cualquier sede que
-- no este en UTC: una resolucion DIAN vigente puede rechazarse ("No existe
-- secuencia fiscal activa y vigente") y el consecutivo diario no reinicia
-- cuando cambia el dia del negocio.

CREATE OR REPLACE FUNCTION public.fn_get_next_invoice_number(p_org_id integer, p_branch_id integer, p_document_type text)
 RETURNS TABLE(invoice_number text, resolution_number character varying, prefix character varying, remaining integer, needs_alert boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_record invoice_sequences%ROWTYPE;
    v_next_number INTEGER;
    v_remaining INTEGER;
BEGIN
    -- Bloquear fila para evitar duplicados
    SELECT * INTO v_record
    FROM invoice_sequences s
    WHERE s.organization_id = p_org_id
      AND s.branch_id = p_branch_id
      AND s.document_type = p_document_type
      AND s.is_active = true
      AND (s.valid_from IS NULL OR s.valid_from <= CURRENT_DATE)
      AND (s.valid_until IS NULL OR s.valid_until >= CURRENT_DATE)
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

CREATE OR REPLACE FUNCTION public.fn_get_next_sale_number(p_org_id integer, p_branch_id integer, p_sequence_type text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_record sale_sequences%ROWTYPE;
    v_next_number INTEGER;
    v_formatted TEXT;
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

    -- Verificar si necesita reset
    IF v_record.reset_period IS NOT NULL THEN
        IF (v_record.reset_period = 'yearly' AND EXTRACT(YEAR FROM v_record.last_reset_at) < EXTRACT(YEAR FROM now()))
           OR (v_record.reset_period = 'monthly' AND (EXTRACT(YEAR FROM v_record.last_reset_at) < EXTRACT(YEAR FROM now()) OR EXTRACT(MONTH FROM v_record.last_reset_at) < EXTRACT(MONTH FROM now())))
           OR (v_record.reset_period = 'daily' AND v_record.last_reset_at::date < CURRENT_DATE)
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
