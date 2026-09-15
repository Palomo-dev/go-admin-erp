-- Aplicada el 2026-09-10 vía MCP (apply_migration) como `crm_v4_f05_otp_fn_service_role_only`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 da7d6f7c03dd242bead3a4b5a793bd2d). No reformatear.
-- El límite de OTP solo lo consulta el servidor (service role). Ningún cliente
-- con sesión necesita ejecutarlo, así que se le retira el EXECUTE: la guarda de
-- pertenencia se mantiene como segunda barrera, no como única.
REVOKE ALL ON FUNCTION public.fn_mobile_otp_allowed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mobile_otp_allowed(uuid, text) TO service_role;