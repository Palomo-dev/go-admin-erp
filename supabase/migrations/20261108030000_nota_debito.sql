-- Frente D3, ronda 3 de Finanzas. Aplicada por el MCP el 2026-11-07 con orden del
-- dueño. Sin ella, las rutas de nota débito responden 501 `nota_debito_no_disponible`.
--
-- Nota débito de venta como documento propio (docs/design/FINANZAS-DOCUMENTOS-V2.md
-- §5, opción A de Q-ND1: cuenta por cobrar propia). Hoy en la base: 0 notas
-- débito, 2 rangos `debit_note` activos, `invoice_sales.document_type` ya admite
-- 'debit_note' (CHECK) y la cola admite el tipo.
--
-- Lo que ya hace la base sin tocarla (verificado por MCP el 2026-11-07):
--   · tr_create_account_receivable (AFTER INSERT, status <> 'draft') crea la
--     cartera de la nota con su total y su vencimiento → cartera propia.
--   · fn_auto_journal_sale ya contempla document_type = 'debit_note' (memo
--     «Nota débito …», regla 'nota_debito' por líneas): débito cartera, crédito
--     ingreso e IVA generado — simétrico al de la nota crédito.
--   · fn_auto_journal_void revierte 'accrual:invoice:<id>' al anular.
--   · fn_factura_venta_recalcular_saldo y fn_recalc_invoice_totals tratan la
--     nota débito como una factura (total − pagado − notas crédito vivas).
--   · fn_invoice_sales_acreditado solo suma notas CRÉDITO: la nota débito no
--     cambia el saldo de la factura original (FV no cambia; la ND se cobra aparte).
--
-- Esta migración:
--   1. fn_nota_debito_codigo_impuesto(nombre, tarifa): código de impuesto de la
--      línea (IVA_19, IVA_5, INC_8, IVA_0, IVA_EXCLUIDO) con la convención de
--      invoice_items.tax_code.
--   2. fn_nota_debito_emitir(p_invoice_id, p_concepto, p_lineas, p_motivo, p_clave):
--      SECURITY DEFINER; guarda de organización y permiso (fn_finanzas_exigir_permiso
--      → finance.create), acceso a la sucursal, idempotente por clave; la factura
--      debe ser una factura viva (no borrador, no anulada, no nota); número por
--      fn_get_next_invoice_number(org, sucursal, 'debit_note'); líneas manuales
--      con el impuesto RESUELTO EN EL SERVIDOR desde organization_taxes (el
--      cliente solo manda el id); total = base + impuesto (sin impuesto incluido);
--      vence con el mismo plazo de la factura. Concepto DIAN 1–4 y motivo quedan
--      en la descripción («Concepto DIAN: n. Motivo: …») y en finance_audit_log.
--      El envío a la DIAN NO se hace aquí (la nota crédito tampoco): lo encola el
--      servidor cuando el despacho de notas débito exista en la cola.
--   3. fn_nota_debito_anular(p_nota_id, p_motivo): finance.void, idempotente;
--      bloquea si la DIAN la aceptó o está en envío, o si tiene pagos vivos. Pone
--      status = 'void': los disparadores revierten el asiento y la cartera.
--   4. fn_registrar_pago acepta pagar una nota débito (antes: documento_invalido
--      para todo lo que no fuera 'invoice'). Se cambia SOLO esa línea con un
--      reemplazo verificado (debe aparecer exactamente una vez); el resto del
--      cuerpo queda idéntico. El rollback hace el reemplazo inverso.
--
-- Prueba en seco (NO aplicada; correr dentro de begin … rollback con una sesión
-- de un usuario con finance.create sobre una factura emitida de pruebas):
--   begin;
--   do $$
--   declare r jsonb; v_inv uuid := '<factura de pruebas>'; v_tax uuid := '<IVA 19 de la org>';
--   begin
--     r := public.fn_nota_debito_emitir(v_inv, '2',
--            jsonb_build_array(jsonb_build_object('descripcion','Gastos de cobranza','cantidad',1,'valor_unitario',45000,'impuesto_id',v_tax)),
--            'Gastos de cobranza de prueba', 'prueba-seco-1');
--     raise notice 'emitida %', r;
--     raise notice 'cartera %', (select row_to_json(a) from accounts_receivable a where a.invoice_id = (r->>'id')::uuid);
--     raise notice 'asiento %', (select count(*) from journal_entries j where j.fact_key like 'accrual:invoice:' || (r->>'id') || '%');
--     raise notice 'repetida %', public.fn_nota_debito_emitir(v_inv, '2', '[]'::jsonb, 'Gastos de cobranza de prueba', 'prueba-seco-1');
--     raise notice 'anulada %', public.fn_nota_debito_anular((r->>'id')::uuid, 'Prueba en seco');
--   end $$;
--   rollback;

-- ── 1. Código de impuesto de una línea ──────────────────────────────────────
create or replace function public.fn_nota_debito_codigo_impuesto(p_nombre text, p_tarifa numeric)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when coalesce(p_tarifa, 0) <= 0 then
      case when lower(coalesce(p_nombre, '')) like '%exclu%' then 'IVA_EXCLUIDO' else 'IVA_0' end
    when lower(coalesce(p_nombre, '')) like '%consumo%' or upper(coalesce(p_nombre, '')) like '%INC%' then
      'INC_' || trim(trailing '.' from trim(trailing '0' from p_tarifa::text))
    else
      'IVA_' || trim(trailing '.' from trim(trailing '0' from p_tarifa::text))
  end;
$$;

-- ── 2. Emitir ───────────────────────────────────────────────────────────────
create or replace function public.fn_nota_debito_emitir(
  p_invoice_id uuid,
  p_concepto text,
  p_lineas jsonb,
  p_motivo text,
  p_clave_idempotencia text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_existente public.invoice_sales%rowtype;
  v_l jsonb;
  v_lineas jsonb := '[]'::jsonb;
  v_desc text;
  v_q numeric;
  v_unit numeric;
  v_tax_id uuid;
  v_tax record;
  v_tarifa numeric;
  v_codigo text;
  v_base numeric;
  v_total_linea numeric;
  v_sub numeric := 0;
  v_tot numeric := 0;
  v_numero text;
  v_plazo interval;
  v_nd_id uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;

  select * into v_inv from public.invoice_sales where id = p_invoice_id for update;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.create']);
  if v_inv.branch_id is not null and not public.app_branch_access(v_inv.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Idempotencia: la misma clave devuelve la nota ya emitida.
  perform pg_advisory_xact_lock(hashtextextended('nota_debito:' || v_inv.organization_id || ':' || p_clave_idempotencia, 0));
  select * into v_existente from public.invoice_sales
   where organization_id = v_inv.organization_id and idempotency_key = p_clave_idempotencia;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.number,
                              'total', coalesce(v_existente.total, 0), 'repetida', true,
                              'fe_factura', v_inv.einvoice_status);
  end if;

  if p_concepto is null or p_concepto not in ('1', '2', '3', '4') then
    raise exception 'concepto_invalido' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'factura_borrador' using errcode = '22023';
  end if;
  if v_inv.status in ('void', 'voided', 'cancelled') then
    raise exception 'ya_anulada' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lineas) > 50 then
    raise exception 'demasiadas_lineas' using errcode = '22023';
  end if;

  -- ── Líneas: el impuesto sale de organization_taxes, nunca del cliente ──
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_desc := btrim(coalesce(v_l->>'descripcion', ''));
    if v_desc = '' or length(v_desc) > 200 then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    begin
      v_q := (v_l->>'cantidad')::numeric;
      v_unit := (v_l->>'valor_unitario')::numeric;
    exception when others then
      raise exception 'linea_invalida' using errcode = '22023';
    end;
    if v_q is null or v_q <= 0 or v_unit is null or v_unit <= 0 then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;

    v_tarifa := 0;
    v_codigo := null;
    if nullif(v_l->>'impuesto_id', '') is not null then
      begin
        v_tax_id := (v_l->>'impuesto_id')::uuid;
      exception when others then
        raise exception 'impuesto_invalido' using errcode = '22023';
      end;
      select t.id, t.name, t.rate into v_tax
        from public.organization_taxes t
       where t.id = v_tax_id and t.organization_id = v_inv.organization_id
         and coalesce(t.is_active, true) and coalesce(t.kind, 'tax') = 'tax';
      if not found then
        raise exception 'impuesto_invalido' using errcode = '22023';
      end if;
      v_tarifa := coalesce(v_tax.rate, 0);
      v_codigo := public.fn_nota_debito_codigo_impuesto(v_tax.name, v_tarifa);
    end if;

    v_base := round(v_q * v_unit, 2);
    v_total_linea := round(v_base * (1 + v_tarifa / 100), 2);
    v_sub := v_sub + v_base;
    v_tot := v_tot + v_total_linea;
    v_lineas := v_lineas || jsonb_build_object(
      'descripcion', v_desc, 'q', v_q, 'unit_price', v_unit, 'total_line', v_total_linea,
      'tax_rate', v_tarifa, 'tax_code', v_codigo);
  end loop;
  if v_tot <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  -- ── Número: la numeración de notas débito de la sucursal ──
  begin
    select n.invoice_number into v_numero
      from public.fn_get_next_invoice_number(v_inv.organization_id, v_inv.branch_id, 'debit_note') n;
  exception when others then
    raise exception 'sin_numeracion' using errcode = '22023',
      hint = 'La sucursal no tiene numeración de notas débito activa y vigente.';
  end;
  if v_numero is null then
    raise exception 'sin_numeracion' using errcode = '22023';
  end if;

  -- Mismo plazo de la factura: vence tantos días después de hoy como la factura
  -- después de su emisión.
  v_plazo := greatest(coalesce(v_inv.due_date - v_inv.issue_date, interval '0'), interval '0');

  insert into public.invoice_sales (
    organization_id, branch_id, customer_id, number, issue_date, due_date,
    currency, subtotal, tax_total, total, balance, status, document_type,
    related_invoice_id, tax_included, payment_method, payment_form, payment_method_code,
    payment_terms, description, created_by, idempotency_key
  ) values (
    v_inv.organization_id, v_inv.branch_id, v_inv.customer_id, v_numero, now(), now() + v_plazo,
    v_inv.currency, v_sub, v_tot - v_sub, v_tot, v_tot, 'issued', 'debit_note',
    v_inv.id, false, v_inv.payment_method, v_inv.payment_form, v_inv.payment_method_code,
    v_inv.payment_terms,
    'Nota débito de la factura ' || coalesce(v_inv.number, v_inv.id::text) || '. Concepto DIAN: ' || p_concepto
      || '. Motivo: ' || btrim(p_motivo),
    v_uid, p_clave_idempotencia
  )
  returning id into v_nd_id;

  insert into public.invoice_items (
    invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
    total_line, tax_rate, tax_code, discount_amount, tax_included
  )
  select v_nd_id, v_nd_id, 'sale', null, l->>'descripcion', (l->>'q')::numeric, (l->>'unit_price')::numeric,
         (l->>'total_line')::numeric, (l->>'tax_rate')::numeric, l->>'tax_code', 0, false
    from jsonb_array_elements(v_lineas) l;

  insert into public.invoice_applied_taxes (invoice_id, tax_code, tax_rate, is_applied)
  select distinct v_nd_id, l->>'tax_code', (l->>'tax_rate')::numeric, true
    from jsonb_array_elements(v_lineas) l
   where coalesce(l->>'tax_code', '') <> '' and (l->>'tax_rate')::numeric > 0;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_inv.organization_id, 'invoice_sales', v_nd_id::text, 'insert', v_uid,
          jsonb_build_object('documento', 'nota_debito', 'factura', v_inv.id, 'numero', v_numero,
                             'concepto', p_concepto, 'total', v_tot, 'lineas', jsonb_array_length(v_lineas)),
          btrim(p_motivo));

  return jsonb_build_object('id', v_nd_id, 'numero', v_numero, 'total', v_tot, 'repetida', false,
                            'fe_factura', v_inv.einvoice_status);
end;
$function$;

-- ── 3. Anular ───────────────────────────────────────────────────────────────
create or replace function public.fn_nota_debito_anular(p_nota_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_nd public.invoice_sales%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select * into v_nd from public.invoice_sales where id = p_nota_id for update;
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_nd.organization_id, array['finance.void']);
  if v_nd.branch_id is not null and not public.app_branch_access(v_nd.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if coalesce(v_nd.document_type, 'invoice') <> 'debit_note' then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;
  if v_nd.status in ('void', 'voided', 'cancelled') then
    return jsonb_build_object('id', v_nd.id, 'status', v_nd.status, 'ya_anulada', true);
  end if;

  if v_nd.einvoice_status = 'accepted' or exists (
      select 1 from public.electronic_invoicing_jobs j
       where j.invoice_id = v_nd.id and j.organization_id = v_nd.organization_id and j.status = 'accepted') then
    raise exception 'nota_aceptada_dian' using errcode = '22023',
      hint = 'La DIAN ya aceptó esta nota débito: se corrige con una nota crédito, no se anula.';
  end if;
  if exists (select 1 from public.electronic_invoicing_jobs j
              where j.invoice_id = v_nd.id and j.organization_id = v_nd.organization_id
                and j.status in ('processing', 'sent')) then
    raise exception 'nota_en_envio_dian' using errcode = '22023';
  end if;
  if public.fn_invoice_sales_paid(v_nd.id) > 0 then
    raise exception 'nota_con_pagos' using errcode = '22023',
      hint = 'La nota débito tiene pagos: anúlelos primero.';
  end if;

  -- Cancela los envíos pendientes o retenidos de la nota (no se mandan anulada).
  update public.electronic_invoicing_jobs
     set status = 'cancelled', hold_reason = null, updated_at = now()
   where invoice_id = v_nd.id and organization_id = v_nd.organization_id and status in ('pending', 'failed');

  -- Los disparadores revierten el asiento (fn_auto_journal_void) y la cartera.
  update public.invoice_sales
     set status = 'void', balance = 0, updated_at = now()
   where id = v_nd.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_nd.organization_id, 'invoice_sales', v_nd.id::text, 'void', v_uid,
          jsonb_build_object('documento', 'nota_debito', 'numero', v_nd.number, 'total', v_nd.total),
          btrim(p_motivo));

  return jsonb_build_object('id', v_nd.id, 'status', 'void', 'ya_anulada', false);
end;
$function$;

revoke all on function public.fn_nota_debito_codigo_impuesto(text, numeric) from public, anon;
revoke all on function public.fn_nota_debito_emitir(uuid, text, jsonb, text, text) from public, anon;
revoke all on function public.fn_nota_debito_anular(uuid, text) from public, anon;
grant execute on function public.fn_nota_debito_codigo_impuesto(text, numeric) to authenticated, service_role;
grant execute on function public.fn_nota_debito_emitir(uuid, text, jsonb, text, text) to authenticated, service_role;
grant execute on function public.fn_nota_debito_anular(uuid, text) to authenticated, service_role;

-- ── 4. fn_registrar_pago acepta la nota débito ─────────────────────────────
-- Reemplazo verificado de UNA línea; CREATE OR REPLACE conserva el ACL.
do $$
declare
  v_firma constant regprocedure :=
    'public.fn_registrar_pago(text,jsonb,text,text,date,text,integer,numeric,numeric,text,text,text,integer)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
  v_viejo constant text := $v$if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then raise exception 'documento_invalido'$v$;
  v_nuevo constant text := $v$if coalesce(v_inv.document_type, 'invoice') not in ('invoice', 'debit_note') then raise exception 'documento_invalido'$v$;
  v_veces integer;
begin
  if position(v_nuevo in v_def) > 0 then
    raise notice 'fn_registrar_pago ya acepta la nota débito';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_veces <> 1 then
    raise exception 'fn_registrar_pago cambió: se esperaba 1 aparición del filtro de documento y hay %', v_veces;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$$;
