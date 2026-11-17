/**
 * Insumos de prueba del motor de nómina (ADR-003). Los parámetros son los que hay
 * cargados en `hr_legal_parameters` (COL) el 2026-11-16, con sus vigencias, más los
 * de la migración `hrm_f3_01_nomina_modelo`. Solo viven en las pruebas: el motor no
 * tiene ningún valor legal escrito.
 */
import type { ParametrosNomina, TramoNomina } from '@/lib/hrm/nomina/base';
import { CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import type { EntradaColilla } from '@/lib/hrm/nomina/motorNomina';

const t = (valor: number, desde = '2026-01-01', hasta: string | null = null): TramoNomina => ({ desde, hasta, valor });
const j = (valor_json: unknown, desde = '2026-01-01', hasta: string | null = null): TramoNomina => ({ desde, hasta, valor: null, valor_json });

export const SMMLV_2026 = 1_750_905;
export const AUXILIO_2026 = 249_095;
export const UVT_2026 = 52_374;

export const PARAMETROS_2026: ParametrosNomina = {
  smmlv: [t(SMMLV_2026, '2026-01-01', '2026-12-31'), { desde: '2027-01-01', hasta: null, valor: null, estado: 'por_confirmar' }],
  auxilio_transporte: [t(AUXILIO_2026, '2026-01-01', '2026-12-31'), { desde: '2027-01-01', hasta: null, valor: null, estado: 'por_confirmar' }],
  auxilio_transporte_tope_smmlv: [t(2)],
  ibc_tope_smmlv: [t(25)],
  ibc_no_salarial_tope_pct: [t(0.4)],
  salario_integral_factor_ibc: [t(0.7)],
  salario_integral_minimo_smmlv: [t(13)],
  aporte_salud_trabajador: [t(0.04)],
  aporte_pension_trabajador: [t(0.04)],
  aporte_salud_empleador: [t(0.085)],
  aporte_pension_empleador: [t(0.12)],
  aporte_ccf: [t(0.04)],
  aporte_icbf: [t(0.03)],
  aporte_sena: [t(0.02)],
  exoneracion_114_1_umbral_smmlv: [t(10)],
  arl_tarifas: [
    j({
      I: { minimo: 0.00348, inicial: 0.00522, maximo: 0.00696 },
      II: { minimo: 0.00435, inicial: 0.01044, maximo: 0.01653 },
      III: { minimo: 0.00783, inicial: 0.02436, maximo: 0.04089 },
      IV: { minimo: 0.0174, inicial: 0.0435, maximo: 0.0606 },
      V: { minimo: 0.03219, inicial: 0.0696, maximo: 0.087 },
    }),
  ],
  fsp_tabla: [
    j(
      [
        // Ley 797, art. 8 y Decreto 3771 de 2007, art. 6 (ronda 3 del Contador): 16 hasta 17
        // inclusive, más de 17 hasta 18… La solidaridad es el 0,5 %; el resto, subsistencia.
        { desde_smmlv: 4, hasta_smmlv: 16, tarifa: 0.01, solidaridad: 0.005 },
        { desde_smmlv: 16, hasta_smmlv: 17, tarifa: 0.012, hasta_incluido: true, solidaridad: 0.005 },
        { desde_smmlv: 17, hasta_smmlv: 18, tarifa: 0.014, hasta_incluido: true, solidaridad: 0.005 },
        { desde_smmlv: 18, hasta_smmlv: 19, tarifa: 0.016, hasta_incluido: true, solidaridad: 0.005 },
        { desde_smmlv: 19, hasta_smmlv: 20, tarifa: 0.018, hasta_incluido: true, solidaridad: 0.005 },
        { desde_smmlv: 20, hasta_smmlv: null, tarifa: 0.02, solidaridad: 0.005 },
      ],
      '2026-01-01',
      '2027-03-31'
    ),
  ],
  divisor_hora_mensual: [t(220, '2025-07-15', '2026-07-14'), t(210, '2026-07-15')],
  vacaciones_dias_habiles_anio: [t(15, '2023-07-15')],
  intereses_cesantias_tasa: [t(0.12)],
  uvt: [t(UVT_2026, '2026-01-01', '2026-12-31')],
  retencion_art383_tabla: [
    j([
      { desde_uvt: 0, hasta_uvt: 95, tarifa: 0, base_uvt: 0, suma_uvt: 0 },
      { desde_uvt: 95, hasta_uvt: 150, tarifa: 0.19, base_uvt: 95, suma_uvt: 0 },
      { desde_uvt: 150, hasta_uvt: 360, tarifa: 0.28, base_uvt: 150, suma_uvt: 10 },
      { desde_uvt: 360, hasta_uvt: 640, tarifa: 0.33, base_uvt: 360, suma_uvt: 69 },
      { desde_uvt: 640, hasta_uvt: 945, tarifa: 0.35, base_uvt: 640, suma_uvt: 162 },
      { desde_uvt: 945, hasta_uvt: 2300, tarifa: 0.37, base_uvt: 945, suma_uvt: 268 },
      { desde_uvt: 2300, hasta_uvt: null, tarifa: 0.39, base_uvt: 2300, suma_uvt: 770 },
    ]),
  ],
  retencion_redondeo_cop: [t(1000)],
  // ET art. 868 (respuesta P17 del Contador): hasta $100 al peso, hasta $10.000 a la centena, más de $10.000 al millar.
  retencion_redondeo_tabla: [j([{ hasta: 100, multiplo: 1 }, { hasta: 10_000, multiplo: 100 }, { hasta: null, multiplo: 1000 }])],
  dep_dependientes_pct: [t(0.1)],
  dep_dependientes_tope_uvt_mes: [t(32)],
  dep_medicina_prepagada_tope_uvt_mes: [t(16)],
  dep_intereses_vivienda_tope_uvt_mes: [t(100)],
  renta_exenta_voluntarios_pct: [t(0.3)],
  renta_exenta_voluntarios_tope_uvt_anio: [t(3800)],
  renta_exenta_25_pct: [t(0.25)],
  renta_exenta_25_tope_uvt_anio: [t(790)],
  limite_global_pct: [t(0.4)],
  limite_global_tope_uvt_anio: [t(1340)],
  cesantias_exenta_tabla: [
    j([
      { hasta_uvt: 350, exento: 1 },
      { hasta_uvt: 410, exento: 0.9 },
      { hasta_uvt: 470, exento: 0.8 },
      { hasta_uvt: 530, exento: 0.6 },
      { hasta_uvt: 590, exento: 0.4 },
      { hasta_uvt: 650, exento: 0.2 },
      { hasta_uvt: null, exento: 0 },
    ]),
  ],
  embargo_alimentos_max: [t(0.5)],
  embargo_fraccion_excedente: [t(0.2)],
  libranza_neto_minimo: [t(0.5)],
  nomina_alerta_variacion_pct: [t(0.1)],
};

/** Una colilla mensual de julio de 2026 de un vínculo de salario mínimo, sin novedades. */
export function entradaBase(over: Partial<EntradaColilla> = {}): EntradaColilla {
  return {
    vinculo_id: '22222222-2222-4222-8222-222222222222',
    sede_id: 7,
    periodo: { desde: '2026-07-01', hasta: '2026-07-31', tipo: 'ordinaria' },
    vinculo: { ingreso: '2025-01-01', retiro: null, integral: false, periodo_salario: 'monthly' },
    salario: [{ desde: '2026-07-01', hasta: '2026-07-31', valor: SMMLV_2026 }],
    clase_arl: 1,
    exoneracion_114_1: true,
    parametros: PARAMETROS_2026,
    conceptos: CATALOGO_BASE,
    horas: [],
    descuentos_tiempo: [],
    ausencias: [],
    novedades: [],
    comisiones: [],
    prestamos: [],
    embargos: [],
    retencion: { procedimiento: 1, porcentaje_fijo: null, dependientes: false, medicina_prepagada: 0, intereses_vivienda: 0, aportes_voluntarios: 0 },
    mes_previo: null,
    promedio_variable_mensual: 0,
    acumulado: null,
    anterior: { devengado: 2_000_000, neto: 1_859_928 },
    ...over,
  };
}

/** Salario fijo en todo el período. */
export function salarioFijo(valor: number, desde = '2026-07-01', hasta = '2026-07-31') {
  return [{ desde, hasta, valor }];
}
