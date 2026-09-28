-- Cajas del POS — tres huecos del cierre ciego y de la escritura de movimientos
-- (docs/implementacion/CAJAS-VENTAS-PLAN.md §7, «Seguridad de cajas, fase 1»).
--
-- 1. `fn_notify_cash_session_closed` publicaba a TODA la organización el monto
--    final y la diferencia del cierre, también con cierre ciego (el cajero la
--    leía en la campana). Con cierre ciego el aviso sale sin cifras; quien tiene
--    `pos.cajas.ver_esperado` las consulta en el detalle de la caja (máscara del
--    servidor). La notificación es de organización (`recipient_user_id` NULL):
--    dirigirla por permiso duplicaría el aviso a los administradores.
--
-- 2. `cash_movements` tenía una política ALL por pertenencia: cualquier miembro
--    podía insertar en una caja CERRADA (cambia sus totales después del cierre),
--    editar o borrar movimientos ajenos y firmar con el `user_id` de otro.
--    Fase 1 (compatible con el código desplegado, que inserta desde el
--    navegador en CajasService, cashSync y movimientosService de Finanzas):
--      - SELECT por pertenencia (sin cambios).
--      - INSERT solo en una caja ABIERTA de la misma organización y con un
--        `user_id` que sea miembro activo de ella.
--      - UPDATE solo en caja abierta y del autor o con `pos.cajas.cerrar_ajenas`.
--      - Sin DELETE.
--    Verificado el 2026-09-28: 5 movimientos en toda la base, ninguno escrito
--    tras el cierre de su caja ni editado. `procesar_devolucion` es SECURITY
--    DEFINER de `postgres` (no le aplica la RLS); el cobro no escribe aquí.
--    Además: `pos_caja_registrar_movimiento`, la RPC por la que pasan desde ya
--    CajasService, cashSync y movimientosService. La fase 2 (quitar INSERT y
--    UPDATE directos) espera al despliegue: ver el plan §7.
--
-- 3. El historial de cajas ya no lee `difference`/`final_amount` desde el
--    navegador: `GET /api/pos/cajas/historial` los enmascara en el servidor
--    (sin migración).

-- ── 1. Aviso de cierre sin cifras con cierre ciego ─────────────────────────
create or replace function public.fn_notify_cash_session_closed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_email text;
  v_ciego boolean;
begin
  if old.status is distinct from new.status and new.status = 'closed' then
    select email into v_user_email from auth.users where id = new.closed_by;
    select coalesce((os.settings->>'blind_cash_count')::boolean, false)
      into v_ciego
      from public.organization_settings os
     where os.organization_id = new.organization_id and os.key = 'pos_blind_cash_count';

    if coalesce(v_ciego, false) then
      perform public.fn_create_org_notification(
        new.organization_id,
        null,
        'app',
        'cash_closed',
        'Caja cerrada',
        'Cerrada por ' || coalesce(v_user_email, 'un usuario') || '. Cierre ciego: el resultado se consulta en el detalle de la caja.',
        jsonb_build_object('session_id', new.id::text, 'cierre_ciego', true)
      );
    else
      perform public.fn_create_org_notification(
        new.organization_id,
        null,
        'app',
        'cash_closed',
        'Caja cerrada',
        'Cerrada por ' || coalesce(v_user_email, 'un usuario') || '. Monto final: $' || coalesce(new.final_amount::text, '0') || '. Diferencia: $' || coalesce(new.difference::text, '0'),
        jsonb_build_object('session_id', new.id::text, 'difference', coalesce(new.difference, 0)::text)
      );
    end if;
  end if;
  return new;
end;
$$;

-- ── 2. cash_movements: escritura acotada (fase 1) ──────────────────────────
drop policy if exists cash_movements_insert_update_delete_policy on public.cash_movements;

create policy cash_movements_insert_caja_abierta on public.cash_movements
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
    and cash_session_id in (
      select cs.id from public.cash_sessions cs
       where cs.organization_id = cash_movements.organization_id and cs.status = 'open'
    )
    and user_id in (
      select om.user_id from public.organization_members om
       where om.organization_id = cash_movements.organization_id and om.is_active
    )
  );

create policy cash_movements_update_caja_abierta on public.cash_movements
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
    and cash_session_id in (
      select cs.id from public.cash_sessions cs
       where cs.organization_id = cash_movements.organization_id and cs.status = 'open'
    )
    and (user_id = (select auth.uid()) or public.fn_caja_puede(organization_id, 'pos.cajas.cerrar_ajenas'))
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
    and cash_session_id in (
      select cs.id from public.cash_sessions cs
       where cs.organization_id = cash_movements.organization_id and cs.status = 'open'
    )
    and (user_id = (select auth.uid()) or public.fn_caja_puede(organization_id, 'pos.cajas.cerrar_ajenas'))
  );

-- RPC única para registrar un movimiento de caja (la usarán todos los
-- escritores; en la fase 2 será el único camino). Idempotente por `p_uuid`
-- (reintentos y el outbox del Desktop). El autor es SIEMPRE quien llama.
create or replace function public.pos_caja_registrar_movimiento(
  p_session_id integer,
  p_tipo text,
  p_monto numeric,
  p_concepto text,
  p_concept_code text default null,
  p_referencia text default null,
  p_notas text default null,
  p_uuid uuid default null,
  p_creado_en timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s record;
  m public.cash_movements;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  select id, organization_id, branch_id, status, opened_at
    into s
    from public.cash_sessions
   where id = p_session_id
   for share;
  if not found then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;

  perform public.fn_assert_acceso_org(s.organization_id);
  if s.branch_id is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Reintento: el mismo movimiento ya está registrado.
  if p_uuid is not null then
    select * into m from public.cash_movements where organization_id = s.organization_id and uuid = p_uuid;
    if found then
      return to_jsonb(m) || jsonb_build_object('ya_registrado', true);
    end if;
  end if;

  if s.status <> 'open' then
    raise exception 'caja_cerrada' using errcode = '55000';
  end if;
  if p_tipo is null or p_tipo not in ('in', 'out') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 1e12 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if coalesce(btrim(p_concepto), '') = '' then
    raise exception 'concepto_requerido' using errcode = '22023';
  end if;

  insert into public.cash_movements (
    uuid, organization_id, cash_session_id, branch_id, type, concept, concept_code,
    reference, amount, user_id, notes, created_at
  ) values (
    coalesce(p_uuid, gen_random_uuid()), s.organization_id, s.id, s.branch_id, p_tipo, btrim(p_concepto),
    nullif(btrim(p_concept_code), ''), nullif(btrim(p_referencia), ''), round(p_monto, 2), v_uid,
    nullif(btrim(p_notas), ''),
    -- La hora del Desktop sin red se respeta solo si cae dentro de la caja.
    case when p_creado_en is not null and p_creado_en >= s.opened_at and p_creado_en <= now() + interval '5 minutes'
         then p_creado_en else now() end
  )
  returning * into m;

  return to_jsonb(m) || jsonb_build_object('ya_registrado', false);
end;
$$;

revoke all on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz) to authenticated;

comment on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz) is
  'Registra un ingreso o egreso en una caja ABIERTA (autor = quien llama, idempotente por uuid). Único camino previsto para escribir cash_movements (fase 2 del plan de cajas).';
