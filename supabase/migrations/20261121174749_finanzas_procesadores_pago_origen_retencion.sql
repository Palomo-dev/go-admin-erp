-- Procesadores de pago, tercera parte (Contador y dueño, 2026-11-21).
--
-- 1. Cada procesador guarda dos datos por organización, que ya no se deducen de su
--    nombre:
--    · origen: «nacional» o «exterior». El exterior no trae IVA colombiano en el
--      extracto; el IVA de su comisión queda como pendiente contable (reverse
--      charge, art. 437-2 num. 3 ET).
--    · retiene saldo a propósito (sí/no). Si dice sí, no aplica la alerta de 5 días
--      hábiles: el tablero muestra el saldo retenido y alerta si pasan más de 30 días
--      sin ningún retiro al banco.
--    Si la organización no los ha elegido valen los de fábrica: exterior y retiene
--    para Stripe y PayPal; nacional y no retiene para los demás.
-- 2. El abono decide el IVA de la comisión por el origen, no por el procesador.
-- 3. Tablero de saldos: cobrado y abonado del mes, saldo, y días hábiles (sin
--    festivos, con fn_hr_dias_habiles) desde el cobro más viejo que sigue sin
--    abonar. Los abonos se aplican primero a los cobros más viejos.

-- ── 1. Origen y retención por procesador ────────────────────────────────────
alter table public.payment_processor_settings
  add column if not exists origin text,
  add column if not exists retains_balance boolean;
alter table public.payment_processor_settings drop constraint if exists payment_processor_settings_origin_check;
alter table public.payment_processor_settings add constraint payment_processor_settings_origin_check
  check (origin is null or origin in ('nacional', 'exterior'));
comment on column public.payment_processor_settings.origin is
  'nacional · exterior. Null: el de fábrica (fn_procesador_pago_preferencias). Exterior: el IVA de la comisión queda como pendiente (reverse charge).';
comment on column public.payment_processor_settings.retains_balance is
  'Retiene saldo a propósito. Null: el de fábrica. Sí: sin alerta de 5 días hábiles; alerta a los 30 días sin retiro al banco.';

-- Valores de fábrica en un solo lugar; lo elegido por la organización manda.
create or replace function public.fn_procesador_pago_preferencias(p_organization_id integer, p_procesador text)
 returns table(origen text, retiene_saldo boolean)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(s.origin, f.origen), coalesce(s.retains_balance, f.retiene)
    from (values
      ('datafono', 'nacional', false), ('wompi', 'nacional', false), ('bold', 'nacional', false),
      ('mercadopago', 'nacional', false), ('payu', 'nacional', false),
      ('stripe', 'exterior', true), ('paypal', 'exterior', true)) as f(codigo, origen, retiene)
    left join public.payment_processor_settings s
      on s.organization_id = p_organization_id and s.processor = f.codigo
   where f.codigo = p_procesador;
$function$;
revoke all on function public.fn_procesador_pago_preferencias(integer, text) from public, anon, authenticated;

-- Configurar: NIT, nombre, origen y retención. Lo que no venga en p_datos no se toca.
create or replace function public.fn_procesador_pago_configurar(p_organization_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_proc text := p_datos->>'procesador';
  v_nit text := left(nullif(regexp_replace(coalesce(p_datos->>'nit', ''), '[^0-9A-Za-z-]', '', 'g'), ''), 20);
  v_nombre text := left(nullif(btrim(coalesce(p_datos->>'nombre', '')), ''), 120);
  v_origen text := nullif(lower(btrim(coalesce(p_datos->>'origen', ''))), '');
  v_retiene boolean;
  v_pref record;
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
  if v_origen is not null and v_origen not in ('nacional', 'exterior') then
    raise exception 'ORIGEN_INVALIDO: el origen es nacional o exterior' using errcode = '22023';
  end if;
  if p_datos ? 'retiene_saldo' and jsonb_typeof(p_datos->'retiene_saldo') <> 'null' then
    if jsonb_typeof(p_datos->'retiene_saldo') <> 'boolean' then
      raise exception 'RETIENE_SALDO_INVALIDO: se espera sí o no (true/false)' using errcode = '22023';
    end if;
    v_retiene := (p_datos->>'retiene_saldo')::boolean;
  end if;

  insert into public.payment_processor_settings
    (organization_id, processor, tercero_nit, tercero_nombre, origin, retains_balance, updated_by, updated_at)
  values (p_organization_id, v_proc, v_nit, v_nombre, v_origen, v_retiene, v_uid, now())
  on conflict (organization_id, processor) do update
    set tercero_nit = case when p_datos ? 'nit' then excluded.tercero_nit else payment_processor_settings.tercero_nit end,
        tercero_nombre = case when p_datos ? 'nombre' then excluded.tercero_nombre else payment_processor_settings.tercero_nombre end,
        origin = case when p_datos ? 'origen' then excluded.origin else payment_processor_settings.origin end,
        retains_balance = case when p_datos ? 'retiene_saldo' then excluded.retains_balance else payment_processor_settings.retains_balance end,
        updated_by = excluded.updated_by, updated_at = now();

  select * into v_pref from public.fn_procesador_pago_preferencias(p_organization_id, v_proc);
  return (select jsonb_build_object('procesador', v_proc, 'nit', s.tercero_nit, 'nombre', s.tercero_nombre,
                                    'origen', v_pref.origen, 'retiene_saldo', v_pref.retiene_saldo)
            from public.payment_processor_settings s
           where s.organization_id = p_organization_id and s.processor = v_proc);
end;
$function$;
revoke all on function public.fn_procesador_pago_configurar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_pago_configurar(integer, jsonb) to authenticated;

-- ── 2. El abono decide el IVA de la comisión por el origen ───────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_registrar(integer, jsonb)'::regprocedure);
  v_viejo text := E'  if v_proc in (''stripe'', ''paypal'') then\n';
  v_nuevo text := E'  if (select p.origen from public.fn_procesador_pago_preferencias(p_organization_id, v_proc) p) = ''exterior'' then\n';
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'fn_procesador_abono_registrar cambió: no se encontró una sola vez la regla de Stripe y PayPal';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- ── 3. Tablero de saldos ─────────────────────────────────────────────────────
-- Cambia la firma (mes y días de retención): se reemplaza la de dos parámetros.
drop function if exists public.fn_procesadores_pago_saldos(integer, integer);
create or replace function public.fn_procesadores_pago_saldos(
  p_organization_id integer, p_dias integer default 5, p_mes date default null, p_dias_retenido integer default 30)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoy date;
  v_tz text;
  v_mes_ini date;
  v_mes_fin date;
  v_dias integer := greatest(coalesce(p_dias, 5), 1);
  v_dias_ret integer := greatest(coalesce(p_dias_retenido, 30), 1);
  v_res jsonb := '[]'::jsonb;
  v_k record;
  v_t record;
  v_p record;
  v_m record;
  v_abonado_mes numeric;
  v_ult_abono date;
  v_aplicado numeric;
  v_pend_desde date;
  v_dias_hab numeric;
  v_dias_sin_retiro integer;
  v_motivo text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'SIN_PERMISO: requiere el permiso finance.view' using errcode = '42501';
  end if;
  v_hoy := public.fn_today_for(p_organization_id, null);
  v_tz := public.fn_timezone_for(p_organization_id, null);
  v_mes_ini := date_trunc('month', coalesce(p_mes, v_hoy))::date;
  v_mes_fin := (v_mes_ini + interval '1 month' - interval '1 day')::date;

  for v_k in select * from public.fn_procesadores_pago_catalogo() loop
    select * into v_t from public.fn_procesador_pago_por_cuenta(p_organization_id, v_k.cuenta);
    select * into v_p from public.fn_procesador_pago_preferencias(p_organization_id, v_k.codigo);

    -- Movimientos de la cuenta. Cobro: débito que no viene de un abono ni de su anulación.
    select coalesce(sum(coalesce(l.debit, 0) - coalesce(l.credit, 0)), 0) as saldo,
           coalesce(sum(coalesce(l.debit, 0)), 0) as debitos,
           coalesce(sum(coalesce(l.credit, 0)), 0) as creditos,
           coalesce(sum(l.debit) filter (where e.source <> 'payment_processor_payouts'), 0) as cobros,
           coalesce(sum(l.debit) filter (where e.source <> 'payment_processor_payouts'
                                           and (e.entry_date at time zone v_tz)::date between v_mes_ini and v_mes_fin), 0) as cobrado_mes,
           max((e.entry_date at time zone v_tz)::date) filter (where l.debit > 0 and e.source <> 'payment_processor_payouts') as ult_cobro
      into v_m
      from public.journal_lines l
      join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = p_organization_id and e.posted and l.account_code like v_k.cuenta || '%';

    select coalesce(sum(a.gross_amount) filter (where a.payout_date between v_mes_ini and v_mes_fin), 0),
           max(a.payout_date)
      into v_abonado_mes, v_ult_abono
      from public.payment_processor_payouts a
     where a.organization_id = p_organization_id and a.processor = v_k.codigo and a.status = 'registrado';

    -- Cobro más viejo sin abonar: los créditos (netos de anulaciones de abonos) saldan
    -- primero los cobros más viejos.
    v_aplicado := v_m.creditos - (v_m.debitos - v_m.cobros);
    v_pend_desde := null;
    if v_m.saldo > 0 then
      select x.fecha into v_pend_desde
        from (select (e.entry_date at time zone v_tz)::date as fecha,
                     sum(l.debit) over (order by e.entry_date, l.id) as acumulado
                from public.journal_lines l
                join public.journal_entries e on e.id = l.journal_entry_id
               where e.organization_id = p_organization_id and e.posted and l.account_code like v_k.cuenta || '%'
                 and l.debit > 0 and e.source <> 'payment_processor_payouts') x
       where x.acumulado > v_aplicado
       order by x.acumulado
       limit 1;
    end if;

    -- Días hábiles (lunes a viernes, sin festivos) desde el día siguiente al cobro.
    v_dias_hab := case when v_pend_desde is not null and v_pend_desde < v_hoy
                       then public.fn_hr_dias_habiles(p_organization_id, v_pend_desde + 1, v_hoy, null, array[1, 2, 3, 4, 5]::smallint[])
                       when v_pend_desde is not null then 0 end;
    -- Saldo retenido a propósito: días desde el último retiro al banco (o desde el cobro más viejo).
    v_dias_sin_retiro := case when v_p.retiene_saldo and v_m.saldo > 0
                              then v_hoy - coalesce(v_ult_abono, v_pend_desde, v_hoy) end;

    v_motivo := case
      when v_m.saldo < 0 then 'saldo_negativo'
      when v_p.retiene_saldo and v_dias_sin_retiro > v_dias_ret then 'saldo_retenido_sin_retiro'
      when not v_p.retiene_saldo and v_dias_hab > v_dias then 'sin_abono'
    end;

    if v_m.saldo <> 0 or v_m.ult_cobro is not null or v_ult_abono is not null then
      v_res := v_res || jsonb_build_object(
        'procesador', v_k.codigo, 'nombre', v_t.nombre, 'nit', v_t.nit, 'cuenta', v_k.cuenta,
        'origen', v_p.origen, 'retiene_saldo', v_p.retiene_saldo,
        'mes', v_mes_ini, 'cobrado_mes', v_m.cobrado_mes, 'abonado_mes', v_abonado_mes,
        'saldo', v_m.saldo, 'ultimo_cobro', v_m.ult_cobro, 'ultimo_abono', v_ult_abono,
        'cobro_pendiente_desde', v_pend_desde,
        'dias_habiles_sin_abono', v_dias_hab,
        'dias_sin_retiro', v_dias_sin_retiro,
        'alerta', v_motivo is not null,
        'motivo_alerta', v_motivo,
        'estado', case
          when v_motivo is not null then 'alerta'
          when v_p.retiene_saldo and v_m.saldo > 0 then 'saldo_retenido'
          else 'al_dia' end);
    end if;
  end loop;
  return v_res;
end;
$function$;
revoke all on function public.fn_procesadores_pago_saldos(integer, integer, date, integer) from public, anon;
grant execute on function public.fn_procesadores_pago_saldos(integer, integer, date, integer) to authenticated;
