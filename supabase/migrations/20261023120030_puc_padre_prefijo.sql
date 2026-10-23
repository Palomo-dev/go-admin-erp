-- Padre por el prefijo más largo que existe.
-- Candado exclusivo solo en este archivo, y como máximo 25 segundos.
-- Si el grupo intermedio no existe, el padre salta a la clase: el disparador
-- no lo permitiría, por eso se apaga y se vuelve a prender aquí mismo.
-- Al revertir la transacción el disparador queda como estaba.
-- Reversión: supabase/rollbacks/20261023120030_puc_padre_prefijo_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '25s';

create temporary table tmp_puc_norm on commit drop as
select organization_id,
       account_code,
       replace(account_code, '-', '') as norm
from public.chart_of_accounts;

create index tmp_puc_norm_org_norm on tmp_puc_norm (organization_id, norm);

alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;

update public.chart_of_accounts c
set parent_code = null
where length(replace(c.account_code, '-', '')) = 1
  and c.parent_code is not null;

update public.chart_of_accounts c
set parent_code = p.padre
from (
  select distinct on (h.organization_id, h.account_code)
    h.organization_id,
    h.account_code,
    a.account_code as padre
  from tmp_puc_norm h
  join tmp_puc_norm a
    on a.organization_id = h.organization_id
   and length(a.norm) < length(h.norm)
   and a.account_code = left(h.norm, length(a.norm))
   and (
     length(a.norm) in (1, 2, 4, 6, 8)
     or (length(a.norm) >= 10 and length(a.norm) % 2 = 0)
   )
  order by h.organization_id, h.account_code, length(a.norm) desc
) p
where c.organization_id = p.organization_id
  and c.account_code = p.account_code
  and c.parent_code is distinct from p.padre;

alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
