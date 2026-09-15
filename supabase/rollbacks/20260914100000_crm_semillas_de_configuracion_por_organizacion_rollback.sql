-- ============================================================
-- ROLLBACK de 20260914100000_crm_semillas_de_configuracion_por_organizacion
-- ============================================================
-- Quita el trigger de siembra automática y las dos funciones.
--
-- SOBRE LOS DATOS: este rollback NO borra las filas sembradas, a propósito.
-- Las semillas son configuración editable por cada organización desde el
-- momento en que existen: una organización puede haber renombrado una vertical,
-- ajustado un perfil ICP o cambiado un umbral de scoring, y borrar «lo que
-- sembró la migración» borraría también esos cambios. No hay forma exacta de
-- distinguir una fila sembrada intacta de una editada sin una marca que las
-- tablas no tienen.
--
-- Si de verdad hay que retirar las semillas de una organización concreta, se
-- hace a mano y por tabla, con su id, revisando antes qué modificó.
--
-- Efecto de revertir: las organizaciones que activen el CRM a partir de ahora
-- volverán a nacer con las tablas de configuración vacías (el defecto original
-- documentado en ANEXO-C §6).
-- ============================================================

DROP TRIGGER IF EXISTS trg_crm_module_activated_seed ON public.organization_modules;
DROP FUNCTION IF EXISTS public.fn_on_crm_module_activated();
DROP FUNCTION IF EXISTS public.fn_crm_seed_defaults(integer);
