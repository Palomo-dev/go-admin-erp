-- Rollback de 20261006180921_carta_qr_solicitudes_mesa.
-- Requiere revertir antes 20261006181513, 181437 y 181211 (usan fn_mesa_qr_sesion y fn_mesa_qr_texto).
-- ⚠️ Borra las solicitudes de mesa (tabla nueva): no se restauran. Las sesiones que quedaron
-- en 'bill_requested' por fn_mesa_pedir_cuenta siguen así (estado válido del POS).
-- Los avisos ya creados en notifications se conservan.
drop function if exists public.pos_mesa_atender_solicitud(integer, uuid, uuid, text);
drop function if exists public.fn_mesa_cancelar_solicitud(integer, uuid, uuid);
drop function if exists public.fn_mesa_pedir_cuenta(integer, uuid, text, text);
drop function if exists public.fn_mesa_solicitar(integer, uuid, text, text, text);
drop function if exists public.fn_mesa_qr_texto(text, integer);
drop function if exists public.fn_mesa_qr_nombre_mesero(uuid);
drop function if exists public.fn_mesa_qr_avisar(integer, uuid, jsonb);
drop function if exists public.fn_mesa_qr_sesion(integer, uuid);
do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_service_requests') then
    alter publication supabase_realtime drop table public.table_service_requests;
  end if;
end $$;
drop table if exists public.table_service_requests;
