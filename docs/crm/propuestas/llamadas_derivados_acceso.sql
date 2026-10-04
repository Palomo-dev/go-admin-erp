-- ACTIVACIÓN POSTERIOR AL DESPLIEGUE: NO aplicar con escritores antiguos.
-- Conserva políticas originales; añade restricciones por llamada real.
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='4s';
DO $$
DECLARE v_table text; v_read text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['call_consents','call_recordings','call_transcripts','call_analyses','call_transcript_segments'] LOOP
  v_read:=CASE WHEN v_table='call_transcript_segments' THEN
   'EXISTS(SELECT 1 FROM public.call_transcripts t JOIN public.calls c ON c.id=t.call_id AND c.organization_id=t.organization_id
    WHERE t.id=call_transcript_segments.transcript_id AND t.organization_id=call_transcript_segments.organization_id
    AND EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=c.organization_id AND m.user_id=auth.uid() AND m.is_active)
    AND (c.user_id=auth.uid() OR public.fn_crm_tiene_permiso(c.organization_id,''crm.calls.view_all'')))'
  ELSE format('EXISTS(SELECT 1 FROM public.calls c WHERE c.id=%I.call_id AND c.organization_id=%I.organization_id
    AND EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=c.organization_id AND m.user_id=auth.uid() AND m.is_active)
    AND (c.user_id=auth.uid() OR public.fn_crm_tiene_permiso(c.organization_id,''crm.calls.view_all'')))',v_table,v_table) END;
  -- La FK de transcript_id no es compuesta: una transcripción de otra llamada
  -- no acredita un análisis aunque ambas llamadas sean de la misma organización.
  IF v_table='call_analyses' THEN
   v_read:=v_read||' AND (call_analyses.transcript_id IS NULL OR EXISTS(
    SELECT 1 FROM public.call_transcripts t WHERE t.id=call_analyses.transcript_id
     AND t.organization_id=call_analyses.organization_id AND t.call_id=call_analyses.call_id))';
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS crm_call_derivado_lectura ON public.%I',v_table);
  EXECUTE format('CREATE POLICY crm_call_derivado_lectura ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND %s)',v_table,v_read);
  EXECUTE format('DROP POLICY IF EXISTS crm_call_derivado_insert ON public.%I',v_table);
  EXECUTE format('CREATE POLICY crm_call_derivado_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false)',v_table);
  EXECUTE format('DROP POLICY IF EXISTS crm_call_derivado_update ON public.%I',v_table);
  EXECUTE format('CREATE POLICY crm_call_derivado_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false)',v_table);
  EXECUTE format('DROP POLICY IF EXISTS crm_call_derivado_delete ON public.%I',v_table);
  EXECUTE format('CREATE POLICY crm_call_derivado_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(false)',v_table);
 END LOOP;
END;
$$;

-- Las relaciones de etiquetas mantienen el escritor autenticado existente.
-- Sólo autor/edit_any puede vincular o desvincular una etiqueta del tenant.
-- La lectura hereda las referencias y sucursales protegidas de calls.
DO $crm_call_tags_guard$
DECLARE v_read text; v_manage text;
BEGIN
 v_read:='auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.calls c
  JOIN public.call_tags t ON t.id=call_tag_relations.tag_id AND t.organization_id=c.organization_id
  WHERE c.id=call_tag_relations.call_id AND c.organization_id=call_tag_relations.organization_id)';
 v_manage:=v_read||' AND EXISTS(SELECT 1 FROM public.calls c
  WHERE c.id=call_tag_relations.call_id AND c.organization_id=call_tag_relations.organization_id
    AND (c.user_id=auth.uid() OR public.fn_crm_tiene_permiso(c.organization_id,''crm.activities.edit_any'')))';
 EXECUTE 'DROP POLICY IF EXISTS crm_call_tag_relacion_lectura ON public.call_tag_relations';
 EXECUTE format('CREATE POLICY crm_call_tag_relacion_lectura ON public.call_tag_relations AS RESTRICTIVE FOR SELECT TO authenticated USING(%s)',v_read);
 EXECUTE 'DROP POLICY IF EXISTS crm_call_tag_relacion_insert ON public.call_tag_relations';
 EXECUTE format('CREATE POLICY crm_call_tag_relacion_insert ON public.call_tag_relations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(%s)',v_manage);
 EXECUTE 'DROP POLICY IF EXISTS crm_call_tag_relacion_update ON public.call_tag_relations';
 EXECUTE format('CREATE POLICY crm_call_tag_relacion_update ON public.call_tag_relations AS RESTRICTIVE FOR UPDATE TO authenticated USING(%s) WITH CHECK(%s)',v_manage,v_manage);
 EXECUTE 'DROP POLICY IF EXISTS crm_call_tag_relacion_delete ON public.call_tag_relations';
 EXECUTE format('CREATE POLICY crm_call_tag_relacion_delete ON public.call_tag_relations AS RESTRICTIVE FOR DELETE TO authenticated USING(%s)',v_manage);
END;
$crm_call_tags_guard$;

-- La ruta autorizada de subida manual usa servicio. Las URLs firmadas de lectura
-- requieren un artefacto cuya ruta completa pertenezca a una llamada autorizada.
DROP POLICY IF EXISTS crm_call_storage_lectura ON storage.objects;
CREATE POLICY crm_call_storage_lectura ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
 bucket_id<>'crm-call-recordings' OR EXISTS(
  SELECT 1 FROM public.call_recordings r JOIN public.calls c ON c.id=r.call_id AND c.organization_id=r.organization_id
  WHERE r.storage_path=objects.name AND r.storage_provider='supabase' AND r.status='ready'
   AND left(objects.name,length('org_'||r.organization_id::text||'/'))='org_'||r.organization_id::text||'/'
   AND EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=c.organization_id AND m.user_id=auth.uid() AND m.is_active)
   AND (c.user_id=auth.uid() OR public.fn_crm_tiene_permiso(c.organization_id,'crm.calls.view_all'))
 )
);
DROP POLICY IF EXISTS crm_call_storage_insert ON storage.objects;
CREATE POLICY crm_call_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'crm-call-recordings');
DROP POLICY IF EXISTS crm_call_storage_update ON storage.objects;
CREATE POLICY crm_call_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'crm-call-recordings') WITH CHECK(bucket_id<>'crm-call-recordings');
DROP POLICY IF EXISTS crm_call_storage_delete ON storage.objects;
CREATE POLICY crm_call_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'crm-call-recordings');
