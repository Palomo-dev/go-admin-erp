-- Reversión de 20261116232859_hrm_f3_10_incapacidad_laboral_arl.sql.
update public.hr_legal_parameters
   set value_json = jsonb_set(value_json, '{laboral}', '[{"paga": "empleador", "fraccion": 1, "desde_dia": 1, "hasta_dia": 1}, {"paga": "arl", "fraccion": 1, "desde_dia": 2, "hasta_dia": null}]'::jsonb),
       notes = '[ADR-001] El piso del SMMLV diario y el tramo 181-540 tienen fuente secundaria.'
 where country_code = 'COL' and code = 'incapacidad_tramos' and effective_from = '2026-01-01';
