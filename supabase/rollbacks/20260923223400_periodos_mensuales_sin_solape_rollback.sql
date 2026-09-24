-- Rollback de 20260923223400_periodos_mensuales_sin_solape.sql
--
-- No se recomienda: la versión anterior generaba meses que terminaban el 27
-- del mes siguiente y se solapaban. Si hace falta, se restaura la función tal
-- como estaba; las fechas corregidas de fiscal_periods NO se deshacen (volver
-- a solaparlas no tiene uso legítimo).

create or replace function public.fn_create_default_branch_and_period()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_year int;
    v_branch_id integer;
BEGIN
    v_year := EXTRACT(YEAR FROM public.fn_today_for_org(NEW.id))::int;

    IF NOT EXISTS (SELECT 1 FROM branches WHERE organization_id = NEW.id) THEN
        INSERT INTO branches (organization_id, name, branch_code, is_main, is_active, created_at, updated_at)
        VALUES (NEW.id, 'Sede Principal', 'MAIN', true, true, now(), now())
        RETURNING id INTO v_branch_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM fiscal_periods WHERE organization_id = NEW.id AND period_type = 'yearly' AND year = v_year) THEN
        INSERT INTO fiscal_periods (organization_id, year, period_type, start_date, end_date, status, created_at, updated_at)
        VALUES (NEW.id, v_year, 'yearly', make_date(v_year, 1, 1), make_date(v_year, 12, 31), 'open', now(), now());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM fiscal_periods WHERE organization_id = NEW.id AND period_type = 'monthly') THEN
        INSERT INTO fiscal_periods (organization_id, year, month, period_type, start_date, end_date, status, created_at, updated_at)
        SELECT NEW.id, v_year, m, 'monthly',
            make_date(v_year, m, 1),
            make_date(v_year, m, 28) + INTERVAL '1 month' - INTERVAL '1 day',
            'open', now(), now()
        FROM generate_series(1, 12) AS m;
    END IF;

    RETURN NEW;
END;
$function$;
