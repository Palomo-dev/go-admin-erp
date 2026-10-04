-- Restaura exclusivamente los campos de contacto respaldados. No borra
-- actividades ni avisos/auditoría: updated_at y los registros de auditoría
-- conservan que hubo una corrección y una reversión.
-- Se detiene antes de restaurar si llegó un contacto posterior o falta la
-- entidad. No debe borrar un contacto válido nuevo ni perder el respaldo.
DO $$
DECLARE v_row record; v_at timestamptz; v_channel text; v_result text;
BEGIN
  IF to_regclass('public.crm_contact_time_repairs') IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.opportunities o JOIN public.crm_contact_time_repairs r
    ON r.organization_id=o.organization_id AND r.entity_id=o.id AND r.entity_type='opportunity'
    ORDER BY o.organization_id,o.id FOR UPDATE OF o;
  PERFORM 1 FROM public.customers c JOIN public.crm_contact_time_repairs r
    ON r.organization_id=c.organization_id AND r.entity_id=c.id AND r.entity_type='customer'
    ORDER BY c.organization_id,c.id FOR UPDATE OF c;
  FOR v_row IN SELECT * FROM public.crm_contact_time_repairs LOOP
    IF v_row.entity_type='opportunity' THEN
      SELECT last_contact_at,contact_channel,contact_result INTO v_at,v_channel,v_result
        FROM public.opportunities WHERE id=v_row.entity_id AND organization_id=v_row.organization_id;
      IF NOT FOUND OR v_at IS DISTINCT FROM v_row.repaired_at
        OR v_channel IS DISTINCT FROM v_row.repaired_channel OR v_result IS DISTINCT FROM v_row.repaired_result THEN
        RAISE EXCEPTION 'contacto_posterior_impide_rollback' USING ERRCODE='40001';
      END IF;
    ELSE
      SELECT last_contact_at INTO v_at FROM public.customers
        WHERE id=v_row.entity_id AND organization_id=v_row.organization_id;
      IF NOT FOUND OR v_at IS DISTINCT FROM v_row.repaired_at THEN
        RAISE EXCEPTION 'contacto_posterior_impide_rollback' USING ERRCODE='40001';
      END IF;
    END IF;
  END LOOP;
  FOR v_row IN SELECT * FROM public.crm_contact_time_repairs LOOP
    IF v_row.entity_type='opportunity' THEN
      UPDATE public.opportunities SET last_contact_at=v_row.previous_at,
        contact_channel=v_row.previous_channel,contact_result=v_row.previous_result
        WHERE id=v_row.entity_id AND organization_id=v_row.organization_id;
    ELSE
      UPDATE public.customers SET last_contact_at=v_row.previous_at
        WHERE id=v_row.entity_id AND organization_id=v_row.organization_id;
    END IF;
  END LOOP;
  DROP TABLE public.crm_contact_time_repairs;
END;
$$;
