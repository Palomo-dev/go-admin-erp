/**
 * Presupuestos (`budgets` + `budget_lines`, periodo 1–12): reglas de presentación
 * y de guardado sin React ni Supabase, compartidas por la pantalla y las rutas
 * de `/api/finanzas/presupuestos`.
 *
 * - Un presupuesto solo se edita en borrador. El esquema no tiene versiones
 *   (no hay `version` ni `parent_id`): de uno aprobado se ofrece una copia en
 *   borrador, que no queda enlazada al original.
 * - `budget_lines` no tiene clave única por (presupuesto, cuenta, periodo,
 *   centro de costo): un `upsert` sin `id` inserta otra fila. Por eso el
 *   guardado compara con lo que hay y actualiza por `id`.
 */

export const ESTADOS_PRESUPUESTO = ['draft', 'approved', 'active', 'closed'] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

export const MESES = 12;

/** Clave de traducción del estado (`finanzasReportesR2.presupuestos.estado.<clave>`). */
export function claveEstado(estado: string | null | undefined): EstadoPresupuesto | 'desconocido' {
  const e = (estado ?? '').trim().toLowerCase();
  return (ESTADOS_PRESUPUESTO as readonly string[]).includes(e) ? (e as EstadoPresupuesto) : 'desconocido';
}

/** Tono del badge (Figma 82-19: borrador en marca, aprobado en verde, cerrado neutro). */
export function tonoEstado(estado: string | null | undefined): 'marca' | 'exito' | 'neutro' {
  const e = claveEstado(estado);
  if (e === 'draft') return 'marca';
  if (e === 'approved' || e === 'active') return 'exito';
  return 'neutro';
}

/** Solo el borrador se edita. Aprobado, activo o cerrado: se copia en un borrador nuevo. */
export function esEditable(estado: string | null | undefined): boolean {
  return claveEstado(estado) === 'draft';
}

/** Permiso que exige el servidor para borrar: el borrador lo descarta quien crea; lo demás, quien aprueba. */
export function permisoParaBorrar(estado: string | null | undefined): 'finance.create' | 'finance.approve' {
  return claveEstado(estado) === 'draft' ? 'finance.create' : 'finance.approve';
}

// ---------------------------------------------------------------------------
// Grilla de líneas
// ---------------------------------------------------------------------------

export interface LineaGuardada {
  id: string;
  account_code: string;
  period: number;
  planned_amount: number | string;
  cost_center_id: string | null;
}

export interface FilaGrilla {
  account_code: string;
  cost_center_id: string | null;
  /** 12 valores, enero a diciembre. */
  meses: number[];
}

export function claveFila(f: { account_code: string; cost_center_id: string | null }): string {
  return `${f.account_code}|${f.cost_center_id ?? ''}`;
}

function aNumero(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/**
 * Agrupa las líneas por cuenta (y centro de costo). Si hay filas repetidas
 * para un mismo mes, se suman: así se ve lo que el informe ya suma.
 */
export function construirGrilla(lineas: readonly LineaGuardada[]): FilaGrilla[] {
  const filas = new Map<string, FilaGrilla>();
  for (const l of lineas) {
    if (!Number.isInteger(l.period) || l.period < 1 || l.period > MESES) continue;
    const clave = claveFila(l);
    let fila = filas.get(clave);
    if (!fila) {
      fila = { account_code: l.account_code, cost_center_id: l.cost_center_id ?? null, meses: Array(MESES).fill(0) };
      filas.set(clave, fila);
    }
    fila.meses[l.period - 1] += aNumero(l.planned_amount);
  }
  return [...filas.values()].sort((a, b) => a.account_code.localeCompare(b.account_code) || claveFila(a).localeCompare(claveFila(b)));
}

export function totalFila(fila: Pick<FilaGrilla, 'meses'>): number {
  return fila.meses.reduce((s, v) => s + aNumero(v), 0);
}

export function totalGrilla(filas: readonly Pick<FilaGrilla, 'meses'>[]): number {
  return filas.reduce((s, f) => s + totalFila(f), 0);
}

/**
 * Reparte el valor del año en 12 meses iguales con los decimales de la moneda.
 * Lo que sobra del redondeo va a diciembre: la suma da exactamente el año.
 */
export function repartirAnual(anual: number, decimales = 0): number[] {
  const total = redondear(aNumero(anual), decimales);
  const mes = Math.trunc((total / MESES) * 10 ** decimales) / 10 ** decimales;
  const meses = Array(MESES - 1).fill(mes);
  return [...meses, redondear(total - mes * (MESES - 1), decimales)];
}

/** Copia el valor de un mes a los demás. */
export function copiarMesAlResto(meses: readonly number[], indice: number): number[] {
  const v = aNumero(meses[indice]);
  return Array(MESES).fill(v);
}

export function grillasIguales(a: readonly FilaGrilla[], b: readonly FilaGrilla[]): boolean {
  if (a.length !== b.length) return false;
  const mapa = new Map(b.map((f) => [claveFila(f), f]));
  return a.every((f) => {
    const otra = mapa.get(claveFila(f));
    return !!otra && f.meses.every((v, i) => aNumero(v) === aNumero(otra.meses[i]));
  });
}

// ---------------------------------------------------------------------------
// Guardado (servidor)
// ---------------------------------------------------------------------------

export interface FilaUpsert {
  id: string;
  budget_id: string;
  organization_id: number;
  account_code: string;
  period: number;
  planned_amount: number;
  cost_center_id: string | null;
}

export interface PlanGuardado {
  upsert: FilaUpsert[];
  borrar: string[];
  total: number;
}

/**
 * Compara la grilla con lo guardado: cada (cuenta, centro, mes) reutiliza el
 * `id` existente; los repetidos y las cuentas quitadas se borran; lo nuevo
 * recibe un `id` de `nuevoId`. Se guardan los 12 meses de cada cuenta.
 */
export function planearGuardado(
  existentes: readonly LineaGuardada[],
  filas: readonly FilaGrilla[],
  ctx: { budgetId: string; organizationId: number; nuevoId: () => string },
): PlanGuardado {
  const porCelda = new Map<string, string[]>();
  for (const l of existentes) {
    const k = `${claveFila(l)}|${l.period}`;
    porCelda.set(k, [...(porCelda.get(k) ?? []), l.id]);
  }
  const usados = new Set<string>();
  const upsert: FilaUpsert[] = [];
  for (const f of filas) {
    for (let p = 1; p <= MESES; p++) {
      const ids = porCelda.get(`${claveFila(f)}|${p}`) ?? [];
      const id = ids[0] ?? ctx.nuevoId();
      usados.add(id);
      upsert.push({
        id,
        budget_id: ctx.budgetId,
        organization_id: ctx.organizationId,
        account_code: f.account_code,
        period: p,
        planned_amount: aNumero(f.meses[p - 1]),
        cost_center_id: f.cost_center_id ?? null,
      });
    }
  }
  const borrar = existentes.map((l) => l.id).filter((id) => !usados.has(id));
  return { upsert, borrar, total: totalGrilla(filas) };
}

// ---------------------------------------------------------------------------
// Validación de cuerpos (servidor)
// ---------------------------------------------------------------------------

export const MAX_CUENTAS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_CUENTA = /^[0-9A-Za-z.\-]{1,30}$/;
const TOPE_IMPORTE = 1e15;

export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

export type ResultadoValidacion<T> = { ok: true; valor: T } | { ok: false; error: string };

export function validarFilas(cuerpo: unknown): ResultadoValidacion<FilaGrilla[]> {
  const filas = (cuerpo as { filas?: unknown } | null)?.filas;
  if (!Array.isArray(filas)) return { ok: false, error: 'filas' };
  if (filas.length > MAX_CUENTAS) return { ok: false, error: 'demasiadas_cuentas' };
  const vistas = new Set<string>();
  const salida: FilaGrilla[] = [];
  for (const f of filas as unknown[]) {
    const r = f as Partial<FilaGrilla> | null;
    if (!r || typeof r.account_code !== 'string' || !CODIGO_CUENTA.test(r.account_code.trim())) return { ok: false, error: 'cuenta' };
    const centro = r.cost_center_id ?? null;
    if (centro !== null && !esUuid(centro)) return { ok: false, error: 'centro' };
    if (!Array.isArray(r.meses) || r.meses.length !== MESES) return { ok: false, error: 'meses' };
    const meses = r.meses.map((v) => (typeof v === 'number' ? v : NaN));
    if (meses.some((v) => !Number.isFinite(v) || Math.abs(v) >= TOPE_IMPORTE)) return { ok: false, error: 'importe' };
    const fila = { account_code: r.account_code.trim(), cost_center_id: centro, meses };
    const k = claveFila(fila);
    if (vistas.has(k)) return { ok: false, error: 'cuenta_repetida' };
    vistas.add(k);
    salida.push(fila);
  }
  return { ok: true, valor: salida };
}

export type OrigenPresupuesto = 'vacio' | 'copia' | 'real_anterior';
/** «Real del año anterior» no tiene todavía una fuente fiable de saldos por cuenta y mes. */
export const ORIGENES_DISPONIBLES: readonly OrigenPresupuesto[] = ['vacio', 'copia'];

export interface CuerpoCrear {
  name: string;
  fiscal_year: number;
  origen: 'vacio' | 'copia';
  copiar_de: string | null;
}

export function validarCrear(cuerpo: unknown): ResultadoValidacion<CuerpoCrear> {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name || name.length > 120) return { ok: false, error: 'nombre' };
  const anio = typeof c.fiscal_year === 'number' ? c.fiscal_year : NaN;
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return { ok: false, error: 'anio' };
  const origen = c.origen ?? 'vacio';
  if (origen !== 'vacio' && origen !== 'copia') return { ok: false, error: 'origen' };
  if (origen === 'copia' && !esUuid(c.copiar_de)) return { ok: false, error: 'copiar_de' };
  return { ok: true, valor: { name, fiscal_year: anio, origen, copiar_de: origen === 'copia' ? (c.copiar_de as string) : null } };
}
