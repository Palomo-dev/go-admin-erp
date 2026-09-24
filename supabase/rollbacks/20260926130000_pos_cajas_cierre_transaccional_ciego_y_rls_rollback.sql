-- Rollback de 20260926130000_pos_cajas_cierre_transaccional_ciego_y_rls.sql
--
-- Restaura la política ALL de cash_sessions, pos_caja_esperado y
-- pos_caja_registrar_arqueo como estaban (20260925130300 / 20260925130000) y
-- retira las funciones y permisos nuevos.
--
-- ADVERTENCIA de datos: borrar las columnas cash_movements.concept_code y
-- cash_movements.reference pierde lo que se haya guardado en ellas (el texto
-- del concepto sigue en `concept`). Las asignaciones de los permisos
-- pos.cajas.* a cargos hechas después también se pierden. Los arqueos de
-- cierre que registró pos_caja_cerrar se quedan (son datos válidos).
-- Antes de revertir, el código debe volver a cerrar con UPDATE directo
-- (POST /api/pos/cajas/[id]/cerrar y cashSync.replayClose anteriores).

-- RLS
drop policy if exists cash_sessions_insert_propia on public.cash_sessions;
drop policy if exists cash_sessions_update_abierta_propia on public.cash_sessions;
drop policy if exists cash_sessions_insert_update_delete_policy on public.cash_sessions;
create policy cash_sessions_insert_update_delete_policy on public.cash_sessions
  for all to authenticated
  using (organization_id in (select organization_members.organization_id from organization_members
                              where organization_members.user_id = auth.uid()));

-- pos_caja_esperado con el cuerpo completo (versión 20260925130300)
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

-- pos_caja_registrar_arqueo como estaba (20260925130000)
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

drop function if exists public.pos_caja_cerrar(integer, numeric, jsonb, jsonb, text, timestamptz);
drop function if exists public.pos_caja__arqueo_visible(public.cash_counts);
drop function if exists public.pos_caja__arqueo_insertar(integer, text, numeric, jsonb, jsonb, text);
drop function if exists public.pos_caja__esperado_calculo(integer);
drop function if exists public.fn_caja_ve_esperado(integer);
drop function if exists public.fn_caja_puede(integer, text);

delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code in ('pos.cajas.cerrar_ajenas', 'pos.cajas.ver_esperado'));
delete from public.role_permissions
 where permission_id in (select id from public.permissions where code in ('pos.cajas.cerrar_ajenas', 'pos.cajas.ver_esperado'));
delete from public.permissions where code in ('pos.cajas.cerrar_ajenas', 'pos.cajas.ver_esperado');

alter table public.cash_movements drop column if exists concept_code;
alter table public.cash_movements drop column if exists reference;
