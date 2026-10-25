-- Commit B (comisiones/pasivos) 25-oct-2026. REHECHA por QA ROJO 8dc44d22 N3/N7 según el contador. NO aplicada.
-- Requiere 134110 (28050501, 41409502) y 134120/134130.
-- Contador (hoteles con 28050501 de movimiento):
--   * Reserva confirmada SIN pago: NO lleva asiento (antes D1305/C2405 por total_estimated).
--   * Anticipo (pago de folio antes del check-in):   D caja/banco  C 28050501   (regla reservation/received)
--   * Cancelada con reembolso:                       D 28050501    C caja/banco (regla reservation/cancelled)
--   * Penalidad retenida al cancelar:                D 28050501    C 41409502   (regla reservation/adjusted;
--       monto = reservations.metadata->>'penalidad_retenida', tope el anticipo; el resto se reembolsa)
--   * No-show (todo el anticipo):                    D 28050501    C 41409502   (regla reservation/no_show)
--   * Checkout (el anticipo abona la cartera):       D 28050501    C cartera    (regla reservation/completed)
--       QA ROJO 56f889e2 ALTO: «cartera» = la MISMA cuenta que DEBITAN los cargos de folio (folio_item/created; hoy
--       1305, de movimiento en las 43 orgs). No se crea 13050501 ni 1305 pasa a título (pendiente aparte).
--   QA ROJO 56f889e2 MEDIO 1: anticipo y reembolso usan la cuenta del MEDIO DE PAGO (fn_money_account_code_pago:
--       cuenta bancaria del pago o la del método: caja 1105 / bancos 1110), no siempre la caja de la sede. El
--       reembolso acredita la cuenta de dinero por la que entró el anticipo.
--   QA ROJO 56f889e2 BAJO 2: el anticipo solo se asienta con la reserva CONFIRMADA (no tentative).
--   event_type: accounting_rules_event_type_check (igual en prod) no admite deposit/penalty/checkout; se usan
--   received (anticipo), adjusted (penalidad) y completed (checkout), que sí admite. No se toca el CHECK.
--   El anticipo de una reserva = saldo CONTABILIZADO de 28050501 en sus asientos (source 'reservation' con
--   source_id = reserva, y 'folio_payment' de los pagos de sus folios). Sin anticipo no hay asiento.
-- a. Funciones: fn_reserva_anticipo (nueva), fn_auto_journal_reservation y fn_auto_journal_folio_payment
--    (las orgs SIN 28050501 de movimiento siguen exactamente con el código anterior).
-- b. (QA ROJO 56f889e2) Ya no se crean 130505/13050501: el checkout acredita la cartera de los cargos de folio.
-- c. Reglas: confirmed → inactiva; cancelled → D28050501/C1105; no_show → D28050501/C41409502; completed → C 1305; se siembran las
--    que falten (received, cancelled, adjusted, no_show, completed), también en las 4 orgs con C4250 (130/133/136/326)
--    que no tenían cancelación ni no-show. Bitácora p1_puc_bitacora migracion '134145'.
-- d. Saldo de 2405 de asientos source='reservation' CONTABILIZADOS (N7: org 2 tiene el borrador manual 49698
--    D3.707.109 en 2405, que no entra) -> 28050501, asiento 'hotel_anticipos_2805:<org>[:n]' 2026-10-25 12:00 COT.
--    En prod solo org 2: -3.200.075 (asientos 424/425/426). OJO: es un saldo global, no queda atado a cada reserva;
--    el contador decide cómo aplicarlo (no lo libera ningún no-show/checkout automático).
-- Pendiente (no se toca aquí): fn_create_default_accounting_rules sigue sembrando las reglas viejas de reserva a
--    orgs NUEVAS; 134145 no corre para ellas.
-- Rollback: supabase/rollbacks/20261025134145_hoteles_anticipos_2805_rollback.sql
set constraints public.trg_chart_cuenta_titulo_configurada immediate;

create or replace function public.fn_reserva_anticipo(p_org integer, p_reserva uuid)
returns numeric language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select round(coalesce(sum(l.credit - l.debit), 0), 2)
    from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = p_org and e.posted is true and l.account_code = '28050501'
     and ((e.source = 'reservation' and e.source_id = p_reserva::text)
          or (e.source = 'folio_payment' and e.source_id in (
                select p.id::text from public.payments p join public.folios f on f.id::text = p.source_id::text
                 where p.source = 'folio' and f.reservation_id = p_reserva)));
$$;
revoke all on function public.fn_reserva_anticipo(integer, uuid) from public, anon;
grant execute on function public.fn_reserva_anticipo(integer, uuid) to authenticated;

-- Cartera de hoteles: la cuenta que DEBITAN los cargos de folio (folio_item/created); por defecto 1305.
create or replace function public.fn_reserva_cuenta_cartera(p_org integer)
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select r.debit_account_code from public.accounting_rules r
                    where r.organization_id = p_org and r.source_type = 'folio_item' and r.event_type = 'created'
                      and r.is_active and nullif(btrim(r.debit_account_code), '') is not null
                    order by r.priority, r.created_at limit 1), '1305')
$$;
revoke all on function public.fn_reserva_cuenta_cartera(integer) from public, anon, authenticated;

-- Cuenta de dinero de un pago (medio de pago): cuenta bancaria del pago o la del método; si no se puede
-- resolver, la cuenta genérica de la regla (que fn_reserva_cuenta_regla lleva a la caja de la sede).
create or replace function public.fn_reserva_cuenta_pago(p_org integer, p_branch integer, p_method text,
  p_bank_account_id integer, p_defecto text)
returns text language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v text;
begin
  begin
    v := public.fn_money_account_code_pago(p_org, nullif(p_branch, 0), p_method, p_bank_account_id);
  exception when others then
    v := null;
  end;
  return coalesce(nullif(btrim(v), ''), public.fn_reserva_cuenta_regla(p_org, p_branch, p_defecto));
end $$;
revoke all on function public.fn_reserva_cuenta_pago(integer, integer, text, integer, text) from public, anon, authenticated;

-- Cuenta de dinero por la que ENTRÓ el anticipo de una reserva (débito de su último asiento de anticipo).
create or replace function public.fn_reserva_cuenta_anticipo(p_org integer, p_reserva uuid)
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select l.account_code
    from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = p_org and e.posted is true and e.source = 'folio_payment'
     and l.debit > 0 and l.account_code <> '28050501'
     and e.source_id in (select p.id::text from public.payments p join public.folios f on f.id::text = p.source_id::text
                          where p.source = 'folio' and f.reservation_id = p_reserva)
     and exists (select 1 from public.journal_lines c where c.journal_entry_id = e.id and c.account_code = '28050501' and c.credit > 0)
   order by e.id desc limit 1
$$;
revoke all on function public.fn_reserva_cuenta_anticipo(integer, uuid) from public, anon, authenticated;

-- Cuenta de una regla de reserva: caja/banco genérica → caja de la sede.
create or replace function public.fn_reserva_cuenta_regla(p_org integer, p_branch integer, p_cuenta text)
returns text language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if p_cuenta in ('1105', '110505', '1110', '111005') then
    return coalesce(public.fn_cuenta_caja(p_org, nullif(p_branch, 0), null), p_cuenta);
  end if;
  return p_cuenta;
end $$;
revoke all on function public.fn_reserva_cuenta_regla(integer, integer, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_amount numeric;
    v_event_type text;
    v_description text;
    v_branch_id integer;
    v_anticipo numeric;
    v_penalidad numeric := 0;
BEGIN
    IF (NEW.status IS NOT DISTINCT FROM OLD.status) THEN
        RETURN NEW;
    END IF;
    v_branch_id := COALESCE(NEW.branch_id, 0);

    -- Hoteles con 28050501 de movimiento: reglas del contador (134145). Sin anticipo no hay asiento.
    IF EXISTS (SELECT 1 FROM chart_of_accounts a WHERE a.organization_id = NEW.organization_id
                 AND a.account_code = '28050501' AND a.es_movimiento IS NOT FALSE) THEN
        IF NEW.status::text NOT IN ('cancelled', 'no_show', 'checked_out') THEN
            RETURN NEW;   -- confirmada / tentativa / check-in: sin asiento
        END IF;
        v_anticipo := public.fn_reserva_anticipo(NEW.organization_id, NEW.id);
        IF v_anticipo <= 0 THEN
            RETURN NEW;
        END IF;
        IF NEW.status::text = 'cancelled' THEN
            IF coalesce(NEW.metadata->>'penalidad_retenida', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
                v_penalidad := least(v_anticipo, (NEW.metadata->>'penalidad_retenida')::numeric);
            END IF;
            IF v_penalidad > 0 THEN
                SELECT * INTO v_rule FROM accounting_rules
                 WHERE organization_id = NEW.organization_id AND source_type = 'reservation'
                   AND event_type = 'adjusted' AND is_active ORDER BY priority, created_at LIMIT 1;
                IF FOUND THEN
                    PERFORM fn_create_journal_entry(
                        p_organization_id := NEW.organization_id, p_branch_id := v_branch_id,
                        p_entry_date := COALESCE(NEW.updated_at, now()),
                        p_memo := 'Penalidad retenida Reserva ' || NEW.id::text,
                        p_source := 'reservation', p_source_id := NEW.id::text,
                        p_debit_account := fn_reserva_cuenta_regla(NEW.organization_id, v_branch_id, v_rule.debit_account_code),
                        p_credit_account := fn_reserva_cuenta_regla(NEW.organization_id, v_branch_id, v_rule.credit_account_code),
                        p_amount := v_penalidad);
                ELSE
                    v_penalidad := 0;
                END IF;
            END IF;
            v_event_type := 'cancelled';
            v_amount := v_anticipo - v_penalidad;
            v_description := 'Reembolso anticipo Reserva ' || NEW.id::text;
        ELSIF NEW.status::text = 'no_show' THEN
            v_event_type := 'no_show';
            v_amount := v_anticipo;
            v_description := 'Penalidad No-Show Reserva ' || NEW.id::text;
        ELSE
            v_event_type := 'completed';
            v_amount := v_anticipo;
            v_description := 'Aplicación anticipo al checkout Reserva ' || NEW.id::text;
        END IF;
        IF v_amount <= 0 THEN
            RETURN NEW;
        END IF;
        SELECT * INTO v_rule FROM accounting_rules
         WHERE organization_id = NEW.organization_id AND source_type = 'reservation'
           AND event_type = v_event_type AND is_active ORDER BY priority, created_at LIMIT 1;
        IF NOT FOUND THEN
            RETURN NEW;
        END IF;
        PERFORM fn_create_journal_entry(
            p_organization_id := NEW.organization_id, p_branch_id := v_branch_id,
            p_entry_date := COALESCE(NEW.updated_at, now()),
            p_memo := v_description,
            p_source := 'reservation', p_source_id := NEW.id::text,
            p_debit_account := fn_reserva_cuenta_regla(NEW.organization_id, v_branch_id, v_rule.debit_account_code),
            p_credit_account := CASE v_event_type
                -- ALTO: el checkout abona la MISMA cartera que debitan los cargos de folio.
                WHEN 'completed' THEN fn_reserva_cuenta_cartera(NEW.organization_id)
                -- MEDIO 1: el reembolso sale por la cuenta de dinero por la que entró el anticipo.
                WHEN 'cancelled' THEN COALESCE(fn_reserva_cuenta_anticipo(NEW.organization_id, NEW.id),
                                               fn_reserva_cuenta_regla(NEW.organization_id, v_branch_id, v_rule.credit_account_code))
                ELSE fn_reserva_cuenta_regla(NEW.organization_id, v_branch_id, v_rule.credit_account_code) END,
            p_amount := v_amount);
        RETURN NEW;
    END IF;

    -- Resto de orgs: comportamiento anterior sin cambios.
    v_event_type := CASE NEW.status
        WHEN 'confirmed' THEN 'confirmed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'no_show' THEN 'no_show'
        ELSE NULL
    END;
    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;
    v_amount := COALESCE(NEW.total_estimated, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'reservation'
      AND event_type = v_event_type
      AND is_active = true
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    v_description := CASE v_event_type
        WHEN 'confirmed' THEN 'Anticipo Reserva ' || NEW.id::text
        WHEN 'cancelled' THEN 'Reversa Cancelacion Reserva ' || NEW.id::text
        WHEN 'no_show' THEN 'Penalidad No-Show Reserva ' || NEW.id::text
    END;
    PERFORM fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := COALESCE(NEW.updated_at, now()),
        p_memo := v_description,
        p_source := 'reservation',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := v_amount
    );
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_folio_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_folio RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_source_id_uuid uuid;
    v_branch integer;
BEGIN
    IF NEW.source IS DISTINCT FROM 'folio' THEN
        RETURN NEW;
    END IF;
    v_amount := COALESCE(NEW.amount, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;
    BEGIN
        v_source_id_uuid := NEW.source_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;
    SELECT f.id, f.reservation_id INTO v_folio FROM folios f WHERE f.id = v_source_id_uuid LIMIT 1;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    SELECT r.organization_id, r.branch_id, r.status::text AS status INTO v_reservation
    FROM reservations r WHERE r.id = v_folio.reservation_id LIMIT 1;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    v_branch := COALESCE(v_reservation.branch_id, 0);

    -- 134145: pago antes del check-in de una reserva CONFIRMADA en hoteles con 28050501 = anticipo
-- (D cuenta del medio de pago C 28050501).
    IF v_reservation.status = 'confirmed'
       AND EXISTS (SELECT 1 FROM chart_of_accounts a WHERE a.organization_id = v_reservation.organization_id
                     AND a.account_code = '28050501' AND a.es_movimiento IS NOT FALSE) THEN
        SELECT * INTO v_rule FROM accounting_rules
         WHERE organization_id = v_reservation.organization_id AND source_type = 'reservation'
           AND event_type = 'received' AND is_active ORDER BY priority, created_at LIMIT 1;
        IF FOUND THEN
            PERFORM fn_create_journal_entry(
                p_organization_id := v_reservation.organization_id, p_branch_id := v_branch,
                p_entry_date := NEW.created_at,
                p_memo := 'Anticipo Reserva ' || v_folio.reservation_id::text || ' (folio ' || v_folio.id::text || ')',
                p_source := 'folio_payment', p_source_id := NEW.id::text,
                p_debit_account := fn_reserva_cuenta_pago(v_reservation.organization_id, v_branch, NEW.method,
                                                          NEW.bank_account_id, v_rule.debit_account_code),
                p_credit_account := fn_reserva_cuenta_regla(v_reservation.organization_id, v_branch, v_rule.credit_account_code),
                p_amount := v_amount,
                p_created_by := NEW.created_by);
            RETURN NEW;
        END IF;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_reservation.organization_id
      AND source_type = 'folio_payment'
      AND event_type = 'received'
      AND is_active = true
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    v_description := 'Pago Folio ' || v_folio.id::text;
    PERFORM fn_create_journal_entry(
        p_organization_id := v_reservation.organization_id,
        p_branch_id := v_branch,
        p_entry_date := NEW.created_at,
        p_memo := v_description,
        p_source := 'folio_payment',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := v_amount,
        p_created_by := NEW.created_by
    );
    RETURN NEW;
END;
$function$;

create or replace function pg_temp.h_log(p_org integer, p_obj text, p_clave text, p_campo text, p_ant text, p_nuevo text)
returns void language sql as $$
  insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
  values ('134145', p_org, p_obj, p_clave, p_campo, p_ant, p_nuevo);
$$;

create or replace function pg_temp.h_set(p_org integer, p_id uuid, p_campo text, p_ant text, p_nuevo text)
returns void language plpgsql as $$
begin
  if p_ant is not distinct from p_nuevo then return; end if;
  execute format('update public.accounting_rules set %I = $1, updated_at = now() where id = $2', p_campo) using p_nuevo, p_id;
  perform pg_temp.h_log(p_org, 'accounting_rules', p_id::text, p_campo, p_ant, p_nuevo);
end $$;

do $$
declare
  v_org integer;
  r record;
  c record;
  v_s numeric;
  v_n integer;
  v_fact text;
  v_branch integer;
  v_entry integer;
  v_id uuid;
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for v_org in select o.id from public.organizations o where o.type_id = 2
                  and exists (select 1 from public.chart_of_accounts a where a.organization_id = o.id
                                and a.account_code = '28050501' and a.es_movimiento is not false)
                order by 1 loop
    -- c. reglas existentes
    for r in select id, event_type et, debit_account_code d, credit_account_code cr, is_active from public.accounting_rules
              where organization_id = v_org and source_type = 'reservation' loop
      if r.et = 'confirmed' and r.is_active then
        update public.accounting_rules set is_active = false, updated_at = now() where id = r.id;
        perform pg_temp.h_log(v_org, 'accounting_rules', r.id::text, 'is_active', 'true', 'false');
      elsif r.et = 'cancelled' then
        perform pg_temp.h_set(v_org, r.id, 'debit_account_code', r.d, '28050501');
        perform pg_temp.h_set(v_org, r.id, 'credit_account_code', r.cr, '1105');
      elsif r.et = 'no_show' then
        perform pg_temp.h_set(v_org, r.id, 'debit_account_code', r.d, '28050501');
        perform pg_temp.h_set(v_org, r.id, 'credit_account_code', r.cr, '41409502');
      elsif r.et = 'completed' and r.cr = '13050501' then
        perform pg_temp.h_set(v_org, r.id, 'credit_account_code', r.cr, public.fn_reserva_cuenta_cartera(v_org));
      end if;
    end loop;

    -- c. reglas que faltan
    for c in select * from (values
        ('Anticipo de reserva', 'Pago antes del check-in: D caja/banco C anticipos', 'received', '1105', '28050501'),
        ('Reembolso de anticipo', 'Reserva cancelada con reembolso', 'cancelled', '28050501', '1105'),
        ('Penalidad retenida', 'Cancelación: penalidad retenida del anticipo', 'adjusted', '28050501', '41409502'),
        ('Reserva no presentada', 'El anticipo pasa al ingreso por no-show', 'no_show', '28050501', '41409502'),
        ('Anticipo aplicado al checkout', 'El anticipo abona la cartera del huésped', 'completed', '28050501', public.fn_reserva_cuenta_cartera(v_org))
      ) t(nombre, descr, et, d, cr) loop
      continue when exists (select 1 from public.accounting_rules where organization_id = v_org
                              and source_type = 'reservation' and event_type = c.et and is_active);
      continue when not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org
                                  and a.account_code = case when c.d = '1105' then c.cr when c.cr = '1105' then c.d
                                                            else c.cr end
                                  and a.es_movimiento is not false);
      insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
                                           debit_account_code, credit_account_code, is_active, priority)
      values (v_org, c.nombre, c.descr, 'reservation', c.et, c.d, c.cr, true, 32)
      returning id into v_id;
      perform pg_temp.h_log(v_org, 'accounting_rules_nueva', v_id::text, 'event_type', null, c.et);
    end loop;

    -- d. saldo de anticipos de reservas en 2405 (solo asientos CONTABILIZADOS)
    if exists (select 1 from public.journal_entries x where x.organization_id = v_org
                 and (x.fact_key = 'hotel_anticipos_2805:' || v_org or x.fact_key like 'hotel_anticipos_2805:' || v_org || ':%')
                 and not exists (select 1 from public.journal_entries rv where rv.organization_id = v_org
                                   and rv.fact_key = 'reversal:' || x.id)) then
      continue;
    end if;
    select round(coalesce(sum(l.debit - l.credit), 0), 2) into v_s
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = v_org and e.source = 'reservation' and e.posted is true and l.account_code = '2405';
    if v_s >= 0 then
      continue;
    end if;
    if not exists (select 1 from public.fiscal_periods fp where fp.organization_id = v_org and fp.period_type = 'monthly'
                     and fp.status = 'open' and date '2026-10-25' between fp.start_date and fp.end_date) then
      raise exception '134145: org % con octubre 2026 cerrado; abrir el período antes de aplicar', v_org;
    end if;
    select count(*) into v_n from public.journal_entries x where x.organization_id = v_org
       and (x.fact_key = 'hotel_anticipos_2805:' || v_org or x.fact_key like 'hotel_anticipos_2805:' || v_org || ':%');
    v_fact := 'hotel_anticipos_2805:' || v_org || case when v_n > 0 then ':' || v_n else '' end;
    select b.id into v_branch from public.branches b where b.organization_id = v_org order by b.is_main desc nulls last, b.id limit 1;
    insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key, created_at, updated_at)
    values (v_org, v_branch, '2026-10-25 12:00 America/Bogota'::timestamptz,
            'Reclasificación anticipos de reservas 2405 -> 28050501 (25-oct-2026)', true, 'reclasificacion_titulo',
            'anticipos_reservas', v_fact, now(), now())
    returning id into v_entry;
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id, debit_base, credit_base)
    values (v_entry, '2405', 'Anticipos de reservas a 28050501', -v_s, 0, v_org, -v_s, 0),
           (v_entry, '28050501', 'Anticipos de reservas desde 2405', 0, -v_s, v_org, 0, -v_s);
    perform pg_temp.h_log(v_org, 'journal_entries', v_entry::text, 'reclasificacion', null, v_fact);
    raise notice '134145: org % anticipos 2405 % -> 28050501 (asiento %)', v_org, v_s, v_entry;
  end loop;
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134145', 'hoteles_anticipos_2805', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
