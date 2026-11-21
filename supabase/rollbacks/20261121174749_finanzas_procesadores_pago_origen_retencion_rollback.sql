-- Reversión de 20261121174749_finanzas_procesadores_pago_origen_retencion.sql
--
-- Vuelve a decidir el IVA del exterior por el nombre del procesador (Stripe y PayPal),
-- deja el tablero de saldos como estaba (días calendario desde el último abono) y quita
-- el origen y la retención de cada procesador. Se detiene si alguna organización ya
-- eligió un origen o una retención distintos, para no perder esa decisión sin avisar.

do $$
begin
  if exists (select 1 from public.payment_processor_settings where origin is not null or retains_balance is not null) then
    raise exception 'Hay organizaciones con origen o retención elegidos: anótelos antes de revertir';
  end if;
end $$;

-- El abono vuelve a mirar el código del procesador.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_registrar(integer, jsonb)'::regprocedure);
begin
  execute replace(v_def,
    E'  if (select p.origen from public.fn_procesador_pago_preferencias(p_organization_id, v_proc) p) = ''exterior'' then\n',
    E'  if v_proc in (''stripe'', ''paypal'') then\n');
end $$;

drop function if exists public.fn_procesadores_pago_saldos(integer, integer, date, integer);

create or replace function public.fn_procesador_pago_configurar(p_organization_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_proc text := p_datos->>'procesador';
  v_nit text := left(nullif(regexp_replace(coalesce(p_datos->>'nit', ''), '[^0-9-]', '', 'g'), ''), 20);
  v_nombre text := left(nullif(btrim(coalesce(p_datos->>'nombre', '')), ''), 120);
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: requiere el permiso finance.create' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fn_procesadores_pago_catalogo() k where k.codigo = v_proc) then
    raise exception 'PROCESADOR_INVALIDO: %', coalesce(v_proc, '(vacío)') using errcode = '22023';
  end if;
  insert into public.payment_processor_settings (organization_id, processor, tercero_nit, tercero_nombre, updated_by, updated_at)
  values (p_organization_id, v_proc, v_nit, v_nombre, v_uid, now())
  on conflict (organization_id, processor) do update
    set tercero_nit = excluded.tercero_nit, tercero_nombre = excluded.tercero_nombre,
        updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('procesador', v_proc, 'nit', v_nit, 'nombre', v_nombre);
end;
$function$;
revoke all on function public.fn_procesador_pago_configurar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_pago_configurar(integer, jsonb) to authenticated;

-- Saldo por procesador y alerta: el saldo sube sin abonos.
create or replace function public.fn_procesadores_pago_saldos(p_organization_id integer, p_dias integer default 5)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoy date;
  v_tz text;
  v_res jsonb := '[]'::jsonb;
  v_k record;
  v_t record;
  v_saldo numeric;
  v_ult_cobro date;
  v_ult_abono date;
  v_pend_desde date;
  v_dias integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'SIN_PERMISO: requiere el permiso finance.view' using errcode = '42501';
  end if;
  v_hoy := public.fn_today_for(p_organization_id, null);
  v_tz := public.fn_timezone_for(p_organization_id, null);
  for v_k in select * from public.fn_procesadores_pago_catalogo() loop
    select * into v_t from public.fn_procesador_pago_por_cuenta(p_organization_id, v_k.cuenta);
    v_saldo := public.fn_procesador_pago_saldo(p_organization_id, v_k.cuenta, null);
    select max((e.entry_date at time zone v_tz)::date) into v_ult_cobro
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = p_organization_id and e.posted and l.account_code like v_k.cuenta || '%' and l.debit > 0
       and e.source <> 'payment_processor_payouts';
    select max(a.payout_date) into v_ult_abono
      from public.payment_processor_payouts a
     where a.organization_id = p_organization_id and a.processor = v_k.codigo and a.status = 'registrado';
    -- Primer cobro que quedó después del último abono.
    select min((e.entry_date at time zone v_tz)::date) into v_pend_desde
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = p_organization_id and e.posted and l.account_code like v_k.cuenta || '%' and l.debit > 0
       and e.source <> 'payment_processor_payouts'
       and (v_ult_abono is null or (e.entry_date at time zone v_tz)::date > v_ult_abono);
    v_dias := case when v_saldo > 0 and v_pend_desde is not null then v_hoy - v_pend_desde end;
    if v_saldo <> 0 or v_ult_cobro is not null or v_ult_abono is not null then
      v_res := v_res || jsonb_build_object(
        'procesador', v_k.codigo, 'nombre', v_t.nombre, 'nit', v_t.nit, 'cuenta', v_k.cuenta,
        'saldo', v_saldo, 'ultimo_cobro', v_ult_cobro, 'ultimo_abono', v_ult_abono,
        'dias_sin_abono', v_dias,
        'alerta', coalesce(v_saldo < 0 or (v_dias is not null and v_dias > greatest(coalesce(p_dias, 5), 1)), false),
        'motivo_alerta', case
          when v_saldo < 0 then 'saldo_negativo'
          when v_dias is not null and v_dias > greatest(coalesce(p_dias, 5), 1) then 'sin_abono'
        end);
    end if;
  end loop;
  return v_res;
end;
$function$;
revoke all on function public.fn_procesadores_pago_saldos(integer, integer) from public, anon;
grant execute on function public.fn_procesadores_pago_saldos(integer, integer) to authenticated;

drop function if exists public.fn_procesador_pago_preferencias(integer, text);

alter table public.payment_processor_settings drop constraint if exists payment_processor_settings_origin_check;
alter table public.payment_processor_settings
  drop column if exists origin,
  drop column if exists retains_balance;
