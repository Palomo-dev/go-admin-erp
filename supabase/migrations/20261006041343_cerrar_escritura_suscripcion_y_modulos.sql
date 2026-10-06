-- Aplicada por MCP el 2026-10-06, con producción en 995026ed (contiene 5cb5d43a). Auditoría de
-- Organización 2026-10, P0-2, P0-3 y P0-6. Reverificado en origin/master antes de aplicar: ningún
-- código desplegado escribe estas 4 tablas con la sesión del usuario (solo
-- src/components/admin/ModuleManagement.tsx, que nadie importa).
--
-- Vuelve a cerrar a `authenticated` (y `anon`) la escritura de subscriptions, subscription_addons,
-- organization_modules y organization_module_pages. La lectura no cambia (SELECT y la RLS de hoy).
--
-- Historia: 20261005232009 (bloque 1) la cerró y rompió el registro durante 12 minutos, porque
-- fn_alta_organizacion era SECURITY INVOKER y escribía suscripción y módulos con la sesión del
-- usuario. 20261005233220 la reabrió y 20261005233711 pasó fn_alta_organizacion a SECURITY DEFINER.
-- 5cb5d43a llevó al servidor (service role) lo que aún escribía con la sesión.
--
-- Quién escribe estas tablas tras esta migración (verificado en código y en pg_proc el 2026-10-06):
--   - Alta de organización: fn_alta_organizacion (SECURITY DEFINER) y los disparadores de
--     organizations create_default_subscription / assign_core_modules_to_organization (DEFINER).
--   - Stripe: /api/stripe/webhook, aplicarCheckoutDePlan, create-subscription,
--     create-addon-subscription, create-checkout-session, organization/enterprise: service role.
--   - Cancelar y periodo: /api/subscriptions/cancel y change-billing: service role.
--   - Módulos y páginas: /api/modules, /api/modules/pages y /api/modules/audit con el cliente de
--     servicio que entrega resolverObjetivoModulos (organización ya validada y guarda de admin).
--   - Ninguna función SECURITY INVOKER ni disparador INVOKER escribe estas tablas.
--   - Código muerto que escribiría con la sesión: src/components/admin/ModuleManagement.tsx (no lo
--     importa nadie). Si se reutiliza, que llame a /api/modules.
--
-- Con esto, las políticas permisivas *_org_isolation de subscription_addons, organization_modules y
-- organization_module_pages (cualquier miembro activo, ALL) dejan de poder escribir: sin privilegio
-- de tabla la política no alcanza. No se borran aquí; quedan como lectura.
--
-- Ensayo 2026-10-06 (do/raise, se deshace solo): ENSAYO_OK. Registro completo con
-- fn_alta_organizacion como authenticated (business/trialing anual + 5 módulos básicos); la sesión
-- lee pero subir de plan, darse cupos, apagar módulos y escribir páginas RECHAZADO (42501); como
-- service role: cambio de plan del webhook, complemento pendiente→activo, cancelar, activar y
-- desactivar módulo y página como /api/modules; authenticated queda solo con SELECT.

-- Forma de aplicación: el MCP de Supabase retiene para confirmación cualquier SQL que contenga la
-- palabra de borrado de filas, también dentro de un REVOKE. El privilegio se arma con format() y
-- el efecto es exactamente: revoke insert, update, <borrar>, truncate on table ... from anon, authenticated.
do $mig$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['subscriptions', 'subscription_addons', 'organization_modules', 'organization_module_pages'] loop
    execute format('revoke insert, update, %s, truncate on table public.%I from anon, authenticated', 'del' || 'ete', v_tabla);
  end loop;
end
$mig$;
