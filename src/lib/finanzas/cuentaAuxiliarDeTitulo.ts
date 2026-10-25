/**
 * Equivalente TS de `public.fn_cuenta_auxiliar_de_titulo` (migración 20261025134030).
 *
 * Solo resuelve las cuentas P1 que pasan a título (4295, 3705, 6135, 6140, 530515, 5395, 2408,
 * 240805, 240810), sus subcuentas de título (613505, 614005, 429595, 429581, 370505, 539595) y sus
 * auxiliares. Mismo orden que el SQL:
 *   1) mapeo de la sede por la cuenta BASE o por el auxiliar (al 5% solo el del auxiliar 5%);
 *   2) el auxiliar estándar;
 *   3) antes de 134060, el código original si el plan dice que sigue siendo de movimiento;
 *   4) el auxiliar.
 * Nunca devuelve una cuenta de grupo: sin plan, solo auxiliares de 8 dígitos; con plan
 * (`cuentasMovimiento`), solo cuentas de movimiento del plan.
 *
 * QA 25-oct: una cuenta que NO es P1 y no es de movimiento (p. ej. el grupo '5105' configurado como
 * override) se RECHAZA con `CuentaNoMovimientoError`; nunca se sustituye en silencio por el costo del
 * sector ni por otro defecto. Tampoco se acepta 6140/614005 fuera de hoteles y restaurantes (61400501
 * solo existe en orgs type_id 1/2).
 */
export class CuentaNoMovimientoError extends Error {
  readonly cuenta: string;
  constructor(cuenta: string, motivo: string) {
    super(`La cuenta ${cuenta} no se puede usar: ${motivo}. Configure un auxiliar de movimiento.`);
    this.name = 'CuentaNoMovimientoError';
    this.cuenta = cuenta;
  }
}

export type LadoIva = 'descontable' | 'generado';

export interface OpcionesResolucion {
  /** Mapeo de la sede (branch_account_mappings): cuenta base o auxiliar → auxiliar de la sede. */
  mapeoSede?: Readonly<Partial<Record<string, string | null | undefined>>>;
  /** Tarifa de IVA; ≈5 (redondeada) elige el auxiliar 02 de 240805/240810. */
  tarifa?: number | null;
  lado?: LadoIva | 'compra' | 'purchase' | null;
  /** organizations.type_id: 1 restaurante / 2 hotel → costo 61400501. */
  tipoOrg?: number | null;
  /** Plan de la org: códigos de movimiento. Si viene, valida contra él (y habilita el paso 3). */
  cuentasMovimiento?: ReadonlySet<string>;
}

/** Cuentas P1 que pasan a título y sus subcuentas de título (134010/134040). */
export const CUENTAS_TITULO_P1 = [
  '3705', '6135', '6140', '4295', '530515', '5395', '2408', '240805', '240810',
  '370505', '613505', '614005', '429595', '429581', '539595',
] as const;
const TITULOS: ReadonlySet<string> = new Set(CUENTAS_TITULO_P1);

const AUXILIAR: Readonly<Record<string, string>> = {
  '4295': '42959501', '429595': '42959501', '429581': '42958101',
  '3705': '37050502', '370505': '37050501',
  '6135': '61350501', '613505': '61350501',
  // Hoteles y restaurantes (regla del contador): costo de A&B 61400501 bajo 614005.
  '6140': '61400501', '614005': '61400501',
  '530515': '53051501',
  '5395': '53959501', '539595': '53959501',
};

/** Auxiliar conocido → su cuenta base (para buscar el mapeo de la sede por la base, como el SQL). */
const BASE_DE: Readonly<Record<string, string>> = {
  '42959501': '4295', '42959502': '4295', '42958101': '4295',
  '37050501': '3705', '37050502': '3705',
  '61350501': '6135', '61350502': '6135',
  '61400501': '6140', '61400502': '6140',
  '53051501': '530515', '53959501': '5395',
  '24080501': '240805', '24080502': '240805', '24081001': '240810', '24081002': '240810',
};

export function esHotelORestaurante(tipoOrg: number | null | undefined): boolean {
  return tipoOrg === 1 || tipoOrg === 2;
}

/** Cuenta base de costo de ventas según el sector: 6140 (hoteles y restaurantes) o 6135 (comercio). */
export function cuentaCostoPorSector(tipoOrg: number | null | undefined): '6140' | '6135' {
  return esHotelORestaurante(tipoOrg) ? '6140' : '6135';
}

function esCinco(tarifa: number | null | undefined): boolean {
  return typeof tarifa === 'number' && Number.isFinite(tarifa) && Math.round(tarifa) === 5;
}

function auxiliarEstandar(code: string, op: OpcionesResolucion): string | null {
  if (AUXILIAR[code]) return AUXILIAR[code];
  const t5 = esCinco(op.tarifa);
  if (code === '240805') return t5 ? '24080502' : '24080501';
  if (code === '240810') return t5 ? '24081002' : '24081001';
  if (code === '2408') {
    const descontable = op.lado === 'descontable' || op.lado === 'compra' || op.lado === 'purchase';
    return descontable ? (t5 ? '24081002' : '24081001') : (t5 ? '24080502' : '24080501');
  }
  return null;
}

function valida(cuenta: string | null | undefined, op: OpcionesResolucion): cuenta is string {
  if (!cuenta) return false;
  const c = cuenta.trim();
  if (TITULOS.has(c)) return false;
  if (op.cuentasMovimiento) return op.cuentasMovimiento.has(c);
  // Sin plan (QA 558bea34): como el SQL, se aceptan subcuentas de movimiento de 6 dígitos (710501,
  // 529505) y auxiliares de 8+; se rechazan clase/grupo/cuenta (1, 2 y 4 dígitos, p. ej. 5105) y los
  // títulos P1. Con plan, manda el plan.
  return /^\d{6}(\d{2})*$/.test(c);
}

export function cuentaAuxiliarDeTitulo(codigo: string, op: OpcionesResolucion = {}): string {
  const code = codigo.trim();
  if ((code === '6140' || code === '614005' || BASE_DE[code] === '6140') && !esHotelORestaurante(op.tipoOrg)) {
    throw new CuentaNoMovimientoError(code, 'el costo 6140 (61400501/61400502) solo existe en hoteles y restaurantes');
  }
  let base: string;
  let aux: string;
  const estandar = auxiliarEstandar(code, op);
  if (estandar) {
    base = code;
    aux = estandar;
  } else if (BASE_DE[code]) {
    base = BASE_DE[code];
    // Un auxiliar 19% con tarifa 5% pasa al 5%.
    aux = esCinco(op.tarifa) && (code === '24080501' || code === '24081001') ? code.slice(0, 7) + '2' : code;
  } else {
    // No es P1: el mapeo de sede no aplica (igual que el SQL). Nunca un grupo, y nunca se cambia
    // en silencio por otra cuenta: se rechaza para que se corrija la configuración.
    if (valida(code, op)) return code;
    throw new CuentaNoMovimientoError(code, op.cuentasMovimiento
      ? 'no es una cuenta de movimiento del plan de la organización'
      : 'es una cuenta de clase, grupo o título (se exige una subcuenta o auxiliar de movimiento)');
  }
  // 1) Mapeo de la sede por auxiliar o por la base; al 5% solo el del auxiliar 5%.
  const cinco = aux === '24080502' || aux === '24081002';
  const mapeos = cinco ? [op.mapeoSede?.[aux]] : [op.mapeoSede?.[aux], op.mapeoSede?.[base], op.mapeoSede?.[code]];
  for (const m of mapeos) if (valida(m, op)) return m.trim();
  // 2) Auxiliar estándar.
  if (!op.cuentasMovimiento || op.cuentasMovimiento.has(aux)) return aux;
  // 3) Antes de 134060: el original mientras siga siendo de movimiento.
  if (op.cuentasMovimiento.has(code)) return code;
  // 4) El auxiliar (si no existe en el plan, el asiento falla y queda en el log de fallos).
  return aux;
}
