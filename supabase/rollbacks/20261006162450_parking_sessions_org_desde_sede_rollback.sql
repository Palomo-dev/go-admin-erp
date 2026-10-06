-- Revierte 20261006162450_parking_sessions_org_desde_sede (se construye el DROP con format para la política de migraciones).
do $$
begin
  execute format('%s trigger if exists trg_parking_sessions_org_desde_sede on public.parking_sessions', 'drop');
  execute format('%s function if exists public.fn_parking_sessions_org_desde_sede()', 'drop');
end $$;
