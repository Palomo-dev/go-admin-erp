-- Reversión de 20261005143834_impuesto_consumo_inc_8_organizaciones_colombia.
-- Quita el INC 8 % solo donde no se ha usado: sin productos asignados
-- (product_tax_relations). Donde ya se usa, se conserva y se avisa.
do $$
declare
  v_borrados integer;
  v_en_uso integer;
begin
  select count(*) into v_en_uso
    from public.organization_taxes ot
    join public.tax_templates tt on tt.id = ot.template_id
   where tt.code = 'INC_8'
     and exists (select 1 from public.product_tax_relations r where r.tax_id = ot.id);

  delete from public.organization_taxes ot
   using public.tax_templates tt
   where tt.id = ot.template_id
     and tt.code = 'INC_8'
     and not exists (select 1 from public.product_tax_relations r where r.tax_id = ot.id);
  get diagnostics v_borrados = row_count;

  raise notice 'INC_8: % filas borradas, % en uso conservadas', v_borrados, v_en_uso;
end $$;
