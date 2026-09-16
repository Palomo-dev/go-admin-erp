-- 20260910000000_fase0_3_vault_provider_secret_functions.sql
-- Versión aplicada en Supabase: 20260910002122 (vía MCP, proyecto jgmgphmzusbluqhuqihj).
-- Versionada a posteriori: se aplicó bajo la regla anterior ("cero .sql en el repo").
--
-- Fase 0.3 (GO-1) — Los secretos de integración pasan a Supabase Vault.
--
-- Problema que resuelven: `integration_credentials.secret_ref` es una columna cuyo
-- nombre promete una REFERENCIA y contenía el secreto literal. Eso lo deja legible
-- en dumps, backups, el panel de Supabase, y a una política mal puesta de repetir el
-- incidente cerrado en SEC-0.b.
--
-- A partir de aquí:
--   integration_credentials.secret_ref  →  uuid de vault.secrets.id
--   vault.secrets                       →  el valor, cifrado en reposo
--   integration_credentials.key_prefix  →  4 caracteres, para distinguirlo en la UI
--
-- Alcance honesto: Vault protege contra dumps, backups, el panel y errores de RLS.
-- NO protege contra quien tenga la service_role key. Esa sigue siendo el activo crítico.
--
-- Ambas funciones son SECURITY DEFINER con search_path fijo, sin EXECUTE para PUBLIC,
-- anon ni authenticated. Sólo service_role las puede llamar, es decir sólo código de
-- servidor. Verificado tras aplicar con has_function_privilege: anon=false,
-- authenticated=false, service_role=true. Probadas de ida y vuelta (alta, lectura,
-- rotación con mismo uuid) sobre una conexión sandbox; datos de prueba borrados.
--
-- Rollback: supabase/rollbacks/20260910000000_fase0_3_vault_provider_secret_functions_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Escribe (o rota) el secreto de una conexión y devuelve el uuid en el vault.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_provider_secret(
  p_connection_id   uuid,
  p_purpose         text,
  p_value           text,
  p_credential_type text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id      integer;
  v_provider    text;
  v_secret_name text;
  v_cred_id     uuid;
  v_secret_ref  text;
  v_secret_id   uuid;
  v_type        text;
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RAISE EXCEPTION 'El valor del secreto no puede estar vacío';
  END IF;
  IF p_purpose IS NULL OR btrim(p_purpose) = '' THEN
    RAISE EXCEPTION 'p_purpose es obligatorio';
  END IF;

  SELECT icn.organization_id, ip.code
    INTO v_org_id, v_provider
  FROM public.integration_connections icn
  JOIN public.integration_connectors  ico ON ico.id = icn.connector_id
  JOIN public.integration_providers   ip  ON ip.id  = ico.provider_id
  WHERE icn.id = p_connection_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'La conexión % no existe', p_connection_id;
  END IF;

  -- Nombre legible en el vault y único por conexión+propósito.
  v_secret_name := 'integration_' || v_org_id || '_' || v_provider || '_' ||
                   p_purpose || '_' || left(p_connection_id::text, 8);

  -- credential_type es NOT NULL y tiene CHECK; se infiere si no lo pasan.
  v_type := COALESCE(
    p_credential_type,
    CASE
      WHEN p_purpose LIKE '%secret%'  THEN 'secret'
      WHEN p_purpose = 'access_token'  THEN 'oauth_access'
      WHEN p_purpose = 'refresh_token' THEN 'oauth_refresh'
      WHEN p_purpose = 'private_key'   THEN 'private_key'
      ELSE 'api_key'
    END
  );

  SELECT id, secret_ref
    INTO v_cred_id, v_secret_ref
  FROM public.integration_credentials
  WHERE connection_id = p_connection_id AND purpose = p_purpose
  ORDER BY created_at DESC
  LIMIT 1;

  -- ¿La fila ya apunta a un secreto vivo del vault? Entonces se rota en sitio.
  IF v_secret_ref IS NOT NULL
     AND v_secret_ref ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND EXISTS (SELECT 1 FROM vault.secrets s WHERE s.id = v_secret_ref::uuid)
  THEN
    v_secret_id := v_secret_ref::uuid;
    PERFORM vault.update_secret(v_secret_id, p_value, NULL, NULL, NULL);
  ELSE
    -- Reutiliza el secreto del vault si ya existe con ese nombre (reintentos,
    -- migraciones repetidas); si no, lo crea.
    SELECT s.id INTO v_secret_id FROM vault.secrets s WHERE s.name = v_secret_name;

    IF v_secret_id IS NULL THEN
      v_secret_id := vault.create_secret(
        p_value,
        v_secret_name,
        'Credencial de integración — organización ' || v_org_id ||
        ', proveedor ' || v_provider || ', propósito ' || p_purpose,
        NULL
      );
    ELSE
      PERFORM vault.update_secret(v_secret_id, p_value, NULL, NULL, NULL);
    END IF;
  END IF;

  IF v_cred_id IS NULL THEN
    INSERT INTO public.integration_credentials
      (connection_id, credential_type, purpose, secret_ref, key_prefix, status, rotated_at)
    VALUES
      (p_connection_id, v_type, p_purpose, v_secret_id::text,
       left(p_value, 4) || '...', 'active', now());
  ELSE
    UPDATE public.integration_credentials
       SET secret_ref = v_secret_id::text,
           key_prefix = left(p_value, 4) || '...',
           status     = 'active',
           rotated_at = now(),
           updated_at = now()
     WHERE id = v_cred_id;
  END IF;

  RETURN v_secret_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lee el secreto de una conexión. Devuelve NULL si aún no está en el vault:
-- nunca devuelve el secret_ref crudo, para que el llamador distinga "migrado"
-- de "todavía en claro en la tabla" y decida explícitamente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_provider_secret(
  p_connection_id uuid,
  p_purpose       text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_secret_ref text;
  v_value      text;
BEGIN
  SELECT secret_ref INTO v_secret_ref
  FROM public.integration_credentials
  WHERE connection_id = p_connection_id
    AND purpose       = p_purpose
    AND status        = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_secret_ref IS NULL
     OR v_secret_ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN
    RETURN NULL;
  END IF;

  SELECT s.decrypted_secret INTO v_value
  FROM vault.decrypted_secrets s
  WHERE s.id = v_secret_ref::uuid;

  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_provider_secret(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_get_provider_secret(uuid, text)             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_provider_secret(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_provider_secret(uuid, text)             TO service_role;

COMMENT ON FUNCTION public.fn_set_provider_secret(uuid, text, text, text) IS
  'Guarda o rota el secreto de una conexión de integración en Supabase Vault y deja el uuid en integration_credentials.secret_ref. Sólo service_role.';
COMMENT ON FUNCTION public.fn_get_provider_secret(uuid, text) IS
  'Devuelve el secreto de una conexión desde Vault, o NULL si secret_ref todavía no es una referencia al vault. Sólo service_role.';
