-- Restaura el trigger anterior; las actividades creadas se conservan.
DROP FUNCTION IF EXISTS public.fn_crm_registrar_actividad(integer,jsonb);
DROP INDEX IF EXISTS public.activities_org_actor_client_key_idx;
DROP FUNCTION IF EXISTS public.fn_crm_crear_tarea(integer,jsonb);
DROP INDEX IF EXISTS public.tasks_crm_actor_client_key_uidx;
-- Las columnas opcionales se conservan para no borrar evidencia de reintentos.
CREATE OR REPLACE FUNCTION public.fn_activities_ultimo_contacto_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer uuid;
  v_at timestamptz := coalesce(NEW.occurred_at,NEW.created_at,now());
BEGIN
  IF NEW.activity_type NOT IN ('call','email','whatsapp','sms','meeting','visit','ai_call') THEN RETURN NEW; END IF;
  IF NEW.activity_type='meeting' THEN
    IF NEW.outcome IS DISTINCT FROM 'done' THEN RETURN NEW; END IF;
    v_at := coalesce(nullif(NEW.metadata->>'completed_at','')::timestamptz,v_at);
  END IF;
  IF v_at>now() OR NOT isfinite(v_at) THEN RETURN NEW; END IF;
  IF NEW.related_type='customer' THEN v_customer:=NEW.related_id;
  ELSIF NEW.related_type='opportunity' THEN
    SELECT customer_id INTO v_customer FROM public.opportunities
      WHERE id=NEW.related_id AND organization_id=NEW.organization_id;
    IF NEW.activity_type='meeting' THEN
      UPDATE public.opportunities SET last_contact_at=v_at,contact_channel='meeting',contact_result='done'
        WHERE id=NEW.related_id AND organization_id=NEW.organization_id
          AND (last_contact_at IS NULL OR last_contact_at<v_at);
    END IF;
  END IF;
  IF v_customer IS NOT NULL THEN
    UPDATE public.customers SET last_contact_at=v_at
      WHERE id=v_customer AND organization_id=NEW.organization_id
        AND (last_contact_at IS NULL OR last_contact_at<v_at);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_activities_ultimo_contacto_cliente() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_activities_ultimo_contacto_cliente() TO service_role;

