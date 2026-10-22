-- Org 142. Ocho promociones de lunes a miercoles pasan a min_quantity = 2.
-- Antes del cambio las ocho tenian min_quantity NULL. El disparador de
-- updated_at se apaga solo dentro de esta transaccion para no reescribir
-- ninguna otra columna. Si no cambian exactamente 8 filas, no se aplica nada.
do $$
declare
  n integer;
begin
  alter table public.promotions disable trigger trg_promotions_updated_at;
  update public.promotions
     set min_quantity = 2
   where organization_id = 142
     and min_quantity is null
     and id in (
       '2385ac6d-3887-485d-938e-1e2abe8c0645',
       '2d2241b7-b526-49bc-92bc-ced4d038d0f6',
       '2d96a74c-5cbe-4af8-b45c-70c51841163c',
       '3b02db18-3ad6-4599-904f-28ee52756063',
       '745324c8-c35c-45c8-8eff-e7454fe47433',
       '96388b44-4a3a-473f-a16e-91c4ec2ecbe7',
       '99747d34-4b87-4ec2-8301-ef6abe48dd3b',
       'a55e2901-8a52-4b84-8adf-e87b036b92f0'
     );
  get diagnostics n = row_count;
  alter table public.promotions enable trigger trg_promotions_updated_at;
  if n <> 8 then
    raise exception 'se esperaban 8 filas y cambiaron %', n;
  end if;
end $$;
