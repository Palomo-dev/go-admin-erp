-- Nómina (fase 3), ronda 3 del Contador (2026-11-16): la incapacidad de origen laboral la paga
-- la ARL desde el día 1 (Ley 776 de 2002, art. 3). Antes el día 1 decía «empleador», y la colilla
-- y el asiento (138095 con la ARL de tercero) no coincidían. El valor no cambia: fracción 1.
update public.hr_legal_parameters
   set value_json = jsonb_set(value_json, '{laboral}', '[{"paga": "arl", "fraccion": 1, "desde_dia": 1, "hasta_dia": null}]'::jsonb),
       notes = coalesce(notes, '') || ' Ronda 3 del Contador (2026-11-16): la incapacidad laboral la paga la ARL desde el día 1.'
 where country_code = 'COL' and code = 'incapacidad_tramos' and effective_from = '2026-01-01';
