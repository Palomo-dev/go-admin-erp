-- Reversión de 20260930170000_inicio_preferencias_usuario.sql.
-- ADVERTENCIA: borra la tabla y con ella las preferencias guardadas (orden y
-- módulos ocultos del inicio de cada persona). No se restauran: el inicio
-- vuelve al orden por defecto con todo visible.

drop table if exists public.user_dashboard_preferences;
