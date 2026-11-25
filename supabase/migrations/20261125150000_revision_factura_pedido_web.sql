-- Clientes › Facturación electrónica: revisión del documento de un pedido web (decisiones del dueño
-- 2026-11-25, Figma «06 Clientes» sección 3192-19436).
--
-- fn_web_order_documento_cliente (20261125061424) deja un pedido «para revisar» cuando el comprador
-- pidió factura con un documento distinto al de la ficha (billing_data.perfil = 'distinto') o con
-- uno que ya está en OTRA ficha ('duplicado'). Esta función registra lo que decidió el equipo:
--
--   usar     (solo 'distinto'): el documento del pedido pasa SIEMPRE a la ficha (tipo, número y
--            DV si es NIT); el correo de factura solo si la ficha no tenía uno (y si es distinto del
--            correo de contacto); el nombre NO se toca. La ficha queda como la que factura el pedido.
--   mantener ('distinto' o 'duplicado'): la ficha no cambia; solo queda registrada la decisión.
--   ligar    (solo 'duplicado' con NIT de una empresa): la persona queda como contacto de esa
--            empresa (customer_company_links) y la factura del pedido sale a nombre de la empresa
--            (billing_data.customer_id), que es la del NIT que pidió el comprador.
--
-- La revisión queda DENTRO de web_orders.billing_data (sin columnas nuevas):
--   billing_data.revision = {decision, por, por_nombre, en, documento_ficha_antes}
-- y también en la Actividad del cliente (activities, tipo 'system', relacionada con la ficha).
--
-- Seguridad: SECURITY DEFINER con search_path fijo; exige sesión (auth.uid()), pertenencia activa a
-- la organización del pedido y el permiso crm.customers.edit o pos.web_order.change (o admin de la
-- organización por role_id, nunca por nombre). Solo `authenticated` puede ejecutarla (anon no).
-- Idempotente: un pedido ya revisado responde 'ya_revisado' sin tocar nada.
-- Aditiva: solo crea una función.

CREATE OR REPLACE FUNCTION public.fn_web_order_revisar_factura(p_order_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_wo record;
  v_bd jsonb;
  v_perfil text;
  v_tipo text;
  v_numero text;
  v_clave text;
  v_dv integer;
  v_correo text;
  v_cliente record;
  v_otro record;
  v_tipo_erp text;
  v_etiqueta text;
  v_antes text;
  v_nombre text;
  v_facturar uuid;
  v_nota text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'SESION_REQUERIDA' USING errcode = '42501';
  END IF;
  IF v_decision NOT IN ('usar', 'mantener', 'ligar') THEN
    RAISE EXCEPTION 'DECISION_INVALIDA' USING errcode = '22023';
  END IF;

  SELECT id, organization_id, branch_id, customer_id, order_number, billing_data
    INTO v_wo
    FROM public.web_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEB_ORDER_NOT_FOUND' USING errcode = 'P0002';
  END IF;

  PERFORM public.fn_assert_acceso_org(v_wo.organization_id);
  IF NOT (
       public.fn_tiene_permiso(v_wo.organization_id, 'crm.customers.edit')
    OR public.fn_tiene_permiso(v_wo.organization_id, 'pos.web_order.change')
    OR EXISTS (SELECT 1 FROM public.organization_members om
                WHERE om.user_id = v_uid AND om.organization_id = v_wo.organization_id AND om.is_active
                  AND (coalesce(om.is_super_admin, false) OR om.role_id IN (1, 2)))
  ) THEN
    RAISE EXCEPTION 'SIN_PERMISO' USING errcode = '42501';
  END IF;

  v_bd := v_wo.billing_data;
  IF v_bd IS NULL OR jsonb_typeof(v_bd) <> 'object' THEN
    RETURN jsonb_build_object('estado', 'no_aplica');
  END IF;
  IF v_bd ? 'revision' AND jsonb_typeof(v_bd->'revision') = 'object' THEN
    RETURN jsonb_build_object('estado', 'ya_revisado', 'revision', v_bd->'revision');
  END IF;

  v_perfil := coalesce(v_bd->>'perfil', '');
  IF v_perfil NOT IN ('distinto', 'duplicado')
     OR (v_decision = 'usar' AND v_perfil <> 'distinto')
     OR (v_decision = 'ligar' AND v_perfil <> 'duplicado') THEN
    RETURN jsonb_build_object('estado', 'no_aplica');
  END IF;

  v_tipo := upper(btrim(coalesce(v_bd->>'tipo', '')));
  v_numero := btrim(coalesce(v_bd->>'numero', ''));
  v_clave := regexp_replace(upper(v_numero), '[^A-Z0-9]', '', 'g');
  v_dv := CASE WHEN v_tipo = 'NIT' AND coalesce(v_bd->>'dv', '') ~ '^[0-9]$' THEN (v_bd->>'dv')::integer END;
  v_correo := nullif(lower(btrim(coalesce(v_bd->>'correo', ''))), '');
  IF v_tipo NOT IN ('NIT', 'CC', 'CE', 'PA') OR v_clave = '' THEN
    RETURN jsonb_build_object('estado', 'no_aplica');
  END IF;
  v_tipo_erp := CASE v_tipo WHEN 'NIT' THEN 'nit' WHEN 'CC' THEN 'cc' WHEN 'CE' THEN 'ce' ELSE 'passport' END;
  v_etiqueta := CASE v_tipo WHEN 'NIT' THEN 'NIT' WHEN 'CC' THEN 'CC' WHEN 'CE' THEN 'CE' ELSE 'pasaporte' END;

  IF v_wo.customer_id IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_aplica');
  END IF;
  SELECT id, customer_type, identification_type, identification_number, dv, email, billing_email
    INTO v_cliente
    FROM public.customers
   WHERE id = v_wo.customer_id AND organization_id = v_wo.organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_aplica');
  END IF;
  v_antes := nullif(btrim(concat_ws(' ', upper(nullif(v_cliente.identification_type, '')),
                                   v_cliente.identification_number || coalesce('-' || v_cliente.dv::text, ''))), '');

  SELECT nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') INTO v_nombre
    FROM public.profiles p WHERE p.id = v_uid;

  v_facturar := NULLIF(v_bd->>'customer_id', '')::uuid;

  IF v_decision = 'usar' THEN
    BEGIN
      UPDATE public.customers
         SET identification_type = v_tipo_erp,
             identification_number = v_numero,
             dv = CASE WHEN v_tipo = 'NIT' THEN v_dv ELSE NULL END,
             billing_email = coalesce(nullif(btrim(coalesce(billing_email, '')), ''),
                                      CASE WHEN v_correo IS DISTINCT FROM lower(email) THEN v_correo END),
             updated_at = now()
       WHERE id = v_cliente.id;
    EXCEPTION WHEN unique_violation THEN
      -- Otro cliente tiene ese documento: no se cambia nada (se unifica en CRM › Identidades).
      RETURN jsonb_build_object('estado', 'duplicado');
    END;
    v_facturar := v_cliente.id;
    v_nota := format('Factura electrónica: se usó en la ficha el documento del pedido %s (%s %s). Antes: %s.',
                     v_wo.order_number, v_etiqueta, v_numero, coalesce(v_antes, 'sin documento'));

  ELSIF v_decision = 'ligar' THEN
    SELECT c.id, c.customer_type INTO v_otro
      FROM public.customers c
     WHERE c.organization_id = v_wo.organization_id
       AND c.id <> v_cliente.id
       AND regexp_replace(upper(coalesce(c.identification_number, '')), '[^A-Z0-9]', '', 'g')
           IN (v_clave, v_clave || coalesce(v_dv::text, ''))
     ORDER BY (c.customer_type = 'company') DESC, c.created_at
     LIMIT 1;
    IF v_otro.id IS NULL OR v_otro.customer_type <> 'company' OR v_cliente.customer_type <> 'person' THEN
      RETURN jsonb_build_object('estado', 'no_aplica');
    END IF;
    INSERT INTO public.customer_company_links (organization_id, person_id, company_id, is_primary)
    VALUES (v_wo.organization_id, v_cliente.id, v_otro.id,
            NOT EXISTS (SELECT 1 FROM public.customer_company_links l WHERE l.person_id = v_cliente.id))
    ON CONFLICT (person_id, company_id) DO NOTHING;
    UPDATE public.customers
       SET parent_customer_id = v_otro.id, updated_at = now()
     WHERE id = v_cliente.id AND parent_customer_id IS NULL;
    v_facturar := v_otro.id;
    v_nota := format('Factura electrónica: el cliente quedó como contacto de la empresa con %s %s (pedido %s); la factura sale a nombre de la empresa.',
                     v_etiqueta, v_numero, v_wo.order_number);

  ELSE
    v_nota := format('Factura electrónica: se mantuvo el documento de la ficha (%s). El pedido %s pidió factura a %s %s.',
                     coalesce(v_antes, 'sin documento'), v_wo.order_number, v_etiqueta, v_numero);
  END IF;

  UPDATE public.web_orders
     SET billing_data = v_bd
           || jsonb_build_object('customer_id', v_facturar)
           || jsonb_build_object('revision', jsonb_build_object(
                'decision', v_decision,
                'por', v_uid,
                'por_nombre', v_nombre,
                'en', now(),
                'documento_ficha_antes', v_antes)),
         updated_at = now()
   WHERE id = v_wo.id;

  INSERT INTO public.activities (organization_id, activity_type, user_id, notes, related_type, related_id, occurred_at, branch_id, metadata)
  VALUES (v_wo.organization_id, 'system', v_uid, v_nota, 'customer', v_cliente.id, now(), v_wo.branch_id,
          jsonb_build_object('origen', 'revision_factura_pedido_web', 'web_order_id', v_wo.id,
                             'order_number', v_wo.order_number, 'decision', v_decision));

  RETURN jsonb_build_object('estado', 'ok', 'decision', v_decision, 'customer_id', v_facturar);
END;
$function$;

COMMENT ON FUNCTION public.fn_web_order_revisar_factura(uuid, text) IS
  'Revisión del documento de factura de un pedido web (billing_data.perfil distinto|duplicado): usar | mantener | ligar. Registra la decisión en billing_data.revision y en activities. Sesión + permiso crm.customers.edit o pos.web_order.change.';

REVOKE ALL ON FUNCTION public.fn_web_order_revisar_factura(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_web_order_revisar_factura(uuid, text) TO authenticated, service_role;
