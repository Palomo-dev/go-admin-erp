-- Reversión de 20260921100000_go_assistant_settings_por_defecto_en_org_nueva.sql
-- Quita el disparador y la función. No borra filas de ai_assistant_settings.
drop trigger if exists trg_seed_ai_assistant_settings on public.organizations;
drop function if exists public.fn_seed_ai_assistant_settings();
