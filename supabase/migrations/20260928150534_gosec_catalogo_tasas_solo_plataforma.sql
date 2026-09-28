-- GO-sec (2026-09-28) — El catálogo GLOBAL de tasas (`currency_rates`) solo lo
-- escribe la plataforma: service role (cron de Vercel, ruta de plataforma
-- /api/finanzas/tasas-cambio/sincronizar, Edge Function actualizar-tasas-cambio)
-- y pg_cron (rol postgres).
--
-- Verificado en la base viva antes de aplicar:
--   * `currency_rates_insert_policy` dejaba insertar a cualquier usuario con
--     role_id 2 o 22 en CUALQUIER organización, y `currency_rates_update_policy`
--     (FOR ALL, rol public) actualizar y BORRAR a cualquier role_id 2. El
--     navegador escribía el catálogo con la clave pública NEXT_PUBLIC_ de
--     OpenExchangeRates.
--   * `currency_rates` no tiene organization_id: es un dato de todos.
--   * Funciones que escriben el catálogo (o disparan la Edge Function con la
--     service_role de Vault) con EXECUTE para authenticated y, las invoker,
--     también para anon/public (ADR-004, deuda 5): update_global_exchange_rates,
--     insert_fallback_rates, fill_missing_currency_dates,
--     auto_generate_missing_rates, fill_historical_rates_real_api, y las
--     SECURITY DEFINER save_exchange_rates (5 sobrecargas),
--     save_global_exchange_rates, update_all_exchange_rates (2),
--     update_all_exchange_rates_with_api, generate_missing_currencies,
--     auto_update_exchange_rates, log_exchange_rates_execution y
--     update_exchange_rates (esta devolvía la URL con la clave de la API a
--     cualquier miembro; hoy falla porque openexchangerates_config no existe).
--   * Llamadores reales: ninguno desde el navegador tras este cambio (el ERP
--     llama desde el servidor con service role); goadmin-websites,
--     go-admin-super y go-admin-sellers no llaman ninguna; pg_cron (jobs 4 y 5)
--     corre como postgres; la Edge Function usa SUPABASE_SERVICE_ROLE_KEY.
--   * No se toca el search_path de estas funciones (ADR-004, deuda 4): con el
--     EXECUTE cerrado a service_role/postgres deja de ser superficie de ataque,
--     y cambiarlo puede cambiar a qué objetos resuelven.

-- 1. RLS: fuera las políticas de escritura. La lectura para authenticated queda.
drop policy if exists currency_rates_insert_policy on public.currency_rates;
drop policy if exists currency_rates_update_policy on public.currency_rates;

revoke insert, update, delete, truncate on table public.currency_rates from anon, authenticated;
revoke all on table public.currency_rates from anon;

-- 2. Funciones que escriben el catálogo global: solo service_role (y el dueño).
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.update_global_exchange_rates(jsonb, text, bigint, text, text)',
    'public.insert_fallback_rates()',
    'public.fill_missing_currency_dates()',
    'public.auto_generate_missing_rates()',
    'public.fill_historical_rates_real_api()',
    'public.save_exchange_rates(integer, uuid, jsonb, text)',
    'public.save_exchange_rates(integer, uuid, jsonb, text, bigint)',
    'public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date)',
    'public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date, text)',
    'public.save_exchange_rates(jsonb, date, text, bigint, text)',
    'public.save_global_exchange_rates(jsonb, text, bigint, date, text)',
    'public.update_all_exchange_rates()',
    'public.update_all_exchange_rates(jsonb, text, bigint, date)',
    'public.update_all_exchange_rates_with_api(jsonb, text, bigint, date)',
    'public.generate_missing_currencies()',
    'public.auto_update_exchange_rates()',
    'public.log_exchange_rates_execution(timestamp with time zone, boolean, text, integer, integer, integer, jsonb)',
    'public.update_exchange_rates(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
