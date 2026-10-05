-- Reversión de 20261005143459_plantilla_impuesto_consumo_inc_8.
-- Solo borra la plantilla si ninguna organización la usa (FK lógica por
-- organization_taxes.template_id): si ya se usa, se deja y se avisa.
do $$
begin
  if exists (select 1 from public.organization_taxes ot
               join public.tax_templates tt on tt.id = ot.template_id
              where tt.code = 'INC_8') then
    raise notice 'INC_8 ya está en uso por alguna organización: no se borra';
  else
    delete from public.tax_templates where code = 'INC_8';
  end if;
end $$;
