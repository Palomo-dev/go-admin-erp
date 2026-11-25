-- Factura electrónica desde la tienda web: el documento del checkout llega al perfil del cliente y
-- queda estructurado en el pedido (pedido del dueño 2026-11-25: «no llenar dos veces el mismo dato»).
--
-- Hasta hoy el checkout v2 solo dejaba una línea en web_orders.customer_notes
-- («[Factura electrónica] NIT 900.123.456-8 · Empresa · correo»). Esa línea se conserva.
--
-- 1. web_orders.billing_data (jsonb, NULL): los datos de factura del pedido, estructurados. Los usa
--    la cola de facturación electrónica (Factus) como adquiriente de la factura de ESE pedido.
-- 2. customers.billing_email (text, NULL): correo donde el cliente recibe la factura electrónica,
--    cuando es distinto del correo de contacto. Factus lo prefiere sobre `email`.
-- 3. fn_web_order_documento_cliente: guarda el documento en la ficha sin sobrescribir uno distinto.
--    - Cédula, CE o pasaporte → identificación del cliente del pedido. Sin documento: se guarda.
--      El mismo: nada. Otro distinto, o ya está en la ficha de OTRO cliente: no se toca ninguna
--      ficha y el pedido queda marcado para revisión (internal_notes + billing_data.perfil).
--    - NIT → la empresa: la ficha con ese NIT en la organización (o una nueva de tipo empresa con
--      razón social, NIT, DV y correo de factura), enlazada como empresa del cliente
--      (parent_customer_id) si no tenía una. Si el NIT es el del propio cliente, su ficha.
--    Aditiva: columnas NULL-ables, sin cambios de tipo ni borrados.

ALTER TABLE public.web_orders ADD COLUMN IF NOT EXISTS billing_data jsonb;
COMMENT ON COLUMN public.web_orders.billing_data IS
  'Factura electrónica pedida en el checkout de la tienda: {tipo NIT|CC|CE|PA, numero, dv, razon_social, correo, customer_id (ficha que factura), perfil (guardado|igual|distinto|duplicado|empresa_existente|empresa_creada|sin_cliente), guardado_en}. La escribe fn_web_order_documento_cliente; la cola de Factus la usa como adquiriente de la factura del pedido.';

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS billing_email text;
COMMENT ON COLUMN public.customers.billing_email IS
  'Correo para la factura electrónica cuando es distinto del correo de contacto (email). Factus lo prefiere sobre email.';

CREATE OR REPLACE FUNCTION public.fn_web_order_documento_cliente(
  p_organization_id integer,
  p_order_id uuid,
  p_datos jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_datos->>'tipo', '')));
  v_numero text;
  v_clave text;
  v_dv integer;
  v_dv_txt text := regexp_replace(coalesce(p_datos->>'dv', ''), '\D', '', 'g');
  v_razon text := nullif(btrim(coalesce(p_datos->>'razon_social', '')), '');
  v_correo text := nullif(lower(btrim(coalesce(p_datos->>'correo', ''))), '');
  v_tipo_erp text;
  v_etiqueta text;
  v_pedido record;
  v_cliente record;
  v_cliente_id uuid;
  v_otro uuid;
  v_empresa uuid;
  v_facturar uuid;
  v_estado text;
  v_nota text;
BEGIN
  IF v_tipo NOT IN ('NIT', 'CC', 'CE', 'PA') THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;

  v_numero := CASE
    WHEN v_tipo IN ('NIT', 'CC') THEN regexp_replace(coalesce(p_datos->>'numero', ''), '\D', '', 'g')
    ELSE upper(regexp_replace(coalesce(p_datos->>'numero', ''), '\s', '', 'g'))
  END;
  -- Misma validación que el checkout (components/site/checkout/facturaEmpresa.ts de la tienda).
  IF (v_tipo = 'NIT' AND length(v_numero) NOT BETWEEN 6 AND 15)
     OR (v_tipo = 'CC' AND length(v_numero) NOT BETWEEN 3 AND 10)
     OR (v_tipo IN ('CE', 'PA') AND v_numero !~ '^[A-Z0-9-]{3,20}$')
     OR (v_tipo = 'NIT' AND length(v_dv_txt) <> 1)
     OR v_razon IS NULL
     OR v_correo IS NULL
     OR v_correo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  IF v_tipo = 'NIT' THEN v_dv := v_dv_txt::integer; END IF;

  -- Clave de comparación: solo letras y números (una ficha con «1.020.304.050» es la misma cédula).
  v_clave := regexp_replace(v_numero, '[^A-Z0-9]', '', 'g');
  v_tipo_erp := CASE v_tipo WHEN 'NIT' THEN 'nit' WHEN 'CC' THEN 'cc' WHEN 'CE' THEN 'ce' ELSE 'passport' END;
  v_etiqueta := CASE v_tipo WHEN 'NIT' THEN 'NIT' WHEN 'CC' THEN 'cédula' WHEN 'CE' THEN 'cédula de extranjería' ELSE 'pasaporte' END;

  SELECT id, customer_id, branch_id, order_number, internal_notes
    INTO v_pedido
    FROM public.web_orders
   WHERE id = p_order_id AND organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'sin_pedido');
  END IF;

  IF v_pedido.customer_id IS NOT NULL THEN
    SELECT id, customer_type, identification_type, identification_number, email, billing_email, parent_customer_id
      INTO v_cliente
      FROM public.customers
     WHERE id = v_pedido.customer_id AND organization_id = p_organization_id
     FOR UPDATE;
    IF FOUND THEN v_cliente_id := v_cliente.id; END IF;
  END IF;

  IF v_cliente_id IS NULL THEN
    v_estado := 'sin_cliente';

  ELSIF v_tipo <> 'NIT' THEN
    -- Persona: identificación del propio cliente.
    IF nullif(btrim(coalesce(v_cliente.identification_number, '')), '') IS NULL THEN
      SELECT c.id INTO v_otro
        FROM public.customers c
       WHERE c.organization_id = p_organization_id
         AND c.id <> v_cliente.id
         AND regexp_replace(upper(coalesce(c.identification_number, '')), '[^A-Z0-9]', '', 'g') = v_clave
       LIMIT 1;
      IF v_otro IS NOT NULL THEN
        v_estado := 'duplicado';
      ELSE
        BEGIN
          UPDATE public.customers
             SET identification_type = v_tipo_erp,
                 identification_number = v_numero,
                 billing_email = coalesce(billing_email, CASE WHEN v_correo IS DISTINCT FROM lower(email) THEN v_correo END),
                 updated_at = now()
           WHERE id = v_cliente.id;
          v_estado := 'guardado';
          v_facturar := v_cliente.id;
        EXCEPTION WHEN unique_violation THEN
          v_estado := 'duplicado';
        END;
      END IF;
    ELSIF regexp_replace(upper(v_cliente.identification_number), '[^A-Z0-9]', '', 'g') = v_clave THEN
      v_estado := 'igual';
      v_facturar := v_cliente.id;
      IF nullif(btrim(coalesce(v_cliente.identification_type, '')), '') IS NULL THEN
        UPDATE public.customers SET identification_type = v_tipo_erp, updated_at = now() WHERE id = v_cliente.id;
      END IF;
    ELSE
      v_estado := 'distinto';
    END IF;

  ELSIF regexp_replace(upper(coalesce(v_cliente.identification_number, '')), '[^A-Z0-9]', '', 'g') IN (v_clave, v_clave || v_dv::text) THEN
    -- El NIT es el del propio cliente (persona natural con RUT, o la ficha ya es la empresa).
    v_estado := 'igual';
    v_facturar := v_cliente.id;
    UPDATE public.customers
       SET dv = coalesce(dv, v_dv),
           identification_type = coalesce(nullif(btrim(coalesce(identification_type, '')), ''), 'nit'),
           billing_email = coalesce(billing_email, CASE WHEN v_correo IS DISTINCT FROM lower(email) THEN v_correo END),
           updated_at = now()
     WHERE id = v_cliente.id;

  ELSE
    -- Empresa: la ficha con ese NIT en la organización, o una nueva.
    SELECT c.id INTO v_empresa
      FROM public.customers c
     WHERE c.organization_id = p_organization_id
       AND regexp_replace(upper(coalesce(c.identification_number, '')), '[^A-Z0-9]', '', 'g') IN (v_clave, v_clave || v_dv::text)
     ORDER BY (c.customer_type = 'company') DESC, c.created_at
     LIMIT 1
     FOR UPDATE;
    IF v_empresa IS NOT NULL THEN
      UPDATE public.customers
         SET dv = coalesce(dv, v_dv),
             company_name = coalesce(nullif(btrim(coalesce(company_name, '')), ''), v_razon),
             billing_email = coalesce(billing_email, v_correo),
             updated_at = now()
       WHERE id = v_empresa;
      v_estado := 'empresa_existente';
    ELSE
      BEGIN
        INSERT INTO public.customers (
          organization_id, branch_id, customer_type, identification_type, identification_number, dv,
          company_name, first_name, legal_organization_id, billing_email, email, is_registered, roles, metadata
        ) VALUES (
          p_organization_id, v_pedido.branch_id, 'company', 'nit', v_numero, v_dv,
          v_razon, v_razon, 1, v_correo,
          CASE WHEN EXISTS (
            SELECT 1 FROM public.customers c WHERE c.organization_id = p_organization_id AND lower(c.email) = v_correo
          ) THEN NULL ELSE v_correo END,
          false, ARRAY['cliente'],
          jsonb_build_object('source', 'web_order', 'web_order_number', v_pedido.order_number)
        )
        RETURNING id INTO v_empresa;
        v_estado := 'empresa_creada';
      EXCEPTION WHEN unique_violation THEN
        v_empresa := NULL;
        v_estado := 'duplicado';
      END;
    END IF;
    IF v_empresa IS NOT NULL THEN
      v_facturar := v_empresa;
      -- La persona queda como contacto de la empresa si aún no tenía una.
      UPDATE public.customers
         SET parent_customer_id = v_empresa, updated_at = now()
       WHERE id = v_cliente.id
         AND parent_customer_id IS NULL
         AND customer_type = 'person';
    END IF;
  END IF;

  v_nota := CASE v_estado
    WHEN 'distinto' THEN format('[Factura electrónica] Revisar: el pedido pide factura a %s %s y la ficha del cliente tiene otro documento. No se cambió la ficha.', v_etiqueta, v_numero)
    WHEN 'duplicado' THEN format('[Factura electrónica] Revisar: el %s %s ya está en la ficha de otro cliente. No se cambió ninguna ficha.', v_etiqueta, v_numero)
    ELSE NULL
  END;

  UPDATE public.web_orders
     SET billing_data = jsonb_build_object(
           'tipo', v_tipo,
           'numero', v_numero,
           'dv', v_dv,
           'razon_social', v_razon,
           'correo', v_correo,
           'customer_id', v_facturar,
           'perfil', v_estado,
           'guardado_en', now()
         ),
         internal_notes = CASE
           WHEN v_nota IS NULL THEN internal_notes
           ELSE concat_ws(E'\n', nullif(btrim(coalesce(internal_notes, '')), ''), v_nota)
         END,
         updated_at = now()
   WHERE id = p_order_id AND organization_id = p_organization_id;

  RETURN jsonb_build_object('estado', v_estado, 'customer_id', v_facturar);
END;
$function$;

COMMENT ON FUNCTION public.fn_web_order_documento_cliente(integer, uuid, jsonb) IS
  'Tienda web: guarda el documento de la factura electrónica del checkout en la ficha del cliente (sin sobrescribir uno distinto) y en web_orders.billing_data. La llama /api/orders con service role.';

REVOKE ALL ON FUNCTION public.fn_web_order_documento_cliente(integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_web_order_documento_cliente(integer, uuid, jsonb) TO service_role;
