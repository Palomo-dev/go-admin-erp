-- K-1 (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md §5): el arqueo nunca se
-- pudo guardar. `cash_counts.difference` es GENERATED ALWAYS y
-- `CajasService.createCashCount` la mandaba en el insert (Postgres 428C9):
-- 0 arqueos en toda la base con 99 sesiones de caja.
--
-- Esta migración:
--  1. `cash_counts.method_breakdown` (jsonb, NULL-able): el arqueo por método.
--     `counted_amount`, `expected_amount` y `difference` quedan SOLO para el
--     efectivo (efectivo contra efectivo); cada otro método se compara contra
--     su propio esperado dentro de `method_breakdown`.
--  2. `pos_caja_esperado(p_session_id)`: el esperado de una caja calculado en
--     el servidor, con las mismas reglas que `CajasService.getCashSummary`
--     (ventana opened_at..closed_at, sucursal de la caja, cajero en modo
--     `user`). Lo usan el arqueo y `POST /api/pos/cajas/[id]/cerrar`.
--  3. `pos_caja_registrar_arqueo(...)`: registra el arqueo con el esperado del
--     servidor. El navegador solo manda lo contado.
--
-- Límite conocido (K-3): `payments` no tiene `cash_session_id`, así que los
-- cobros se asignan a la caja por ventana de tiempo, sucursal y (modo `user`)
-- cajero. Dos cajas de la misma sucursal abiertas a la vez en modo `branch`
-- (global + sucursal) ven los mismos cobros.

alter table public.cash_counts add column if not exists method_breakdown jsonb;

comment on column public.cash_counts.method_breakdown is
  'Arqueo por método: {"<método>": {"esperado": n, "contado": n, "diferencia": n}}. El esperado lo calcula pos_caja_esperado en el servidor. counted_amount, expected_amount y difference son solo del efectivo.';

create or replace function public.pos_caja_esperado(p_session_id integer)
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

  -- Cobros de la ventana. Fuentes de egreso: compras y cuentas por pagar;
  -- `account_receivable` son abonos (recibos de caja), no ventas.
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

  -- Devoluciones procesadas de la ventana (mismas reglas que el resumen).
  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
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

comment on function public.pos_caja_esperado(integer) is
  'Esperado de una caja calculado en el servidor (efectivo y por método). Mismas reglas que CajasService.getCashSummary. Asignación por ventana de tiempo: payments no tiene cash_session_id (K-3).';

create or replace function public.pos_caja_registrar_arqueo(
  p_session_id integer,
  p_tipo text,
  p_efectivo_contado numeric,
  p_contado_por_metodo jsonb default '{}'::jsonb,
  p_denominaciones jsonb default null,
  p_notas text default null
)
returns jsonb
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
  -- pos_caja_esperado valida organización y sucursal.
  v_esperado := public.pos_caja_esperado(p_session_id);
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
      if jsonb_typeof(v_contado->v_metodo) <> 'number' or (v_contado->>v_metodo)::numeric < 0 then
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
    p_efectivo_contado, v_esp, p_denominaciones, v_uid, nullif(p_notas, ''), v_desglose
  )
  returning * into v_fila;

  return to_jsonb(v_fila);
end;
$$;

comment on function public.pos_caja_registrar_arqueo(integer, text, numeric, jsonb, jsonb, text) is
  'Registra un arqueo con el esperado calculado en el servidor (pos_caja_esperado). counted/expected/difference = efectivo; method_breakdown = cada método contra su esperado.';

revoke all on function public.pos_caja_esperado(integer) from public, anon;
revoke all on function public.pos_caja_registrar_arqueo(integer, text, numeric, jsonb, jsonb, text) from public, anon;
grant execute on function public.pos_caja_esperado(integer) to authenticated, service_role;
grant execute on function public.pos_caja_registrar_arqueo(integer, text, numeric, jsonb, jsonb, text) to authenticated, service_role;
