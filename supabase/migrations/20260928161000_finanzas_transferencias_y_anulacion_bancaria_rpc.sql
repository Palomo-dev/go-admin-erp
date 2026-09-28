-- Finanzas · transferencias entre cuentas y anulación de un movimiento bancario
-- por RPC transaccional (2026-09-28).
--
-- Antes: `transferenciasService` insertaba en bank_transfers desde el navegador
-- y movía los saldos con `rpc('update_bank_balance')` —que no existe— y un
-- UPDATE de respaldo que nunca se esperaba: el saldo de las cuentas NUNCA
-- cambiaba. La fecha 'YYYY-MM-DD' iba a un timestamptz (medianoche UTC = el día
-- anterior en Bogotá) y la anulación hacía UPDATE sin filtro de organización.
--
-- Ahora (requiere 20260928160000, que mantiene el saldo por disparador):
--   · fn_transferencia_registrar: valida organización (la de la sesión, que el
--     servidor recibe y compara), permiso finance.create, acceso a las
--     sucursales de ambas cuentas, cuentas activas de la MISMA organización,
--     misma moneda, saldo suficiente (con ambas cuentas bloqueadas) y fecha no
--     futura en la zona de la organización; inserta en 'completed' y los
--     disparadores mueven los dos saldos y generan el asiento
--     (trg_auto_journal_bank_transfer). Idempotente por el id que manda el
--     cliente: repetir la llamada devuelve la misma transferencia.
--   · fn_transferencia_anular: permiso finance.void; pasa a 'cancelled' (el
--     disparador revierte los saldos y trg_auto_journal_bank_transfer genera el
--     contra-asiento). Exige saldo en la cuenta destino para devolver el dinero.
--     Idempotente: anular una anulada responde ya_anulada.
--   · fn_movimiento_banco_anular: reverso de un ingreso/egreso por banco con un
--     movimiento contrario (import_source = 'anulacion', import_id = uuid del
--     original). No anula conciliados ni importados del banco, ni anulaciones.
--     Idempotente: el reverso existe una sola vez por movimiento.

-- ── Registrar ───────────────────────────────────────────────────────────────
create or replace function public.fn_transferencia_registrar(
  p_id uuid,
  p_organization_id integer,
  p_cuenta_origen integer,
  p_cuenta_destino integer,
  p_monto numeric,
  p_fecha date default null,
  p_referencia text default null,
  p_notas text default null,
  p_branch_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_t public.bank_transfers%rowtype;
  v_o public.bank_accounts%rowtype;
  v_d public.bank_accounts%rowtype;
  v_monto numeric := round(p_monto, 2);
  v_branch integer;
  v_tz text;
  v_fecha timestamptz;
  v_moneda_o text;
  v_moneda_d text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_id is null or p_organization_id is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);

  -- Idempotencia por el id del cliente.
  perform pg_advisory_xact_lock(hashtextextended('fn_transferencia_registrar:' || p_id::text, 0));
  select * into v_t from public.bank_transfers where id = p_id;
  if found then
    if v_t.organization_id <> p_organization_id then
      raise exception 'transferencia_no_encontrada' using errcode = 'P0002';
    end if;
    return jsonb_build_object('id', v_t.id, 'repetida', true, 'status', v_t.status,
                              'transfer_date', v_t.transfer_date);
  end if;

  if v_monto is null or v_monto <= 0 or v_monto > 1e12 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if p_cuenta_origen is null or p_cuenta_destino is null then
    raise exception 'cuenta_requerida' using errcode = '22023';
  end if;
  if p_cuenta_origen = p_cuenta_destino then
    raise exception 'cuentas_iguales' using errcode = '22023';
  end if;

  -- Ambas cuentas bloqueadas en orden de id (sin interbloqueos entre transferencias cruzadas).
  perform 1 from public.bank_accounts
   where id in (p_cuenta_origen, p_cuenta_destino)
   order by id
   for update;
  select * into v_o from public.bank_accounts where id = p_cuenta_origen;
  select * into v_d from public.bank_accounts where id = p_cuenta_destino;
  if v_o.id is null or v_o.organization_id <> p_organization_id
     or v_d.id is null or v_d.organization_id <> p_organization_id then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  if not coalesce(v_o.is_active, true) or not coalesce(v_d.is_active, true) then
    raise exception 'cuenta_inactiva' using errcode = '22023';
  end if;
  perform public.fn_fc_acceso_sucursal(v_o.branch_id);
  perform public.fn_fc_acceso_sucursal(v_d.branch_id);

  v_moneda_o := upper(btrim(coalesce(v_o.currency, public.fn_moneda_base_organizacion(p_organization_id))));
  v_moneda_d := upper(btrim(coalesce(v_d.currency, public.fn_moneda_base_organizacion(p_organization_id))));
  if v_moneda_o <> v_moneda_d then
    raise exception 'moneda_distinta' using errcode = '22023',
      detail = jsonb_build_object('origen', v_moneda_o, 'destino', v_moneda_d)::text;
  end if;

  if coalesce(v_o.balance, 0) < v_monto then
    raise exception 'saldo_insuficiente' using errcode = '22023',
      detail = jsonb_build_object('disponible', coalesce(v_o.balance, 0), 'monto', v_monto)::text;
  end if;

  v_branch := coalesce(p_branch_id, v_o.branch_id);
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
      raise exception 'sucursal_invalida' using errcode = '22023';
    end if;
    perform public.fn_fc_acceso_sucursal(p_branch_id);
  end if;

  -- El día elegido, con la hora de pared de la organización/sucursal (no medianoche UTC).
  if p_fecha is null then
    v_fecha := now();
  else
    if p_fecha > public.fn_today_for(p_organization_id, v_branch) then
      raise exception 'fecha_futura' using errcode = '22023';
    end if;
    v_tz := public.fn_timezone_for(p_organization_id, v_branch);
    v_fecha := ((p_fecha + (now() at time zone v_tz)::time) at time zone v_tz);
  end if;

  insert into public.bank_transfers (
    id, organization_id, branch_id, from_account_id, to_account_id, amount, transfer_date,
    reference, notes, status, created_by
  ) values (
    p_id, p_organization_id, v_branch, p_cuenta_origen, p_cuenta_destino, v_monto, v_fecha,
    nullif(btrim(coalesce(p_referencia, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''),
    'completed', v_uid
  ) returning * into v_t;

  return jsonb_build_object('id', v_t.id, 'repetida', false, 'status', v_t.status,
                            'transfer_date', v_t.transfer_date);
end;
$function$;

comment on function public.fn_transferencia_registrar(uuid, integer, integer, integer, numeric, date, text, text, integer) is
  'Registra una transferencia entre cuentas bancarias de la organización: valida saldo, moneda, organización y fecha; los disparadores mueven los saldos y el asiento. Idempotente por p_id.';

revoke all on function public.fn_transferencia_registrar(uuid, integer, integer, integer, numeric, date, text, text, integer) from public, anon;
grant execute on function public.fn_transferencia_registrar(uuid, integer, integer, integer, numeric, date, text, text, integer) to authenticated;

-- ── Anular ──────────────────────────────────────────────────────────────────
create or replace function public.fn_transferencia_anular(
  p_organization_id integer,
  p_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_t public.bank_transfers%rowtype;
  v_d public.bank_accounts%rowtype;
  v_motivo text := coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Sin motivo');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_id is null or p_organization_id is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.void']);

  select * into v_t from public.bank_transfers
   where id = p_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'transferencia_no_encontrada' using errcode = 'P0002';
  end if;
  if v_t.branch_id is not null then
    perform public.fn_fc_acceso_sucursal(v_t.branch_id);
  end if;

  if v_t.status = 'cancelled' then
    return jsonb_build_object('id', v_t.id, 'ya_anulada', true);
  end if;

  if v_t.status = 'completed' then
    perform 1 from public.bank_accounts
     where id in (v_t.from_account_id, v_t.to_account_id)
     order by id
     for update;
    select * into v_d from public.bank_accounts where id = v_t.to_account_id;
    if coalesce(v_d.balance, 0) < v_t.amount then
      raise exception 'saldo_insuficiente_para_revertir' using errcode = '22023',
        detail = jsonb_build_object('disponible', coalesce(v_d.balance, 0), 'monto', v_t.amount)::text;
    end if;
  end if;

  update public.bank_transfers
     set status = 'cancelled',
         notes = concat_ws(E'\n\n', nullif(btrim(coalesce(notes, '')), ''), 'ANULADA: ' || v_motivo),
         updated_at = now()
   where id = v_t.id;

  return jsonb_build_object('id', v_t.id, 'ya_anulada', false);
end;
$function$;

comment on function public.fn_transferencia_anular(integer, uuid, text) is
  'Anula una transferencia de la organización: el disparador revierte ambos saldos y trg_auto_journal_bank_transfer genera el contra-asiento. Idempotente.';

revoke all on function public.fn_transferencia_anular(integer, uuid, text) from public, anon;
grant execute on function public.fn_transferencia_anular(integer, uuid, text) to authenticated;

-- ── Anular un ingreso/egreso por banco ──────────────────────────────────────
create or replace function public.fn_movimiento_banco_anular(
  p_organization_id integer,
  p_id integer,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_tx public.bank_transactions%rowtype;
  v_rev public.bank_transactions%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_id is null or p_organization_id is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.void']);

  select * into v_tx from public.bank_transactions
   where id = p_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'movimiento_no_encontrado' using errcode = 'P0002';
  end if;
  if v_tx.branch_id is not null then
    perform public.fn_fc_acceso_sucursal(v_tx.branch_id);
  end if;

  select * into v_rev from public.bank_transactions
   where organization_id = p_organization_id
     and import_source = 'anulacion'
     and import_id = v_tx.uuid::text;
  if found then
    return jsonb_build_object('id', v_rev.id, 'uuid', v_rev.uuid, 'ya_anulado', true);
  end if;

  if v_tx.import_source = 'anulacion' then
    raise exception 'anulacion_de_anulacion' using errcode = '22023';
  end if;
  if v_tx.import_source is not null then
    raise exception 'movimiento_importado' using errcode = '22023';
  end if;
  if v_tx.status in ('matched', 'reconciled') then
    raise exception 'movimiento_conciliado' using errcode = '22023';
  end if;

  insert into public.bank_transactions (
    organization_id, branch_id, bank_account_id, trans_date, description, amount,
    reference, transaction_type, status, import_source, import_id
  ) values (
    v_tx.organization_id, v_tx.branch_id, v_tx.bank_account_id, now(),
    'ANULACIÓN: ' || coalesce(v_tx.description, v_tx.transaction_type),
    -v_tx.amount,
    coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Anulación del movimiento #' || v_tx.id),
    case when v_tx.amount > 0 then 'withdrawal' else 'deposit' end,
    'unmatched', 'anulacion', v_tx.uuid::text
  ) returning * into v_rev;

  return jsonb_build_object('id', v_rev.id, 'uuid', v_rev.uuid, 'ya_anulado', false);
end;
$function$;

comment on function public.fn_movimiento_banco_anular(integer, integer, text) is
  'Reverso de un ingreso/egreso por banco con el movimiento contrario (import_source = anulacion, import_id = uuid del original). El saldo lo mueve el disparador y el asiento fn_auto_journal_bank. Idempotente.';

revoke all on function public.fn_movimiento_banco_anular(integer, integer, text) from public, anon;
grant execute on function public.fn_movimiento_banco_anular(integer, integer, text) to authenticated;
