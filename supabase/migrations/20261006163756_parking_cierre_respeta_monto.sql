-- Aplicada el 2026-10-06 con apply_migration (versión 20261006163756).
-- Urgente parqueadero: al registrar la salida, el monto que cobra la pantalla no era el que quedaba
-- en la sesión ni en contabilidad.
--
-- calculate_parking_session_amount (BEFORE UPDATE, al pasar de open a closed) SOBRESCRIBÍA
-- siempre parking_sessions.amount con tarifa × unidades. La pantalla manda el monto que cobró en
-- caja, que no siempre es ese: ticket perdido (lost_ticket_fee), salida por excepción (0),
-- abonado (0) o una tarifa distinta a la que quedó en rate_id al entrar. Resultado: el pago en
-- payments decía una cifra y la sesión y el asiento de fn_auto_journal_parking_session otra.
-- Ensayo antes del cambio (org 325, authenticated): salida de moto con amount=99999 enviado →
-- guardado 2000.00; cierre con amount=6000 → asiento por la cifra de la tarifa.
--
-- Además, «Registrar pago» (pantalla Pagos) cerraba la sesión sin exit_at: duration_min y amount
-- quedaban en 0 y exit_at en NULL (ensayo: amount=0.00 exit_at=NULL).
--
-- Cambio:
--  1. Si el cierre trae amount, se respeta. Solo se calcula con la tarifa si llega NULL.
--  2. Si el cierre no trae exit_at, se pone now() antes de calcular la duración.
--  3. fn_auto_journal_parking_session solo asienta cuando el estado CAMBIA (el disparador es
--     AFTER UPDATE OF status y se disparaba también con un update que repetía status='closed').
--     El resto de la función queda igual.
set lock_timeout = '10s';

create or replace function public.calculate_parking_session_amount()
returns trigger
language plpgsql
as $f$
declare
  v_rate_price numeric;
  v_rate_unit text;
  v_grace_period integer;
  v_duration_minutes integer;
  v_unit_count numeric;
begin
  if new.status = 'closed' and old.status = 'open' then
    new.exit_at := coalesce(new.exit_at, now());
    new.duration_min := greatest(0, floor(extract(epoch from (new.exit_at - new.entry_at)) / 60));

    -- El monto que manda la pantalla es el que se cobró: se respeta.
    if new.amount is null and new.rate_id is not null then
      select price, unit::text, coalesce(grace_period_min, 0)
        into v_rate_price, v_rate_unit, v_grace_period
        from public.parking_rates
       where id = new.rate_id;

      v_duration_minutes := greatest(0, new.duration_min - v_grace_period);

      case v_rate_unit
        when 'minute' then v_unit_count := v_duration_minutes;
        when 'hour' then v_unit_count := ceiling(v_duration_minutes / 60.0);
        when 'day' then v_unit_count := ceiling(v_duration_minutes / (60.0 * 24));
        else v_unit_count := 0;
      end case;

      new.amount := coalesce(v_rate_price, 0) * v_unit_count;
    end if;
  end if;

  return new;
end;
$f$;

comment on function public.calculate_parking_session_amount() is
  'Al cerrar una sesión de parqueadero: pone exit_at si falta, calcula duration_min y, SOLO si amount llega NULL, el monto por tarifa. Si la pantalla manda amount (ticket perdido, excepción, abonado), se respeta.';

-- Conserva SECURITY DEFINER (la versión anterior lo tenía); se fija además el search_path.
-- Sus permisos (solo postgres y service_role) no cambian con create or replace.
create or replace function public.fn_auto_journal_parking_session()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
    v_rule record;
    v_entry_id integer;
    v_org_id integer;
begin
    -- Solo cuando el estado cambia: un update que repite status='closed' no asienta otra vez.
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then
        return new;
    end if;

    -- Solo sesiones cerradas con monto
    if new.status::text not in ('closed', 'paid', 'completed') then
        return new;
    end if;

    if coalesce(new.amount, 0) <= 0 then
        return new;
    end if;

    -- Obtener organization_id desde branch
    select organization_id into v_org_id from branches where id = new.branch_id;
    if v_org_id is null then
        return new;
    end if;

    select * into v_rule
    from accounting_rules
    where organization_id = v_org_id
      and source_type = 'parking'
      and is_active = true
    order by priority limit 1;

    if v_rule is null then /* registro-sin-regla */ perform fn_log_journal_failure(coalesce((to_jsonb(new)->>'organization_id')::integer, v_org_id), null, now(), tg_table_name, to_jsonb(new)->>'id', null, null, null, null, 'no_rule', 'Sin regla contable activa para ' || tg_table_name || ' (' || tg_op || ')'); return new;
    end if;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := new.branch_id,
        p_entry_date := coalesce(new.exit_at, new.created_at, now()),
        p_memo := 'Parking - ' || coalesce(new.vehicle_plate, new.id::text),
        p_source := 'parking_sessions',
        p_source_id := new.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := new.amount
    );

    return new;
end;
$f$;
