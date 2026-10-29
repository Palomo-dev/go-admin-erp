-- Métodos de pago por sucursal (QA 28-oct, Soporte AMARILLO): branch_ids = '{}' debe ser NULL («todas»).
-- El trigger trg_opm_validar_branch_ids (20261028180000) ya normaliza '{}' a NULL; esta migración lo
-- deja explícito, normaliza lo que hubiera quedado y agrega un CHECK (cardinality > 0) como red de
-- seguridad. El trigger es BEFORE, así que un INSERT/UPDATE con '{}' sigue funcionando: llega como NULL.
-- Conteo en prod al escribirla: 0 filas con '{}' (379 con NULL).
set lock_timeout = '5s';

create or replace function public.fn_opm_validar_branch_ids()
returns trigger
language plpgsql
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
begin
  if new.branch_ids is not null then
    if cardinality(new.branch_ids) = 0 then
      new.branch_ids := null;  -- lista vacía = todas
    elsif exists (
      select 1 from unnest(new.branch_ids) b(id)
       where not exists (select 1 from public.branches br
                          where br.id = b.id and br.organization_id = new.organization_id)
    ) then
      raise exception 'Las sucursales del método de pago deben ser de la misma organización'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Normalizar lo existente antes del CHECK.
update public.organization_payment_methods set branch_ids = null
 where branch_ids is not null and cardinality(branch_ids) = 0;

alter table public.organization_payment_methods
  drop constraint if exists opm_branch_ids_no_vacio;
alter table public.organization_payment_methods
  add constraint opm_branch_ids_no_vacio
  check (branch_ids is null or cardinality(branch_ids) > 0) not valid;
alter table public.organization_payment_methods
  validate constraint opm_branch_ids_no_vacio;
