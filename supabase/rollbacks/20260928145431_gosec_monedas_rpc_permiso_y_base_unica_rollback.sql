-- Rollback de 20260928145431_gosec_monedas_rpc_permiso_y_base_unica.
-- Restaura los cuerpos anteriores (pg_get_functiondef del 2026-09-28, antes de
-- aplicar): solo fn_assert_acceso_org, sin search_path y sin permiso de rol.
-- Recrea la sobrecarga set_currency_auto_update(integer, varchar, boolean) tal
-- como estaba, AUNQUE ESTABA ROTA (UPDATE currencies WHERE organization_id,
-- columna inexistente) y vuelve ambigua la llamada con parámetros con nombre.
-- No restaura datos: la preferencia finance.default_currency que la RPC nueva
-- haya escrito se queda escrita.

drop index if exists public.organization_currencies_una_base;

create or replace function public.get_organization_currencies(p_organization_id integer)
 returns table(code character, name text, symbol text, decimals integer, auto_update boolean, is_base boolean, org_auto_update boolean)
 language plpgsql
 security definer
as $function$
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  RETURN QUERY
  SELECT c.code, c.name, c.symbol, c.decimals, c.auto_update, oc.is_base, oc.auto_update as org_auto_update
  FROM currencies c
  JOIN organization_currencies oc ON c.code = oc.currency_code
  WHERE oc.organization_id = p_organization_id
  ORDER BY oc.is_base DESC, c.code ASC;
END;
$function$;
alter function public.get_organization_currencies(integer) volatile;
alter function public.get_organization_currencies(integer) reset search_path;

create or replace function public.get_currency_templates(p_organization_id integer)
 returns table(code character, name text, symbol text, decimals integer, auto_update boolean)
 language plpgsql
 security definer
as $function$
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  RETURN QUERY
  SELECT c.code, c.name, c.symbol, c.decimals, c.auto_update
  FROM currencies c
  WHERE NOT EXISTS (
      SELECT 1 FROM organization_currencies oc
      WHERE oc.currency_code = c.code AND oc.organization_id = p_organization_id)
  ORDER BY c.code ASC;
END;
$function$;
alter function public.get_currency_templates(integer) volatile;
alter function public.get_currency_templates(integer) reset search_path;

create or replace function public.set_organization_base_currency(p_organization_id integer, p_currency_code character varying)
 returns boolean
 language plpgsql
 security definer
as $function$
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  UPDATE organization_currencies SET is_base = FALSE WHERE organization_id = p_organization_id;
  UPDATE organization_currencies SET is_base = TRUE
  WHERE organization_id = p_organization_id AND currency_code = p_currency_code;
  RETURN TRUE;
END;
$function$;
alter function public.set_organization_base_currency(integer, character varying) reset search_path;

create or replace function public.add_organization_currency(p_organization_id integer, p_currency_code character, p_is_base boolean default false, p_auto_update boolean default true)
 returns boolean
 language plpgsql
 security definer
as $function$
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  IF NOT EXISTS (SELECT 1 FROM currencies WHERE code = p_currency_code) THEN
    RAISE EXCEPTION 'La moneda con código % no existe en el catálogo global', p_currency_code;
  END IF;
  IF EXISTS (
    SELECT 1 FROM organization_currencies
    WHERE organization_id = p_organization_id AND currency_code = p_currency_code
  ) THEN
    RAISE EXCEPTION 'La moneda con código % ya está asociada a esta organización', p_currency_code;
  END IF;
  IF p_is_base THEN
    UPDATE organization_currencies SET is_base = FALSE WHERE organization_id = p_organization_id;
  END IF;
  INSERT INTO organization_currencies(organization_id, currency_code, is_base, auto_update)
  VALUES (p_organization_id, p_currency_code, p_is_base, p_auto_update);
  RETURN TRUE;
END;
$function$;
alter function public.add_organization_currency(integer, character, boolean, boolean) reset search_path;

create or replace function public.remove_organization_currency(p_organization_id integer, p_currency_code character varying)
 returns boolean
 language plpgsql
 security definer
as $function$
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  DELETE FROM organization_currencies
  WHERE organization_id = p_organization_id AND currency_code = p_currency_code;
  RETURN TRUE;
END;
$function$;
alter function public.remove_organization_currency(integer, character varying) reset search_path;

create or replace function public.set_currency_auto_update(p_currency_code character varying, p_auto_update boolean, p_org_id integer)
 returns boolean
 language plpgsql
 security definer
as $function$
BEGIN
  perform public.fn_assert_acceso_org(p_org_id::integer);
  UPDATE organization_currencies
  SET auto_update = p_auto_update
  WHERE organization_id = p_org_id AND currency_code = p_currency_code;
  RETURN TRUE;
END;
$function$;
alter function public.set_currency_auto_update(character varying, boolean, integer) reset search_path;

create or replace function public.set_currency_auto_update(p_org_id integer, p_currency_code character varying, p_auto_update boolean)
 returns jsonb
 language plpgsql
 security definer
as $function$
DECLARE
  affected_rows integer;
BEGIN
  perform public.fn_assert_acceso_org(p_org_id::integer);
  UPDATE currencies
  SET auto_update = p_auto_update, updated_at = now()
  WHERE organization_id = p_org_id AND code = p_currency_code;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'No se encontró la moneda especificada');
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Configuración de actualización automática actualizada correctamente');
END;
$function$;
revoke all on function public.set_currency_auto_update(integer, character varying, boolean) from public, anon;
grant execute on function public.set_currency_auto_update(integer, character varying, boolean) to authenticated, service_role;
