-- La siembra del mapeo de impuestos (20261027211000) no debe tumbar el alta de la org, pero tampoco puede
-- fallar en silencio (antes: solo RAISE WARNING, que nadie ve). Ahora la falla queda en
-- public.bitacora_siembra_org (org, paso, error, sqlstate, cuándo) y sigue sin bloquear la creación de la org.
-- Caso típico: fn_assert_acceso_org dentro de la siembra cuando quien crea la org aún no es miembro.
-- Requiere 20261027211000. SIN APLICAR.
-- Rollback: supabase/rollbacks/20261027211500_siembra_mapeo_impuestos_bitacora_rollback.sql
create table if not exists public.bitacora_siembra_org (
  id bigserial primary key,
  organization_id integer not null,
  paso text not null,
  error text not null,
  sqlstate text,
  creado timestamptz not null default now(),
  resuelto_at timestamptz
);
create index if not exists bitacora_siembra_org_pendientes_idx
  on public.bitacora_siembra_org (creado desc) where resuelto_at is null;
-- Solo la ven el servidor y Soporte (service_role / SQL); sin políticas para usuarios.
alter table public.bitacora_siembra_org enable row level security;
revoke all on public.bitacora_siembra_org from anon, authenticated;

create or replace function public.trg_fn_sembrar_configuracion_contable()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
begin
  perform public.fn_sembrar_configuracion_contable(new.id);
  begin
    perform public.fn_sembrar_mapeo_impuestos(new.id);
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    -- Visible: queda en la bitácora (y en el log). La org se crea igual.
    insert into public.bitacora_siembra_org (organization_id, paso, error, sqlstate)
    values (new.id, 'fn_sembrar_mapeo_impuestos', left(sqlerrm, 1000), v_estado);
    raise warning 'fn_sembrar_mapeo_impuestos(%) falló (bitacora_siembra_org): %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- Reintento para Soporte: siembra de nuevo y marca resueltas las fallas de esa org.
create or replace function public.fn_reintentar_siembra_mapeo(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_n integer;
begin
  v_n := public.fn_sembrar_mapeo_impuestos(p_org);
  update public.bitacora_siembra_org set resuelto_at = now()
   where organization_id = p_org and paso = 'fn_sembrar_mapeo_impuestos' and resuelto_at is null;
  return v_n;
end;
$function$;
revoke all on function public.fn_reintentar_siembra_mapeo(integer) from public, anon, authenticated;
grant execute on function public.fn_reintentar_siembra_mapeo(integer) to service_role;
