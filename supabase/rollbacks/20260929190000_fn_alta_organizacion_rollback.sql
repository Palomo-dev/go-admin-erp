-- Rollback de 20260929190000_fn_alta_organizacion.sql.
-- Quita la RPC del alta de organización. El código que la llama
-- (src/lib/services/altaOrganizacionService.ts) debe revertirse antes: sin la
-- función, crear una organización falla. No toca datos: las organizaciones
-- creadas con ella se quedan como están.
drop function if exists public.fn_alta_organizacion(jsonb);
