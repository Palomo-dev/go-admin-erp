-- Rollback de 20260923133707_nota_credito_liquida_su_excedente.sql
-- (y de 20260923133809, que solo reemplaza fn_excedente_nota_credito).
--
-- Las liquidaciones ya hechas NO se borran: son saldos a favor (credit_notes +
-- asiento 1305 D / 2805 C) y devoluciones (pago negativo + 1305 D / Caja|Bancos C)
-- publicados. Para deshacer una, se revierte su asiento con fn_revertir_asiento
-- y se anula el documento (credit_notes.status / payments.status).
--
-- Este archivo retira las funciones nuevas y devuelve fn_create_customer_credit
-- a su versión sin clave del hecho; conserva la columna
-- credit_notes.source_credit_note_id (aditiva, rastro de las liquidaciones).
drop function if exists public.fn_liquidar_excedente_nota_credito(uuid, text, text, integer);

-- La vista de control vuelve a contar «notas sobre facturas pagadas» por estado.
create or replace view public.v_cartera_vs_documentos
with (security_invoker = true) as
with orgs as (
  select o.id as organization_id, r.debit_account_code as cuenta_cxc
  from organizations o
  cross join lateral fn_regla_devengo_venta(o.id) r
),
libro as (
  select je.organization_id, jl.account_code, sum(jl.debit - jl.credit) as saldo
  from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
  group by 1, 2
),
abiertas as (
  select organization_id, sum(balance) as saldo
  from invoice_sales
  where status in ('issued', 'partial') and coalesce(document_type, 'invoice') = 'invoice'
  group by 1
),
nc_pagadas as (
  select nc.organization_id, count(*) as n, sum(nc.total) as importe
  from invoice_sales nc join invoice_sales f on f.id = nc.related_invoice_id
  where nc.document_type = 'credit_note' and f.status = 'paid'
  group by 1
),
sin_pago as (
  select i.organization_id, count(*) as n, sum(i.total) as importe
  from invoice_sales i
  where i.status = 'paid' and coalesce(i.document_type, 'invoice') = 'invoice'
    and i.total > 0 and fn_invoice_sales_paid(i.id) = 0
  group by 1
)
select g.organization_id, g.cuenta_cxc,
  coalesce(l.saldo, 0) as cxc_libro, coalesce(a.saldo, 0) as cxc_facturas_abiertas,
  coalesce(l.saldo, 0) - coalesce(a.saldo, 0) as diferencia,
  coalesce(nc.n, 0) as nc_sobre_pagadas, coalesce(nc.importe, 0) as importe_nc_sobre_pagadas,
  coalesce(sp.n, 0) as pagadas_sin_pago, coalesce(sp.importe, 0) as importe_pagadas_sin_pago
from orgs g
left join libro l on l.organization_id = g.organization_id and l.account_code = g.cuenta_cxc
left join abiertas a on a.organization_id = g.organization_id
left join nc_pagadas nc on nc.organization_id = g.organization_id
left join sin_pago sp on sp.organization_id = g.organization_id
where l.saldo is not null or a.saldo is not null or sp.n is not null;

drop function if exists public.fn_excedente_nota_credito(uuid);

create or replace function public.fn_create_customer_credit(
  p_org integer, p_customer uuid, p_amount numeric,
  p_cash_account text DEFAULT '1110'::text, p_branch integer DEFAULT NULL::integer,
  p_notes text DEFAULT NULL::text, p_expiry timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_created_by uuid DEFAULT NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_id uuid;
  v_entry integer;
BEGIN
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
    p_tax_amount := 0
  );

  RETURN v_id;
END;
$function$;
