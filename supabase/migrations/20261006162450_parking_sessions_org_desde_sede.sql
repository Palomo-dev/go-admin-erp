-- Aplicada el 2026-10-06 con apply_migration (versión 20261006162450).
-- Urgente: «Registrar entrada» del parqueadero fallaba con 23502 (organization_id NULL): la
-- pantalla insertaba la sesión sin organización. La organización sale de la sede si no llega;
-- si llega distinta a la de la sede, se rechaza (42501). La RLS de parking_sessions es por sede.
-- Ensayo (do $$ … raise exception $$ como authenticated, org 57): ENSAYO_OK org_esperada=57 org_puesta=57.
set lock_timeout = '10s';

create or replace function public.fn_parking_sessions_org_desde_sede()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_org_sede integer;
begin
  select b.organization_id into v_org_sede from public.branches b where b.id = new.branch_id;
  if new.organization_id is null then
    new.organization_id := v_org_sede;
  elsif v_org_sede is not null and new.organization_id <> v_org_sede then
    raise exception 'sede_de_otra_organizacion' using errcode = '42501';
  end if;
  return new;
end;
$f$;

comment on function public.fn_parking_sessions_org_desde_sede() is
  'parking_sessions.organization_id sale de la sede si no llega (la entrada del POS de parqueadero no la enviaba: 23502). Si llega distinta a la de la sede, rechaza.';

revoke all on function public.fn_parking_sessions_org_desde_sede() from public, anon, authenticated;

create trigger trg_parking_sessions_org_desde_sede
  before insert on public.parking_sessions
  for each row execute function public.fn_parking_sessions_org_desde_sede();
