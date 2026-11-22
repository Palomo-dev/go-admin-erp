-- Nómina electrónica: elemento DIAN de «Propinas (no salarial)» (Contador, 2026-11-21).
--
-- La propina pagada por nómina se reporta en Devengados/OtrosConceptos/OtroConcepto
-- con DescripcionConcepto="Propinas" y el valor en ConceptoNS (no salarial),
-- elemento NIE148 del anexo técnico 1.0 (Resolución 000013 de 2021). No se deja
-- vacío: el total devengado del documento tiene que cuadrar con lo pagado.
-- Reportarla no la vuelve deducible: la contabilidad sigue saliendo de la 2815.
--
-- Retención en la fuente: sigue por fuera (base_retencion = false). La paga el
-- cliente y el empleador solo la recauda y reparte (Ley 1935 de 2018, art. 5);
-- no es salario (art. 131 CST), así que no nace de la relación laboral (art. 383 ET).
--
-- dian_code 'OtroConceptoNS' = OtroConcepto con el valor en ConceptoNS. Lo único que cambia
-- frente a 20261121031559 es esa columna de PROPINAS; la semilla completa se repite porque la
-- prueba nominaCatalogoConceptos exige que la última migración con la marca la contenga.

-- catalogo-nomina: semilla vigente de la plataforma (la prueba nominaCatalogoConceptos la compara con conceptos.ts)
insert into public.hr_payroll_concepts
  (organization_id, code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code, is_system)
select null, v.* , true from (values
  ('SALARIO', 'Salario', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('SALARIO_INTEGRAL', 'Salario integral', 'devengado', true, true, false, false, true, true, '510503', null, 'Basico'),
  ('SALARIO_HORAS', 'Horas ordinarias (salario por hora)', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('DESCUENTO_TIEMPO', 'Tiempo no trabajado sin justificar', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('RECARGO_NOCTURNO', 'Recargo nocturno', 'devengado', true, true, false, true, true, true, '510515', null, 'HRN'),
  ('RECARGO_DOMINICAL', 'Recargo dominical o festivo', 'devengado', true, true, false, true, true, true, '510515', null, 'HRDDF'),
  ('RECARGO_DOMINICAL_NOCTURNO', 'Recargo dominical o festivo nocturno', 'devengado', true, true, false, true, true, true, '510515', null, 'HRNDF'),
  ('HORA_EXTRA_DIURNA', 'Hora extra diurna', 'devengado', true, true, false, true, true, true, '510515', null, 'HED'),
  ('HORA_EXTRA_NOCTURNA', 'Hora extra nocturna', 'devengado', true, true, false, true, true, true, '510515', null, 'HEN'),
  ('HORA_EXTRA_DOMINICAL_DIURNA', 'Hora extra dominical o festiva diurna', 'devengado', true, true, false, true, true, true, '510515', null, 'HEDDF'),
  ('HORA_EXTRA_DOMINICAL_NOCTURNA', 'Hora extra dominical o festiva nocturna', 'devengado', true, true, false, true, true, true, '510515', null, 'HENDF'),
  ('AUXILIO_TRANSPORTE', 'Auxilio de transporte', 'devengado', false, false, false, true, true, false, '510527', null, 'AuxilioTransporte'),
  ('COMISIONES', 'Comisiones', 'devengado', true, true, false, true, true, true, '510518', null, 'Comision'),
  ('BONIFICACION_SALARIAL', 'Bonificación salarial', 'devengado', true, true, false, true, true, true, '510548', null, 'BonificacionS'),
  ('BONIFICACION_NO_SALARIAL', 'Bonificación no salarial', 'devengado', false, false, true, false, true, false, '510548', null, 'BonificacionNS'),
  ('AUXILIO_NO_SALARIAL', 'Auxilio no salarial', 'devengado', false, false, true, false, true, false, '510545', null, 'AuxilioNS'),
  ('RETROACTIVO', 'Retroactivo salarial', 'devengado', true, true, false, true, true, true, '510506', null, 'Reintegro'),
  ('VACACIONES_DISFRUTADAS', 'Vacaciones disfrutadas', 'devengado', true, true, false, false, true, true, '2525', null, 'VacacionesComunes'),
  ('VACACIONES_COMPENSADAS', 'Vacaciones compensadas en dinero', 'devengado', false, false, false, false, true, true, '2525', null, 'VacacionesCompensadas'),
  ('INCAPACIDAD_COMUN', 'Incapacidad de origen común', 'devengado', false, true, false, false, true, false, '510524', null, 'Incapacidad'),
  ('INCAPACIDAD_LABORAL', 'Incapacidad de origen laboral', 'devengado', false, true, false, false, true, false, '510524', null, 'Incapacidad'),
  ('LICENCIA_MATERNIDAD', 'Licencia de maternidad', 'devengado', false, true, false, false, true, false, '510595', null, 'LicenciaMP'),
  ('LICENCIA_PATERNIDAD', 'Licencia de paternidad', 'devengado', false, true, false, false, true, false, '510595', null, 'LicenciaMP'),
  ('LICENCIA_REMUNERADA', 'Licencia remunerada', 'devengado', true, true, false, true, true, true, '510506', null, 'LicenciaR'),
  ('PRIMA_SERVICIOS', 'Prima de servicios', 'devengado', false, false, false, false, true, false, '2520', null, 'Primas'),
  ('INTERESES_CESANTIAS', 'Intereses sobre cesantías', 'devengado', false, false, false, false, true, false, '2515', null, 'Cesantias'),
  ('PROPINAS', 'Propinas (no salarial)', 'devengado', false, false, false, false, false, false, '28150502', null, 'OtroConceptoNS'),
  ('SALUD_EMPLEADO', 'Salud (trabajador)', 'deduccion', false, false, false, false, false, false, null, '237005', 'Salud'),
  ('PENSION_EMPLEADO', 'Pensión (trabajador)', 'deduccion', false, false, false, false, false, false, null, '238030', 'FondoPension'),
  ('FONDO_SOLIDARIDAD', 'Fondo de solidaridad pensional', 'deduccion', false, false, false, false, false, false, null, '238030', 'FondoSP'),
  ('RETENCION_FUENTE', 'Retención en la fuente', 'deduccion', false, false, false, false, false, false, null, '236505', 'RetencionFuente'),
  ('EMBARGO_ALIMENTOS', 'Embargo por alimentos', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('EMBARGO_COOPERATIVA', 'Embargo de cooperativa', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('EMBARGO_ORDINARIO', 'Embargo ordinario', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('PRESTAMO', 'Préstamo a empleado', 'deduccion', false, false, false, false, false, false, null, '136595', 'Deuda'),
  ('LIBRANZA', 'Libranza', 'deduccion', false, false, false, false, false, false, null, '237030', 'Libranza'),
  ('APORTE_COOPERATIVA', 'Aporte a cooperativa', 'deduccion', false, false, false, false, false, false, null, '237040', 'Cooperativa'),
  ('FONDO_EMPLEADOS', 'Aporte al fondo de empleados', 'deduccion', false, false, false, false, false, false, null, '237045', null),
  ('CUOTA_SINDICAL', 'Cuota sindical', 'deduccion', false, false, false, false, false, false, null, '237035', 'Sindicatos'),
  ('OTRO_DESCUENTO', 'Otro descuento autorizado', 'deduccion', false, false, false, false, false, false, null, '237095', 'OtraDeduccion'),
  ('SALUD_EMPLEADOR', 'Salud (empleador)', 'aporte_empleador', false, false, false, false, false, false, '510569', '237005', null),
  ('PENSION_EMPLEADOR', 'Pensión (empleador)', 'aporte_empleador', false, false, false, false, false, false, '510570', '238030', null),
  ('ARL', 'Riesgos laborales (ARL)', 'aporte_empleador', false, false, false, false, false, false, '510568', '237006', null),
  ('CAJA_COMPENSACION', 'Caja de compensación', 'aporte_empleador', false, false, false, false, false, false, '510572', '237010', null),
  ('ICBF', 'ICBF', 'aporte_empleador', false, false, false, false, false, false, '510575', '237010', null),
  ('SENA', 'SENA', 'aporte_empleador', false, false, false, false, false, false, '510578', '237010', null),
  ('PROVISION_CESANTIAS', 'Provisión de cesantías', 'provision', false, false, false, false, false, false, '510530', '2510', null),
  ('PROVISION_INTERESES', 'Provisión de intereses sobre cesantías', 'provision', false, false, false, false, false, false, '510533', '2515', null),
  ('PROVISION_PRIMA', 'Provisión de prima de servicios', 'provision', false, false, false, false, false, false, '510536', '2520', null),
  ('PROVISION_VACACIONES', 'Provisión de vacaciones', 'provision', false, false, false, false, false, false, '510539', '2525', null),
  ('CESANTIAS_CONSIGNAR', 'Cesantías por consignar al fondo', 'informativo', false, false, false, false, false, false, '2510', '2510', 'Cesantias'),
  ('INCAPACIDAD_POR_COBRAR', 'Incapacidad o licencia por cobrar a la EPS, la ARL o el fondo', 'informativo', false, false, false, false, false, false, '138095', null, null),
  ('RECUPERACION_PROVISIONES', 'Recuperación de provisiones de nómina de un año cerrado', 'informativo', false, false, false, false, false, false, null, '425050', null)
) as v(code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code)
on conflict (organization_id, code) do update
  set name = excluded.name, kind = excluded.kind, is_salarial = excluded.is_salarial, base_ss = excluded.base_ss,
      cuenta_40 = excluded.cuenta_40, is_prestacional = excluded.is_prestacional, base_retencion = excluded.base_retencion,
      base_parafiscales = excluded.base_parafiscales, debit_account = excluded.debit_account,
      credit_account = excluded.credit_account, dian_code = excluded.dian_code, is_system = true, updated_at = now()
  where public.hr_payroll_concepts.organization_id is null;
