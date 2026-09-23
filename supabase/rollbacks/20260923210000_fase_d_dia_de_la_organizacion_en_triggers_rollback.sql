-- Reversion de 20260923210000_fase_d_dia_de_la_organizacion_en_triggers.sql
--
-- Devuelve los siete triggers a su cuerpo anterior, el que decide el dia
-- calendario con CURRENT_DATE (dia UTC). Se restaura tal cual estaba, incluido
-- el comentario de calculate_days_overdue que nombraba CURRENT_DATE.
-- Solo CREATE OR REPLACE: firma, volatilidad, SECURITY DEFINER/INVOKER,
-- search_path, owner y ACL se conservan solos.
--
-- Nota: aplicar esta reversion reintroduce el error "la fecha se muestra un dia
-- corrido" en cartera, cuotas, prestamos, contrataciones y periodos fiscales
-- para cualquier organizacion que no este en UTC.

CREATE OR REPLACE FUNCTION public.calculate_days_overdue()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_today date;
BEGIN
  -- Calcular dias de atraso si hay fecha de vencimiento y balance pendiente
  IF NEW.due_date IS NOT NULL AND NEW.balance > 0 THEN
    -- Obtener hoy en la zona horaria de la organizacion (no CURRENT_DATE que es UTC)
    v_today := public.fn_today_for_org(NEW.organization_id);

    -- Calcular dias de atraso (solo si esta vencida)
    IF NEW.due_date::date < v_today THEN
      NEW.days_overdue := (v_today - NEW.due_date::date)::integer;

      -- Actualizar status si es necesario
      IF NEW.status = 'current' THEN
        NEW.status := 'overdue';
      END IF;
    ELSE
      -- Si no esta vencida, dias de atraso = 0
      NEW.days_overdue := 0;

      -- Si esta pagada parcialmente, mantener status 'partial'
      -- Si no tiene pagos, mantener 'current'
      IF NEW.status = 'overdue' AND NEW.balance = NEW.amount THEN
        NEW.status := 'current';
      END IF;
    END IF;
  ELSE
    -- Si no hay balance pendiente o no hay fecha de vencimiento
    NEW.days_overdue := 0;

    -- Si balance es 0, marcar como pagada
    IF NEW.balance = 0 THEN
      NEW.status := 'paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ar_installments_before_save()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();

    -- Calcular días de atraso
    IF NEW.status IN ('pending', 'partial', 'overdue') AND NEW.due_date < CURRENT_DATE THEN
        NEW.days_overdue := (CURRENT_DATE - NEW.due_date)::INTEGER;
    ELSE
        NEW.days_overdue := 0;
    END IF;

    -- Actualizar status basado en pagos y fecha
    IF NEW.paid_amount >= NEW.amount THEN
        NEW.status := 'paid';
        NEW.balance := 0;
        NEW.paid_at := COALESCE(NEW.paid_at, now());
        NEW.days_overdue := 0;
    ELSIF NEW.paid_amount > 0 THEN
        NEW.status := CASE WHEN NEW.due_date < CURRENT_DATE THEN 'overdue' ELSE 'partial' END;
        NEW.balance := NEW.amount - NEW.paid_amount;
    ELSIF NEW.due_date < CURRENT_DATE AND NEW.status = 'pending' THEN
        NEW.status := 'overdue';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hrm_generate_loan_installments()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_installment_date date;
  i int;
BEGIN
  -- Solo procesar si se aprobó el préstamo
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    -- Generar las cuotas
    v_installment_date := COALESCE(NEW.first_payment_date, CURRENT_DATE + INTERVAL '1 month');

    FOR i IN 1..NEW.installments_total LOOP
      INSERT INTO loan_installments (
        loan_id, installment_number, due_date, amount,
        principal_portion, interest_portion, status
      ) VALUES (
        NEW.id,
        i,
        v_installment_date,
        NEW.installment_amount,
        NEW.principal / NEW.installments_total,
        NEW.total_interest / NEW.installments_total,
        'pending'
      );

      -- Siguiente mes
      v_installment_date := v_installment_date + INTERVAL '1 month';
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hrm_update_loan_on_installment_payment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total_paid numeric;
  v_installments_paid int;
BEGIN
  -- Solo procesar si se marcó como pagada
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Calcular total pagado y cuotas pagadas
    SELECT
      COALESCE(SUM(amount_paid), 0),
      COUNT(*) FILTER (WHERE status = 'paid')
    INTO v_total_paid, v_installments_paid
    FROM loan_installments
    WHERE loan_id = NEW.loan_id;

    -- Actualizar préstamo
    UPDATE employee_loans
    SET
      balance = total_amount - v_total_paid,
      installments_paid = v_installments_paid,
      last_payment_date = CURRENT_DATE,
      status = CASE
        WHEN total_amount - v_total_paid <= 0 THEN 'paid'
        ELSE status
      END,
      updated_at = now()
    WHERE id = NEW.loan_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_employment_for_new_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_branch_id INTEGER;
BEGIN
  -- Solo crear employment si no existe uno para este member
  IF NOT EXISTS (
    SELECT 1 FROM employments
    WHERE organization_member_id = NEW.id
  ) THEN

    -- Resolver branch_id en orden de prioridad:
    -- 1. Asignacion explicita en member_branches (si ya existe)
    SELECT mb.branch_id INTO v_branch_id
    FROM member_branches mb
    WHERE mb.organization_member_id = NEW.id
    ORDER BY mb.id ASC
    LIMIT 1;

    -- 2. Sucursal principal de la organizacion (fallback robusto)
    IF v_branch_id IS NULL THEN
      SELECT b.id INTO v_branch_id
      FROM branches b
      WHERE b.organization_id = NEW.organization_id
        AND b.is_main = true
        AND b.is_active = true
      LIMIT 1;
    END IF;

    INSERT INTO employments (
      organization_member_id,
      status,
      hire_date,
      employment_type,
      contract_type,
      work_location,
      work_hours_per_week,
      currency_code,
      salary_period,
      branch_id
    ) VALUES (
      NEW.id,
      'active',
      CURRENT_DATE,
      'employee',
      'indefinite',
      'onsite',
      48,
      'COP',
      'monthly',
      v_branch_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_create_default_branch_and_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
    v_branch_id integer;
BEGIN
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

    -- Crear periodos mensuales
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

CREATE OR REPLACE FUNCTION public.fn_create_default_org_structure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_min_wage NUMERIC := 1300000; -- Default (Colombia 2024)
  v_currency CHAR(3) := 'COP';
  v_country_code VARCHAR(3);
  v_dept_id UUID;
  v_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
BEGIN
  -- Obtener country_code de la organización
  v_country_code := COALESCE(NEW.country_code, 'CO');

  -- Buscar salario mínimo del país para el año actual
  SELECT minimum_wage, minimum_wage_currency
  INTO v_min_wage, v_currency
  FROM country_payroll_rules
  WHERE country_code = v_country_code
    AND year = v_year
    AND is_active = true
  LIMIT 1;

  -- Si no hay datos del año actual, buscar el más reciente
  IF v_min_wage IS NULL THEN
    SELECT minimum_wage, minimum_wage_currency
    INTO v_min_wage, v_currency
    FROM country_payroll_rules
    WHERE country_code = v_country_code
      AND is_active = true
    ORDER BY year DESC
    LIMIT 1;
  END IF;

  -- Default si no hay datos del país
  IF v_min_wage IS NULL THEN
    v_min_wage := 1300000;
    v_currency := 'COP';
  END IF;

  -- ==================== DEPARTAMENTOS ====================

  -- Administración
  INSERT INTO departments (organization_id, code, name, description, is_active, metadata)
  VALUES (NEW.id, 'ADM', 'Administración', 'Gestión administrativa y recursos humanos', true,
          jsonb_build_object('is_default', true, 'sort_order', 1))
  RETURNING id INTO v_dept_id;

  -- Posiciones de Administración
  INSERT INTO job_positions (organization_id, department_id, code, name, description, level, min_salary, max_salary, is_active)
  VALUES
    (NEW.id, v_dept_id, 'GER-GENERAL', 'Gerente General', 'Dirección general de la empresa', 'executive', v_min_wage * 5, v_min_wage * 10, true),
    (NEW.id, v_dept_id, 'ASIST-ADM', 'Asistente Administrativo', 'Apoyo administrativo general', 'junior', v_min_wage * 1, v_min_wage * 1.5, true),
    (NEW.id, v_dept_id, 'RECEP', 'Recepcionista', 'Atención al público y llamadas', 'junior', v_min_wage * 1, v_min_wage * 1.3, true),
    (NEW.id, v_dept_id, 'COORD-RRHH', 'Coordinador de RRHH', 'Gestión de recursos humanos', 'mid', v_min_wage * 2, v_min_wage * 3.5, true);

  -- Finanzas
  INSERT INTO departments (organization_id, code, name, description, is_active, metadata)
  VALUES (NEW.id, 'FIN', 'Finanzas', 'Contabilidad, tesorería y finanzas', true,
          jsonb_build_object('is_default', true, 'sort_order', 2))
  RETURNING id INTO v_dept_id;

  INSERT INTO job_positions (organization_id, department_id, code, name, description, level, min_salary, max_salary, is_active)
  VALUES
    (NEW.id, v_dept_id, 'CONTADOR', 'Contador', 'Gestión contable y tributaria', 'senior', v_min_wage * 2.5, v_min_wage * 4, true),
    (NEW.id, v_dept_id, 'AUX-CONT', 'Auxiliar Contable', 'Apoyo en procesos contables', 'junior', v_min_wage * 1, v_min_wage * 1.5, true),
    (NEW.id, v_dept_id, 'TESORERO', 'Tesorero', 'Gestión de caja y bancos', 'mid', v_min_wage * 2, v_min_wage * 3, true);

  -- Ventas
  INSERT INTO departments (organization_id, code, name, description, is_active, metadata)
  VALUES (NEW.id, 'VEN', 'Ventas', 'Gestión comercial y ventas', true,
          jsonb_build_object('is_default', true, 'sort_order', 3))
  RETURNING id INTO v_dept_id;

  INSERT INTO job_positions (organization_id, department_id, code, name, description, level, min_salary, max_salary, is_active)
  VALUES
    (NEW.id, v_dept_id, 'DIR-COMERCIAL', 'Director Comercial', 'Dirección del área comercial', 'senior', v_min_wage * 4, v_min_wage * 7, true),
    (NEW.id, v_dept_id, 'VENDEDOR', 'Vendedor', 'Atención y cierre de ventas', 'junior', v_min_wage * 1, v_min_wage * 1.5, true),
    (NEW.id, v_dept_id, 'COORD-VEN', 'Coordinador de Ventas', 'Supervisión del equipo de ventas', 'mid', v_min_wage * 2, v_min_wage * 3, true);

  -- Operaciones
  INSERT INTO departments (organization_id, code, name, description, is_active, metadata)
  VALUES (NEW.id, 'OPE', 'Operaciones', 'Operaciones, logística y producción', true,
          jsonb_build_object('is_default', true, 'sort_order', 4))
  RETURNING id INTO v_dept_id;

  INSERT INTO job_positions (organization_id, department_id, code, name, description, level, min_salary, max_salary, is_active)
  VALUES
    (NEW.id, v_dept_id, 'JEF-OPE', 'Jefe de Operaciones', 'Supervisión de operaciones', 'senior', v_min_wage * 3, v_min_wage * 5, true),
    (NEW.id, v_dept_id, 'OPERARIO', 'Operario', 'Trabajo operativo general', 'junior', v_min_wage * 1, v_min_wage * 1.3, true),
    (NEW.id, v_dept_id, 'SUP-OPE', 'Supervisor de Operaciones', 'Supervisión de equipos operativos', 'mid', v_min_wage * 1.5, v_min_wage * 2.5, true);

  -- Tecnología
  INSERT INTO departments (organization_id, code, name, description, is_active, metadata)
  VALUES (NEW.id, 'TEC', 'Tecnología', 'Sistemas, desarrollo y soporte técnico', true,
          jsonb_build_object('is_default', true, 'sort_order', 5))
  RETURNING id INTO v_dept_id;

  INSERT INTO job_positions (organization_id, department_id, code, name, description, level, min_salary, max_salary, is_active)
  VALUES
    (NEW.id, v_dept_id, 'DIR-TEC', 'Director de Tecnología', 'Dirección del área de TI', 'executive', v_min_wage * 5, v_min_wage * 8, true),
    (NEW.id, v_dept_id, 'DEV-JR', 'Desarrollador Junior', 'Desarrollo de software nivel inicial', 'junior', v_min_wage * 1.5, v_min_wage * 2.5, true),
    (NEW.id, v_dept_id, 'DEV-SR', 'Desarrollador Senior', 'Desarrollo de software nivel avanzado', 'senior', v_min_wage * 3, v_min_wage * 5, true),
    (NEW.id, v_dept_id, 'SOP-TEC', 'Soporte Técnico', 'Soporte y mantenimiento de sistemas', 'junior', v_min_wage * 1, v_min_wage * 1.8, true);

  -- Gimnasio (si aplica - módulo GYM)
  INSERT INTO departments (organization_id, code, name, description, is_active, metadata)
  VALUES (NEW.id, 'GYM', 'Gimnasio', 'Instructores y personal de gimnasio', true,
          jsonb_build_object('is_default', true, 'sort_order', 10, 'module', 'gym', 'allows_hourly_payment', true))
  RETURNING id INTO v_dept_id;

  INSERT INTO job_positions (organization_id, department_id, code, name, description, level, min_salary, max_salary, requirements, is_active)
  VALUES
    (NEW.id, v_dept_id, 'INST-GENERAL', 'Instructor General', 'Instructor multidisciplinario', 'junior',
     v_min_wage * 0.015, v_min_wage * 0.025,
     jsonb_build_object('specialties', ARRAY['general'], 'hourly_rate_suggested', v_min_wage * 0.015), true),
    (NEW.id, v_dept_id, 'INST-YOGA', 'Instructor de Yoga', 'Instructor especializado en yoga', 'junior',
     v_min_wage * 0.018, v_min_wage * 0.030,
     jsonb_build_object('specialties', ARRAY['hatha', 'vinyasa'], 'certifications', ARRAY['RYT-200'], 'hourly_rate_suggested', v_min_wage * 0.018), true),
    (NEW.id, v_dept_id, 'INST-FUNCIONAL', 'Instructor Funcional', 'Entrenamiento funcional y CrossFit', 'junior',
     v_min_wage * 0.020, v_min_wage * 0.035,
     jsonb_build_object('specialties', ARRAY['functional', 'crossfit'], 'certifications', ARRAY['CPT'], 'hourly_rate_suggested', v_min_wage * 0.020), true),
    (NEW.id, v_dept_id, 'COORD-GYM', 'Coordinador de Gimnasio', 'Coordinación del área de gimnasio', 'mid',
     v_min_wage * 2, v_min_wage * 3.5, '{}'::jsonb, true);

  RETURN NEW;
END;
$function$;
