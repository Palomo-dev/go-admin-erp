-- Reversión de 20261110100000_cartera_abono_retencion_consignacion.sql (revertirla ANTES que 20261108121000).
--
-- Restaura EXACTAMENTE las definiciones que la migración reemplazó:
--   fn_invoice_sales_paid(uuid)          pg_get_functiondef leído por el MCP el 2026-11-10, md5 4c772ca4a7d6926ce091a7910ea4e1d7
--   fn_excedente_nota_credito(uuid)      pg_get_functiondef leído por el MCP el 2026-11-10, md5 e9cb33e070ea4c18e1912ee21455b8e6
--   fn_consignacion_retencion_practicada  el texto de 20261108121000_consignaciones.sql, byte a byte
-- (la prueba 30 comprueba los dos md5 después de revertir). CREATE OR REPLACE conserva el ACL.
--
-- Datos: los abonos «aplicada» vuelven a «por_aplicar» (su disparador, todavía presente, recalcula cada factura con la
-- función ya restaurada: el saldo vuelve a no contarlos) y su pendiente «consignacion_cartera_retencion_por_aplicar» se
-- reabre o, si el abono nació aplicado, se registra. Los asientos de las retenciones quedan como están.

-- 1. Lo pagado y el excedente, como estaban.
CREATE OR REPLACE FUNCTION public.fn_invoice_sales_paid(p_invoice_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = p_invoice_id));
  select coalesce((
    select sum(p.amount + case when p.source = 'account_receivable' then coalesce(p.discount_amount, 0) else 0 end)
      from public.payments p, public.invoice_sales i
     where i.id = p_invoice_id
       and p.status = 'completed'
       and (
         (p.source = 'invoice_sales' and p.source_id = i.id::text)
         or (p.source = 'sale' and i.sale_id is not null and p.source_id = i.sale_id::text)
         or (p.source = 'account_receivable' and p.source_id in (
             select ar.id::text from public.accounts_receivable ar where ar.invoice_id = i.id
           ))
       )
  ), 0)
  -- Saldo a favor aplicado a la factura: dinero ya recibido del cliente.
  + coalesce((
    select sum(a.amount) from public.credit_note_applications a where a.invoice_id = p_invoice_id
  ), 0);
$function$;

CREATE OR REPLACE FUNCTION public.fn_excedente_nota_credito(p_credit_note_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- El excedente es el dinero ya pagado que la nota convierte en saldo del
-- cliente: saldo(C) = max(0, pagado − max(0, total − C)), con C las notas
-- acumuladas. Excedente = saldo(hasta esta nota) − saldo(hasta la anterior).
-- Sin pago no hay excedente (una nota mayor que la factura no crea dinero a
-- devolver), y un sobrepago previo a la nota no se le atribuye a la nota.
declare
  v_nc invoice_sales%rowtype;
  v_inv invoice_sales%rowtype;
  v_previas numeric;
  v_pagado numeric;
  v_total numeric;
begin
  select * into v_nc from invoice_sales where id = p_credit_note_id and document_type = 'credit_note';
  if not found or v_nc.related_invoice_id is null then
    return 0;
  end if;
  select * into v_inv from invoice_sales where id = v_nc.related_invoice_id;
  if not found then
    return 0;
  end if;

  select coalesce(sum(abs(total)), 0) into v_previas
  from invoice_sales
  where related_invoice_id = v_inv.id and document_type = 'credit_note' and id <> v_nc.id
    and (created_at, id::text) < (v_nc.created_at, v_nc.id::text);

  v_pagado := fn_invoice_sales_paid(v_inv.id);
  v_total := coalesce(v_inv.total, 0);

  return round(
      greatest(0, v_pagado - greatest(0, v_total - v_previas - abs(coalesce(v_nc.total, 0))))
    - greatest(0, v_pagado - greatest(0, v_total - v_previas)), 2);
end;
$function$;

-- 2. Los abonos vuelven a «por aplicar» y sus pendientes quedan abiertos.
update public.consignment_withholding_receivable_applications set status = 'por_aplicar' where status = 'aplicada';
update public.journal_entry_failures
   set resolved_at = null, resolution = null
 where source = 'consignment_withholding' and reason = 'consignacion_cartera_retencion_por_aplicar' and resolution = 'abono_aplicado_en_cartera'
   and not exists (select 1 from public.journal_entry_failures f2
                    where f2.organization_id = journal_entry_failures.organization_id and f2.fact_key = journal_entry_failures.fact_key
                      and f2.reason = journal_entry_failures.reason and f2.resolved_at is null);
do $$
declare
  v_x record;
begin
  for v_x in
    select x.organization_id, x.withholding_id, x.amount, x.applied_on, n.branch_id, n.number, w.class
      from public.consignment_withholding_receivable_applications x
      join public.consignment_settlement_withholdings w on w.id = x.withholding_id
      join public.consignment_settlements s on s.id = w.settlement_id
      join public.consignment_notes n on n.id = s.note_id
     where x.status = 'por_aplicar'
       and not exists (select 1 from public.journal_entry_failures f where f.organization_id = x.organization_id
                         and f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = x.withholding_id::text and f.resolved_at is null)
  loop
    perform public.fn_consignacion_pendiente(v_x.organization_id, v_x.branch_id, 'consignacion_cartera_retencion_por_aplicar',
      'consignment_withholding', v_x.withholding_id::text, v_x.amount,
      'Nota ' || v_x.number || ': retención de ' || v_x.class || ' del comprador abonada a la factura con el cobro del '
        || to_char(v_x.applied_on, 'YYYY-MM-DD') || '; el saldo de cartera aún no cuenta el abono (ver saldo real exigible)');
  end loop;
end $$;

-- 3. Fuera el disparador, su función, el índice y la función interna.
drop trigger if exists trg_abono_retencion_recalcula_factura on public.consignment_withholding_receivable_applications;
drop function if exists public.fn_trg_abono_retencion_recalcula_factura();
drop index if exists public.idx_consignment_wh_receivable_invoice_aplicada;
drop function if exists public.fn_invoice_sales_retenciones_abonadas(uuid);

-- 4. La retención practicada de 20261108121000 (deja el abono «por_aplicar» con su pendiente).
create or replace function public.fn_consignacion_retencion_practicada(
  p_retencion uuid,
  p_valor numeric,
  p_base numeric,
  p_fecha date,
  p_soporte text,
  p_organization_id integer,
  p_factura uuid default null,
  p_pago uuid default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_r public.consignment_settlement_withholdings%rowtype;
  v_pago public.payments%rowtype;
  v_saldo_factura numeric;
  v_por_aplicar numeric := 0;
  v_liq public.consignment_settlements%rowtype;
  v_nota public.consignment_notes%rowtype;
  v_cfg public.consignment_account_settings%rowtype;
  v_valor numeric := round(coalesce(p_valor, 0), 2);
  v_soporte text := nullif(left(btrim(coalesce(p_soporte, '')), 1000), '');
  v_cuenta text;
  v_sufrida text;
  v_cxc numeric := 0;
  v_resto numeric;
  v_e1 integer;
  v_e2 integer;
  v_tz text;
  v_instante timestamptz;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if v_valor <= 0 or coalesce(p_base, 0) <= 0 or p_fecha is null then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  if v_soporte is null or length(v_soporte) < 5 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  select * into v_r from public.consignment_settlement_withholdings where id = p_retencion and organization_id = p_organization_id for update;
  if not found then raise exception 'retencion_no_encontrada' using errcode = 'P0002'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);
  select * into v_liq from public.consignment_settlements where id = v_r.settlement_id;
  select * into v_nota from public.consignment_notes where id = v_liq.note_id;
  if not public.app_branch_access(v_nota.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;
  if v_liq.status = 'anulada' then raise exception 'liquidacion_anulada' using errcode = '22023'; end if;
  if v_r.status = 'practicada' then
    if v_r.practiced_amount = v_valor then
      return jsonb_build_object('retencion_id', v_r.id, 'repetida', true, 'valor', v_r.practiced_amount, 'asiento_id', v_r.journal_entry_id);
    end if;
    raise exception 'retencion_ya_practicada' using errcode = '22023';
  end if;
  v_tz := coalesce(public.fn_timezone_for(p_organization_id, v_nota.branch_id), 'America/Bogota');
  if p_fecha > (now() at time zone v_tz)::date then raise exception 'fecha_futura' using errcode = '22023'; end if;
  if not public.fn_is_period_open(p_organization_id, p_fecha) then raise exception 'periodo_cerrado' using errcode = '22023'; end if;
  -- El hecho no puede ser anterior a las ventas que la liquidación cubre.
  if p_fecha < (select min((a.created_at at time zone v_tz)::date) from public.consignment_allocations a where a.settlement_id = v_liq.id) then
    raise exception 'fecha_anterior_a_la_venta' using errcode = '22023';
  end if;
  v_instante := case when p_fecha = (now() at time zone v_tz)::date then now() else (p_fecha::timestamp + time '12:00') at time zone v_tz end;

  if v_r.scope = 'operacion' then
    if p_factura is null or not exists (select 1 from public.consignment_allocations a
                                         where a.settlement_id = v_liq.id and a.source = 'invoice_sale' and a.source_id = p_factura::text) then
      raise exception 'factura_de_la_liquidacion_obligatoria' using errcode = '22023',
        hint = 'La retención de la operación la practica el comprador al pagar una factura de la venta: indique cuál.';
    end if;
    select jl.account_code into v_cuenta
      from public.journal_entries e join public.journal_lines jl on jl.journal_entry_id = e.id
     where e.organization_id = p_organization_id and e.source = 'invoice_sales' and e.source_id = p_factura::text
       and coalesce(jl.debit, 0) > 0 and jl.account_code like '13%'
     order by jl.debit desc, jl.id limit 1;
    if v_cuenta is null then
      raise exception 'sin_cuenta_cartera_cliente' using errcode = 'P0002', hint = 'La factura no tiene causación con la cartera del cliente.';
    end if;
    -- Ronda 5 (respuesta 10): la retención se registra con el cobro donde el comprador la practicó, en su misma fecha.
    if p_pago is null then
      raise exception 'cobro_obligatorio' using errcode = '22023',
        hint = 'Indique el pago o abono del comprador en el que practicó la retención: el abono a la factura se registra en ese mismo momento.';
    end if;
    select * into v_pago from public.payments p
     where p.id = p_pago and p.organization_id = p_organization_id and p.status = 'completed'
       and ((p.source = 'invoice_sales' and p.source_id = p_factura::text)
         or (p.source = 'sale' and p.source_id = (select i.sale_id::text from public.invoice_sales i where i.id = p_factura))
         or (p.source = 'account_receivable' and p.source_id in (select ar.id::text from public.accounts_receivable ar where ar.invoice_id = p_factura)));
    if v_pago.id is null then
      raise exception 'cobro_de_otra_factura' using errcode = '22023', hint = 'El cobro debe ser un pago completado de esa factura.';
    end if;
    if (coalesce(v_pago.payment_date, v_pago.created_at) at time zone v_tz)::date <> p_fecha then
      raise exception 'fecha_distinta_del_cobro' using errcode = '22023',
        detail = to_char(coalesce(v_pago.payment_date, v_pago.created_at) at time zone v_tz, 'YYYY-MM-DD');
    end if;
    -- La cartera no queda inflada ni se abona de más: el abono por retención, sumado a los demás de la factura que siguen
    -- por aplicar, no puede superar lo que la factura todavía debe después del cobro.
    select coalesce(i.balance, i.total, 0) into v_saldo_factura from public.invoice_sales i where i.id = p_factura;
    select coalesce(sum(x.amount), 0) into v_por_aplicar from public.consignment_withholding_receivable_applications x
     where x.invoice_id = p_factura and x.status = 'por_aplicar';
    if v_valor + v_por_aplicar > v_saldo_factura + 0.5 then
      raise exception 'retencion_excede_saldo_factura' using errcode = '22023',
        detail = jsonb_build_object('saldo_factura', v_saldo_factura, 'por_aplicar', v_por_aplicar, 'retencion', v_valor)::text;
    end if;
    v_e1 := public.fn_create_journal_entry(
      p_organization_id := p_organization_id, p_branch_id := v_nota.branch_id, p_entry_date := v_instante,
      p_memo := 'Retención practicada por el comprador sobre la venta por cuenta del dueño - ' || v_nota.number, p_source := 'consignment_withholding',
      p_source_id := v_r.id::text, p_debit_account := v_nota.owner_account_code, p_credit_account := v_cuenta,
      p_amount := v_valor, p_created_by := v_uid, p_fact_key := 'consignment_withholding:' || v_r.id::text);
    insert into public.consignment_withholding_receivable_applications (organization_id, withholding_id, invoice_id, payment_id, amount, applied_on,
                                                                          journal_entry_id, created_by)
    values (p_organization_id, v_r.id, p_factura, v_pago.id, v_valor, p_fecha, v_e1, v_uid);
    perform public.fn_consignacion_pendiente(p_organization_id, v_nota.branch_id, 'consignacion_cartera_retencion_por_aplicar',
      'consignment_withholding', v_r.id::text, v_valor,
      'Nota ' || v_nota.number || ': retención de ' || v_r.class || ' del comprador abonada a la factura con el cobro del '
        || to_char(p_fecha, 'YYYY-MM-DD') || '; el saldo de cartera aún no cuenta el abono (ver saldo real exigible)');
  else
    select * into v_cfg from public.consignment_account_settings where organization_id = p_organization_id;
    v_sufrida := public.fn_consignacion_cuenta_valida(p_organization_id, v_cfg.withheld_accounts ->> v_r.class, '^1355[0-9]{2,6}$');
    if v_sufrida is null then
      raise exception 'sin_cuenta_retencion_sufrida' using errcode = 'P0002', detail = v_r.class,
        hint = 'Defina en Consignaciones › Cuentas la cuenta de retención sufrida (bajo 1355) de esta clase.';
    end if;
    v_cxc := least(v_valor, greatest(public.fn_consignacion_cxc_dueno_saldo(v_nota.id), 0));
    v_resto := v_valor - v_cxc;
    if v_cxc > 0 then
      v_e1 := public.fn_create_journal_entry(
        p_organization_id := p_organization_id, p_branch_id := v_nota.branch_id, p_entry_date := v_instante,
        p_memo := 'Retención sufrida sobre la comisión (por cobrar al dueño) - ' || v_nota.number, p_source := 'consignment_withholding',
        p_source_id := v_r.id::text, p_debit_account := v_sufrida, p_credit_account := v_nota.owner_receivable_account_code,
        p_amount := v_cxc, p_created_by := v_uid, p_fact_key := 'consignment_withholding:' || v_r.id::text || ':cxc');
    end if;
    if v_resto > 0 then
      v_e2 := public.fn_create_journal_entry(
        p_organization_id := p_organization_id, p_branch_id := v_nota.branch_id, p_entry_date := v_instante,
        p_memo := 'Retención sufrida sobre la comisión ya compensada - ' || v_nota.number, p_source := 'consignment_withholding',
        p_source_id := v_r.id::text, p_debit_account := v_sufrida, p_credit_account := v_nota.owner_account_code,
        p_amount := v_resto, p_created_by := v_uid, p_fact_key := 'consignment_withholding:' || v_r.id::text);
    end if;
  end if;
  if coalesce(v_e1, v_e2) is null then raise exception 'asiento_no_creado' using errcode = 'P0001'; end if;

  update public.consignment_settlement_withholdings
     set status = 'practicada', practiced_amount = v_valor, practiced_base = round(p_base, 2), practiced_at = p_fecha, practiced_support = v_soporte,
         practiced_invoice_id = p_factura, practiced_receivable = v_cxc, journal_entry_id = coalesce(v_e1, v_e2)
   where id = v_r.id;
  update public.journal_entry_failures
     set resolved_at = now(), resolution = 'retencion_practicada'
   where organization_id = p_organization_id and source = 'consignment_owner_settlement'
     and source_id = v_r.settlement_id::text || ':' || v_r.id::text and resolved_at is null;
  -- El certificado no crea el hecho: queda como pendiente de SOPORTE hasta conciliarlo (ronda 5, respuesta 10).
  perform public.fn_consignacion_pendiente(p_organization_id, v_nota.branch_id, 'consignacion_retencion_certificado_pendiente',
    'consignment_withholding', 'cert:' || v_r.id::text, v_valor,
    'Nota ' || v_nota.number || ': retención practicada; certificado del agente pendiente de soporte (conciliar al recibirlo)');
  return jsonb_build_object('retencion_id', v_r.id, 'repetida', false, 'valor', v_valor, 'ambito', v_r.scope, 'asiento_id', coalesce(v_e1, v_e2),
                            'asiento_resto', case when v_e1 is not null then v_e2 end, 'por_cobrar_dueno', v_cxc, 'contra_281510', v_valor - v_cxc,
                            'cuenta_cliente', v_cuenta, 'cobro_id', v_pago.id,
                            'abono_factura', case when v_r.scope = 'operacion' then jsonb_build_object(
                               'factura_id', p_factura, 'valor', v_valor, 'estado', 'por_aplicar', 'saldo_factura', v_saldo_factura,
                               'saldo_real_exigible', round(v_saldo_factura - v_por_aplicar - v_valor, 2)) end,
                            'certificado', 'pendiente_de_soporte');
end;
$function$;

comment on table public.consignment_withholding_receivable_applications is
  'Ronda 5: abono a la factura por la retención de la operación practicada por el comprador, ligado al cobro (mismo momento). por_aplicar hasta que el saldo de cartera lo cuente.';
