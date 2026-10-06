/**
 * Lectura defensiva del cuerpo de `POST /api/crm/leads/importar`.
 *
 * El cuerpo llega del navegador: se aceptan SOLO los campos conocidos, como
 * texto y con largo acotado. La organización no forma parte del cuerpo (sale
 * de la sesión; `readOrgBody` rechaza una ajena antes de llegar aquí).
 */

import { CAMPOS_LEAD, CAMPOS_MULTIPLES, type CampoSimple } from './campos';
import { MAX_FILAS_POR_ARCHIVO, MAX_FILAS_POR_BLOQUE } from './validacion';
import type { DatoAdicional, FilaLeadEntrada, OpcionesImportacionLeads } from './tipos';

export type AccionImportacion = 'validar' | 'importar';

const CAMPOS_SIMPLES: ReadonlySet<string> = new Set(CAMPOS_LEAD.filter((c) => !CAMPOS_MULTIPLES.has(c.campo)).map((c) => c.campo));
const LARGO_CELDA = 2000;
const MAX_LISTA = 10;

/** Límite de filas por archivo: `LEADS_IMPORT_MAX_FILAS` (1 a 5.000) o 1.000. */
export function maxFilasPorArchivo(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.LEADS_IMPORT_MAX_FILAS);
  return Number.isInteger(n) && n >= 1 && n <= 5000 ? n : MAX_FILAS_POR_ARCHIVO;
}

export type EntradaImportacion =
  | { ok: true; accion: AccionImportacion; filas: FilaLeadEntrada[]; opciones: OpcionesImportacionLeads }
  | { ok: false; status: 400 | 413; error: string };

const texto = (v: unknown, largo: number): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  return s ? s.slice(0, largo) : null;
};

function lista(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.slice(0, MAX_LISTA).map((x) => texto(x, LARGO_CELDA)).filter((x): x is string => !!x);
  return out.length ? out : undefined;
}

/** Columnas «Dato adicional» de una fila: hasta 60, encabezado ≤ 120 y valor ≤ 2.000 caracteres. */
const MAX_ADICIONALES = 60;
function adicionales(v: unknown): DatoAdicional[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: DatoAdicional[] = [];
  for (const x of v.slice(0, MAX_ADICIONALES)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as { columna?: unknown; valor?: unknown };
    const columna = texto(o.columna, 120);
    const valor = texto(o.valor, LARGO_CELDA);
    if (columna && valor) out.push({ columna, valor });
  }
  return out.length ? out : undefined;
}

function fila(v: unknown): FilaLeadEntrada | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { fila?: unknown; campos?: unknown; fuente?: unknown; etiquetas?: unknown; telefonosAdicionales?: unknown; correosAdicionales?: unknown; adicionales?: unknown };
  const n = Number(o.fila);
  if (!Number.isInteger(n) || n < 1) return null;
  const campos: Partial<Record<CampoSimple, string>> = {};
  if (o.campos && typeof o.campos === 'object') {
    for (const [k, val] of Object.entries(o.campos as Record<string, unknown>)) {
      if (!CAMPOS_SIMPLES.has(k)) continue;
      const t = texto(val, LARGO_CELDA);
      if (t) campos[k as CampoSimple] = t;
    }
  }
  const f: FilaLeadEntrada = { fila: n, campos };
  const fuente = lista(o.fuente);
  const etiquetas = lista(o.etiquetas);
  if (fuente) f.fuente = fuente;
  if (etiquetas) f.etiquetas = etiquetas;
  const telefonos = lista(o.telefonosAdicionales);
  const correos = lista(o.correosAdicionales);
  const extra = adicionales(o.adicionales);
  if (telefonos) f.telefonosAdicionales = telefonos;
  if (correos) f.correosAdicionales = correos;
  if (extra) f.adicionales = extra;
  return f;
}

export function leerEntradaImportacion(body: unknown, maxFilas: number = MAX_FILAS_POR_ARCHIVO): EntradaImportacion {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Cuerpo inválido' };
  const b = body as { accion?: unknown; filas?: unknown; opciones?: unknown };
  const accion = b.accion === 'validar' || b.accion === 'importar' ? b.accion : null;
  if (!accion) return { ok: false, status: 400, error: "accion debe ser 'validar' o 'importar'" };
  if (!Array.isArray(b.filas) || b.filas.length === 0) return { ok: false, status: 400, error: 'No hay filas para importar' };

  const limite = accion === 'validar' ? maxFilas : Math.min(maxFilas, MAX_FILAS_POR_BLOQUE);
  if (b.filas.length > limite) {
    return {
      ok: false,
      status: 413,
      error: accion === 'validar'
        ? `El archivo trae ${b.filas.length} filas; el máximo por archivo es ${limite}. Divídelo en varios.`
        : `Cada bloque admite hasta ${limite} filas.`,
    };
  }

  const filas: FilaLeadEntrada[] = [];
  const vistas = new Set<number>();
  for (const raw of b.filas) {
    const f = fila(raw);
    if (!f) return { ok: false, status: 400, error: 'Hay filas con formato inválido' };
    if (vistas.has(f.fila)) return { ok: false, status: 400, error: `La fila ${f.fila} viene repetida` };
    vistas.add(f.fila);
    filas.push(f);
  }

  const o = (b.opciones && typeof b.opciones === 'object' ? b.opciones : {}) as Record<string, unknown>;
  const lote = texto(o.lote, 60);
  if (!lote) return { ok: false, status: 400, error: 'El nombre del lote es obligatorio (identifica la importación y evita duplicarla).' };
  const pais = typeof o.pais === 'string' && /^[A-Za-z]{2}$/.test(o.pais) ? o.pais.toUpperCase() : 'CO';
  const moneda = typeof o.monedaValor === 'string' && /^[A-Za-z]{3}$/.test(o.monedaValor) ? o.monedaValor.toUpperCase() : null;
  const opciones: OpcionesImportacionLeads = {
    lote,
    tipoCliente: o.tipoCliente === 'person' ? 'person' : 'company',
    monedaValor: moneda,
    pais,
    archivo: texto(o.archivo, 200),
  };
  return { ok: true, accion, filas, opciones };
}
