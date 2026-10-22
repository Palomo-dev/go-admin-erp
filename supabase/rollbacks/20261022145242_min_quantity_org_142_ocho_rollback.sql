-- Devuelve min_quantity a NULL en las ocho filas de la org 142.
-- Antes de 20261022145242 las ocho estaban en NULL y updated_at era:
--   2385ac6d-3887-485d-938e-1e2abe8c0645  2026-10-22 04:53:59.353648+00
--   2d2241b7-b526-49bc-92bc-ced4d038d0f6  2026-10-22 01:34:02.205714+00
--   2d96a74c-5cbe-4af8-b45c-70c51841163c  2026-10-22 03:59:21.234281+00
--   3b02db18-3ad6-4599-904f-28ee52756063  2026-10-21 02:29:43.888869+00
--   745324c8-c35c-45c8-8eff-e7454fe47433  2026-10-22 04:51:15.293644+00
--   96388b44-4a3a-473f-a16e-91c4ec2ecbe7  2026-10-20 01:57:02.136338+00
--   99747d34-4b87-4ec2-8301-ef6abe48dd3b  2026-10-22 04:44:09.751346+00
--   a55e2901-8a52-4b84-8adf-e87b036b92f0  2026-10-22 01:33:58.787703+00
-- El update no reescribio updated_at. Este rollback tampoco: apaga el
-- disparador en la misma transaccion. Si no vuelven exactamente 8 filas, aborta.
do $$
declare
  n integer;
begin
  alter table public.promotions disable trigger trg_promotions_updated_at;
  update public.promotions
     set min_quantity = null
   where organization_id = 142
     and min_quantity = 2
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
    raise exception 'se esperaban 8 filas y volvieron %', n;
  end if;
end $$;
