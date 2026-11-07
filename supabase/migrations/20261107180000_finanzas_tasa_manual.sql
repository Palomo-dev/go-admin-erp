-- Finanzas R2, frente C, pieza M4 «Registrar tasa manual» (2026-11-07).
-- Aplicada por el MCP el 2026-11-07 con orden del dueño. Sin ella, el diálogo
-- responde «aún no está disponible» (PGRST202).
--
-- Qué hace:
--   1. `exchange_rates` (tasas de la ORGANIZACIÓN) gana `created_by` y `reason`:
--      el diseño dice «Queda en el historial con tu nombre» y el histórico muestra
--      «Registró: <persona> · «<motivo>»».
--   2. `fn_finanzas_registrar_tasa_manual`: única vía para escribir una tasa
--      manual. Exige el mismo permiso que las RPC de monedas (20260928145431),
--      guarda 1 <moneda> = <tasa> <moneda base> con fuente 'manual', autor =
--      auth.uid() y motivo; si ya hay una manual ese día, la reemplaza.
--      No toca documentos: los ya contabilizados conservan su tasa.
--   3. Cierra las escrituras directas de miembros en `exchange_rates`: con las
--      políticas actuales cualquier miembro (cajero incluido) podía insertar,
--      cambiar o borrar tasas y firmar con el `created_by` de otro. Leer sigue
--      igual (`exchange_rates_select_org`) y service_role conserva su política.
--
-- Verificado por MCP (solo lectura) el 2026-11-07 en taqjemqjtumhwptchcxk:
--   * exchange_rates: 0 filas; UNIQUE (organization_id, base_currency,
--     target_currency, effective_date); políticas *_select_org, *_insert_org,
--     *_update_org, *_delete_org (authenticated) y *_service_role_all.
--   * Nadie en src/ escribe exchange_rates desde el navegador salvo
--     currencyService.updateExchangeRate, que no tiene llamadores.
--   * fn_finanzas_exigir_permiso(p_org integer, p_codigos text[]),
--     fn_today_for_org(p_org_id integer) → date,
--     fn_moneda_base_organizacion(p_org integer) → text.

-- 1. Autor y motivo (aditivo, NULL-ables).
alter table public.exchange_rates add column if not exists created_by uuid;
alter table public.exchange_rates add column if not exists reason text;

comment on column public.exchange_rates.created_by is 'Quién registró la tasa manual (auth.uid()). NULL en tasas de sistema.';
comment on column public.exchange_rates.reason is 'Motivo de la tasa manual («TRM del contador para el cierre»).';

-- 2. Registrar tasa manual.
create or replace function public.fn_finanzas_registrar_tasa_manual(
  p_org integer,
  p_moneda text,
  p_fecha date,
  p_tasa numeric,
  p_motivo text
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
  v_motivo text := regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g');
  v_base text;
  v_id integer;
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['billing_management', 'organization_settings']);

  if p_tasa is null or p_tasa <= 0 then
    raise exception 'tasa_invalida' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fn_today_for_org(p_org) then
    raise exception 'fecha_futura' using errcode = '22023';
  end if;
  if char_length(v_motivo) < 5 or char_length(v_motivo) > 500 then
    raise exception 'motivo_corto' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_currencies oc
                  where oc.organization_id = p_org and btrim(oc.currency_code) = v_moneda) then
    raise exception 'moneda_no_asignada' using errcode = 'P0002';
  end if;

  select btrim(oc.currency_code) into v_base
    from public.organization_currencies oc
   where oc.organization_id = p_org and oc.is_base;
  if v_base is null then
    v_base := upper(btrim(public.fn_moneda_base_organizacion(p_org)));
  end if;
  if v_moneda = v_base then
    raise exception 'moneda_es_base' using errcode = '22023';
  end if;

  insert into public.exchange_rates as er
         (organization_id, base_currency, target_currency, rate, source, effective_date, is_default, created_by, reason)
  values (p_org, v_moneda, v_base, p_tasa, 'manual', p_fecha, false, auth.uid(), v_motivo)
  on conflict (organization_id, base_currency, target_currency, effective_date) do update
     set rate = excluded.rate,
         source = 'manual',
         created_by = excluded.created_by,
         reason = excluded.reason,
         updated_at = now()
  returning er.id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.fn_finanzas_registrar_tasa_manual(integer, text, date, numeric, text) from public, anon;
grant execute on function public.fn_finanzas_registrar_tasa_manual(integer, text, date, numeric, text) to authenticated, service_role;

-- 3. Sin escrituras directas de miembros: la tasa manual entra solo por la RPC.
drop policy if exists exchange_rates_insert_org on public.exchange_rates;
drop policy if exists exchange_rates_update_org on public.exchange_rates;
drop policy if exists exchange_rates_delete_org on public.exchange_rates;
