-- Restaura el permiso anterior; no modifica filas ni políticas RLS.
-- El editor dejará de poder consultar la URL con una sesión autenticada.
REVOKE SELECT (data_policy_url) ON TABLE public.comm_settings FROM authenticated;
