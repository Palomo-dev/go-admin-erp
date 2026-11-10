/**
 * Convierte la respuesta de la base en las filas de cada pantalla. No calcula
 * saldos: agrupa y etiqueta. El texto visible va en `messages/*`; aquí viajan
 * las claves y, cuando hace falta, el nombre de la cuenta en el plan de la
 * organización.
 */
import { gastosPorFuncion } from '@/lib/finanzas/reportes/estadosNiif';
import type {
  CuentaResultado,
  EstadoFlujos,
  EstadoPatrimonio,
  EstadoResultado,
  FilaPresupuesto,
  RenglonFlujo,
  SeccionFlujo,
} from './tipos';

export interface FilaComparada {
  clave: string;
  /** Clave de `messages`, si el renglón tiene nombre fijo. */
  texto: string | null;
  /** Nombre de la cuenta en el plan, cuando el renglón sale de un grupo del PUC. */
  nombre: string | null;
  grupo: string | null;
  actual: number;
  anterior: number | null;
}

const claveRenglon = (r: RenglonFlujo) => `${r.tipo}:${r.grupo}:${r.sentido ?? ''}`;

/** Texto fijo de un renglón del flujo: «Depreciación», «Abonos a préstamos»… */
export function textoRenglonFlujo(r: Pick<RenglonFlujo, 'seccion' | 'tipo' | 'grupo' | 'sentido'>): string | null {
  if (r.tipo === 'ajuste') return `ajuste.${r.grupo}`;
  if (r.tipo === 'variacion') return ['13', '14', '22', '23', '24', '25', '26', '28'].includes(r.grupo) ? `variacion.g${r.grupo}` : null;
  const llave = `g${r.grupo}.${r.sentido}`;
  if (r.seccion === 'inversion' && ['15', '16', '12'].includes(r.grupo)) return `inversion.${llave}`;
  if (r.seccion === 'financiacion' && ['21', '23', '31', '32', '53'].includes(r.grupo)) return `financiacion.${llave}`;
  return null;
}

const ORDEN_TIPO: Record<RenglonFlujo['tipo'], number> = { ajuste: 0, variacion: 1, movimiento: 2 };

/** Renglones de una sección con las dos columnas. Un renglón de un solo año se muestra en cero en el otro. */
export function filasDeSeccion(
  seccion: SeccionFlujo,
  actual: EstadoFlujos,
  anterior: EstadoFlujos | null,
): FilaComparada[] {
  const mapa = new Map<string, FilaComparada & { orden: number }>();
  const sumar = (filas: RenglonFlujo[], campo: 'actual' | 'anterior') => {
    for (const r of filas.filter((f) => f.seccion === seccion)) {
      const clave = claveRenglon(r);
      const fila = mapa.get(clave) ?? {
        clave,
        texto: textoRenglonFlujo(r),
        nombre: r.nombre,
        grupo: r.tipo === 'ajuste' ? null : r.grupo,
        actual: 0,
        anterior: anterior ? 0 : null,
        orden: ORDEN_TIPO[r.tipo],
      };
      fila[campo] = (fila[campo] ?? 0) + r.valor;
      mapa.set(clave, fila);
    }
  };
  sumar(actual.filas, 'actual');
  if (anterior) sumar(anterior.filas, 'anterior');
  return [...mapa.values()].sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
}

/** El estado no está completo mientras haya importes sin clasificar. */
export function flujoCompleto(f: EstadoFlujos): boolean {
  return Math.abs(f.pendiente) < 0.01 && f.pendientes_cuentas.length === 0 && f.revisar_cuentas.length === 0;
}

export const flujoCuadra = (f: EstadoFlujos): boolean => Math.abs(f.diferencia) < 1;

export const COLUMNAS_PATRIMONIO = ['capital', 'reservas', 'ejercicio', 'acumulados', 'otros'] as const;
export type ColumnaPatrimonio = (typeof COLUMNAS_PATRIMONIO)[number];

function columnaDeGrupo(grupo: string): ColumnaPatrimonio {
  if (grupo === '31' || grupo === '32') return 'capital';
  if (grupo === '33') return 'reservas';
  if (grupo === '36') return 'ejercicio';
  if (grupo === '37') return 'acumulados';
  return 'otros';
}

export interface FilaPatrimonio {
  clave: string;
  valores: Record<ColumnaPatrimonio, number>;
  total: number;
  esTotal: boolean;
}

const ORDEN_PATRIMONIO = ['saldo_inicial', 'traslado', 'resultado', 'dividendos', 'aportes', 'capitalizacion', 'reservas', 'ori', 'otros', 'saldo_final'];

/** Las cuentas 34, 35 y 38 van en «Otros», que se oculta si queda en cero. */
export function filasPatrimonio(e: EstadoPatrimonio): { filas: FilaPatrimonio[]; columnas: ColumnaPatrimonio[] } {
  const filas = e.filas
    .map((f) => {
      const valores = Object.fromEntries(COLUMNAS_PATRIMONIO.map((c) => [c, 0])) as Record<ColumnaPatrimonio, number>;
      for (const [grupo, valor] of Object.entries(f.valores ?? {})) valores[columnaDeGrupo(grupo)] += valor;
      return { clave: f.clave, valores, total: f.total, esTotal: f.clave === 'saldo_inicial' || f.clave === 'saldo_final' };
    })
    .sort((a, b) => ORDEN_PATRIMONIO.indexOf(a.clave) - ORDEN_PATRIMONIO.indexOf(b.clave));
  const columnas = COLUMNAS_PATRIMONIO.filter((c) => c !== 'otros' || filas.some((f) => Math.abs(f.valores.otros) >= 0.01));
  return { filas, columnas };
}

export const patrimonioCuadra = (e: EstadoPatrimonio): boolean => Math.abs(e.diferencia) < 1;

/** Movimientos que la regla no reconoció: se ven aparte y el Contador los revisa. */
export const patrimonioConOtros = (e: EstadoPatrimonio): boolean =>
  e.filas.some((f) => f.clave === 'otros' && Math.abs(f.total) >= 0.01);

type RubroNaturaleza =
  | 'ingresos'
  | 'otros_ingresos'
  | 'costo_ventas'
  | 'costo_produccion'
  | 'personal'
  | 'honorarios'
  | 'impuestos'
  | 'depreciacion'
  | 'otros_gastos'
  | 'renta';

const NATURALEZA: ReadonlyArray<{ rubro: RubroNaturaleza; prefijos: string[] }> = [
  { rubro: 'ingresos', prefijos: ['41'] },
  { rubro: 'otros_ingresos', prefijos: ['4'] },
  { rubro: 'costo_ventas', prefijos: ['6'] },
  { rubro: 'costo_produccion', prefijos: ['7'] },
  { rubro: 'personal', prefijos: ['5105', '5205'] },
  { rubro: 'honorarios', prefijos: ['5110', '5210', '5120', '5220', '5135', '5235'] },
  { rubro: 'impuestos', prefijos: ['5115', '5215'] },
  { rubro: 'depreciacion', prefijos: ['5160', '5165', '5260', '5265'] },
  { rubro: 'renta', prefijos: ['54'] },
  { rubro: 'otros_gastos', prefijos: ['5'] },
];

export const RUBROS_NATURALEZA: readonly RubroNaturaleza[] = [
  'ingresos', 'otros_ingresos', 'costo_ventas', 'costo_produccion', 'personal', 'honorarios',
  'impuestos', 'depreciacion', 'otros_gastos', 'renta',
];

function rubroDe(c: CuentaResultado): RubroNaturaleza | null {
  return NATURALEZA.find((n) => n.prefijos.some((p) => c.codigo.startsWith(p)))?.rubro ?? null;
}

function sumarPor<T extends string>(cuentas: readonly CuentaResultado[], clave: (c: CuentaResultado) => T | null): Map<T, number> {
  const totales = new Map<T, number>();
  for (const c of cuentas) {
    const k = clave(c);
    if (k) totales.set(k, (totales.get(k) ?? 0) + c.neto);
  }
  return totales;
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;

export interface FilaResultado {
  clave: string;
  actual: number;
  anterior: number | null;
  variacion: number | null;
}

function variacionPorcentual(actual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null;
  return redondear(((actual - anterior) / Math.abs(anterior)) * 100);
}

function filaResultado(clave: string, actual: number, anterior: number | null): FilaResultado {
  return { clave, actual: redondear(actual), anterior: anterior === null ? null : redondear(anterior), variacion: variacionPorcentual(actual, anterior) };
}

/** Vista principal, decisión del Contador: NIIF para pymes 5.11. Los gastos van con su signo. */
export function resultadoPorNaturaleza(actual: EstadoResultado, anterior: EstadoResultado | null): FilaResultado[] {
  const a = sumarPor(actual.cuentas, rubroDe);
  const b = anterior ? sumarPor(anterior.cuentas, rubroDe) : null;
  return RUBROS_NATURALEZA
    .map((r) => filaResultado(r, a.get(r) ?? 0, b ? b.get(r) ?? 0 : null))
    .filter((f) => Math.abs(f.actual) >= 0.01 || Math.abs(f.anterior ?? 0) >= 0.01);
}

/** Opcional: la misma cifra por función, con la regla de `estadosNiif`. Los gastos van negativos. */
export function resultadoPorFuncion(actual: EstadoResultado, anterior: EstadoResultado | null): FilaResultado[] {
  const lado = (e: EstadoResultado) => ({
    ingresos: e.cuentas.filter((c) => c.codigo.startsWith('4')).reduce((s, c) => s + c.neto, 0),
    gastos: gastosPorFuncion(
      e.cuentas.filter((c) => !c.codigo.startsWith('4')).map((c) => ({ account_code: c.codigo, amount: -c.neto, children: [] })),
    ),
  });
  const a = lado(actual);
  const b = anterior ? lado(anterior) : null;
  return [
    filaResultado('ingresos_totales', a.ingresos, b ? b.ingresos : null),
    ...a.gastos.map((g, i) => filaResultado(`funcion_${g.clave}`, -g.importe, b ? -b.gastos[i].importe : null)),
  ].filter((f) => Math.abs(f.actual) >= 0.01 || Math.abs(f.anterior ?? 0) >= 0.01);
}

/** Largo del detalle: grupo (2) a subauxiliar (10, tope del plan). */
export type LargoDetalle = '2' | '4' | '6' | '8' | '10';

export interface FilaDetalleResultado extends FilaResultado {
  nombre: string | null;
}

/** Detalle consolidado al largo pedido: la suma conserva el total de cada columna. */
export function detalleResultado(actual: EstadoResultado, anterior: EstadoResultado | null, largo: LargoDetalle): FilaDetalleResultado[] {
  const corte = Number(largo);
  const a = sumarPor(actual.cuentas, (c) => c.codigo.slice(0, corte));
  const b = anterior ? sumarPor(anterior.cuentas, (c) => c.codigo.slice(0, corte)) : null;
  const nombres = new Map<string, string | null>();
  for (const c of [...actual.cuentas, ...(anterior?.cuentas ?? [])]) {
    const clave = c.codigo.slice(0, corte);
    if (c.codigo === clave || !nombres.has(clave)) nombres.set(clave, c.codigo === clave ? c.nombre : null);
  }
  return [...new Set([...a.keys(), ...(b?.keys() ?? [])])].sort().map((clave) => ({
    ...filaResultado(clave, a.get(clave) ?? 0, b ? b.get(clave) ?? 0 : null),
    nombre: nombres.get(clave) ?? null,
  }));
}

export const resultadoIntegralDe = (e: EstadoResultado): number => redondear(e.utilidad + e.ori);

export interface TotalesPresupuesto {
  presupuesto: number;
  real: number;
}

/** Una línea presupuestada dentro de otra ya está contada en su padre. */
export function filasPresupuesto(filas: readonly FilaPresupuesto[]): FilaPresupuesto[] {
  return filas.filter((f) => f.presupuestada && !f.solapada);
}

export const filasSinPresupuesto = (filas: readonly FilaPresupuesto[]): FilaPresupuesto[] =>
  filas.filter((f) => !f.presupuestada);

/** Variación contra presupuesto con signo: más gasto del presupuestado se ve positivo, como en Figma. */
export function signoVariacion(porcentaje: number | null): string {
  if (porcentaje === null) return '—';
  const entero = Math.round(porcentaje);
  return `${entero > 0 ? '+' : entero < 0 ? '−' : ''}${Math.abs(entero)} %`;
}
