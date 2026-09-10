-- Rollback de 20260909210000_unify_customers_branch_default_with_fase9.
--
-- Restaura fn_auto_assign_customer_branch() y su trigger, y quita
-- trg_branch_default de customers. Definicion identica a la que estaba en
-- produccion antes del cambio (migracion 20260908062907_auto_assign_branch_id_customers).
--
-- No modifica ninguna fila existente: solo revierte el comportamiento en INSERT.

DROP TRIGGER IF EXISTS trg_branch_default ON public.customers;

CREATE OR REPLACE FUNCTION public.fn_auto_assign_customer_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT id INTO NEW.branch_id FROM branches
    WHERE organization_id = NEW.organization_id AND is_main = true
    LIMIT 1;
    IF NEW.branch_id IS NULL THEN
      SELECT id INTO NEW.branch_id FROM branches
      WHERE organization_id = NEW.organization_id AND is_active = true
      ORDER BY id LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_assign_customer_branch ON public.customers;
CREATE TRIGGER trg_auto_assign_customer_branch
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_assign_customer_branch();
