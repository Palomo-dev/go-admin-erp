-- Retira sólo las restricciones nuevas y conserva datos y políticas anteriores.
DO $$
DECLARE v_table text; v_policy text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['call_consents','call_recordings','call_transcripts','call_analyses','call_transcript_segments'] LOOP
  FOREACH v_policy IN ARRAY ARRAY['crm_call_derivado_lectura','crm_call_derivado_insert','crm_call_derivado_update','crm_call_derivado_delete'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',v_policy,v_table);
  END LOOP;
 END LOOP;
END;
$$;
DROP POLICY IF EXISTS crm_call_storage_lectura ON storage.objects;
DROP POLICY IF EXISTS crm_call_storage_insert ON storage.objects;
DROP POLICY IF EXISTS crm_call_storage_update ON storage.objects;
DROP POLICY IF EXISTS crm_call_storage_delete ON storage.objects;
