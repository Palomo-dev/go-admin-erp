-- Unifica el default de branch_id en customers con la Fase 9 multi-sucursal.
--
-- Hasta ahora customers usaba fn_auto_assign_customer_branch(), una funcion
-- aparte que solo consideraba is_main y la primera sucursal activa, ignorando
-- member_branches. Eso provocaba que un usuario asignado unicamente a la
-- sucursal B creara clientes en la sucursal principal, mientras sus reservas
-- (que si usan fn_branch_set_default) caian correctamente en B.
--
-- fn_branch_set_default() aplica la prioridad documentada en la Fase 9:
--   1) sucursal asignada unica del usuario (member_branches)
--   2) sucursal principal (is_main = true)
--   3) primera sucursal de la organizacion
--
-- Desde el sitio publico se escribe con service_role, donde auth.uid() es NULL
-- y el paso 1 nunca aplica: el comportamiento observable para clientes creados
-- desde la web sigue siendo is_main, igual que antes de este cambio.

DROP TRIGGER IF EXISTS trg_auto_assign_customer_branch ON public.customers;
DROP FUNCTION IF EXISTS public.fn_auto_assign_customer_branch();

DROP TRIGGER IF EXISTS trg_branch_default ON public.customers;
CREATE TRIGGER trg_branch_default
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_branch_set_default();
