-- GO-contabilidad · El cierre automático de caja deja de llevar sobrantes y faltantes a ventas.
-- Contador 2026-11-25:
--   «Las cuentas de ajuste al peso: no las renombres, porque son otra cosa y pueden tener movimiento.
--    Crea dos nuevas, la 42958102 "Sobrantes de caja" y la 53959502 "Faltantes de caja", y usa esas
--    en el cierre de caja de ahora en adelante.»
--
-- ANTES (fn_auto_journal_cash_session, disparador trg_auto_journal_cash_session en cash_sessions):
--   al cerrar con diferencia tomaba la regla 'cash_movement' de la organización (1105 / 41359501,
--   o el ingreso del sector: 41559501, 41400501, 414015…) y hacía
--     sobrante: Dr caja / Cr la cuenta de VENTAS de la regla
--     faltante: Dr la cuenta de VENTAS de la regla / Cr caja
--   ⇒ un sobrante inflaba las ventas y un faltante las restaba. En la org 377 los dos sobrantes
--   (374.450 y 50.100) quedaron en la 41359501.
-- AHORA:
--     sobrante: Dr caja (débito de la regla) / Cr 42958102 «Sobrantes de caja»
--     faltante: Dr 53959502 «Faltantes de caja» / Cr caja
--   Las dos cuentas se aseguran por organización en el momento del cierre con fn_puc_asegurar_cuenta
--   (el mismo mecanismo de siembra del plan: crea la cadena 4 → 42 → 4295 → 429581 si falta, hereda
--   tipo, naturaleza y centro de costo por clase). No se renombran ni se tocan 42958101 «Ajuste al
--   peso a favor» ni 53959501 «Ajuste al peso en contra». La caja no lleva centro de costo
--   (p_cuenta_sin_centro); la 53959502, como toda cuenta de gasto de movimiento, sí.
--   Si la cuenta no se puede asegurar, el cierre NO se bloquea: el asiento queda en
--   fn_log_journal_failure (motivo 'cuenta_sobrante_faltante') para reintentarlo, igual que 'no_rule'.
-- No toca asientos pasados. Firma, SECURITY DEFINER, search_path, permisos y disparador no cambian
-- (CREATE OR REPLACE conserva el ACL).
--
-- Además crea ya las dos cuentas en la org 377 (la que pidió el cambio); el resto de organizaciones
-- las recibe en su primer cierre con diferencia. Hoy ninguna organización tiene 42958102 ni 53959502.
--
-- Reversión: supabase/rollbacks/20261126040000_cierre_caja_sobrantes_faltantes_rollback.sql

create or replace function public.fn_auto_journal_cash_session()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_diff numeric;
    v_caja text;
    v_contra text;
BEGIN
    -- Solo cuando se cierra la sesión
    IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
        v_diff := COALESCE(NEW.difference, COALESCE(NEW.final_amount, 0) - COALESCE(NEW.initial_amount, 0));

        IF v_diff = 0 THEN
            RETURN NEW;
        END IF;

        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'cash_movement'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
        END IF;

        -- Sobrantes y faltantes de caja (Contador 2026-11-25, 20261126040000): nunca a ventas ni al
        -- ajuste al peso. La caja es el débito de la regla 'cash_movement'.
        v_caja := v_rule.debit_account_code;
        BEGIN
            v_contra := public.fn_puc_asegurar_cuenta(
                NEW.organization_id,
                CASE WHEN v_diff > 0 THEN '42958102' ELSE '53959502' END,
                CASE WHEN v_diff > 0 THEN 'Sobrantes de caja' ELSE 'Faltantes de caja' END,
                true
            );
        EXCEPTION WHEN others THEN
            v_contra := NULL;
        END;

        IF v_contra IS NULL OR v_caja IS NULL THEN
            PERFORM fn_log_journal_failure(NEW.organization_id, NEW.branch_id, COALESCE(NEW.closed_at, now()),
                TG_TABLE_NAME, NEW.id::text, NULL,
                CASE WHEN v_diff > 0 THEN v_caja ELSE '53959502' END,
                CASE WHEN v_diff > 0 THEN '42958102' ELSE v_caja END,
                ABS(v_diff), 'cuenta_sobrante_faltante',
                'No se pudo asegurar la cuenta de ' || CASE WHEN v_diff > 0 THEN 'sobrantes (42958102)' ELSE 'faltantes (53959502)' END
                  || ' o la regla no trae cuenta de caja');
            RETURN NEW;
        END IF;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := COALESCE(NEW.branch_id, 0),
            p_entry_date := COALESCE(NEW.closed_at, now()),
            p_memo := 'Cierre de Caja - Sesión ' || NEW.id::text
                      || CASE WHEN v_diff > 0 THEN ' · sobrante' ELSE ' · faltante' END,
            p_source := 'cash_sessions',
            p_source_id := NEW.id::text,
            p_debit_account := CASE WHEN v_diff > 0 THEN v_caja ELSE v_contra END,
            p_credit_account := CASE WHEN v_diff > 0 THEN v_contra ELSE v_caja END,
            p_amount := ABS(v_diff),
            p_cuenta_sin_centro := v_caja
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- Las dos cuentas en la org 377, ya (su próximo cierre con diferencia las usaría de todos modos).
DO $cuentas_377$
begin
  if exists (select 1 from public.organizations where id = 377) then
    perform public.fn_puc_asegurar_cuenta(377, '42958102', 'Sobrantes de caja', true);
    perform public.fn_puc_asegurar_cuenta(377, '53959502', 'Faltantes de caja', true);
    if (select count(*) from public.chart_of_accounts
         where organization_id = 377 and account_code in ('42958102', '53959502')
           and es_movimiento is true and is_active is true) <> 2 then
      raise exception 'CUENTAS_377: no quedaron 42958102 y 53959502 de movimiento en la org 377';
    end if;
  end if;
end
$cuentas_377$;
