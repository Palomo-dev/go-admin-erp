/**
 * Certificado de retenciones (Figma 09 · «Certificado de retenciones (Nuevo ·
 * propuesta)», 1491:126182): piezas puras que usan el cargador del motor, el
 * diálogo que elige el periodo y las pruebas. No importa nada del servidor.
 *
 * La agrupación por concepto NO se hace aquí: la hace la base
 * (`fn_certificado_retenciones_proveedor`, la misma lectura que el reporte de
 * retenciones practicadas). Aquí solo se ordena lo que llega, se suma la fila
 * «Total retenido» de la tabla y se arman los textos del documento.
 */

import { addPlainDays } from '@/lib/utils/dateCore';
import { localeDeIdioma, type Formateador } from './formato';
import type { Traductor } from './textos';
import type { IdiomaDocumento } from './tipos';

export const CLASES_RETENCION = ['retefuente', 'reteiva', 'reteica'] as const;
export type ClaseRetencion = (typeof CLASES_RETENCION)[number];

/** Un concepto tal como lo devuelve la RPC (y como queda en la foto del certificado expedido). */
export interface ConceptoRetenido {
  clase?: string | null;
  concepto?: string | null;
  cuenta?: string | null;
  tarifa?: number | string | null;
  base?: number | string | null;
  valor?: number | string | null;
}

export interface FilaValorRetenido {
  clase: ClaseRetencion | null;
  concepto: string;
  cuenta: string | null;
  base: number;
  /** Tarifa en escala 0–100 (2,5 = 2,5 %), como `invoice_purchase_withholdings.rate`. */
  tarifa: number;
  valor: number;
}

export interface ResumenValoresRetenidos {
  filas: FilaValorRetenido[];
  /** Suma de la columna «Valor retenido» (la fila «Total retenido»). Las bases no se suman. */
  total: number;
  /** Clases presentes, en el orden fuente → IVA → ICA. */
  clases: ClaseRetencion[];
}

const ORDEN_CLASE: Record<ClaseRetencion, number> = { retefuente: 1, reteiva: 2, reteica: 3 };

function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function esClase(valor: unknown): valor is ClaseRetencion {
  return typeof valor === 'string' && (CLASES_RETENCION as readonly string[]).includes(valor);
}

/** Redondeo a 6 decimales: evita el ruido de coma flotante al sumar importes. */
function sinRuido(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Filas de la tabla «Valores retenidos» y su total: fuente → IVA → ICA, luego
 * concepto y tarifa (el mismo orden de la RPC). Una fila sin valor no se pinta.
 */
export function resumirValoresRetenidos(conceptos: readonly ConceptoRetenido[] | null | undefined): ResumenValoresRetenidos {
  const filas = (conceptos ?? [])
    .map((c): FilaValorRetenido => ({
      clase: esClase(c.clase) ? c.clase : null,
      concepto: String(c.concepto ?? '').trim() || '—',
      cuenta: String(c.cuenta ?? '').trim() || null,
      base: numero(c.base),
      tarifa: numero(c.tarifa),
      valor: numero(c.valor),
    }))
    .filter((f) => f.valor !== 0)
    .sort(
      (a, b) =>
        (a.clase ? ORDEN_CLASE[a.clase] : 9) - (b.clase ? ORDEN_CLASE[b.clase] : 9) ||
        a.concepto.localeCompare(b.concepto, 'es') ||
        a.tarifa - b.tarifa,
    );
  const total = sinRuido(filas.reduce((s, f) => s + f.valor, 0));
  const presentes = new Set(filas.map((f) => f.clase).filter((c): c is ClaseRetencion => c !== null));
  return { filas, total, clases: CLASES_RETENCION.filter((c) => presentes.has(c)) };
}

/** Dónde se declaran: retención en la fuente e IVA en el formulario 350, ICA en el municipio. */
export function claveDeclaradoEn(clases: readonly ClaseRetencion[]): string {
  const ica = clases.includes('reteica');
  const formulario350 = clases.includes('retefuente') || clases.includes('reteiva');
  if (ica && formulario350) return 'certificado.declarado350EIca';
  if (ica) return 'certificado.declaradoIca';
  return 'certificado.declarado350';
}

/** Constancia bajo la tabla, según qué se declaró (mismas tres variantes que «Declarado en»). */
export function claveConstancia(clases: readonly ClaseRetencion[]): string {
  return claveDeclaradoEn(clases).replace('certificado.declarado', 'certificado.constancia');
}

/** «2,5 %», «15 %»; el ICA se expresa por mil, como lo fija cada municipio: «7 ‰», «9,66 ‰». */
export function textoTarifa(clase: ClaseRetencion | null, tarifa: number, f: Pick<Formateador, 'numero'>): string {
  return clase === 'reteica' ? `${f.numero(tarifa * 10, 3)} ‰` : `${f.numero(tarifa, 3)} %`;
}

const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MES_RE = /^(\d{4})-(\d{2})$/;

function ultimoDiaDelMes(anio: number, mes: number): string {
  const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  return addPlainDays(siguiente, -1);
}

/**
 * Periodo de meses completos elegido en el diálogo («2026-01» a «2026-09»):
 * del día 1 del primer mes al último día del último, sin pasar de `hoy`.
 * Null si los meses no son válidos o están al revés.
 */
export function rangoDeMeses(desdeMes: string, hastaMes: string, hoy: string): { desde: string; hasta: string } | null {
  const a = MES_RE.exec(desdeMes);
  const b = MES_RE.exec(hastaMes);
  if (!a || !b || desdeMes > hastaMes) return null;
  const mesA = Number(a[2]);
  const mesB = Number(b[2]);
  if (mesA < 1 || mesA > 12 || mesB < 1 || mesB > 12) return null;
  const desde = `${desdeMes}-01`;
  if (desde > hoy) return null;
  const fin = ultimoDiaDelMes(Number(b[1]), mesB);
  return { desde, hasta: fin < hoy ? fin : hoy };
}

export interface PeriodoMeses {
  anioDesde: number;
  mesDesde: number;
  anioHasta: number;
  mesHasta: number;
}

/**
 * El periodo en meses si empieza el día 1 y termina el último día de un mes
 * (o `hasta` es el día de expedición: el mes en curso hasta hoy). Si no, null
 * y el documento muestra las dos fechas.
 */
export function periodoEnMeses(desde: string, hasta: string, expedicion: string | null = null): PeriodoMeses | null {
  const a = DIA_RE.exec(desde);
  const b = DIA_RE.exec(hasta);
  if (!a || !b || desde > hasta || a[3] !== '01') return null;
  const anioHasta = Number(b[1]);
  const mesHasta = Number(b[2]);
  if (hasta !== ultimoDiaDelMes(anioHasta, mesHasta) && hasta !== expedicion) return null;
  return { anioDesde: Number(a[1]), mesDesde: Number(a[2]), anioHasta, mesHasta };
}

function nombreMes(anio: number, mes: number, idioma: IdiomaDocumento): string {
  return new Intl.DateTimeFormat(localeDeIdioma(idioma, 'es-CO'), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, 15, 12)));
}

/**
 * «enero a septiembre de 2026», «septiembre de 2026», «diciembre de 2025 a
 * enero de 2026» o, si no son meses completos, «01/09/2026 a 15/09/2026».
 * En minúscula inicial (va también dentro del título de la tabla); el campo
 * «Periodo certificado» la pone en mayúscula con `capitalizar`.
 */
export function textoPeriodo(
  desde: string,
  hasta: string,
  idioma: IdiomaDocumento,
  t: Traductor,
  f: Pick<Formateador, 'fecha'>,
  expedicion: string | null = null,
): string {
  const p = periodoEnMeses(desde, hasta, expedicion);
  if (!p) return t('certificado.periodoDias', { desde: f.fecha(desde), hasta: f.fecha(hasta) });
  const mesDesde = nombreMes(p.anioDesde, p.mesDesde, idioma);
  const mesHasta = nombreMes(p.anioHasta, p.mesHasta, idioma);
  if (p.anioDesde === p.anioHasta && p.mesDesde === p.mesHasta) return t('certificado.periodoMes', { mes: mesHasta, anio: p.anioHasta });
  if (p.anioDesde === p.anioHasta) return t('certificado.periodoMeses', { desde: mesDesde, hasta: mesHasta, anio: p.anioHasta });
  return t('certificado.periodoMesesAnios', { desde: mesDesde, anioDesde: p.anioDesde, hasta: mesHasta, anioHasta: p.anioHasta });
}

export function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase() + texto.slice(1) : texto;
}
