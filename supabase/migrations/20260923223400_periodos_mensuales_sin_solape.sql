-- ADR-CC-012 · Periodos mensuales que no se solapan
--
-- fn_create_default_branch_and_period calculaba el fin de mes como
-- make_date(año, mes, 28) + 1 mes − 1 día, que cae el 27 del mes siguiente:
-- agosto iba del 1 de agosto al 27 de septiembre. 996 de 1.020 periodos
-- mensuales (83 organizaciones) quedaron así. Como fn_is_period_open toma
-- cualquiera de los periodos que contienen la fecha, cerrar agosto habría
-- cerrado también casi todo septiembre. Ninguno está cerrado todavía (todos
-- 'open'), así que corregir las fechas no cambia nada ya contabilizado.

create or replace function public.fn_create_default_branch_and_period()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_year int;
    v_branch_id integer;
BEGIN
    -- Anio calendario de la organizacion, no el del reloj UTC del servidor
    v_year := EXTRACT(YEAR FROM public.fn_today_for_org(NEW.id))::int;

    -- Crear branch principal si no existe
    IF NOT EXISTS (SELECT 1 FROM branches WHERE organization_id = NEW.id) THEN
        INSERT INTO branches (organization_id, name, branch_code, is_main, is_active, created_at, updated_at)
        VALUES (NEW.id, 'Sede Principal', 'MAIN', true, true, now(), now())
        RETURNING id INTO v_branch_id;
    END IF;

    -- Crear periodo fiscal anual si no existe
    IF NOT EXISTS (SELECT 1 FROM fiscal_periods WHERE organization_id = NEW.id AND period_type = 'yearly' AND year = v_year) THEN
        INSERT INTO fiscal_periods (organization_id, year, period_type, start_date, end_date, status, created_at, updated_at)
        VALUES (NEW.id, v_year, 'yearly', make_date(v_year, 1, 1), make_date(v_year, 12, 31), 'open', now(), now());
    END IF;

    -- Crear periodos mensuales: del día 1 al último día del mismo mes
    IF NOT EXISTS (SELECT 1 FROM fiscal_periods WHERE organization_id = NEW.id AND period_type = 'monthly') THEN
        INSERT INTO fiscal_periods (organization_id, year, month, period_type, start_date, end_date, status, created_at, updated_at)
        SELECT NEW.id, v_year, m, 'monthly',
            make_date(v_year, m, 1),
            (make_date(v_year, m, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date,
            'open', now(), now()
        FROM generate_series(1, 12) AS m;
    END IF;

    RETURN NEW;
END;
$function$;

update public.fiscal_periods
   set end_date = (date_trunc('month', start_date) + interval '1 month - 1 day')::date,
       updated_at = now()
 where period_type = 'monthly'
   and status = 'open'
   and end_date <> (date_trunc('month', start_date) + interval '1 month - 1 day')::date;
