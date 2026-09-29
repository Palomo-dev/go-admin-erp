-- Reversión de 20260929120000_peso_f1_unidades_dian. Las líneas de factura ya
-- creadas con KGM/LBR/LTR/MTR conservan su unidad (no se revierten datos).

drop trigger if exists trg_invoice_items_unidad_dian on public.invoice_items;
drop function if exists public.fn_invoice_items_unidad_dian();

alter table public.units drop column if exists dian_unit_measure_id;

delete from public.dian_unit_measures d
 where d.id = 80
   and not exists (select 1 from public.invoice_items ii where ii.unit_measure_id = 80);

-- La libra y sus conversiones, solo si ningún producto ni receta la usa.
do $$
begin
  if not exists (select 1 from public.products p where btrim(p.unit_code) = 'LB')
     and not exists (select 1 from public.recipe_ingredients ri where btrim(ri.unit_code) = 'LB') then
    delete from public.unit_conversions uc
     where uc.organization_id is null
       and (btrim(uc.from_unit_code), btrim(uc.to_unit_code)) in (('LB', 'KG'), ('KG', 'LB'), ('LB', 'GR'), ('GR', 'LB'));
    delete from public.units u where btrim(u.code) = 'LB';
  end if;
end;
$$;
