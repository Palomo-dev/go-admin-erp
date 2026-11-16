/**
 * Base del motor de nómina (ADR-003): tipos comunes, lectura de parámetros por
 * vigencia, días en base 360 y redondeo.
 *
 * Puro: no lee la base ni el reloj ni el TZ del proceso. Las fechas son días
 * calendario `YYYY-MM-DD` (columnas `date`) y se operan en UTC solo como
 * aritmética de calendario. Ningún valor legal vive aquí: todo llega en los
 * tramos de `fn_hr_parametro_tramos`.
 */
import { addPlainDays } from '@/lib/utils/dateCore';

export const VERSION_MOTOR_NOMINA = 'hrm-nomina-3';

/** Un tramo de vigencia de un parámetro (lo que entrega `fn_hr_parametro_tramos`). */
export interface TramoNomina {
  desde: string;
  hasta: string | null;
  valor: number | null;
  valor_json?: unknown;
  estado?: string | null;
}
export type ParametrosNomina = Readonly<Record<string, readonly TramoNomina[]>>;

export class ParametroNominaFaltante extends Error {
  readonly code = 'parametro_no_configurado';
  constructor(
    public readonly codigo: string,
    public readonly fecha: string
  ) {
    super(`parametro_no_configurado: ${codigo} en ${fecha}`);
    this.name = 'ParametroNominaFaltante';
  }
}

function tramoEn(p: ParametrosNomina, codigo: string, fecha: string): TramoNomina | null {
  for (const t of p[codigo] ?? []) {
    if (t.desde <= fecha && (t.hasta === null || t.hasta === undefined || fecha <= t.hasta)) return t;
  }
  return null;
}

/** Valor numérico vigente en un día. Falla si no hay valor o está por confirmar: nunca inventa. */
export function num(p: ParametrosNomina, codigo: string, fecha: string): number {
  const t = tramoEn(p, codigo, fecha);
  if (!t || t.estado === 'por_confirmar' || t.valor === null || t.valor === undefined || !Number.isFinite(Number(t.valor))) {
    throw new ParametroNominaFaltante(codigo, fecha);
  }
  return Number(t.valor);
}

/** Como `num`, pero devuelve `null` si no está configurado (para opciones de la empresa). */
export function numOpcional(p: ParametrosNomina, codigo: string, fecha: string): number | null {
  const t = tramoEn(p, codigo, fecha);
  if (!t || t.estado === 'por_confirmar' || t.valor === null || t.valor === undefined) return null;
  const v = Number(t.valor);
  return Number.isFinite(v) ? v : null;
}

/** Tabla (jsonb) vigente en un día. */
export function tabla<T>(p: ParametrosNomina, codigo: string, fecha: string): T {
  const t = tramoEn(p, codigo, fecha);
  if (!t || t.estado === 'por_confirmar' || t.valor_json === null || t.valor_json === undefined) {
    throw new ParametroNominaFaltante(codigo, fecha);
  }
  return t.valor_json as T;
}

// ---------------------------------------------------------------------------
// Días en base 360 (CST: el mes laboral es de 30 días)
// ---------------------------------------------------------------------------

function partes(f: string): [number, number, number] {
  const [a, m, d] = f.split('-').map(Number);
  return [a, m, d];
}

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function esFinDeMes(f: string): boolean {
  const [a, m, d] = partes(f);
  return d === ultimoDiaDelMes(a, m);
}

export function finDeMes(f: string): string {
  const [a, m] = partes(f);
  return `${a}-${String(m).padStart(2, '0')}-${String(ultimoDiaDelMes(a, m)).padStart(2, '0')}`;
}

export function inicioDeMes(f: string): string {
  return `${f.slice(0, 7)}-01`;
}

/**
 * Peso de un día en el mes de 30: el 31 no cuenta, y el último día de febrero
 * completa el mes (vale 3 el 28 y 2 el 29). Así un mes completo siempre suma 30.
 */
export function pesoDia360(f: string): number {
  const [a, m, d] = partes(f);
  if (d === 31) return 0;
  if (m === 2 && d === ultimoDiaDelMes(a, 2)) return 30 - d + 1;
  return 1;
}

/** Días en base 360 entre dos fechas, ambas incluidas. 0 si el rango está vacío. */
export function dias360(desde: string, hasta: string): number {
  if (hasta < desde) return 0;
  let n = 0;
  for (let f = desde; f <= hasta; f = addPlainDays(f, 1)) n += pesoDia360(f);
  return n;
}

/** Recorre los días de un rango, incluidos los dos extremos. */
export function* diasDe(desde: string, hasta: string): Generator<string> {
  for (let f = desde; f <= hasta; f = addPlainDays(f, 1)) yield f;
}

export function maxFecha(a: string, b: string): string {
  return a > b ? a : b;
}
export function minFecha(a: string, b: string): string {
  return a < b ? a : b;
}

// ---------------------------------------------------------------------------
// Redondeo explícito
// ---------------------------------------------------------------------------

/** Al peso, mitad hacia arriba (en negativos, mitad alejándose de cero). */
export function aPeso(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const r = Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
  return r === 0 ? 0 : r;
}

/** Al peso superior (el IBC de la PILA se aproxima al peso superior). */
export function aPesoSuperior(x: number): number {
  return Math.ceil(x - 1e-9);
}

/**
 * Al múltiplo de 100 superior: la PILA aproxima así cada cotización (Decreto 780
 * de 2016, art. 3.2.1.5, num. 2). El Contador lo pidió en la nómina desde ya (P14).
 */
export function aCentenaSuperior(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.ceil(x / 100 - 1e-9) * 100;
}

/** Al múltiplo más cercano (`m` = 1000 para la retención), mitad hacia arriba. */
export function aMultiplo(x: number, m: number): number {
  if (!m || m <= 1) return aPeso(x);
  return Math.round(x / m + 1e-9) * m;
}

// ---------------------------------------------------------------------------
// Prorrateo por vigencia: «un período que cruza un cambio usa el valor de cada fecha»
// ---------------------------------------------------------------------------

/**
 * Suma, día por día (peso 360), `valor(fecha)`. Con un SMMLV que cambia a mitad de
 * mes, el piso del IBC del mes es la suma de cada tramo por sus días.
 */
export function sumaDiaria(desde: string, hasta: string, valorDia: (f: string) => number): number {
  let s = 0;
  for (const f of diasDe(desde, hasta)) {
    const w = pesoDia360(f);
    if (w) s += valorDia(f) * w;
  }
  return s;
}

/** Promedio ponderado por días (peso 360) de un parámetro en un rango. */
export function promedioDiario(p: ParametrosNomina, codigo: string, desde: string, hasta: string): number {
  const d = dias360(desde, hasta);
  if (d === 0) return num(p, codigo, hasta);
  return sumaDiaria(desde, hasta, (f) => num(p, codigo, f)) / d;
}

/** UVT del año gravable de la fecha. */
export function uvt(p: ParametrosNomina, fecha: string): number {
  return num(p, 'uvt', fecha);
}

// ---------------------------------------------------------------------------
// Huella (idempotencia)
// ---------------------------------------------------------------------------

function estable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${estable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** FNV-1a de 64 bits (dos de 32) en hexadecimal: detecta que una entrada cambió. */
export function huella(v: unknown): string {
  const texto = `${VERSION_MOTOR_NOMINA}|${estable(v)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
