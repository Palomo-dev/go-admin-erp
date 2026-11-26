-- Reversión de 20261126040000_cierre_caja_sobrantes_faltantes.sql
--
-- 1. fn_auto_journal_cash_session vuelve EXACTAMENTE a la versión anterior (sobrante Dr caja /
--    Cr la cuenta de ventas de la regla 'cash_movement'; faltante al revés). Volver a esa versión
--    reintroduce el error que el Contador pidió corregir: hacerlo solo si la nueva falla.
--    Cuerpo verificado contra la función viva antes de aplicar: md5(prosrc) d980cf87424afeb5ee43ba4c5a83063d.
-- 2. Quita 42958102 «Sobrantes de caja» y 53959502 «Faltantes de caja» de las organizaciones donde
--    NO tienen movimientos (antes de esta migración no existían en ninguna). Donde ya tienen
--    asientos se conservan: esta reversión NO borra ni reclasifica asientos de cierres hechos con la
--    versión nueva; si hiciera falta, se reclasifican con una nota contable.

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

        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := COALESCE(NEW.branch_id, 0),
            p_entry_date := COALESCE(NEW.closed_at, now()),
            p_memo := 'Cierre de Caja - Sesión ' || NEW.id::text,
            p_source := 'cash_sessions',
            p_source_id := NEW.id::text,
            p_debit_account := CASE WHEN v_diff > 0 THEN v_rule.debit_account_code ELSE v_rule.credit_account_code END,
            p_credit_account := CASE WHEN v_diff > 0 THEN v_rule.credit_account_code ELSE v_rule.debit_account_code END,
            p_amount := ABS(v_diff)
        );
    END IF;

    RETURN NEW;
END;
$function$;

DO $quitar_cuentas$
declare
  v_n integer;
begin
  delete from public.chart_of_accounts c
   where c.account_code in ('42958102', '53959502')
     and not exists (select 1 from public.journal_lines l
                       join public.journal_entries e on e.id = l.journal_entry_id
                      where e.organization_id = c.organization_id and l.account_code = c.account_code)
     and not exists (select 1 from public.chart_of_accounts h
                      where h.organization_id = c.organization_id and h.parent_code = c.account_code);
  get diagnostics v_n = row_count;
  raise notice 'Cuentas 42958102/53959502 sin movimientos quitadas: %', v_n;
end
$quitar_cuentas$;
