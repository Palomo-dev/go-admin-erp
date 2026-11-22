-- «Anular devolución» del POS (Figma 05 POS y ventas, sección 873:573997:
-- menú ⋯ 2721:955, diálogos 2719:190434 · 2719:190511 · 2719:190584 y el
-- detalle anulado 2721:17).
--
-- Reglas del Contador:
--   1. Nota crédito ACEPTADA por la DIAN: la devolución no se reversa. Se
--      registra una venta nueva con factura nueva (la pantalla lo ofrece).
--   2. Nota crédito sin transmitir o rechazada: se reversa con asientos espejo
--      (fn_revertir_asiento_en_fecha) con fecha de hoy, o con la fecha original
--      si ese periodo sigue abierto. Nunca dentro de un periodo cerrado.
--   3. Además: el producto vuelve a salir del inventario (kardex, origen
--      'return' en salida, source_id = la devolución, como la anulación de
--      venta reutiliza 'return' en entrada); si el reintegro fue en efectivo,
--      entra el dinero en una caja ABIERTA (sin caja se bloquea, igual que al
--      crear la devolución); la nota crédito queda anulada (sin enviar nada a
--      la DIAN); el saldo a favor, si no se usó, se cancela; la devolución pasa
--      a 'cancelled' y la venta vuelve a 'paid' si había quedado 'refunded'.
--      Motivo obligatorio (≥ 5) con quién y cuándo en la devolución y en
--      finance_audit_log.
--
-- Permiso: pos.void («Anular ventas»), el mismo de pos_anular_venta_v1.
-- Se bloquea (con código) lo que no se puede deshacer con seguridad: nota en
-- envío o ya anulada, devolución nacida de una garantía, con membresías
-- recortadas, saldo a favor ya usado, seriales que ya no están como los dejó
-- la devolución y efectivo sin caja abierta.

-- ── 1 ── Quién, cuándo y por qué ─────────────────────────────────────────────
alter table public.returns add column if not exists voided_at timestamptz;
alter table public.returns add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.returns add column if not exists void_reason text;

comment on column public.returns.voided_at is 'Cuándo se anuló la devolución (fn_devolucion_anular). NULL si sigue vigente.';
comment on column public.returns.voided_by is 'Quién anuló la devolución (fn_devolucion_anular).';
comment on column public.returns.void_reason is 'Motivo de la anulación de la devolución (mínimo 5 caracteres).';

-- ── 2 ── Diagnóstico: qué diálogo aplica y qué bloquea ─────────────────────
create or replace function public.fn_devolucion_anulacion_estado(p_organization_id integer, p_return_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.returns%rowtype;
  v_nc public.invoice_sales%rowtype;
  v_estado_dian text;
  v_fecha_acept timestamptz;
  v_tz text;
  v_original timestamptz;
  v_fecha_orig date;
  v_hoy date;
  v_per_orig boolean;
  v_per_hoy boolean;
  v_caja integer;
  v_credito public.credit_notes%rowtype;
  v_credito_usado boolean := false;
  v_bloqueo text;
  v_asientos jsonb;
  v_caso text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);

  select * into v_r from public.returns
   where id = p_return_id and organization_id = p_organization_id;
  if not found then
    raise exception 'devolucion_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_r.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Nota crédito y su estado ante la DIAN.
  if v_r.credit_note_invoice_id is not null then
    select * into v_nc from public.invoice_sales
     where id = v_r.credit_note_invoice_id and organization_id = p_organization_id;
  end if;
  if v_nc.id is not null then
    select max(coalesce(j.processed_at, j.updated_at)) into v_fecha_acept
      from public.electronic_invoicing_jobs j
     where j.invoice_id = v_nc.id and j.organization_id = p_organization_id and j.status = 'accepted';
    v_estado_dian := case
      when v_nc.status in ('void', 'voided', 'cancelled') then 'anulada'
      when v_nc.einvoice_status = 'accepted' or v_fecha_acept is not null then 'aceptada'
      when exists (select 1 from public.electronic_invoicing_jobs j
                    where j.invoice_id = v_nc.id and j.organization_id = p_organization_id
                      and j.status in ('processing', 'sent')) then 'en_envio'
      when v_nc.einvoice_status = 'rejected' or exists (
             select 1 from public.electronic_invoicing_jobs j
              where j.invoice_id = v_nc.id and j.organization_id = p_organization_id and j.status = 'rejected') then 'rechazada'
      else 'sin_transmitir'
    end;
  end if;

  -- Periodos: el de la devolución y el de hoy (día local y día que valida el
  -- disparador del asiento; los dos tienen que estar abiertos).
  v_tz := public.fn_timezone_for(p_organization_id, v_r.branch_id);
  v_original := coalesce(v_r.return_date, v_r.created_at);
  v_fecha_orig := (v_original at time zone v_tz)::date;
  v_hoy := public.fn_today_for(p_organization_id, v_r.branch_id);
  v_per_orig := public.fn_is_period_open(p_organization_id, v_fecha_orig)
                and public.fn_is_period_open(p_organization_id, v_original::date);
  v_per_hoy := public.fn_is_period_open(p_organization_id, v_hoy)
               and public.fn_is_period_open(p_organization_id, now()::date);

  if v_r.refund_method = 'cash' then
    v_caja := public.fn_caja_abierta_para(p_organization_id, v_r.branch_id, v_uid);
  end if;

  if v_r.customer_credit_id is not null then
    select * into v_credito from public.credit_notes
     where id = v_r.customer_credit_id and organization_id = p_organization_id;
    v_credito_usado := v_credito.id is null
      or v_credito.status is distinct from 'active'
      or round(coalesce(v_credito.balance, 0), 2) < round(coalesce(v_credito.amount, 0), 2)
      or exists (select 1 from public.credit_note_applications a where a.credit_note_id = v_credito.id);
  end if;

  -- Asientos de la devolución aún sin contra-asiento: el reintegro (origen
  -- returns), el devengo de la nota crédito y el saldo a favor.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', je.id, 'fecha', je.entry_date,
           'numero', case when je.comprobante_numero is not null
                          then coalesce(je.comprobante_prefijo, '') || je.comprobante_numero
                          else '#' || je.id end,
           'memo', je.memo) order by je.id), '[]'::jsonb)
    into v_asientos
    from public.journal_entries je
   where je.organization_id = p_organization_id
     and coalesce(je.posted, false)
     and ((je.source = 'returns' and je.source_id = v_r.id::text)
          or (v_r.credit_note_invoice_id is not null and je.fact_key = 'accrual:credit_note:' || v_r.credit_note_invoice_id::text)
          or (v_r.customer_credit_id is not null and je.fact_key = 'customer_credit:' || v_r.customer_credit_id::text))
     and not exists (select 1 from public.journal_entries x
                      where x.organization_id = je.organization_id and x.fact_key = 'reversal:' || je.id);

  v_bloqueo := case
    when v_r.status = 'cancelled' then 'ya_anulada'
    when v_r.status is distinct from 'processed' then 'estado_invalido'
    when v_estado_dian = 'aceptada' then 'nota_aceptada_dian'
    when v_estado_dian = 'en_envio' then 'nota_en_envio_dian'
    when v_estado_dian = 'anulada' then 'nota_ya_anulada'
    when coalesce(v_r.idempotency_key, '') like 'garantia:%' then 'devolucion_de_garantia'
    when exists (select 1 from public.membership_events e
                  where e.organization_id = p_organization_id
                    and e.metadata->>'documento' = 'devolucion:' || v_r.id::text) then 'devolucion_con_membresia'
    when v_credito_usado then 'saldo_a_favor_aplicado'
    when exists (select 1 from public.return_lines rl
                   join public.serial_numbers sn on sn.id = any(rl.serial_ids)
                  where rl.return_id = v_r.id and rl.organization_id = p_organization_id
                    and (sn.status not in ('in_stock', 'returned', 'damaged')
                         or (sn.status <> 'damaged' and sn.sale_id is not null))) then 'serial_no_disponible'
    when not v_per_orig and not v_per_hoy then 'periodo_cerrado'
    when v_r.refund_method = 'cash' and v_caja is null then 'efectivo_sin_caja'
    else null
  end;

  v_caso := case
    when v_bloqueo = 'ya_anulada' then 'ya_anulada'
    when v_bloqueo = 'nota_aceptada_dian' then 'nota_aceptada'
    when v_bloqueo is not null then 'bloqueada'
    else 'anulable'
  end;

  return jsonb_build_object(
    'return_id', v_r.id,
    'estado', v_r.status,
    'metodo', v_r.refund_method,
    'total', v_r.total_refund,
    'tiene_permiso', public.fn_tiene_permiso(p_organization_id, 'pos.void'),
    'nota', case when v_nc.id is null then null else jsonb_build_object(
              'id', v_nc.id, 'numero', v_nc.number, 'estado_dian', v_estado_dian,
              'fecha_aceptacion', v_fecha_acept) end,
    'fecha_original', v_fecha_orig,
    'hoy', v_hoy,
    'periodo_original_abierto', v_per_orig,
    'periodo_hoy_abierto', v_per_hoy,
    'caja_abierta', v_caja,
    'saldo_a_favor', case when v_r.customer_credit_id is null then null else jsonb_build_object(
              'id', v_r.customer_credit_id, 'usado', v_credito_usado) end,
    'asientos', v_asientos,
    'bloqueo', v_bloqueo,
    'caso', v_caso);
end;
$$;

comment on function public.fn_devolucion_anulacion_estado(integer, integer) is
  'Anular devolución: estado de la nota crédito ante la DIAN, periodos (original y hoy), caja abierta, asientos a reversar y bloqueo. caso = anulable | nota_aceptada | bloqueada | ya_anulada. Lo usa fn_devolucion_anular y la pantalla para elegir el diálogo.';

-- ── 3 ── La anulación, en una transacción ───────────────────────────────────
create or replace function public.fn_devolucion_anular(
  p_organization_id integer,
  p_return_id integer,
  p_motivo text,
  p_fecha_espejo text default 'hoy'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_motivo text := left(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), 500);
  v_r public.returns%rowtype;
  v_sale public.sales%rowtype;
  v_diag jsonb;
  v_numero text;
  v_fecha timestamptz;
  v_asiento record;
  v_rev integer;
  v_revs jsonb := '[]'::jsonb;
  v_pendientes integer := 0;
  v_job record;
  v_jobs integer := 0;
  v_mov record;
  v_qty numeric;
  v_unidades numeric := 0;
  v_serial record;
  v_seriales integer := 0;
  v_factura uuid;
  v_caja integer;
  v_caja_branch integer;
  v_mov_caja integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if p_fecha_espejo is null or p_fecha_espejo not in ('hoy', 'original') then
    raise exception 'fecha_espejo_invalida' using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);

  select * into v_r from public.returns
   where id = p_return_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'devolucion_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_r.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if not public.fn_tiene_permiso(p_organization_id, 'pos.void') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  -- Idempotente: anularla otra vez no repite nada.
  if v_r.status = 'cancelled' then
    return jsonb_build_object('return_id', v_r.id, 'ya_anulada', true);
  end if;

  select * into v_sale from public.sales
   where id = v_r.sale_id and organization_id = p_organization_id
   for update;

  v_diag := public.fn_devolucion_anulacion_estado(p_organization_id, p_return_id);
  if v_diag->>'bloqueo' is not null then
    raise exception '%', v_diag->>'bloqueo' using errcode = '22023';
  end if;

  if p_fecha_espejo = 'original' then
    if not (v_diag->>'periodo_original_abierto')::boolean then
      raise exception 'periodo_original_cerrado' using errcode = '22023';
    end if;
    v_fecha := coalesce(v_r.return_date, v_r.created_at);
  else
    if not (v_diag->>'periodo_hoy_abierto')::boolean then
      raise exception 'periodo_hoy_cerrado' using errcode = '22023';
    end if;
    v_fecha := now();
  end if;
  v_numero := 'DEV-' || lpad(v_r.id::text, 6, '0');

  -- a. Asientos espejo (la única reversa del sistema).
  for v_asiento in
    select (e->>'id')::integer as id from jsonb_array_elements(v_diag->'asientos') e
  loop
    v_rev := public.fn_revertir_asiento_en_fecha(v_asiento.id, 'anulacion_devolucion', 'devolucion:' || v_r.id, v_fecha, v_uid);
    if v_rev is null then
      v_pendientes := v_pendientes + 1;
    else
      v_revs := v_revs || to_jsonb(v_rev);
    end if;
  end loop;

  -- b. Nota crédito: lo que no salió a la DIAN se cancela y la nota queda
  --    anulada (trg_nota_credito_recalcula_factura recalcula la factura).
  if v_r.credit_note_invoice_id is not null then
    for v_job in
      select j.id from public.electronic_invoicing_jobs j
       where j.invoice_id = v_r.credit_note_invoice_id and j.organization_id = p_organization_id
         and j.status in ('pending', 'failed')
       for update
    loop
      update public.electronic_invoicing_jobs set status = 'cancelled', locked_at = null, locked_by = null where id = v_job.id;
      insert into public.electronic_invoicing_events (job_id, organization_id, event_type, event_message, metadata)
      values (v_job.id, p_organization_id, 'cancelled', 'Job cancelado: se anuló la devolución ' || v_numero,
              jsonb_build_object('actor', v_uid, 'accion', 'cancel', 'origen', 'fn_devolucion_anular', 'devolucion', v_r.id));
      v_jobs := v_jobs + 1;
    end loop;

    update public.invoice_sales
       set status = 'void',
           notes = case when coalesce(btrim(notes), '') = '' then 'ANULADA con la devolución ' || v_numero || ': ' || v_motivo
                        else notes || E'\n\nANULADA con la devolución ' || v_numero || ': ' || v_motivo end,
           updated_at = now()
     where id = v_r.credit_note_invoice_id and organization_id = p_organization_id;
  end if;

  -- c. Saldo a favor (sin usar: el diagnóstico lo exige).
  if v_r.customer_credit_id is not null then
    update public.credit_notes
       set status = 'cancelled', balance = 0, updated_at = now(),
           notes = case when coalesce(btrim(notes), '') = '' then 'ANULADO: devolución ' || v_numero || ' anulada'
                        else notes || E'\n' || 'ANULADO: devolución ' || v_numero || ' anulada' end
     where id = v_r.customer_credit_id and organization_id = p_organization_id;
  end if;

  -- d. Inventario: sale otra vez lo que la devolución reingresó (productos e
  --    ingredientes de receta), neto de lo ya retirado.
  for v_mov in
    select sm.product_id, sm.branch_id, sum(sm.qty) as qty,
           (array_agg(sm.unit_cost order by sm.id))[1] as unit_cost
      from public.stock_movements sm
     where sm.organization_id = p_organization_id and sm.source = 'return'
       and sm.source_id = v_r.id::text and sm.direction = 'in'
     group by sm.product_id, sm.branch_id
  loop
    v_qty := v_mov.qty - coalesce((
      select sum(o.qty) from public.stock_movements o
       where o.organization_id = p_organization_id and o.source = 'return'
         and o.source_id = v_r.id::text and o.direction = 'out'
         and o.product_id = v_mov.product_id and o.branch_id = v_mov.branch_id), 0);
    continue when v_qty <= 0;
    perform public.fn_inv_int_mover(
      p_organization_id, v_mov.branch_id, v_mov.product_id, null, 'out', v_qty, v_mov.unit_cost,
      'return', v_r.id::text, 'Anulación de la devolución ' || v_numero, v_uid, '{}'::jsonb);
    v_unidades := v_unidades + v_qty;
  end loop;

  -- e. Seriales: vuelven a «vendidos» en la venta original.
  select i.id into v_factura from public.invoice_sales i
   where i.sale_id = v_sale.id and i.organization_id = p_organization_id
     and coalesce(i.document_type, 'invoice') = 'invoice'
   order by i.created_at limit 1;
  for v_serial in
    select sn.* from public.serial_numbers sn
     where sn.organization_id = p_organization_id
       and sn.id in (select unnest(rl.serial_ids) from public.return_lines rl
                      where rl.return_id = v_r.id and rl.organization_id = p_organization_id)
     for update
  loop
    update public.serial_numbers set
      status = 'sold',
      sale_id = v_sale.id::text,
      sold_to_customer_id = coalesce(v_serial.sold_to_customer_id, v_sale.customer_id),
      sold_by_user_id = coalesce(v_serial.sold_by_user_id, v_sale.user_id),
      sale_channel = coalesce(nullif(v_serial.sale_channel, 'in_stock'), 'pos'),
      sale_date = coalesce(v_serial.sale_date, v_sale.sale_date),
      invoice_sale_id = coalesce(v_serial.invoice_sale_id, v_factura),
      current_branch_id = v_sale.branch_id,
      updated_at = now(), updated_by = v_uid
    where id = v_serial.id;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status,
      from_branch_id, to_branch_id, source_table, source_id, sale_id, customer_id, performed_by, notes
    ) values (
      v_serial.id, p_organization_id, 'return_voided', v_serial.status, 'sold',
      v_serial.current_branch_id, v_sale.branch_id, 'returns', v_r.id::text, v_sale.id,
      v_sale.customer_id, v_uid, v_motivo
    );
    v_seriales := v_seriales + 1;
  end loop;

  -- f. Efectivo: el cliente devuelve el dinero a una caja abierta. Con
  --    return_id el movimiento no genera asiento propio: el espejo del
  --    reintegro ya lleva la caja al débito.
  if v_r.refund_method = 'cash' then
    v_caja := public.fn_caja_abierta_para(p_organization_id, v_r.branch_id, v_uid);
    if v_caja is null then
      raise exception 'efectivo_sin_caja' using errcode = '22023',
        hint = 'Abra la caja para recibir el dinero que el cliente devuelve.';
    end if;
    select cs.branch_id into v_caja_branch from public.cash_sessions cs where cs.id = v_caja;
    insert into public.cash_movements (
      organization_id, cash_session_id, branch_id, type, concept, amount, user_id, notes, return_id
    ) values (
      p_organization_id, v_caja, coalesce(v_caja_branch, v_r.branch_id), 'in',
      'Anulación de la devolución ' || v_numero, v_r.total_refund, v_uid, v_motivo, v_r.id
    )
    returning id into v_mov_caja;
  end if;

  -- g. La devolución y la venta.
  update public.returns
     set status = 'cancelled', voided_at = now(), voided_by = v_uid, void_reason = v_motivo, updated_at = now()
   where id = v_r.id;

  update public.sales s
     set payment_status = 'paid'
   where s.id = v_sale.id
     and s.organization_id = p_organization_id
     and s.payment_status = 'refunded'
     and coalesce((
       select sum(r.total_refund) from public.returns r
        where r.sale_id = s.id and r.organization_id = s.organization_id
          and coalesce(r.status, 'processed') not in ('void', 'cancelled', 'anulado')
     ), 0) < coalesce(s.total, 0) - 0.01;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (p_organization_id, 'returns', v_r.id::text, 'void', v_uid,
          jsonb_build_object('numero', v_numero, 'total', v_r.total_refund, 'metodo', v_r.refund_method,
                             'venta', v_r.sale_id, 'fecha_espejo', p_fecha_espejo, 'fecha_asiento', v_fecha,
                             'contra_asientos', v_revs, 'asientos_pendientes', v_pendientes,
                             'nota_credito', v_r.credit_note_invoice_id,
                             'nota_estado_dian', v_diag->'nota'->>'estado_dian', 'jobs_fe_cancelados', v_jobs,
                             'saldo_a_favor', v_r.customer_credit_id, 'movimiento_caja', v_mov_caja,
                             'sesion_caja', v_caja, 'unidades_retiradas', v_unidades, 'seriales', v_seriales),
          v_motivo);

  return jsonb_build_object(
    'return_id', v_r.id, 'ya_anulada', false, 'numero', v_numero,
    'fecha_espejo', p_fecha_espejo, 'fecha_asiento', v_fecha,
    'contra_asientos', v_revs, 'asientos_pendientes', v_pendientes,
    'nota_credito_anulada', v_r.credit_note_invoice_id, 'jobs_fe_cancelados', v_jobs,
    'saldo_a_favor_cancelado', v_r.customer_credit_id,
    'movimiento_caja', v_mov_caja, 'sesion_caja', v_caja,
    'unidades_retiradas', v_unidades, 'seriales', v_seriales);
end;
$$;

comment on function public.fn_devolucion_anular(integer, integer, text, text) is
  'Anula una devolución del POS en una transacción: asientos espejo (hoy u original si el periodo está abierto), nota crédito anulada (sin transmitir o rechazada), saldo a favor cancelado, inventario y seriales de vuelta, ingreso en caja abierta si fue en efectivo, venta a paid. Permiso pos.void. Nota aceptada por la DIAN: nota_aceptada_dian.';

revoke all on function public.fn_devolucion_anulacion_estado(integer, integer) from public, anon;
revoke all on function public.fn_devolucion_anular(integer, integer, text, text) from public, anon;
grant execute on function public.fn_devolucion_anulacion_estado(integer, integer) to authenticated, service_role;
grant execute on function public.fn_devolucion_anular(integer, integer, text, text) to authenticated, service_role;
