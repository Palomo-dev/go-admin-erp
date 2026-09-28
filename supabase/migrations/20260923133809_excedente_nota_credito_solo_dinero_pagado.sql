-- F-58 · El excedente de una nota crédito es solo dinero ya pagado.
--
-- La primera versión (20260923..._nota_credito_liquida_su_excedente) calculaba
-- |nota| − (total − pagos − notas previas). Aplicada a los datos reales daba
-- excedente en notas mayores que su factura SIN ningún pago (org 2, FACT-0061:
-- dos notas de −160.531 sobre una factura de 134.900 no pagada), y le atribuía a
-- la nota un sobrepago previo. Un excedente es dinero que el cliente pagó y que
-- la nota convierte en saldo suyo; sin pago no hay nada que devolver.

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

