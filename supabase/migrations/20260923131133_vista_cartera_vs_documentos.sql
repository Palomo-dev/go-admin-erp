-- Vista de control: cartera del libro contra cartera de los documentos.
--
-- Por organización:
--   · cuenta_cxc: la cuenta por cobrar de la organización (fn_regla_devengo_venta);
--   · cxc_libro: saldo de esa cuenta en el libro (débitos − créditos);
--   · cxc_facturas_abiertas: saldo de las facturas issued/partial;
--   · diferencia = cxc_libro − cxc_facturas_abiertas;
--   · nc_sobre_pagadas / importe_nc_sobre_pagadas: notas crédito sobre facturas
--     ya pagadas, que dejan un saldo a favor sin documento (F-58) y explican
--     una diferencia negativa;
--   · pagadas_sin_pago / importe_pagadas_sin_pago: facturas en paid sin ningún
--     pago registrado (fn_invoice_sales_paid = 0), que dejan 1305 abierto
--     aunque el documento diga que se cobró.
--
-- security_invoker: la vista no salta la RLS de quien la consulta. Además solo
-- service_role puede leerla: expone saldos de todas las organizaciones.

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
  select nc.organization_id, count(*) as n, sum(nc.total) as importe
  from invoice_sales nc
  join invoice_sales f on f.id = nc.related_invoice_id
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

comment on view public.v_cartera_vs_documentos is
  'Control: saldo de la cuenta por cobrar en el libro contra el saldo de las facturas abiertas, por organización, con las dos causas conocidas de diferencia (notas crédito sobre facturas pagadas, F-58; facturas pagadas sin pago registrado). Solo service_role.';
