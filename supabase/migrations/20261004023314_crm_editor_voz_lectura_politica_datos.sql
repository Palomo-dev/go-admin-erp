-- El editor de agentes lee esta columna con la sesión y las políticas RLS.
-- La migración que añadió la URL omitió su permiso de lectura por columna.
-- No se concede SELECT sobre la tabla: contiene credenciales de telefonía.
-- Idempotente; no modifica filas, permisos de escritura ni políticas RLS.
GRANT SELECT (data_policy_url) ON TABLE public.comm_settings TO authenticated;
