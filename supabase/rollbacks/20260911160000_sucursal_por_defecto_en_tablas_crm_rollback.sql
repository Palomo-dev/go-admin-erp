-- ============================================================
-- ROLLBACK de 20260911160000_sucursal_por_defecto_en_tablas_crm
-- ============================================================
-- Quita los cuatro triggers y las dos funciones, y devuelve a NULL la sucursal
-- de las filas que la migración (o el trigger después) asignó.
--
-- SOBRE LOS DATOS: este rollback SÍ revierte los datos, y puede hacerlo con
-- exactitud por una razón medida antes de aplicar: el 100 % de las filas de
-- las cuatro tablas tenía `branch_id` NULL, es decir, NINGÚN escritor de
-- código ponía sucursal en ellas. Por tanto, toda fila cuya sucursal sea la
-- principal de su organización la recibió de esta regla —del backfill o del
-- trigger— y devolverla a NULL restaura el estado anterior con fidelidad.
--
-- Si en el futuro algún escritor de código empieza a poner `branch_id` por su
-- cuenta en estas tablas, esta afirmación deja de ser exacta y el rollback
-- anularía también esas filas. Revisar antes de ejecutar.
--
-- Al revertir, las vistas que filtran por sucursal vuelven a salir vacías para
-- cualquier organización con una sucursal seleccionada (el defecto original),
-- salvo donde el código use `applyBranchFilterInclusive`, que las sigue
-- mostrando.
-- ============================================================

DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.opportunities;
DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.conversations;
DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.messages;
DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.activities;

-- Datos: solo las filas cuya sucursal es la principal de su organización
-- (ver justificación arriba). Se hace ANTES de borrar la función que la resuelve.
UPDATE public.opportunities o SET branch_id = NULL
 WHERE o.branch_id IS NOT NULL AND o.branch_id = public.fn_org_main_branch(o.organization_id);

UPDATE public.conversations c SET branch_id = NULL
 WHERE c.branch_id IS NOT NULL AND c.branch_id = public.fn_org_main_branch(c.organization_id);

UPDATE public.messages m SET branch_id = NULL
 WHERE m.branch_id IS NOT NULL AND m.branch_id = public.fn_org_main_branch(m.organization_id);

UPDATE public.activities a SET branch_id = NULL
 WHERE a.branch_id IS NOT NULL AND a.branch_id = public.fn_org_main_branch(a.organization_id);

DROP FUNCTION IF EXISTS public.fn_set_branch_from_org();
DROP FUNCTION IF EXISTS public.fn_org_main_branch(integer);
