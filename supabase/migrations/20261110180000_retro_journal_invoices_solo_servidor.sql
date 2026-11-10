-- Seguridad · fn_retro_journal_invoices deja de poder ejecutarla un usuario con sesión.
--
-- ESTADO: ESCRITA, NO APLICADA (20261110180000). Se aplica por el MCP cuando el dueño lo ordene. No depende de ninguna
-- otra migración. Reversión: supabase/rollbacks/20261110180000_retro_journal_invoices_solo_servidor_rollback.sql.
--
-- El riesgo. public.fn_retro_journal_invoices() es SECURITY DEFINER, no fija search_path y no tiene ninguna guarda de
-- organización: recorre las facturas de venta de TODAS las organizaciones que no tienen asiento y les crea el asiento
-- con la regla contable de cada una. A 2026-11-10 (SELECT por el MCP) la puede ejecutar authenticated (y service_role
-- y postgres; anon ya no). Cualquier usuario con sesión de cualquier organización podía, por /rest/v1/rpc, publicar
-- asientos en los libros de las demás organizaciones.
--
-- Impacto hoy: ninguno medible. Hay 0 facturas de venta sin asiento, así que una llamada hoy no crearía nada. El riesgo
-- es para la próxima factura que quede sin asiento.
--
-- Uso: nadie la llama. Búsqueda en src/, supabase/functions/, electron/, print-agent/, mobile/ y en los repositorios
-- go-admin-super, go-admin-sellers y goadmin-websites: 0 usos. Es una utilidad de reparación de una sola vez.
--
-- Arreglo: quitar EXECUTE a public, anon y authenticated (queda para service_role y postgres) y fijar search_path. No
-- se cambia el cuerpo. Si alguna vez hace falta, se ejecuta desde el servidor con la organización ya validada.

revoke execute on function public.fn_retro_journal_invoices() from public, anon, authenticated;
grant execute on function public.fn_retro_journal_invoices() to service_role;

alter function public.fn_retro_journal_invoices() set search_path = public, pg_temp;
