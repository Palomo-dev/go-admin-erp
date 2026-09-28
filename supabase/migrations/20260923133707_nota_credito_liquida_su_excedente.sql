-- F-58 · La nota crédito sobre una factura ya pagada liquida su excedente
-- (ADR-CC-008, aprobado 2026-09-23).
--
-- Una nota crédito revierte ingreso e IVA contra la cuenta por cobrar. Lo que
-- excede lo que aún se debía de la factura deja 1305 negativo sin documento.
-- Ese excedente se liquida de una de dos formas, elegida al emitir:
--
--   · saldo a favor (preseleccionada): credit_notes + 1305 D / 2805 C, por la
--     función que ya existía (fn_create_customer_credit);
--   · devolución de dinero: un pago con importe NEGATIVO en payments
--     (source='credit_note'), que el cierre de caja resta como salida, y el
--     asiento 1305 D / Caja|Bancos C según el medio.
--
-- · fn_excedente_nota_credito(nc): el dinero ya pagado que la nota convierte
--   en saldo del cliente (sin pago no hay excedente).
-- · fn_liquidar_excedente_nota_credito(nc, modo, método, cuenta bancaria):
--   idempotente por nota; guarda de pertenencia; si el asiento no se puede
--   crear, lanza y no deja nada a medias.
-- · fn_create_customer_credit: misma firma; su asiento gana clave del hecho
--   customer_credit:{id} y search_path fijo.
-- · credit_notes.source_credit_note_id: enlaza el saldo a favor con la nota
--   que lo originó.

alter table public.credit_notes
  add column if not exists source_credit_note_id uuid references public.invoice_sales(id) on delete set null;

create unique index if not exists uq_credit_notes_source_credit_note
  on public.credit_notes (source_credit_note_id) where source_credit_note_id is not null;

comment on column public.credit_notes.source_credit_note_id is
  'Nota crédito (invoice_sales, document_type credit_note) cuyo excedente originó este saldo a favor (F-58).';

-- ── Saldo a favor: misma firma, con clave del hecho ─────────────────────────
create or replace function public.fn_create_customer_credit(
  p_org integer, p_customer uuid, p_amount numeric,
  p_cash_account text DEFAULT '1110'::text, p_branch integer DEFAULT NULL::integer,
  p_notes text DEFAULT NULL::text, p_expiry timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_created_by uuid DEFAULT NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_id uuid;
  v_entry integer;
BEGIN
  -- La organización deja de ser un parámetro en el que confiar. El rol de
  -- servicio (sin auth.uid()) pasa igual, para no romper procesos de servidor.
  IF (select auth.uid()) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
     WHERE om.organization_id = p_org
       AND om.user_id = (select auth.uid())
       AND om.is_active
  ) THEN
    RAISE EXCEPTION 'no pertenece a la organizacion %', p_org USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  INSERT INTO public.credit_notes(organization_id, customer_id, branch_id, amount, balance, status, notes, expiry_date)
  VALUES (p_org, p_customer, p_branch, p_amount, p_amount, 'active', p_notes, p_expiry)
  RETURNING id INTO v_id;

  v_entry := fn_create_journal_entry(
    p_organization_id := p_org,
    p_branch_id := p_branch,
    p_entry_date := now(),
    p_memo := 'Saldo a favor cliente',
    p_source := 'customer_credit',
    p_source_id := v_id::text,
    p_debit_account := p_cash_account,
    p_credit_account := '2805',
    p_amount := p_amount,
    p_tax_account := NULL,
    p_tax_amount := 0,
    p_created_by := p_created_by,
    p_fact_key := 'customer_credit:' || v_id::text
  );

  RETURN v_id;
END;
$function$;

-- ── Excedente de una nota crédito ───────────────────────────────────────────
create or replace function public.fn_excedente_nota_credito(p_credit_note_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
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
$$;

revoke all on function public.fn_excedente_nota_credito(uuid) from public, anon;
grant execute on function public.fn_excedente_nota_credito(uuid) to authenticated, service_role;

-- ── Liquidación del excedente ───────────────────────────────────────────────
create or replace function public.fn_liquidar_excedente_nota_credito(
  p_credit_note_id uuid,
  p_modo text,
  p_metodo text default null,
  p_bank_account_id integer default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nc invoice_sales%rowtype;
  v_customer uuid;
  v_exc numeric;
  v_recv text;
  v_money text;
  v_credit uuid;
  v_payment uuid;
  v_entry integer;
begin
  if p_modo not in ('saldo_a_favor', 'devolucion') then
    raise exception 'Modo inválido: %. Use saldo_a_favor o devolucion', p_modo using errcode = '22023';
  end if;

  select * into v_nc from invoice_sales where id = p_credit_note_id and document_type = 'credit_note';
  if not found then
    raise exception 'La nota crédito % no existe', p_credit_note_id using errcode = 'P0002';
  end if;

  -- Guarda de pertenencia (afirmación positiva). Sin sesión solo pasan los
  -- roles de servidor.
  if auth.uid() is not null then
    if not exists (select 1 from organization_members om
                   where om.user_id = auth.uid() and om.organization_id = v_nc.organization_id and om.is_active) then
      raise exception 'No perteneces a la organización de esta nota crédito' using errcode = '42501';
    end if;
  elsif coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'service_role') then
    raise exception 'Se requiere una sesión' using errcode = '42501';
  end if;

  -- Idempotente: una nota se liquida una sola vez.
  select id into v_credit from credit_notes where source_credit_note_id = v_nc.id;
  if v_credit is not null then
    return jsonb_build_object('modo', 'saldo_a_favor', 'ya_liquidada', true, 'credit_id', v_credit);
  end if;
  select id into v_payment from payments where source = 'credit_note' and source_id = v_nc.id::text limit 1;
  if v_payment is not null then
    return jsonb_build_object('modo', 'devolucion', 'ya_liquidada', true, 'payment_id', v_payment);
  end if;

  v_exc := fn_excedente_nota_credito(v_nc.id);
  if v_exc <= 0 then
    return jsonb_build_object('excedente', 0);
  end if;

  select debit_account_code into v_recv from fn_regla_devengo_venta(v_nc.organization_id);
  if v_recv is null then
    raise exception 'La organización no tiene regla de venta con cuenta por cobrar' using errcode = 'P0002';
  end if;

  if p_modo = 'saldo_a_favor' then
    v_customer := coalesce(v_nc.customer_id,
                           (select customer_id from invoice_sales where id = v_nc.related_invoice_id));
    if v_customer is null then
      raise exception 'La factura no tiene cliente: el excedente solo se puede devolver' using errcode = '22023';
    end if;

    -- 1305 D / 2805 C: la cuenta «de dinero» de fn_create_customer_credit es
    -- aquí la cuenta por cobrar, que la nota dejó en negativo.
    v_credit := fn_create_customer_credit(
      p_org := v_nc.organization_id,
      p_customer := v_customer,
      p_amount := v_exc,
      p_cash_account := v_recv,
      p_branch := v_nc.branch_id,
      p_notes := 'Saldo a favor por la nota crédito ' || coalesce(v_nc.number, v_nc.id::text),
      p_expiry := null,
      p_created_by := auth.uid());
    update credit_notes set source_credit_note_id = v_nc.id where id = v_credit;

    if not exists (select 1 from journal_entries
                   where organization_id = v_nc.organization_id and fact_key = 'customer_credit:' || v_credit) then
      raise exception 'No se pudo contabilizar el saldo a favor (ver journal_entry_failures)';
    end if;

    return jsonb_build_object('modo', 'saldo_a_favor', 'excedente', v_exc, 'credit_id', v_credit);
  end if;

  -- Devolución de dinero.
  if p_metodo is null then
    raise exception 'Indique el medio por el que se devuelve el dinero' using errcode = '22023';
  end if;
  v_money := fn_money_account_code_pago(v_nc.organization_id, v_nc.branch_id, p_metodo, p_bank_account_id);
  if v_money is null then
    raise exception 'No se encontró la cuenta de caja o banco para el medio %', p_metodo using errcode = 'P0002';
  end if;

  -- Importe negativo: es una salida. El cierre de caja suma los pagos por medio
  -- y así la resta; fn_auto_journal_payment ignora source='credit_note'.
  insert into payments (organization_id, branch_id, amount, method, currency, status,
                        source, source_id, reference, created_by, bank_account_id)
  values (v_nc.organization_id, v_nc.branch_id, -v_exc, p_metodo, coalesce(v_nc.currency, 'COP'), 'completed',
          'credit_note', v_nc.id::text, 'Devolución por la nota crédito ' || coalesce(v_nc.number, ''),
          auth.uid(), p_bank_account_id)
  returning id into v_payment;

  v_entry := fn_create_journal_entry(
    p_organization_id := v_nc.organization_id,
    p_branch_id := v_nc.branch_id,
    p_entry_date := now(),
    p_memo := 'Devolución por la nota crédito ' || coalesce(v_nc.number, v_nc.id::text),
    p_source := 'credit_note',
    p_source_id := v_nc.id::text,
    p_debit_account := v_recv,
    p_credit_account := v_money,
    p_amount := v_exc,
    p_created_by := auth.uid(),
    p_tax_is_credit := false,
    p_fact_key := 'refund:credit_note:' || v_nc.id::text);
  if v_entry is null then
    raise exception 'No se pudo contabilizar la devolución (ver journal_entry_failures)';
  end if;

  return jsonb_build_object('modo', 'devolucion', 'excedente', v_exc, 'payment_id', v_payment, 'entry_id', v_entry);
end;
$$;

revoke all on function public.fn_liquidar_excedente_nota_credito(uuid, text, text, integer) from public, anon;
grant execute on function public.fn_liquidar_excedente_nota_credito(uuid, text, text, integer) to authenticated, service_role;

-- La vista de control cuenta como pendiente solo lo que no se liquidó.
create or replace view public.v_cartera_vs_documentos
with (security_invoker = true) as
with orgs as (
  select o.id as organization_id, r.debit_account_code as cuenta_cxc
  from organizations o
  cross join lateral fn_regla_devengo_venta(o.id) r
),
libro as (
  select je.organization_id, jl.account_code, sum(jl.debit - jl.credit) as saldo
  from journal_entries je
  join journal_lines jl on jl.journal_entry_id = je.id
  group by 1, 2
),
abiertas as (
  select organization_id, sum(balance) as saldo
  from invoice_sales
  where status in ('issued', 'partial') and coalesce(document_type, 'invoice') = 'invoice'
  group by 1
),
nc_pagadas as (
  select nc.organization_id, count(*) as n, -sum(fn_excedente_nota_credito(nc.id)) as importe
  from invoice_sales nc
  where nc.document_type = 'credit_note'
    and fn_excedente_nota_credito(nc.id) > 0
    and not exists (select 1 from credit_notes c where c.source_credit_note_id = nc.id)
    and not exists (select 1 from payments p where p.source = 'credit_note' and p.source_id = nc.id::text)
  group by 1
),
sin_pago as (
  select i.organization_id, count(*) as n, sum(i.total) as importe
  from invoice_sales i
  where i.status = 'paid' and coalesce(i.document_type, 'invoice') = 'invoice'
    and i.total > 0 and fn_invoice_sales_paid(i.id) = 0
  group by 1
)
select
  g.organization_id,
  g.cuenta_cxc,
  coalesce(l.saldo, 0) as cxc_libro,
  coalesce(a.saldo, 0) as cxc_facturas_abiertas,
  coalesce(l.saldo, 0) - coalesce(a.saldo, 0) as diferencia,
  coalesce(nc.n, 0) as nc_sobre_pagadas,
  coalesce(nc.importe, 0) as importe_nc_sobre_pagadas,
  coalesce(sp.n, 0) as pagadas_sin_pago,
  coalesce(sp.importe, 0) as importe_pagadas_sin_pago
from orgs g
left join libro l on l.organization_id = g.organization_id and l.account_code = g.cuenta_cxc
left join abiertas a on a.organization_id = g.organization_id
left join nc_pagadas nc on nc.organization_id = g.organization_id
left join sin_pago sp on sp.organization_id = g.organization_id
where l.saldo is not null or a.saldo is not null or sp.n is not null;

revoke all on public.v_cartera_vs_documentos from public, anon, authenticated;
grant select on public.v_cartera_vs_documentos to service_role;
