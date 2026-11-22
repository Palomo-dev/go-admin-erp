-- POS · Cargos de servicio v2 (Figma 1088:714506): impuesto propio y archivo.
--
-- 1. `tax_id`: el impuesto del cargo (POS-CARGOS-SERVICIO-EN-VENTAS.md §1.5 y
--    §6 #1). `is_taxable` se conserva por compatibilidad y queda derivado:
--    `is_taxable = (tax_id is not null)`, lo pone el trigger. El impuesto
--    tiene que ser de la misma organización que el cargo.
-- 2. `archived_at`: «Archivar» reemplaza al borrado físico (POS-PAGINAS-
--    FALTANTES-FIGMA.md §5 #6). Un cargo archivado queda inactivo y fuera de
--    la lista por defecto; se puede restaurar. El día que el cobro guarde
--    `sale_service_charges`, sus filas seguirán apuntando al cargo.
--
-- Aditiva: columnas NULL, ningún dato existente cambia de valor salvo
-- `is_taxable` de los cargos que lo tenían en true sin impuesto (no hay
-- tarifa con la que cobrarlo: quedaban «gravados» sin saber con qué).

alter table public.service_charges
  add column if not exists tax_id uuid null references public.organization_taxes(id) on delete set null;
alter table public.service_charges
  add column if not exists archived_at timestamptz null;

create index if not exists idx_service_charges_tax_id on public.service_charges (tax_id) where tax_id is not null;

comment on column public.service_charges.tax_id is
  'Impuesto del cargo (organization_taxes de la misma organización). NULL = sin impuesto. is_taxable se deriva de esta columna.';
comment on column public.service_charges.archived_at is
  'Cargo archivado (reemplaza al borrado físico). Archivado implica is_active = false; se restaura poniendo NULL.';

create or replace function public.fn_service_charges_impuesto_y_archivo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tax_id is not null and not exists (
       select 1 from public.organization_taxes t
        where t.id = new.tax_id and t.organization_id = new.organization_id
     ) then
    raise exception 'El impuesto del cargo no es de esta organización' using errcode = '23514';
  end if;
  new.is_taxable := new.tax_id is not null;
  if new.archived_at is not null then
    new.is_active := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_charges_impuesto_y_archivo on public.service_charges;
create trigger trg_service_charges_impuesto_y_archivo
  before insert or update on public.service_charges
  for each row execute function public.fn_service_charges_impuesto_y_archivo();

update public.service_charges set is_taxable = false where is_taxable and tax_id is null;
