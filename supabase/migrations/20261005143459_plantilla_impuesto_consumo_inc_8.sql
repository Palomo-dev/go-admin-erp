-- Plantilla «Impuesto Nacional al Consumo 8 % (INC)» para Colombia (2026-10-05).
--
-- Verificado por MCP: tax_templates (país COL) solo tenía IVA 19/5/0/excluido y
-- retenciones; ninguna organización tenía un impuesto al 8 %. Un restaurante que
-- cobra impoconsumo no podía configurarlo bien:
--   - sin plantilla, fn_codigo_impuesto_linea no encuentra código para la
--     tarifa 8 y la línea queda con tax_code NULL;
--   - mapTaxCode (factusService.ts) declara una línea sin código como IVA (01):
--     un INC creado a mano salía en la factura electrónica como IVA 8 %.
-- Con la plantilla INC_8, la tarifa 8 resuelve a INC_8 y Factus la declara 04.
--
-- Aditivo: una fila nueva; no toca impuestos de ninguna organización. Cada
-- organización lo agrega en Finanzas › Impuestos (y decide si va incluido en
-- el precio, organization_taxes.tax_included).
insert into public.tax_templates (country, code, name, rate, description, valid_from, valid_to, kind)
values ('COL', 'INC_8', 'Impuesto al consumo 8% (INC)',
        8.00, 'Impuesto Nacional al Consumo de restaurantes, cafeterías y bares en Colombia',
        '2017-01-01 00:00:00+00', null, 'tax')
on conflict (code) do nothing;
