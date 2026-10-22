/**
 * Extracto bancario: lectura de CSV de bancos colombianos y empareje.
 *
 * El archivo se interpreta en el navegador. La base confirma el empareje
 * (mismo valor, fecha a lo sumo a 3 días y referencia compatible) para que
 * un cliente no pueda casar un movimiento de otra cuenta.
 */

export const DIAS_EMPAREJE = 3;

export type CategoriaExtracto = 'gmf' | 'comision' | 'interes';

export interface LineaExtracto {
  fecha: string;
  descripcion: string;
  referencia: string;
  /** Signo del banco: positivo entra, negativo sale. */
  valor: number;
  categoria: CategoriaExtracto | null;
}

export interface MovimientoCandidato {
  id: number;
  fecha: string;
  valor: number;
  referencia: string | null;
}

export interface ParejaExtracto {
  linea: number;
  movimientoId: number;
}

const ENCABEZADOS_FECHA = ['fecha', 'fecha movimiento', 'fecha transaccion', 'fecha de transaccion', 'fecha aplicacion'];
const ENCABEZADOS_DESC = ['descripcion', 'concepto', 'detalle', 'observacion', 'transaccion'];
const ENCABEZADOS_REF = ['referencia', 'documento', 'doc', 'comprobante', 'nro documento', 'numero'];
const ENCABEZADOS_VALOR = ['valor', 'importe', 'monto', 'cantidad'];
const ENCABEZADOS_DEBITO = ['debito', 'debitos', 'retiro', 'cargos', 'valor debito'];
const ENCABEZADOS_CREDITO = ['credito', 'creditos', 'consignacion', 'abonos', 'valor credito'];

function quitarTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizarTexto(texto: string): string {
  return quitarTildes(texto).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizarReferencia(texto: string | null | undefined): string {
  return quitarTildes(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Número con separador de miles colombiano (1.234.567,89) o anglosajón. */
export function parsearNumeroColombiano(crudo: string): number | null {
  const limpio = crudo.replace(/[$\s]/g, '').replace(/COP/gi, '');
  if (!limpio || limpio === '-' || limpio === '—') return null;
  const negativo = /^\(.*\)$/.test(limpio) || limpio.startsWith('-');
  const cuerpo = limpio.replace(/[()]/g, '').replace(/^-/, '');
  const tieneComa = cuerpo.includes(',');
  const tienePunto = cuerpo.includes('.');
  let normal = cuerpo;
  if (tieneComa && tienePunto) {
    if (cuerpo.lastIndexOf(',') > cuerpo.lastIndexOf('.')) {
      normal = cuerpo.replace(/\./g, '').replace(',', '.');
    } else {
      normal = cuerpo.replace(/,/g, '');
    }
  } else if (tieneComa) {
    const partes = cuerpo.split(',');
    const decimal = partes.length === 2 && partes[1].length <= 2;
    normal = decimal ? `${partes[0].replace(/\./g, '')}.${partes[1]}` : cuerpo.replace(/,/g, '');
  } else if (tienePunto) {
    const partes = cuerpo.split('.');
    const miles = partes.length > 2 || (partes.length === 2 && partes[1].length === 3);
    normal = miles ? cuerpo.replace(/\./g, '') : cuerpo;
  }
  const valor = Number(normal);
  if (!Number.isFinite(valor)) return null;
  return negativo ? -Math.abs(valor) : valor;
}

/** Día calendario YYYY-MM-DD. No pasa por UTC. */
export function parsearFechaExtracto(crudo: string): string | null {
  const texto = crudo.trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!dmy) return null;
  const dia = dmy[1].padStart(2, '0');
  const mes = dmy[2].padStart(2, '0');
  const anio = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
  const fecha = `${anio}-${mes}-${dia}`;
  const [y, m, d] = fecha.split('-').map(Number);
  const comprobacion = new Date(Date.UTC(y, m - 1, d));
  if (comprobacion.getUTCFullYear() !== y || comprobacion.getUTCMonth() !== m - 1 || comprobacion.getUTCDate() !== d) {
    return null;
  }
  return fecha;
}

export function sugerirCategoria(descripcion: string): CategoriaExtracto | null {
  const texto = normalizarTexto(descripcion);
  if (/gmf|4\s*x\s*1000|gravamen a los movimientos/.test(texto)) return 'gmf';
  if (/comision|cuota de manejo|costo de transaccion|cargo bancario/.test(texto)) return 'comision';
  if (/interes/.test(texto)) return 'interes';
  return null;
}

function detectarDelimitador(linea: string): string {
  const candidatos = [';', '\t', ',', '|'];
  let mejor = ',';
  let cuenta = 0;
  for (const d of candidatos) {
    const n = linea.split(d).length;
    if (n > cuenta) {
      cuenta = n;
      mejor = d;
    }
  }
  return mejor;
}

/** Parte una línea respetando comillas. */
export function partirLinea(linea: string, delimitador: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        comillas = !comillas;
      }
    } else if (c === delimitador && !comillas) {
      celdas.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  celdas.push(actual.trim());
  return celdas;
}

export function textoAFilas(texto: string): string[][] {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return [];
  const delimitador = detectarDelimitador(lineas[0].includes(';') ? lineas.find((l) => l.includes(';')) ?? lineas[0] : lineas[0]);
  return lineas.map((l) => partirLinea(l, delimitador));
}

function indiceDe(encabezados: string[], alias: string[]): number {
  return encabezados.findIndex((h) => alias.includes(h));
}

/**
 * Lee la matriz (CSV ya partido o la primera hoja de Excel).
 * Salta el preámbulo hasta la fila de encabezados.
 */
export function parsearMatrizExtracto(filas: string[][]): LineaExtracto[] {
  let encabezado = -1;
  let columnas: string[] = [];
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const norm = filas[i].map((c) => normalizarTexto(c));
    if (indiceDe(norm, ENCABEZADOS_FECHA) >= 0 && (
      indiceDe(norm, ENCABEZADOS_VALOR) >= 0
      || indiceDe(norm, ENCABEZADOS_DEBITO) >= 0
      || indiceDe(norm, ENCABEZADOS_CREDITO) >= 0
    )) {
      encabezado = i;
      columnas = norm;
      break;
    }
  }
  if (encabezado < 0) return [];

  const iFecha = indiceDe(columnas, ENCABEZADOS_FECHA);
  const iDesc = indiceDe(columnas, ENCABEZADOS_DESC);
  const iRef = indiceDe(columnas, ENCABEZADOS_REF);
  const iValor = indiceDe(columnas, ENCABEZADOS_VALOR);
  const iDebito = indiceDe(columnas, ENCABEZADOS_DEBITO);
  const iCredito = indiceDe(columnas, ENCABEZADOS_CREDITO);

  const lineas: LineaExtracto[] = [];
  for (let i = encabezado + 1; i < filas.length; i++) {
    const fila = filas[i];
    const fecha = parsearFechaExtracto(fila[iFecha] ?? '');
    if (!fecha) continue;
    const descripcion = (fila[iDesc] ?? '').trim();
    if (/^total(es)?$/.test(normalizarTexto(descripcion))) continue;
    let valor: number | null = null;
    if (iValor >= 0) valor = parsearNumeroColombiano(fila[iValor] ?? '');
    if (valor === null && (iDebito >= 0 || iCredito >= 0)) {
      const debito = iDebito >= 0 ? parsearNumeroColombiano(fila[iDebito] ?? '') : null;
      const credito = iCredito >= 0 ? parsearNumeroColombiano(fila[iCredito] ?? '') : null;
      const d = debito === null ? 0 : Math.abs(debito);
      const c = credito === null ? 0 : Math.abs(credito);
      if (d === 0 && c === 0) continue;
      valor = c - d;
    }
    if (valor === null || Math.abs(valor) < 0.005) continue;
    const referencia = iRef >= 0 ? (fila[iRef] ?? '').trim() : '';
    lineas.push({
      fecha,
      descripcion,
      referencia,
      valor,
      categoria: sugerirCategoria(descripcion),
    });
  }
  return lineas;
}

export function parsearExtractoCsv(texto: string): LineaExtracto[] {
  return parsearMatrizExtracto(textoAFilas(texto));
}

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  const ua = Date.UTC(ya, ma - 1, da);
  const ub = Date.UTC(yb, mb - 1, db);
  return Math.round((ua - ub) / 86_400_000);
}

export function referenciasCompatibles(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarReferencia(a);
  const nb = normalizarReferencia(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Empareje automático uno a uno. Gana la referencia exacta y, a igualdad,
 * la fecha más cercana. Una transacción no se usa dos veces.
 */
export function emparejarExtracto(
  lineas: LineaExtracto[],
  movimientos: MovimientoCandidato[],
  dias: number = DIAS_EMPAREJE,
): ParejaExtracto[] {
  const usados = new Set<number>();
  const orden = lineas.map((linea, lineaIdx) => ({ linea, lineaIdx }));
  orden.sort((a, b) => {
    const ra = normalizarReferencia(a.linea.referencia) ? 0 : 1;
    const rb = normalizarReferencia(b.linea.referencia) ? 0 : 1;
    return ra - rb || a.linea.fecha.localeCompare(b.linea.fecha);
  });

  const parejas: ParejaExtracto[] = [];
  for (const { linea, lineaIdx } of orden) {
    const refLinea = normalizarReferencia(linea.referencia);
    let mejor: { id: number; puntos: number } | null = null;
    for (const mov of movimientos) {
      if (usados.has(mov.id)) continue;
      if (Math.abs(mov.valor - linea.valor) >= 0.005) continue;
      const distancia = Math.abs(diasEntre(linea.fecha, mov.fecha.slice(0, 10)));
      if (distancia > dias) continue;
      if (!referenciasCompatibles(linea.referencia, mov.referencia)) continue;
      const refMov = normalizarReferencia(mov.referencia);
      const puntos = (refLinea && refMov && refLinea === refMov ? 1000 : refLinea && refMov ? 100 : 0) - distancia;
      if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && mov.id < mejor.id)) {
        mejor = { id: mov.id, puntos };
      }
    }
    if (mejor) {
      usados.add(mejor.id);
      parejas.push({ linea: lineaIdx, movimientoId: mejor.id });
    }
  }
  return parejas;
}

export const ETIQUETA_CATEGORIA: Record<CategoriaExtracto, string> = {
  gmf: 'GMF',
  comision: 'Comisiones',
  interes: 'Intereses',
};

/** Clave de categorías de tesorería, si la organización ya la tiene. No siembra. */
export function claveCategoria(categoria: CategoriaExtracto, valor: number): string {
  if (categoria === 'gmf') return 'gmf';
  if (categoria === 'comision') return 'comisiones_bancarias';
  return valor >= 0 ? 'intereses_recibidos' : 'intereses_pagados';
}
