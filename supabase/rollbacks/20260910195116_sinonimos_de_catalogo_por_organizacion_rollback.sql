-- Reversion de 20260910195116_sinonimos_de_catalogo_por_organizacion
--
-- ATENCION: esto BORRA los sinonimos que el comerciante haya escrito a mano
-- (`org_sinonimos.origen = 'manual'`). No hay forma de recuperarlos despues.
-- Si solo quieres desactivar el efecto sin perder el trabajo del inquilino,
-- revierte antes 20260910195143 (que devuelve `palabras_de_catalogo` a su
-- version sin sinonimos) y deja estas tablas en pie.

drop table if exists public.org_sinonimos;
drop table if exists public.sinonimos_base;
