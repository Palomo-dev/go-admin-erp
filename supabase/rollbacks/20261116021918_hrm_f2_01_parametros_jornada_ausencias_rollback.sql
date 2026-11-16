-- Reversión de 20261116021918_hrm_f2_01_parametros_jornada_ausencias.
-- Borra los valores de plataforma y el catálogo de los seis parámetros nuevos.
-- Si una organización ya fijó su propio valor (hr_org_parameters) de alguno de
-- ellos, esas filas se borran también: no se restauran.
delete from public.hr_org_parameters
 where code in ('jornada_max_diaria','jornada_flexible_max_diaria','tardanza_tolerancia_minutos',
                'vacaciones_dias_habiles_anio','licencia_luto_dias_habiles','licencias_pago');
delete from public.hr_legal_parameters
 where country_code = 'COL'
   and code in ('jornada_max_diaria','jornada_flexible_max_diaria','tardanza_tolerancia_minutos',
                'vacaciones_dias_habiles_anio','licencia_luto_dias_habiles','licencias_pago');
delete from public.hr_parameter_catalog
 where code in ('jornada_max_diaria','jornada_flexible_max_diaria','tardanza_tolerancia_minutos',
                'vacaciones_dias_habiles_anio','licencia_luto_dias_habiles','licencias_pago');
