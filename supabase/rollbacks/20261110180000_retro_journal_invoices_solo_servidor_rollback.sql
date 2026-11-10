-- Reversión de 20261110180000_retro_journal_invoices_solo_servidor.sql.
--
-- Deja la función como estaba el 2026-11-10 (leído por el MCP): EXECUTE para authenticated, service_role y postgres
-- (anon ya no lo tenía) y sin search_path fijado. Devuelve el riesgo que la migración cierra; úsese solo si algo
-- legítimo dependía de llamarla con la sesión de un usuario.

alter function public.fn_retro_journal_invoices() reset search_path;

grant execute on function public.fn_retro_journal_invoices() to authenticated;
