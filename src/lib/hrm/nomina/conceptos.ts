/**
 * Conceptos de nómina (ADR-003 §2). La fuente de verdad es `hr_payroll_concepts`
 * (plataforma + organización); el motor los recibe en los insumos. Aquí están los
 * tipos y el catálogo base de la plataforma, que es copia exacta de la semilla de
 * la migración `hrm_f3_01_nomina_modelo` (una prueba los compara).
 *
 * Banderas:
 * - `salarial`: es salario (CST 127). Entra a la base de embargos.
 * - `base_ss`: entra al IBC de salud, pensión y ARL.
 * - `cuenta_40`: pago no salarial que cuenta en la regla del 40 % (Ley 1393, art. 30).
 * - `prestacional`: base de prima y cesantías.
 * - `base_retencion`: ingreso laboral para la retención en la fuente.
 * - `base_parafiscales`: base de caja, ICBF y SENA («nómina de salarios», Ley 21 de 1982).
 */

export type TipoConcepto = 'devengado' | 'deduccion' | 'aporte_empleador' | 'provision' | 'informativo';

export interface Concepto {
  codigo: string;
  nombre: string;
  tipo: TipoConcepto;
  salarial: boolean;
  base_ss: boolean;
  cuenta_40: boolean;
  prestacional: boolean;
  base_retencion: boolean;
  base_parafiscales: boolean;
  cuenta_debito: string | null;
  cuenta_credito: string | null;
  /** Elemento del anexo técnico de nómina electrónica (fase 4). */
  codigo_dian: string | null;
}

export type Catalogo = Readonly<Record<string, Concepto>>;

type Fila = [
  codigo: string,
  nombre: string,
  tipo: TipoConcepto,
  salarial: boolean,
  base_ss: boolean,
  cuenta_40: boolean,
  prestacional: boolean,
  base_retencion: boolean,
  base_parafiscales: boolean,
  debito: string | null,
  credito: string | null,
  dian: string | null,
];

const S = true;
const N = false;

/** Catálogo base de la plataforma (cuentas que existen hoy en los planes de cuentas; el Contador las confirma). */
export const FILAS_CATALOGO_BASE: readonly Fila[] = [
  // Devengados
  ['SALARIO', 'Salario', 'devengado', S, S, N, S, S, S, '5105', null, 'Basico'],
  ['SALARIO_INTEGRAL', 'Salario integral', 'devengado', S, S, N, N, S, S, '5105', null, 'Basico'],
  ['SALARIO_HORAS', 'Horas ordinarias (salario por hora)', 'devengado', S, S, N, S, S, S, '5105', null, 'Basico'],
  ['DESCUENTO_TIEMPO', 'Tiempo no trabajado sin justificar', 'devengado', S, S, N, S, S, S, '5105', null, 'Basico'],
  ['RECARGO_NOCTURNO', 'Recargo nocturno', 'devengado', S, S, N, S, S, S, '5105', null, 'HRN'],
  ['RECARGO_DOMINICAL', 'Recargo dominical o festivo', 'devengado', S, S, N, S, S, S, '5105', null, 'HRDDF'],
  ['RECARGO_DOMINICAL_NOCTURNO', 'Recargo dominical o festivo nocturno', 'devengado', S, S, N, S, S, S, '5105', null, 'HRNDF'],
  ['HORA_EXTRA_DIURNA', 'Hora extra diurna', 'devengado', S, S, N, S, S, S, '5105', null, 'HED'],
  ['HORA_EXTRA_NOCTURNA', 'Hora extra nocturna', 'devengado', S, S, N, S, S, S, '5105', null, 'HEN'],
  ['HORA_EXTRA_DOMINICAL_DIURNA', 'Hora extra dominical o festiva diurna', 'devengado', S, S, N, S, S, S, '5105', null, 'HEDDF'],
  ['HORA_EXTRA_DOMINICAL_NOCTURNA', 'Hora extra dominical o festiva nocturna', 'devengado', S, S, N, S, S, S, '5105', null, 'HENDF'],
  ['AUXILIO_TRANSPORTE', 'Auxilio de transporte', 'devengado', N, N, N, S, S, N, '5105', null, 'AuxilioTransporte'],
  ['COMISIONES', 'Comisiones', 'devengado', S, S, N, S, S, S, '5105', null, 'Comision'],
  ['BONIFICACION_SALARIAL', 'Bonificación salarial', 'devengado', S, S, N, S, S, S, '5105', null, 'BonificacionS'],
  ['BONIFICACION_NO_SALARIAL', 'Bonificación no salarial', 'devengado', N, N, S, N, S, N, '5105', null, 'BonificacionNS'],
  ['AUXILIO_NO_SALARIAL', 'Auxilio no salarial', 'devengado', N, N, S, N, S, N, '5105', null, 'AuxilioNS'],
  ['RETROACTIVO', 'Retroactivo salarial', 'devengado', S, S, N, S, S, S, '5105', null, 'Reintegro'],
  ['VACACIONES_DISFRUTADAS', 'Vacaciones disfrutadas', 'devengado', S, S, N, N, S, S, '2525', null, 'VacacionesComunes'],
  ['VACACIONES_COMPENSADAS', 'Vacaciones compensadas en dinero', 'devengado', N, N, N, N, S, S, '2525', null, 'VacacionesCompensadas'],
  ['INCAPACIDAD_COMUN', 'Incapacidad de origen común', 'devengado', N, S, N, N, S, N, '5105', null, 'Incapacidad'],
  ['INCAPACIDAD_LABORAL', 'Incapacidad de origen laboral', 'devengado', N, S, N, N, S, N, '5105', null, 'Incapacidad'],
  ['LICENCIA_MATERNIDAD', 'Licencia de maternidad', 'devengado', N, S, N, N, S, N, '5105', null, 'LicenciaMP'],
  ['LICENCIA_PATERNIDAD', 'Licencia de paternidad', 'devengado', N, S, N, N, S, N, '5105', null, 'LicenciaMP'],
  ['LICENCIA_REMUNERADA', 'Licencia remunerada', 'devengado', S, S, N, S, S, S, '5105', null, 'LicenciaR'],
  ['PRIMA_SERVICIOS', 'Prima de servicios', 'devengado', N, N, N, N, S, N, '2520', null, 'Primas'],
  ['INTERESES_CESANTIAS', 'Intereses sobre cesantías', 'devengado', N, N, N, N, S, N, '2515', null, 'Cesantias'],
  // Deducciones
  ['SALUD_EMPLEADO', 'Salud (trabajador)', 'deduccion', N, N, N, N, N, N, null, '2370', 'Salud'],
  ['PENSION_EMPLEADO', 'Pensión (trabajador)', 'deduccion', N, N, N, N, N, N, null, '2370', 'FondoPension'],
  ['FONDO_SOLIDARIDAD', 'Fondo de solidaridad pensional', 'deduccion', N, N, N, N, N, N, null, '2370', 'FondoSP'],
  ['RETENCION_FUENTE', 'Retención en la fuente', 'deduccion', N, N, N, N, N, N, null, '23650501', 'RetencionFuente'],
  ['EMBARGO_ALIMENTOS', 'Embargo por alimentos', 'deduccion', N, N, N, N, N, N, null, '2380', 'EmbargoFiscal'],
  ['EMBARGO_COOPERATIVA', 'Embargo de cooperativa', 'deduccion', N, N, N, N, N, N, null, '2380', 'EmbargoFiscal'],
  ['EMBARGO_ORDINARIO', 'Embargo ordinario', 'deduccion', N, N, N, N, N, N, null, '2380', 'EmbargoFiscal'],
  ['PRESTAMO', 'Préstamo a empleado', 'deduccion', N, N, N, N, N, N, null, '1365', 'Deuda'],
  ['LIBRANZA', 'Libranza', 'deduccion', N, N, N, N, N, N, null, '2380', 'Libranza'],
  ['OTRO_DESCUENTO', 'Otro descuento autorizado', 'deduccion', N, N, N, N, N, N, null, '2380', 'OtraDeduccion'],
  // Aportes del empleador
  ['SALUD_EMPLEADOR', 'Salud (empleador)', 'aporte_empleador', N, N, N, N, N, N, '5105', '2370', null],
  ['PENSION_EMPLEADOR', 'Pensión (empleador)', 'aporte_empleador', N, N, N, N, N, N, '5105', '2370', null],
  ['ARL', 'Riesgos laborales (ARL)', 'aporte_empleador', N, N, N, N, N, N, '5105', '2370', null],
  ['CAJA_COMPENSACION', 'Caja de compensación', 'aporte_empleador', N, N, N, N, N, N, '5105', '2370', null],
  ['ICBF', 'ICBF', 'aporte_empleador', N, N, N, N, N, N, '5105', '2370', null],
  ['SENA', 'SENA', 'aporte_empleador', N, N, N, N, N, N, '5105', '2370', null],
  // Provisiones
  ['PROVISION_CESANTIAS', 'Provisión de cesantías', 'provision', N, N, N, N, N, N, '5105', '2510', null],
  ['PROVISION_INTERESES', 'Provisión de intereses sobre cesantías', 'provision', N, N, N, N, N, N, '5105', '2515', null],
  ['PROVISION_PRIMA', 'Provisión de prima de servicios', 'provision', N, N, N, N, N, N, '5105', '2520', null],
  ['PROVISION_VACACIONES', 'Provisión de vacaciones', 'provision', N, N, N, N, N, N, '5105', '2525', null],
  // Informativos (no cambian el neto)
  ['CESANTIAS_CONSIGNAR', 'Cesantías por consignar al fondo', 'informativo', N, N, N, N, N, N, '2510', '2380', 'Cesantias'],
];

export function catalogoDesdeFilas(filas: readonly Fila[]): Catalogo {
  const out: Record<string, Concepto> = {};
  for (const [codigo, nombre, tipo, salarial, base_ss, cuenta_40, prestacional, base_retencion, base_parafiscales, d, c, dian] of filas) {
    out[codigo] = {
      codigo,
      nombre,
      tipo,
      salarial,
      base_ss,
      cuenta_40,
      prestacional,
      base_retencion,
      base_parafiscales,
      cuenta_debito: d,
      cuenta_credito: c,
      codigo_dian: dian,
    };
  }
  return out;
}

export const CATALOGO_BASE: Catalogo = catalogoDesdeFilas(FILAS_CATALOGO_BASE);

/** Concepto del catálogo; si no está, falla: el motor nunca inventa banderas. */
export function concepto(cat: Catalogo, codigo: string): Concepto {
  const c = cat[codigo];
  if (!c) throw new Error(`concepto_no_configurado: ${codigo}`);
  return c;
}
