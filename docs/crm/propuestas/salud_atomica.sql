-- Ola 5 Salud: configuración + outbox y score + snapshot en transacciones.
-- Esquema verificado por MCP; sin nuevas tablas ni cálculos de score en SQL.
CREATE OR REPLACE FUNCTION public.fn_crm_validar_config_salud(p_config jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i jsonb; t jsonb; b jsonb; n numeric; suma integer:=0; claves text[]:='{}'; limites numeric[]; k text;
BEGIN
  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_config))<>2
     OR NOT p_config ?& ARRAY['bands','indicators'] THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
  b:=p_config->'bands';
  IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>3 OR NOT b ?& ARRAY['green','yellow','red']
     OR jsonb_typeof(b->'green')<>'number' OR jsonb_typeof(b->'yellow')<>'number' OR jsonb_typeof(b->'red')<>'number' THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
  IF (b->>'green')::numeric NOT BETWEEN 1 AND 100 OR (b->>'yellow')::numeric NOT BETWEEN 0 AND 99 OR (b->>'red')::numeric<>0
     OR (b->>'green')::numeric<>floor((b->>'green')::numeric) OR (b->>'yellow')::numeric<>floor((b->>'yellow')::numeric)
     OR (b->>'green')::numeric<=(b->>'yellow')::numeric THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_config->'indicators') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'indicators') NOT BETWEEN 1 AND 13 THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(p_config->'indicators') LOOP
    IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(i))<>5 OR NOT i ?& ARRAY['key','label','weight','direction','thresholds']
       OR jsonb_typeof(i->'key')<>'string' OR (i->>'key')<>ALL(ARRAY['recency','days_since_last_invoice','frequency','invoices_12m','ltv','revenue_12m','avg_ticket','activity','days_since_last_activity','receivables','overdue','overdue_ratio','overdue_balance'])
       OR i->>'key'=ANY(claves) OR jsonb_typeof(i->'label')<>'string' OR length(btrim(i->>'label')) NOT BETWEEN 1 AND 100
       OR jsonb_typeof(i->'weight')<>'number' OR jsonb_typeof(i->'direction')<>'string' OR i->>'direction' NOT IN ('lower_better','higher_better') THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
    n:=(i->>'weight')::numeric;
    IF n NOT BETWEEN 0 AND 100 OR n<>floor(n) THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
    suma:=suma+n::integer; claves:=array_append(claves,i->>'key'); limites:='{}'; k:=CASE WHEN i->>'direction'='lower_better' THEN 'max' ELSE 'min' END;
    IF jsonb_typeof(i->'thresholds') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'thresholds') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
    FOR t IN SELECT value FROM jsonb_array_elements(i->'thresholds') LOOP
      IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(t))<>2 OR NOT t ?& ARRAY[k,'score']
         OR jsonb_typeof(t->k)<>'number' OR jsonb_typeof(t->'score')<>'number' THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
      n:=(t->>k)::numeric;
      IF n<0 OR n=ANY(limites) OR (t->>'score')::numeric NOT BETWEEN 0 AND 100 OR (t->>'score')::numeric<>floor((t->>'score')::numeric) THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
      limites:=array_append(limites,n);
    END LOOP;
  END LOOP;
  IF suma<>100 THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023'; END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'salud_config_invalida' USING ERRCODE='22023';
END $$;

CREATE OR REPLACE FUNCTION public.fn_crm_exigir_admin_salud(p_org integer)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  -- Permiso canónico de administración, incluidos cargos con admin.full_access.
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id=p_org AND m.user_id=auth.uid() AND m.is_active AND public.fn_crm_tiene_permiso(p_org,'admin.full_access'))
    THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_crm_encolar_salud(p_org integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE estampilla timestamptz; evento uuid; trabajo uuid;
BEGIN
  PERFORM public.fn_crm_exigir_admin_salud(p_org);
  PERFORM pg_advisory_xact_lock(713551,p_org);
  SELECT updated_at INTO estampilla FROM public.health_score_configs WHERE organization_id=p_org FOR SHARE;
  evento:=public.fn_emit_crm_event(p_org,'health.recalculate_requested','health_config',gen_random_uuid(),jsonb_build_object('config_stamp',estampilla,'requested_by',auth.uid()));
  SELECT id INTO trabajo FROM public.outbound_jobs WHERE organization_id=p_org AND dedupe_key='crm_event:'||evento::text;
  IF trabajo IS NULL THEN RAISE EXCEPTION 'salud_cola_incompleta'; END IF;
  RETURN jsonb_build_object('queued',true,'event_id',evento,'job_id',trabajo);
END $$;

CREATE OR REPLACE FUNCTION public.fn_crm_configurar_salud(p_org integer,p_config jsonb,p_expected_stamp timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE anterior public.health_score_configs%ROWTYPE; guardada public.health_score_configs%ROWTYPE;
BEGIN
  PERFORM public.fn_crm_exigir_admin_salud(p_org);
  PERFORM public.fn_crm_validar_config_salud(p_config);
  PERFORM pg_advisory_xact_lock(713551,p_org);
  SELECT * INTO anterior FROM public.health_score_configs WHERE organization_id=p_org FOR UPDATE;
  IF anterior.updated_at IS DISTINCT FROM p_expected_stamp THEN RAISE EXCEPTION 'salud_config_modificada' USING ERRCODE='23505'; END IF;
  INSERT INTO public.health_score_configs(organization_id,config,updated_at) VALUES(p_org,p_config,clock_timestamp())
    ON CONFLICT(organization_id) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at RETURNING * INTO guardada;
  RETURN jsonb_build_object('config',guardada.config,'updated_at',guardada.updated_at,'refresh_interval_hours',coalesce(guardada.refresh_interval_hours,24),'is_active',coalesce(guardada.is_active,true))||public.fn_crm_encolar_salud(p_org);
END $$;

CREATE OR REPLACE FUNCTION public.fn_crm_salud_base(p_org integer,p_customers uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
  IF p_org IS NULL OR coalesce(cardinality(p_customers),0) NOT BETWEEN 1 AND 200 OR array_position(p_customers,NULL) IS NOT NULL
     OR cardinality(p_customers)<>(SELECT count(DISTINCT x) FROM unnest(p_customers) x) THEN RAISE EXCEPTION 'salud_lote_invalido' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('customer_id',c.id,'last_snapshot',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'score',s.score,'created_at',s.created_at) END) ORDER BY c.id),'[]') INTO resultado
  FROM public.customers c LEFT JOIN LATERAL (SELECT h.id,h.score,h.created_at FROM public.health_score_snapshots h WHERE h.organization_id=p_org AND h.customer_id=c.id ORDER BY h.created_at DESC NULLS LAST,h.id DESC LIMIT 1) s ON true
  WHERE c.organization_id=p_org AND c.lifecycle_stage='customer' AND c.id=ANY(p_customers);
  IF jsonb_array_length(resultado)<>cardinality(p_customers) THEN RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE='23503'; END IF;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.fn_crm_guardar_mediciones_salud(p_org integer,p_rows jsonb,p_config_stamp timestamptz,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE cfg public.health_score_configs%ROWTYPE; r jsonb; c public.customers%ROWTYPE; ultimo public.health_score_snapshots%ROWTYPE;
  cid uuid; esperado uuid; puntos integer; banda text; escribir boolean; repetida boolean; snapshots integer:=0; clientes integer:=0; omitidos integer:=0;
BEGIN
  IF p_org IS NULL OR p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 200
    THEN RAISE EXCEPTION 'salud_lote_invalido' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rows))<>(SELECT count(DISTINCT value->>'customer_id') FROM jsonb_array_elements(p_rows)) THEN RAISE EXCEPTION 'salud_lote_invalido' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(713551,p_org);
  SELECT * INTO cfg FROM public.health_score_configs WHERE organization_id=p_org FOR SHARE;
  IF cfg.updated_at IS DISTINCT FROM p_config_stamp THEN RAISE EXCEPTION 'salud_config_modificada' USING ERRCODE='23505'; END IF;
  IF cfg.is_active=false THEN RAISE EXCEPTION 'salud_inactiva' USING ERRCODE='22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'customer_id' LOOP
    IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r))<>6 OR NOT r ?& ARRAY['customer_id','score','band','indicators','write_snapshot','expected_snapshot_id']
       OR jsonb_typeof(r->'customer_id')<>'string' OR jsonb_typeof(r->'score')<>'number' OR jsonb_typeof(r->'band')<>'string' OR jsonb_typeof(r->'indicators')<>'object'
       OR jsonb_typeof(r->'write_snapshot')<>'boolean' OR jsonb_typeof(r->'expected_snapshot_id') NOT IN ('string','null')
       OR (r->>'score')::numeric NOT BETWEEN 0 AND 100 OR (r->>'score')::numeric<>floor((r->>'score')::numeric) OR r->>'band' NOT IN ('red','yellow','green')
       OR EXISTS (SELECT 1 FROM jsonb_each(r->'indicators') e WHERE jsonb_typeof(e.value) NOT IN ('number','null')) THEN RAISE EXCEPTION 'salud_lote_invalido' USING ERRCODE='22023'; END IF;
    cid:=(r->>'customer_id')::uuid; esperado:=(r->>'expected_snapshot_id')::uuid; puntos:=(r->>'score')::integer; banda:=r->>'band'; escribir:=(r->>'write_snapshot')::boolean;
    SELECT * INTO c FROM public.customers WHERE organization_id=p_org AND id=cid AND lifecycle_stage='customer' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE='23503'; END IF;
    IF c.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id=c.branch_id AND b.organization_id=p_org) THEN RAISE EXCEPTION 'sucursal_no_encontrada' USING ERRCODE='23503'; END IF;
    SELECT * INTO ultimo FROM public.health_score_snapshots WHERE organization_id=p_org AND customer_id=cid ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 1 FOR UPDATE;
    repetida:=ultimo.created_at=p_now AND ultimo.score=puntos AND ultimo.band=banda AND ultimo.indicators=r->'indicators';
    IF c.health_score_updated_at>p_now OR (ultimo.id IS DISTINCT FROM esperado AND NOT coalesce(repetida,false)) THEN RAISE EXCEPTION 'salud_medicion_modificada' USING ERRCODE='23505'; END IF;
    IF escribir AND NOT coalesce(repetida,false) THEN
      INSERT INTO public.health_score_snapshots(organization_id,customer_id,score,band,indicators,created_at) VALUES(p_org,cid,puntos,banda,r->'indicators',p_now);
      snapshots:=snapshots+1;
    ELSE omitidos:=omitidos+1; END IF;
    IF c.health_score IS DISTINCT FROM puntos THEN
      UPDATE public.customers SET health_score=puntos,health_score_updated_at=p_now WHERE organization_id=p_org AND id=cid;
      clientes:=clientes+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('snapshots_written',snapshots,'customers_updated',clientes,'skipped_unchanged',omitidos);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'salud_lote_invalido' USING ERRCODE='22023';
END $$;

-- La sesión sólo puede solicitar y configurar; jamás enviar scores calculados.
REVOKE ALL ON FUNCTION public.fn_crm_validar_config_salud(jsonb),public.fn_crm_exigir_admin_salud(integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_crm_encolar_salud(integer),public.fn_crm_configurar_salud(integer,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_encolar_salud(integer),public.fn_crm_configurar_salud(integer,jsonb,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_crm_salud_base(integer,uuid[]),public.fn_crm_guardar_mediciones_salud(integer,jsonb,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_salud_base(integer,uuid[]),public.fn_crm_guardar_mediciones_salud(integer,jsonb,timestamptz,timestamptz) TO service_role;
