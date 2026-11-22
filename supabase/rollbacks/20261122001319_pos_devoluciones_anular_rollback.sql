-- Rollback de 20261122001319_pos_devoluciones_anular.
--
-- Quita las dos funciones de «Anular devolución» y las tres columnas de
-- auditoría de returns. ADVERTENCIA: no revierte datos. Las devoluciones ya
-- anuladas siguen en 'cancelled' con sus asientos espejo, el ingreso de caja,
-- la salida de kardex y la nota crédito anulada; al borrar las columnas se
-- pierde quién, cuándo y por qué (queda en finance_audit_log, entity
-- 'returns', action 'void').

drop function if exists public.fn_devolucion_anular(integer, integer, text, text);
drop function if exists public.fn_devolucion_anulacion_estado(integer, integer);

alter table public.returns drop column if exists void_reason;
alter table public.returns drop column if exists voided_by;
alter table public.returns drop column if exists voided_at;
