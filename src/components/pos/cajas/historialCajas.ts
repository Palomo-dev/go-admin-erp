/**
 * Lógica pura de las pestañas «Cajas abiertas» e «Historial» de
 * /app/pos/cajas (Figma 680:404392). Sin Supabase ni React: se prueba en
 * `__tests__/historialCajas.test.ts`.
 */
import type { CashSession, ResultadoCierre } from './types';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';

/**
 * «$ 1.068.400» (sin centavos, como en las cifras de Figma) en la moneda base
 * de la organización (`useMonedaOrganizacion()`); nunca pesos fijos.
 */
export function dinero(valor: number | null | undefined, moneda: ContextoMoneda | string): string {
  return formatMoneda(Math.round(Number(valor ?? 0)) || 0, moneda, { decimals: 0 });
}

/** «+$ 30.000», «−$ 12.000» o «$ 0»: el signo siempre visible salvo en cero. */
export function dineroConSigno(valor: number | null | undefined, moneda: ContextoMoneda | string): string {
  const n = Math.round(Number(valor ?? 0)) || 0;
  if (n > 0) return `+${dinero(n, moneda)}`;
  if (n < 0) return `−${dinero(Math.abs(n), moneda)}`;
  return dinero(0, moneda);
}

/** Una diferencia de menos de medio peso se da por cuadrada (redondeos de caja). */
const TOLERANCIA = 0.5;

/** Faltante (contó menos), sobrante (contó más) o cuadrada. `null` = sin cierre. */
export function resultadoDiferencia(diferencia: number | null | undefined): ResultadoCierre | null {
  if (diferencia === null || diferencia === undefined || Number.isNaN(Number(diferencia))) return null;
  const d = Number(diferencia);
  if (d <= -TOLERANCIA) return 'faltante';
  if (d >= TOLERANCIA) return 'sobrante';
  return 'cuadrada';
}

export const ETIQUETA_RESULTADO: Record<ResultadoCierre, string> = {
  faltante: 'Faltante',
  sobrante: 'Sobrante',
  cuadrada: 'Cuadrada',
};

export function esResultadoCierre(valor: string | null | undefined): valor is ResultadoCierre {
  return valor === 'faltante' || valor === 'sobrante' || valor === 'cuadrada';
}

export interface ResumenDiferencias {
  sesiones: number;
  faltantes: number;
  cajasConFaltante: number;
  sobrantes: number;
  cajasConSobrante: number;
  neta: number;
  cuadradas: number;
}

/** Cifras de la franja del historial: suma de faltantes, de sobrantes y la neta. */
export function resumenDiferencias(diferencias: readonly (number | null | undefined)[]): ResumenDiferencias {
  const r: ResumenDiferencias = { sesiones: 0, faltantes: 0, cajasConFaltante: 0, sobrantes: 0, cajasConSobrante: 0, neta: 0, cuadradas: 0 };
  for (const valor of diferencias) {
    r.sesiones += 1;
    const resultado = resultadoDiferencia(valor);
    const d = Number(valor ?? 0);
    if (resultado === 'faltante') {
      r.faltantes += d;
      r.cajasConFaltante += 1;
    } else if (resultado === 'sobrante') {
      r.sobrantes += d;
      r.cajasConSobrante += 1;
    } else if (resultado === 'cuadrada') {
      r.cuadradas += 1;
    }
    if (resultado) r.neta += d;
  }
  return r;
}

/**
 * Término de búsqueda apto para un filtro `or()`/`ilike` de PostgREST: sin
 * comas, paréntesis, comodines ni comillas, que cambiarían la expresión.
 */
export function sanitizarBusqueda(termino: string | null | undefined): string {
  return (termino ?? '')
    .replace(/[,()*%\\"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** «#1285» o «1285» → 1285. Cualquier otra cosa → null (se busca por cajero). */
export function numeroDeCaja(termino: string): number | null {
  const limpio = termino.trim().replace(/^#/, '');
  if (!/^\d{1,9}$/.test(limpio)) return null;
  return Number(limpio);
}

/** ¿Coincide una caja abierta con el buscador de la pestaña (cajero, sucursal o número)? */
export function cajaCoincide(sesion: Pick<CashSession, 'id' | 'opened_by_name' | 'branch_name'>, termino: string): boolean {
  const t = normalizar(termino);
  if (!t) return true;
  const numero = numeroDeCaja(termino);
  if (numero !== null && sesion.id === numero) return true;
  return normalizar(sesion.opened_by_name ?? '').includes(t) || normalizar(sesion.branch_name ?? '').includes(t) || String(sesion.id).includes(t.replace(/^#/, ''));
}

/** ¿El nombre completo contiene todas las palabras buscadas (sin tildes ni mayúsculas)? */
export function nombreContieneTodas(nombreCompleto: string, palabras: readonly string[]): boolean {
  const nombre = normalizar(nombreCompleto);
  return palabras.every((p) => nombre.includes(normalizar(p)));
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Resumen de la franja de «Cajas abiertas». */
export interface ResumenCajasAbiertas {
  cajas: number;
  sucursales: number;
  /** Suma del esperado de las cajas cuyo resumen ya se calculó. */
  esperado: number;
  movimientos: number;
  ingresos: number;
  egresos: number;
}

export function resumenCajasAbiertas(
  sesiones: readonly Pick<CashSession, 'id' | 'branch_id'>[],
  resumenes: ReadonlyMap<number, { expected_amount: number; cash_in_count?: number; cash_out_count?: number }>,
): ResumenCajasAbiertas {
  const sucursales = new Set(sesiones.map((s) => (s.branch_id === null ? 'global' : String(s.branch_id))));
  const r: ResumenCajasAbiertas = { cajas: sesiones.length, sucursales: sucursales.size, esperado: 0, movimientos: 0, ingresos: 0, egresos: 0 };
  for (const s of sesiones) {
    const resumen = resumenes.get(s.id);
    if (!resumen) continue;
    r.esperado += Number(resumen.expected_amount || 0);
    r.ingresos += resumen.cash_in_count ?? 0;
    r.egresos += resumen.cash_out_count ?? 0;
  }
  r.movimientos = r.ingresos + r.egresos;
  return r;
}

/**
 * Tiempo transcurrido como clave + valores, para traducirlo en la UI con
 * `cajas.listado.hace.<clave>` (ver `useHaceCuanto` en `listado/comunes.tsx`).
 */
export type PartesHaceCuanto =
  | { clave: 'momento'; valores: Record<string, never> }
  | { clave: 'minutos'; valores: { min: number } }
  | { clave: 'horas'; valores: { h: number } }
  | { clave: 'horasMinutos'; valores: { h: number; min: number } }
  | { clave: 'dias'; valores: { count: number } };

export function partesHaceCuanto(desde: string | Date, ahora: Date = new Date()): PartesHaceCuanto {
  const inicio = typeof desde === 'string' ? new Date(desde) : desde;
  const minutos = Math.max(0, Math.floor((ahora.getTime() - inicio.getTime()) / 60_000));
  if (minutos < 1) return { clave: 'momento', valores: {} };
  if (minutos < 60) return { clave: 'minutos', valores: { min: minutos } };
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto ? { clave: 'horasMinutos', valores: { h: horas, min: resto } } : { clave: 'horas', valores: { h: horas } };
  return { clave: 'dias', valores: { count: Math.floor(horas / 24) } };
}

/** «hace 3 h 20 min», «hace 5 min», «hace un momento» (español; la UI traduce `partesHaceCuanto`). */
export function haceCuanto(desde: string | Date, ahora: Date = new Date()): string {
  const p = partesHaceCuanto(desde, ahora);
  switch (p.clave) {
    case 'momento':
      return 'hace un momento';
    case 'minutos':
      return `hace ${p.valores.min} min`;
    case 'horas':
      return `hace ${p.valores.h} h`;
    case 'horasMinutos':
      return `hace ${p.valores.h} h ${p.valores.min} min`;
    case 'dias':
      return p.valores.count === 1 ? 'hace 1 día' : `hace ${p.valores.count} días`;
  }
}

/** Valor de celda CSV: comillas si hace falta y sin fórmulas que Excel ejecute. */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export interface FilaCsvHistorial {
  caja: number;
  apertura: string;
  cierre: string;
  cerro: string;
  cajero: string;
  sucursal: string;
  inicial: number;
  final: number | null;
  diferencia: number | null;
}

/** Textos del CSV en el idioma activo (la UI los pasa traducidos; por defecto, español). */
export interface TextosCsvHistorial {
  /** Las 10 columnas, en el orden de `FilaCsvHistorial` + «Resultado». */
  cabecera: readonly string[];
  oculto: string;
  resultados: Record<ResultadoCierre, string>;
}

const TEXTOS_CSV_ES: TextosCsvHistorial = {
  cabecera: ['Caja', 'Apertura', 'Cierre', 'Cerró', 'Cajero', 'Sucursal', 'Inicial', 'Final', 'Diferencia', 'Resultado'],
  oculto: 'Oculto',
  resultados: ETIQUETA_RESULTADO,
};

/**
 * CSV del historial (separador `;`, como lo abre Excel en es-CO) con BOM para
 * que las tildes lleguen bien. `ocultarImportes` = cierre ciego para quien no
 * puede ver el esperado: final y diferencia no se exportan.
 */
export function historialACsv(
  filas: readonly FilaCsvHistorial[],
  ocultarImportes: boolean,
  textos: TextosCsvHistorial = TEXTOS_CSV_ES,
): string {
  const cabecera = textos.cabecera.map(celdaCsv);
  const lineas = filas.map((f) => {
    const resultado = resultadoDiferencia(f.diferencia);
    return [
      f.caja,
      f.apertura,
      f.cierre,
      f.cerro,
      f.cajero,
      f.sucursal,
      f.inicial,
      ocultarImportes ? textos.oculto : f.final ?? '',
      ocultarImportes ? textos.oculto : f.diferencia ?? '',
      ocultarImportes || !resultado ? '' : textos.resultados[resultado],
    ]
      .map(celdaCsv)
      .join(';');
  });
  return `﻿${[cabecera.join(';'), ...lineas].join('\r\n')}`;
}
