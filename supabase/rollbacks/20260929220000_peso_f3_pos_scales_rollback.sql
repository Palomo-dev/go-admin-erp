-- Reversión de 20260929220000_peso_f3_pos_scales.
-- Revertir antes 20260929220200 (parche de fn_pos_validar_pesaje) y
-- 20260929220100 (RPC), que dependen de esta tabla.
-- OJO: borra la configuración de las básculas (no restaura datos). Las ventas
-- conservan su notes.pesaje con el bascula_id, que queda sin fila a la que apuntar.

drop table if exists public.pos_scales;
