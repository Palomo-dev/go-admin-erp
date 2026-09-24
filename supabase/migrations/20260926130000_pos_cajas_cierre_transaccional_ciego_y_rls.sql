-- Cajas del POS: cierre transaccional con conteo por método, cierre ciego
-- enmascarado en el servidor, permisos propios de caja y RLS que ya no deja
-- reescribir una caja desde el navegador.
-- Plan: docs/implementacion/CAJAS-VENTAS-PLAN.md (pasos 6 y 11; D6, D8, D14, R2–R5).
--
--  1. Permisos `pos.cajas.cerrar_ajenas` y `pos.cajas.ver_esperado`, por
--     defecto para los roles de sistema Admin de organización (2) y Manager (5).
--     `fn_caja_puede(org, código)`: el mismo criterio que `hasOrgAdminOrPermission`
--     del servidor Node (super admin o rol 1/2, o el código por rol/cargo, o
--     `admin.full_access`). Nunca el nombre del rol.
--  2. `fn_caja_ve_esperado(org)`: sin cierre ciego, sí; con cierre ciego, solo con
--     `pos.cajas.ver_esperado`.
--  3. `pos_caja__esperado_calculo` (interna, sin grant): el cálculo de siempre,
--     cuerpo idéntico al `pos_caja_esperado` vigente (20260925130300).
--     `pos_caja_esperado` pasa a envolverla (fase 1: sin máscara, ver abajo).
--  4. `pos_caja__arqueo_insertar` (interna): inserta el arqueo con el
--     `method_breakdown` calculado en el servidor. La usan el arqueo y el cierre.
--     `pos_caja_registrar_arqueo` exige ahora la caja abierta (R4) y no devuelve
--     esperado ni diferencias a quien no puede verlos (R2).
--  5. `pos_caja_cerrar`: cierre en UNA transacción (D6/R5): bloquea la fila,
--     comprueba organización, sucursal y permiso (quien abrió o
--     `pos.cajas.cerrar_ajenas`), registra el arqueo `closing` con el conteo por
--     método y cierra con la diferencia del servidor. Idempotente para el
--     outbox del Desktop (`ya_cerrada`) y acepta la hora real del cierre sin red.
--  6. RLS de `cash_sessions` (R3): se retira la política ALL sin WITH CHECK; el
--     navegador solo INSERTA su propia apertura y solo ACTUALIZA una caja
--     abierta que abrió él (o con `pos.cajas.cerrar_ajenas`); nadie borra
--     (solo service role, herramientas de plataforma).
--
-- Dos fases, para no romper el cierre en producción antes del despliegue: el
-- código desplegado hoy cierra con un UPDATE directo desde la ruta y lee
-- `efectivo_esperado` de `pos_caja_esperado`. Esta es la FASE 1 (compatible).
-- La FASE 2, cuando este commit esté desplegado, retira el UPDATE y mueve la
-- máscara del cierre ciego a `pos_caja_esperado` (plan, §«Fase 2»).
--  7. `cash_movements.concept_code` y `cash_movements.reference` (K10, D13),
--     NULL-ables.
--
-- Dry-run: todo el bloque dentro de begin … rollback con un usuario simulado
-- (request.jwt.claims) antes de aplicarlo; ver el commit.

-- ── 1. Permisos ──────────────────────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select v.code, v.name, v.description, 'pos', 'pos'
  from (values
    ('pos.cajas.cerrar_ajenas', 'Cerrar cajas de otros cajeros',
     'Cerrar una caja del POS que abrió otra persona'),
    ('pos.cajas.ver_esperado', 'Ver el esperado con cierre ciego',
     'Ver el efectivo esperado, el desglose y las diferencias de las cajas aunque la organización use cierre ciego')
  ) as v(code, name, description)
 where not exists (select 1 from public.permissions p where p.code = v.code);

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (2), (5)) as r(role_id)
 where p.code in ('pos.cajas.cerrar_ajenas', 'pos.cajas.ver_esperado')
   and not exists (select 1 from public.role_permissions rp
                    where rp.role_id = r.role_id and rp.permission_id = p.id);

create or replace function public.fn_caja_puede(p_org integer, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
          exists (select 1 from public.organization_members om
                   where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active
                     and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2)))
       or public.check_user_permission(auth.uid(), p_org, p_code)
       or public.check_user_permission(auth.uid(), p_org, 'admin.full_access')
     );
$$;

comment on function public.fn_caja_puede(integer, text) is
  'Permiso de caja del usuario de la sesión: super admin o rol 1/2, el código por rol o cargo, o admin.full_access. Mismo criterio que hasOrgAdminOrPermission (src/lib/utils/orgContext.ts).';

revoke all on function public.fn_caja_puede(integer, text) from public, anon;
grant execute on function public.fn_caja_puede(integer, text) to authenticated, service_role;

create or replace function public.fn_caja_ve_esperado(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is null  -- service role: sin máscara
      or coalesce((select (os.settings->>'blind_cash_count')::boolean
                     from public.organization_settings os
                    where os.organization_id = p_org and os.key = 'pos_blind_cash_count'), false) = false
      or public.fn_caja_puede(p_org, 'pos.cajas.ver_esperado');
$$;

comment on function public.fn_caja_ve_esperado(integer) is
  'Cierre ciego: true si quien pregunta puede ver el esperado y las diferencias de las cajas de la organización.';

revoke all on function public.fn_caja_ve_esperado(integer) from public, anon;
grant execute on function public.fn_caja_ve_esperado(integer) to authenticated, service_role;

-- ── 3. Esperado: cálculo interno + envoltura con máscara ────────────────────
create or replace function public.pos_caja__esperado_calculo(p_session_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s public.cash_sessions%rowtype;
  v_hasta timestamptz;
  v_por_cajero boolean;
  v_ventas_ef numeric := 0;
  v_vuelto numeric := 0;
  v_abonos_ef numeric := 0;
  v_compras_ef numeric := 0;
  v_devoluciones numeric := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_efectivo numeric := 0;
  v_por_metodo jsonb := '{}'::jsonb;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  v_hasta := coalesce(s.closed_at, now());
  v_por_cajero := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = s.organization_id and os.key = 'pos_cash_session_mode'),
    'branch') = 'user';

  with p as (
    select coalesce(pay.method, 'other') as metodo,
           coalesce(pay.amount, 0) as monto,
           coalesce(pay.change_amount, 0) as vuelto,
           coalesce(pay.source, '') as origen
      from public.payments pay
     where pay.organization_id = s.organization_id
       and pay.status = 'completed'
       and pay.created_at >= s.opened_at
       and pay.created_at <= v_hasta
       and (s.branch_id is null or pay.branch_id = s.branch_id)
       and (not v_por_cajero or pay.created_by = s.opened_by)
  )
  select
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(vuelto) filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'account_receivable'), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen in ('invoice_purchase', 'account_payable')), 0),
    coalesce(
      (select jsonb_object_agg(x.metodo, x.total)
         from (select metodo, sum(monto) as total from p
                where metodo <> 'cash' and origen not in ('invoice_purchase', 'account_payable')
                group by metodo) x),
      '{}'::jsonb)
    into v_ventas_ef, v_vuelto, v_abonos_ef, v_compras_ef, v_por_metodo
    from p;

  -- Devoluciones heredadas (anteriores a procesar_devolucion): se restan como
  -- antes. Las nuevas en efectivo ya son una salida en cash_movements y las de
  -- saldo a favor no sacan efectivo.
  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
     and r.refund_method is null
     and r.created_at >= s.opened_at
     and r.created_at <= v_hasta
     and (s.branch_id is null or r.branch_id = s.branch_id)
     and (not v_por_cajero or r.user_id = s.opened_by);

  select coalesce(sum(m.amount) filter (where m.type = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.type = 'out'), 0)
    into v_entradas, v_salidas
    from public.cash_movements m
   where m.cash_session_id = s.id;

  v_efectivo := coalesce(s.initial_amount, 0)
              + (v_ventas_ef - v_vuelto)
              + v_abonos_ef
              + v_entradas - v_salidas
              - v_compras_ef
              - v_devoluciones;

  return jsonb_build_object(
    'session_id', s.id,
    'organization_id', s.organization_id,
    'status', s.status,
    'efectivo_esperado', round(v_efectivo, 2),
    'por_metodo', v_por_metodo || jsonb_build_object('cash', round(v_efectivo, 2)),
    'detalle', jsonb_build_object(
      'inicial', coalesce(s.initial_amount, 0),
      'ventas_efectivo', v_ventas_ef - v_vuelto,
      'vuelto', v_vuelto,
      'abonos_efectivo', v_abonos_ef,
      'entradas', v_entradas,
      'salidas', v_salidas,
      'compras_efectivo', v_compras_ef,
      'devoluciones', v_devoluciones
    ),
    'por_cajero', v_por_cajero,
    'hasta', v_hasta
  );
end;
$$;

comment on function public.pos_caja__esperado_calculo(integer) is
  'Esperado de una caja SIN máscara de cierre ciego. Interna: solo la llaman pos_caja_esperado, pos_caja__arqueo_insertar y pos_caja_cerrar.';

revoke all on function public.pos_caja__esperado_calculo(integer) from public, anon, authenticated;
grant execute on function public.pos_caja__esperado_calculo(integer) to service_role;

-- FASE 1 (esta migración): pos_caja_esperado envuelve el cálculo SIN máscara,
-- porque la versión desplegada de POST /api/pos/cajas/[id]/cerrar todavía lee
-- `efectivo_esperado` de aquí para cerrar; con la máscara, un cajero con cierre
-- ciego no podría cerrar hasta desplegar el código nuevo. La máscara la aplica
-- el servidor Node (GET /api/pos/cajas/[id]/resumen) y la FASE 2
-- (docs/implementacion/CAJAS-VENTAS-PLAN.md, «Fase 2 de la RLS y la máscara»)
-- la mueve aquí cuando el código de este commit esté desplegado.
create or replace function public.pos_caja_esperado(p_session_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Valida organización y sucursal (lanza 42501/P0002).
  return public.pos_caja__esperado_calculo(p_session_id);
end;
$$;

comment on function public.pos_caja_esperado(integer) is
  'Esperado de una caja (efectivo, por método y desglose). El cálculo vive en pos_caja__esperado_calculo; la máscara del cierre ciego la aplica el servidor (fase 1) y aquí en la fase 2.';

revoke all on function public.pos_caja_esperado(integer) from public, anon;
grant execute on function public.pos_caja_esperado(integer) to authenticated, service_role;

-- ── 4. Arqueo ────────────────────────────────────────────────────────────────
create or replace function public.pos_caja__arqueo_insertar(
  p_session_id integer,
  p_tipo text,
  p_efectivo_contado numeric,
  p_contado_por_metodo jsonb,
  p_denominaciones jsonb,
  p_notas text
)
returns public.cash_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.cash_sessions%rowtype;
  v_uid uuid := auth.uid();
  v_esperado jsonb;
  v_por_metodo jsonb;
  v_contado jsonb := coalesce(p_contado_por_metodo, '{}'::jsonb);
  v_desglose jsonb := '{}'::jsonb;
  v_metodo text;
  v_esp numeric;
  v_cont numeric;
  v_fila public.cash_counts%rowtype;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('opening', 'partial', 'closing') then
    raise exception 'Tipo de arqueo inválido' using errcode = '22023';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 or p_efectivo_contado > 1e12 then
    raise exception 'Efectivo contado inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_contado) <> 'object' then
    raise exception 'Conteo por método inválido' using errcode = '22023';
  end if;

  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  -- Valida organización y sucursal.
  v_esperado := public.pos_caja__esperado_calculo(p_session_id);
  v_por_metodo := v_esperado->'por_metodo';

  for v_metodo in
    select k from (
      select jsonb_object_keys(v_por_metodo) as k
      union
      select jsonb_object_keys(v_contado)
    ) llaves
    where k <> 'cash'
  loop
    v_esp := coalesce((v_por_metodo->>v_metodo)::numeric, 0);
    if v_contado ? v_metodo then
      if jsonb_typeof(v_contado->v_metodo) <> 'number' or (v_contado->>v_metodo)::numeric < 0
         or (v_contado->>v_metodo)::numeric > 1e12 then
        raise exception 'Conteo del método % inválido', v_metodo using errcode = '22023';
      end if;
      v_cont := (v_contado->>v_metodo)::numeric;
      v_desglose := v_desglose || jsonb_build_object(v_metodo, jsonb_build_object(
        'esperado', v_esp, 'contado', v_cont, 'diferencia', round(v_cont - v_esp, 2)));
    else
      -- Método con esperado y sin conteo: se registra el esperado sin juzgarlo.
      v_desglose := v_desglose || jsonb_build_object(v_metodo, jsonb_build_object(
        'esperado', v_esp, 'contado', null, 'diferencia', null));
    end if;
  end loop;

  v_esp := (v_esperado->>'efectivo_esperado')::numeric;
  v_desglose := v_desglose || jsonb_build_object('cash', jsonb_build_object(
    'esperado', v_esp, 'contado', p_efectivo_contado, 'diferencia', round(p_efectivo_contado - v_esp, 2)));

  insert into public.cash_counts (
    organization_id, branch_id, cash_session_id, count_type,
    counted_amount, expected_amount, denominations, counted_by, notes, method_breakdown
  ) values (
    s.organization_id, s.branch_id, s.id, p_tipo,
    p_efectivo_contado, v_esp, p_denominaciones, v_uid, nullif(btrim(coalesce(p_notas, '')), ''), v_desglose
  )
  returning * into v_fila;

  return v_fila;
end;
$$;

comment on function public.pos_caja__arqueo_insertar(integer, text, numeric, jsonb, jsonb, text) is
  'Inserta un arqueo con el esperado del servidor. Interna: la usan pos_caja_registrar_arqueo y pos_caja_cerrar.';

revoke all on function public.pos_caja__arqueo_insertar(integer, text, numeric, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.pos_caja__arqueo_insertar(integer, text, numeric, jsonb, jsonb, text) to service_role;

-- Arqueo visible según el cierre ciego: sin esperado ni diferencias; lo contado se conserva.
create or replace function public.pos_caja__arqueo_visible(p_fila public.cash_counts)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.fn_caja_ve_esperado(p_fila.organization_id) then to_jsonb(p_fila) || jsonb_build_object('oculto', false)
    else (to_jsonb(p_fila) - 'expected_amount' - 'difference' - 'method_breakdown')
         || jsonb_build_object(
              'expected_amount', null,
              'difference', null,
              'method_breakdown', (
                select coalesce(jsonb_object_agg(k, jsonb_build_object('esperado', null, 'contado', v->'contado', 'diferencia', null)), '{}'::jsonb)
                  from jsonb_each(coalesce(p_fila.method_breakdown, '{}'::jsonb)) as e(k, v)),
              'oculto', true)
  end;
$$;

revoke all on function public.pos_caja__arqueo_visible(public.cash_counts) from public, anon, authenticated;
grant execute on function public.pos_caja__arqueo_visible(public.cash_counts) to service_role;

create or replace function public.pos_caja_registrar_arqueo(
  p_session_id integer,
  p_tipo text,
  p_efectivo_contado numeric,
  p_contado_por_metodo jsonb default '{}'::jsonb,
  p_denominaciones jsonb default null::jsonb,
  p_notas text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_fila public.cash_counts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  select status into v_status from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  -- R4: un arqueo es de una caja abierta (antes solo lo comprobaba la pantalla).
  -- La organización y la sucursal las valida pos_caja__arqueo_insertar antes de insertar.
  if v_status <> 'open' then
    perform public.pos_caja__esperado_calculo(p_session_id);  -- 42501 si no es de su organización
    raise exception 'caja_cerrada' using errcode = '55000', detail = 'La caja ya está cerrada: no admite arqueos.';
  end if;
  v_fila := public.pos_caja__arqueo_insertar(p_session_id, p_tipo, p_efectivo_contado, p_contado_por_metodo, p_denominaciones, p_notas);
  return public.pos_caja__arqueo_visible(v_fila);
end;
$$;

comment on function public.pos_caja_registrar_arqueo(integer, text, numeric, jsonb, jsonb, text) is
  'Registra un arqueo de una caja ABIERTA con el esperado del servidor. Con cierre ciego y sin pos.cajas.ver_esperado no devuelve esperado ni diferencias.';

revoke all on function public.pos_caja_registrar_arqueo(integer, text, numeric, jsonb, jsonb, text) from public, anon;
grant execute on function public.pos_caja_registrar_arqueo(integer, text, numeric, jsonb, jsonb, text) to authenticated, service_role;

-- ── 5. Cierre transaccional ─────────────────────────────────────────────────
create or replace function public.pos_caja_cerrar(
  p_session_id integer,
  p_efectivo_contado numeric,
  p_contado_por_metodo jsonb default '{}'::jsonb,
  p_denominaciones jsonb default null::jsonb,
  p_notas text default null::text,
  p_cerrada_en timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s public.cash_sessions%rowtype;
  v_cierre timestamptz;
  v_arqueo public.cash_counts%rowtype;
  v_dif numeric;
  v_ve boolean;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 or p_efectivo_contado > 1e12 then
    raise exception 'Efectivo contado inválido' using errcode = '22023';
  end if;
  if p_notas is not null and length(p_notas) > 5000 then
    raise exception 'Notas demasiado largas' using errcode = '22023';
  end if;

  select * into s from public.cash_sessions where id = p_session_id for update;
  if not found then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  -- Idempotente: el outbox del Desktop puede reintentar un cierre ya aplicado.
  if s.status <> 'open' then
    return jsonb_build_object('ya_cerrada', true, 'session_id', s.id, 'status', s.status);
  end if;

  if s.opened_by <> v_uid and not public.fn_caja_puede(s.organization_id, 'pos.cajas.cerrar_ajenas') then
    raise exception 'sin_permiso' using errcode = '42501',
      detail = 'Solo el cajero que abrió la caja o quien tenga pos.cajas.cerrar_ajenas puede cerrarla.';
  end if;

  -- Hora del cierre: ahora, o la del cierre hecho sin red (nunca futura ni antes de abrir).
  v_cierre := least(coalesce(p_cerrada_en, now()), now());
  v_cierre := greatest(v_cierre, s.opened_at);

  -- 1) Fija la ventana del esperado (pos_caja__esperado_calculo usa closed_at).
  --    Solo cambia closed_at: no dispara el asiento ni la notificación de cierre.
  update public.cash_sessions set closed_at = v_cierre where id = s.id;

  -- 2) Arqueo de cierre con el conteo por método (D6), en la misma transacción.
  v_arqueo := public.pos_caja__arqueo_insertar(
    s.id, 'closing', p_efectivo_contado, p_contado_por_metodo, p_denominaciones, p_notas);
  v_dif := round(p_efectivo_contado - coalesce(v_arqueo.expected_amount, 0), 2);

  -- 3) Cierre con la diferencia del servidor (dispara el asiento del cierre).
  update public.cash_sessions
     set status = 'closed',
         closed_by = v_uid,
         final_amount = p_efectivo_contado,
         difference = v_dif,
         notes = coalesce(nullif(btrim(coalesce(p_notas, '')), ''), s.notes)
   where id = s.id
  returning * into s;

  v_ve := public.fn_caja_ve_esperado(s.organization_id);
  return jsonb_build_object(
    'ya_cerrada', false,
    'session_id', s.id,
    'uuid', s.uuid,
    'status', s.status,
    'opened_by', s.opened_by,
    'opened_at', s.opened_at,
    'closed_at', s.closed_at,
    'closed_by', s.closed_by,
    'branch_id', s.branch_id,
    'initial_amount', s.initial_amount,
    'final_amount', s.final_amount,
    'difference', case when v_ve then s.difference end,
    'expected_amount', case when v_ve then v_arqueo.expected_amount end,
    'arqueo_id', v_arqueo.id,
    'oculto', not v_ve
  );
end;
$$;

comment on function public.pos_caja_cerrar(integer, numeric, jsonb, jsonb, text, timestamptz) is
  'Cierra una caja en una transacción: permiso (quien abrió o pos.cajas.cerrar_ajenas), arqueo closing con el conteo por método y diferencia del servidor. Idempotente (ya_cerrada). Sin esperado ni diferencia para quien no puede verlos (cierre ciego).';

revoke all on function public.pos_caja_cerrar(integer, numeric, jsonb, jsonb, text, timestamptz) from public, anon;
grant execute on function public.pos_caja_cerrar(integer, numeric, jsonb, jsonb, text, timestamptz) to authenticated, service_role;

-- ── 6. RLS de cash_sessions ──────────────────────────────────────────────────
-- Antes: `cash_sessions_insert_update_delete_policy` (ALL, sin WITH CHECK):
-- cualquier miembro podía actualizar o borrar cualquier caja de su
-- organización, abierta o cerrada, incluida la diferencia.
-- FASE 1: INSERT solo de la apertura propia; UPDATE solo de una caja ABIERTA y
-- solo por quien la abrió o con pos.cajas.cerrar_ajenas (lo que necesita la
-- ruta de cierre desplegada hoy y el outbox del Desktop anterior); sin DELETE.
-- FASE 2 (tras desplegar): se retira también el UPDATE; todo cierre por
-- pos_caja_cerrar.
drop policy if exists cash_sessions_insert_update_delete_policy on public.cash_sessions;
drop policy if exists cash_sessions_insert_propia on public.cash_sessions;
drop policy if exists cash_sessions_update_abierta_propia on public.cash_sessions;

create policy cash_sessions_update_abierta_propia on public.cash_sessions
  for update to authenticated
  using (
    status = 'open'
    and organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active = true)
    and (opened_by = (select auth.uid()) or public.fn_caja_puede(organization_id, 'pos.cajas.cerrar_ajenas'))
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active = true)
    and (opened_by = (select auth.uid()) or public.fn_caja_puede(organization_id, 'pos.cajas.cerrar_ajenas'))
  );

comment on policy cash_sessions_update_abierta_propia on public.cash_sessions is
  'Fase 1: solo cajas abiertas, por quien la abrió o con pos.cajas.cerrar_ajenas. Una caja cerrada ya no se reescribe. Fase 2: se retira (todo cierre por pos_caja_cerrar).';

create policy cash_sessions_insert_propia on public.cash_sessions
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active = true)
    and opened_by = (select auth.uid())
    and status = 'open'
    and closed_at is null
    and closed_by is null
    and final_amount is null
    and difference is null
  );

comment on policy cash_sessions_insert_propia on public.cash_sessions is
  'El navegador solo abre su propia caja. Cerrar va por pos_caja_cerrar (ruta /api/pos/cajas/[id]/cerrar y outbox del Desktop); sin DELETE directo.';

-- ── 7. Movimientos: clave del concepto y número de soporte ──────────────────
alter table public.cash_movements add column if not exists concept_code text;
alter table public.cash_movements add column if not exists reference text;

comment on column public.cash_movements.concept_code is
  'Clave del catálogo único de conceptos (src/lib/pos/cajas/conceptos.ts), p. ej. gastosMenores. concept guarda el texto canónico o el texto libre de «Otro…». NULL en los movimientos anteriores al catálogo.';
comment on column public.cash_movements.reference is
  'Número de soporte del movimiento (recibo, factura del gasto…). Opcional.';
