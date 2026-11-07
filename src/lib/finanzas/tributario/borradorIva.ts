/**
 * Borrador del IVA (formulario 300) desde los libros: lectura del jsonb de
 * `fn_tributario_borrador_iva` (migración propuesta 20261108101000) y filas
 * para exportar. La numeración de renglones del formulario la fija el Contador
 * con el formulario vigente: aquí los renglones son conceptos, no números.
 * Sin React ni Supabase.
 */

export type LadoIva = 'generado' | 'descontable' | 'otros';

export type ClaveRenglonIva =
  | 'gravadas'
  | 'sin_iva'
  | 'devoluciones'
  | 'tarifa_sin_identificar'
  | 'no_cuadra'
  | 'sin_lineas'
  | 'ajuste_redondeo'
  | 'otros_movimientos';

export interface RenglonIva {
  lado: LadoIva;
  clave: ClaveRenglonIva;
  tarifa: number | null;
  base: number | null;
  valor: number;
  estado: 'ok' | 'revisar';
  asientos: number[];
  totalAsientos: number;
  totalDocumentos: number;
}

export interface BorradorIva {
  desde: string;
  hasta: string;
  renglones: RenglonIva[];
  ivaGenerado: number;
  ivaDescontable: number;
  otrosMovimientos: number | null;
  /** IVA generado − descontable de los libros. Positivo = a pagar; negativo = saldo a favor. */
  saldo: number;
  documentos: number;
  porRevisar: number;
  cuentas: string[];
}

const LADOS: readonly LadoIva[] = ['generado', 'descontable', 'otros'];
const CLAVES: readonly ClaveRenglonIva[] = [
  'gravadas',
  'sin_iva',
  'devoluciones',
  'tarifa_sin_identificar',
  'no_cuadra',
  'sin_lineas',
  'ajuste_redondeo',
  'otros_movimientos',
];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** jsonb de la RPC → borrador. Un renglón que no se entiende se descarta (y la prueba lo vigila). */
export function leerBorradorIva(data: unknown): BorradorIva {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const periodo = (d.periodo ?? {}) as Record<string, unknown>;
  const totales = (d.totales ?? {}) as Record<string, unknown>;
  const renglones = (Array.isArray(d.renglones) ? d.renglones : [])
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => r !== null)
    .filter((r) => LADOS.includes(r.lado as LadoIva) && CLAVES.includes(r.clave as ClaveRenglonIva))
    .map<RenglonIva>((r) => ({
      lado: r.lado as LadoIva,
      clave: r.clave as ClaveRenglonIva,
      tarifa: num(r.tarifa),
      base: num(r.base),
      valor: num(r.valor) ?? 0,
      estado: r.estado === 'ok' ? 'ok' : 'revisar',
      asientos: Array.isArray(r.asientos) ? r.asientos.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [],
      totalAsientos: num(r.total_asientos) ?? 0,
      totalDocumentos: num(r.total_documentos) ?? 0,
    }));
  return {
    desde: String(periodo.desde ?? ''),
    hasta: String(periodo.hasta ?? ''),
    renglones,
    ivaGenerado: num(totales.iva_generado) ?? 0,
    ivaDescontable: num(totales.iva_descontable) ?? 0,
    otrosMovimientos: num(totales.otros_movimientos),
    saldo: num(totales.saldo) ?? 0,
    documentos: num(totales.documentos) ?? 0,
    porRevisar: num(totales.por_revisar) ?? renglones.filter((r) => r.estado === 'revisar').length,
    cuentas: Array.isArray(d.cuentas) ? d.cuentas.map(String) : [],
  };
}

/** Renglones de un lado, en el orden en que llegan (la base ya los ordena). */
export function renglonesDe(b: BorradorIva, lado: LadoIva): RenglonIva[] {
  return b.renglones.filter((r) => r.lado === lado);
}

/** El saldo solo es definitivo si nada está por revisar. */
export function saldoDefinitivo(b: BorradorIva): boolean {
  return b.porRevisar === 0;
}

/**
 * Filas del CSV (Excel). `etiqueta` traduce cada renglón; los importes van sin
 * formato (número con punto decimal) para que Excel los sume.
 */
export function filasCsvBorradorIva(
  b: BorradorIva,
  textos: {
    encabezado: [string, string, string, string, string];
    etiqueta: (r: RenglonIva) => string;
    estado: (e: RenglonIva['estado']) => string;
    generado: string;
    descontable: string;
    saldo: string;
  },
): (string | number | null)[][] {
  const filas: (string | number | null)[][] = [textos.encabezado];
  for (const r of b.renglones) filas.push([textos.etiqueta(r), r.base, r.valor, textos.estado(r.estado), r.asientos.join(' ')]);
  filas.push([textos.generado, null, b.ivaGenerado, null, null]);
  filas.push([textos.descontable, null, b.ivaDescontable, null, null]);
  filas.push([textos.saldo, null, b.saldo, b.porRevisar > 0 ? textos.estado('revisar') : textos.estado('ok'), null]);
  return filas;
}
