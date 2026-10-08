-- Rollback de 20261008005828_ai_settings_escritura_solo_admin.
-- Quita las tres políticas RESTRICTIVE de escritura de ai_settings. La
-- escritura vuelve a lo anterior: cualquier miembro activo puede insertar y
-- actualizar (políticas permisivas ai_settings_insert / ai_settings_update).
-- No toca datos.
drop policy if exists ai_settings_escritura_admin_insert on public.ai_settings;
drop policy if exists ai_settings_escritura_admin_update on public.ai_settings;
drop policy if exists ai_settings_escritura_admin_delete on public.ai_settings;
