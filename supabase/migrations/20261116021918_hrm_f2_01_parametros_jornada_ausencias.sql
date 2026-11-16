-- HRM fase 2 · paso 1: parámetros de jornada, vacaciones y licencias (ADR-002 §3, §5, §6 y §8).
-- Ningún valor legal va fijo en el código: el motor de horas y las ausencias los leen por fecha.

insert into public.hr_parameter_catalog (code, name, description, unit, org_override, research_ref) values
  ('jornada_max_diaria', 'Jornada ordinaria máxima diaria',
   'Horas ordinarias por día. Por encima son extra aunque la semana no llegue a su tope.', 'horas', 'no_mayor', '§1.1 · CST 161'),
  ('jornada_flexible_max_diaria', 'Jornada flexible: máximo diario',
   'Con jornada flexible pactada, horas ordinarias por día sin recargo de extra.', 'horas', 'no_mayor', '§1.1 · CST 161 lit. c'),
  ('tardanza_tolerancia_minutos', 'Tolerancia de tardanza',
   'Minutos de gracia antes de registrar una tardanza. No es norma: lo define la empresa.', 'entero', 'libre', '§12-E'),
  ('vacaciones_dias_habiles_anio', 'Vacaciones por año de servicio',
   'Días hábiles de vacaciones causados por cada año de servicio.', 'dias', 'no_menor', '§3 · CST 186'),
  ('licencia_luto_dias_habiles', 'Licencia de luto',
   'Días hábiles de licencia remunerada por luto.', 'dias', 'no_menor', 'Ley 1280 de 2009 (fuera de la investigación)'),
  ('licencias_pago', 'Quién paga cada licencia',
   'Pagador y fracción del salario por clase de licencia.', 'tabla', 'no', '§11.2 · CST 57 num. 6')
on conflict (code) do nothing;

insert into public.hr_legal_parameters
  (country_code, code, value, value_json, effective_from, effective_to, status, verificacion, legal_source, source_url, notes)
select v.* from (values
  ('COL', 'jornada_max_diaria', 8::numeric, null::jsonb, '2023-07-15'::date, null::date, 'vigente', 'V',
   'CST art. 161 (Ley 2101 de 2021; art. 11 de la Ley 2466 de 2025)',
   'http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html',
   '[ADR-002] 8 h diarias; la semana se distribuye en 5 o 6 días.'),
  ('COL', 'jornada_flexible_max_diaria', 9, null, '2023-07-15', null, 'vigente', 'V',
   'CST art. 161 lit. c (art. 11 de la Ley 2466 de 2025)',
   'http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html',
   '[ADR-002] Jornada flexible de 4 a 9 h diarias sin recargo mientras el promedio no pase del tope semanal.'),
  ('COL', 'tardanza_tolerancia_minutos', 0, null, '2023-07-15', null, 'vigente', 'V',
   'No es norma: lo define cada empresa (investigación §12-E)', null,
   '[ADR-002] Sin tolerancia por defecto; la organización fija la suya.'),
  ('COL', 'vacaciones_dias_habiles_anio', 15, null, '2023-07-15', null, 'vigente', 'V',
   'CST art. 186', 'http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr006.html',
   '[ADR-002] 15 días hábiles consecutivos por cada año de servicio; proporcional en base 360.'),
  ('COL', 'licencia_luto_dias_habiles', 5, null, '2023-07-15', null, 'por_confirmar', 'NC',
   'Ley 1280 de 2009 (CST 57 num. 10)', null,
   '[ADR-002] No está en la investigación del 2026-11-14: no limita ni se usa para calcular hasta que el Contador lo confirme.'),
  ('COL', 'licencias_pago', null,
   '{"vacaciones":{"paga":"empleador","fraccion":1},
     "maternidad":{"paga":"eps","fraccion":1,"base":"salario_al_iniciar"},
     "paternidad":{"paga":"eps","fraccion":1,"base":"proporcional_cotizado"},
     "luto":{"paga":"empleador","fraccion":1},
     "calamidad":{"paga":"empleador","fraccion":1},
     "licencia_remunerada":{"paga":"empleador","fraccion":1},
     "licencia_no_remunerada":{"paga":null,"fraccion":0}}'::jsonb,
   '2026-01-01', null, 'vigente', 'S',
   'CST 57 num. 6 (Ley 2466 de 2025); CST 236 (Ley 2114 de 2021); CST 51',
   'http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html',
   '[ADR-002] Maternidad y paternidad las paga la EPS (§11.2). Las licencias remuneradas del CST 57 las paga el empleador. La no remunerada suspende el contrato.')
) as v(country_code, code, value, value_json, effective_from, effective_to, status, verificacion, legal_source, source_url, notes)
where not exists (select 1 from public.hr_legal_parameters l where l.country_code = v.country_code and l.code = v.code);
