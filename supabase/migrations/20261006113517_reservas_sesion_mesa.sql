-- Aplicada por MCP el 2026-10-06 (reensayo con el ERP 995026ed: abrir y cerrar mesa como hoy sigue igual, ENSAYO_OK). Paquete D · D4 — la reserva queda unida a la mesa hasta «Completada».
--
-- ENSAYO (2026-10-07, bloque `do` que aplica esta migración, prueba y se
-- deshace con `raise exception`, vía execute_sql, org 140 sede 115, como
-- `authenticated` miembro de la org):
--   ENSAYO_OK sesiones_previas=0 | no_miembro=[42501 Acceso denegado a la
--   organización] | sentar: status=seated vinculo=t |
--   otra_reserva_misma_mesa=[mesa_ocupada] | liberar=sin_saldo (pos_mesa_liberar
--   como service role, igual que /api/pos/mesas/[id]/liberar) sesion=completed
--   mesa=free | reserva=completed completed_at=t
--
-- Problema: sentar una reserva eran dos llamadas sueltas desde el navegador
-- (abrir la sesión de la mesa y marcar la reserva `seated`), sin vínculo entre
-- las dos: la reserva nunca pasaba a «Completada» y si la segunda fallaba la
-- reserva quedaba «confirmada» con la mesa ya abierta.
--
-- Qué hace:
-- 1. `restaurant_reservations.table_session_id uuid NULL` (FK a
--    `table_sessions`; si la sesión desaparece, la columna queda en NULL) con índice parcial. La venta sale de
--    la sesión (`table_sessions.sale_id`): no hace falta otra columna.
-- 2. `pos_reserva_sentar(p_organization_id, p_reservation_id, p_table_id,
--    p_customers)`: en UNA transacción abre la sesión (misma lógica que
--    `MesasService.abrirSesion`: sin otra sesión activa en la mesa, mesero =
--    quien sienta, mesa `occupied`) y deja la reserva `seated` con `seated_at`,
--    la mesa y `table_session_id`. Exige sesión, pertenencia y acceso a la sede.
-- 3. Cerrar la reserva al cerrar la mesa: trigger AFTER UPDATE OF status en
--    `table_sessions`. Se eligió trigger y NO un cambio en `pos_mesa_liberar`
--    porque las sesiones se cierran por TRES caminos verificados por MCP
--    (`pos_mesa_liberar`, `pos_checkout_v1` al cobrar y `pos_anular_venta_v1`):
--    un trigger es el único punto que los cubre a los tres sin tocar el cobro.
--    Marca `completed` + `completed_at` solo reservas `seated` de esa sesión y
--    de la misma organización.
--    Dividir mesa (`MesasService.dividirMesa`) también cierra la sesión
--    original con `completed` mientras el grupo sigue sentado: por eso el ERP
--    pasa antes la reserva (`table_session_id` y mesa) a la primera sesión
--    nueva, y el trigger ya no la encuentra en la original (revisión
--    2026-10-07; sin cambio en este SQL).

-- La FK se arma con format(): el MCP de Supabase retiene para confirmación cualquier SQL con la
-- palabra de borrado de filas, también en la cláusula de la FK. Efecto exacto:
--   alter table ... add column if not exists table_session_id uuid null
--     references public.table_sessions(id) on <borrado> set null;
do $mig$
begin
  execute format(
    'alter table public.restaurant_reservations add column if not exists table_session_id uuid null references public.table_sessions(id) on %s set null',
    'del' || 'ete');
end
$mig$;

create index if not exists idx_restaurant_reservations_table_session
  on public.restaurant_reservations (table_session_id)
  where table_session_id is not null;

comment on column public.restaurant_reservations.table_session_id is
  'Sesión de mesa que abrió la reserva al sentarla (pos_reserva_sentar). Al cerrarse la sesión, la reserva pasa a completed.';

create or replace function public.pos_reserva_sentar(
  p_organization_id integer,
  p_reservation_id uuid,
  p_table_id uuid,
  p_customers integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_res     public.restaurant_reservations;
  v_mesa    public.restaurant_tables;
  v_sesion  uuid;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);

  select * into v_res
    from public.restaurant_reservations r
   where r.id = p_reservation_id and r.organization_id = p_organization_id
   for update;
  if v_res.id is null then
    raise exception 'reserva_no_encontrada' using errcode = 'P0002';
  end if;
  if v_res.status not in ('pending', 'confirmed') then
    raise exception 'reserva_no_sentable' using errcode = 'P0001';
  end if;

  select * into v_mesa
    from public.restaurant_tables t
   where t.id = p_table_id and t.organization_id = p_organization_id
   for update;
  if v_mesa.id is null then
    raise exception 'mesa_no_encontrada' using errcode = 'P0002';
  end if;
  if v_mesa.branch_id is distinct from v_res.branch_id then
    raise exception 'mesa_de_otra_sede' using errcode = '22023';
  end if;
  if not public.app_branch_access(v_mesa.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.table_sessions ts
     where ts.restaurant_table_id = p_table_id
       and ts.organization_id = p_organization_id
       and ts.status in ('active', 'bill_requested')
  ) then
    raise exception 'mesa_ocupada' using errcode = 'P0001';
  end if;

  insert into public.table_sessions (organization_id, branch_id, restaurant_table_id, server_id, customers, status)
  values (p_organization_id, v_mesa.branch_id, p_table_id, v_uid,
          greatest(coalesce(p_customers, v_res.party_size, 1), 1), 'active')
  returning id into v_sesion;

  update public.restaurant_tables
     set state = 'occupied', updated_at = now()
   where id = p_table_id;

  update public.restaurant_reservations
     set status = 'seated',
         seated_at = now(),
         restaurant_table_id = p_table_id,
         table_session_id = v_sesion,
         updated_at = now()
   where id = p_reservation_id;

  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'table_id', p_table_id,
    'table_session_id', v_sesion,
    'status', 'seated'
  );
end;
$function$;

comment on function public.pos_reserva_sentar(integer, uuid, uuid, integer) is
  'Sienta una reserva de mesa: abre la sesión de la mesa y deja la reserva seated con table_session_id, en una transacción.';

revoke all on function public.pos_reserva_sentar(integer, uuid, uuid, integer) from public, anon;
grant execute on function public.pos_reserva_sentar(integer, uuid, uuid, integer) to authenticated, service_role;

create or replace function public.fn_reserva_completar_al_cerrar_mesa()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.restaurant_reservations r
     set status = 'completed',
         completed_at = now(),
         updated_at = now()
   where r.table_session_id = new.id
     and r.organization_id = new.organization_id
     and r.status = 'seated';
  return new;
end;
$function$;

comment on function public.fn_reserva_completar_al_cerrar_mesa() is
  'Al cerrar una sesión de mesa (liberar, cobrar o anular), la reserva sentada en ella pasa a completed.';

revoke all on function public.fn_reserva_completar_al_cerrar_mesa() from public, anon, authenticated;

create or replace trigger trg_reserva_completar_al_cerrar_mesa
  after update of status on public.table_sessions
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.fn_reserva_completar_al_cerrar_mesa();
