/**
 * Estados financieros con los nombres de NIIF para Pymes (secc. 3–5): «Estado de situación financiera» y
 * «Estado del resultado integral». El comparativo del periodo anterior va activado por defecto (3.14).
 * Gastos por función (51 administración, 52 ventas, 53 otros): se muestran en positivo y se restan; un saldo
 * crédito en una cuenta de gasto se muestra negativo en su renglón (no se le quita el signo).
 */

export const TITULO_SITUACION_FINANCIERA = 'Estado de situación financiera';
export const TITULO_RESULTADO_INTEGRAL = 'Estado del resultado integral';
/** NIIF Pymes 3.14: información comparativa del periodo anterior, activada por defecto. */
export const COMPARATIVO_POR_DEFECTO = true;

interface NodoImporte {
  account_code: string;
  amount: number;
  children: NodoImporte[];
}

function restarAnio(fecha: string): string {
  const [a, m, d] = fecha.split('-').map((parte) => parseInt(parte, 10));
  if (!a || !m || !d) return fecha;
  const anio = a - 1;
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  return `${anio}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Mismo rango del año anterior (29-feb → 28-feb). */
export function rangoComparativo(desde: string, hasta: string): { desde: string; hasta: string } {
  return { desde: restarAnio(desde), hasta: restarAnio(hasta) };
}

/** Corte comparativo del estado de situación financiera: cierre del ejercicio anterior (31-dic). */
export function corteComparativo(corte: string): string {
  const anio = parseInt(corte.slice(0, 4), 10);
  return Number.isFinite(anio) ? `${anio - 1}-12-31` : corte;
}

/** Importe por código de todo el árbol (para la columna comparativa). */
export function importesPorCodigo(nodos: readonly NodoImporte[], destino = new Map<string, number>()): Map<string, number> {
  for (const nodo of nodos) {
    destino.set(nodo.account_code, nodo.amount);
    importesPorCodigo(nodo.children, destino);
  }
  return destino;
}

export interface RenglonFuncion {
  clave: string;
  titulo: string;
  /** Importe en el signo natural del gasto: positivo = débito (se resta); negativo = saldo crédito. */
  importe: number;
}

const FUNCIONES: ReadonlyArray<{ clave: string; titulo: string; prefijos: string[] }> = [
  { clave: 'costos', titulo: 'Costo de ventas y de producción', prefijos: ['6', '7'] },
  { clave: '51', titulo: 'Gastos de administración', prefijos: ['51'] },
  { clave: '52', titulo: 'Gastos de ventas', prefijos: ['52'] },
  { clave: '53', titulo: 'Otros gastos', prefijos: ['53'] },
  { clave: '54', titulo: 'Impuesto de renta y complementarios', prefijos: ['54'] },
];

/**
 * Suma por función usando el nodo más alto que cae en cada prefijo (sin contar dos veces un padre y su hijo).
 * Lo que no encaja (p. ej. 59 ganancias y pérdidas) va a «Otros gastos».
 */
export function gastosPorFuncion(gastos: readonly NodoImporte[]): RenglonFuncion[] {
  const totales = new Map<string, number>(FUNCIONES.map((f) => [f.clave, 0]));
  const visitar = (nodo: NodoImporte) => {
    const codigo = nodo.account_code;
    const funcion = FUNCIONES.find((f) => f.prefijos.some((p) => codigo.startsWith(p) && codigo.length >= p.length));
    if (funcion && (codigo.length >= 2 || funcion.clave === 'costos')) {
      totales.set(funcion.clave, (totales.get(funcion.clave) ?? 0) + nodo.amount);
      return;
    }
    if (nodo.children.length === 0) {
      if (codigo.length >= 2 || !codigo.startsWith('5')) {
        totales.set('53', (totales.get('53') ?? 0) + nodo.amount);
      }
      return;
    }
    nodo.children.forEach(visitar);
  };
  gastos.forEach(visitar);
  return FUNCIONES.map((f) => ({ clave: f.clave, titulo: f.titulo, importe: redondear(totales.get(f.clave) ?? 0) }));
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Resultado = ingresos − Σ gastos (los gastos se restan con su signo: un saldo crédito suma). */
export function resultadoIntegral(totalIngresos: number, renglones: readonly RenglonFuncion[]): number {
  return redondear(totalIngresos - renglones.reduce((suma, r) => suma + r.importe, 0));
}
