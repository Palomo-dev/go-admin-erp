/**
 * Lógica pura del listado y de los miembros de segmentos (Figma CRM 1384:17
 * «Listado — listo» y 1384:1045 «Miembros»). Sin React ni red.
 *
 * - Filtro por texto y tipo (chips «Todos / Dinámicos / Estáticos»).
 * - «Contactables»: los canales que tienen al menos un cliente contactable,
 *   según `segments.counts_json` (lo escribe el recálculo en el servidor).
 * - «Usado en»: lo que devuelve `crm_segment_usages` (campañas, campañas de
 *   voz y secuencias que apuntan al segmento).
 * - «Hace 12 min», «Hace 3 meses»: tiempo relativo con `Intl.RelativeTimeFormat`.
 */
import { normalizarFiltroSegmento } from '@/lib/services/crm/segmentosFiltroLogica';
import type { FilterRule, Segment } from './types';

export { leerConteos, conteosDesdeDesglose, contactables, type ConteosSegmento, type CanalContacto } from '@/lib/services/crm/segmentosConteosLogica';

export type TipoFiltroSegmento = 'todos' | 'dinamicos' | 'estaticos';

export function filtrarSegmentos(segmentos: readonly Segment[], texto: string, tipo: TipoFiltroSegmento): Segment[] {
  const q = texto.trim().toLocaleLowerCase('es');
  return segmentos.filter((s) => {
    if (tipo === 'dinamicos' && !s.is_dynamic) return false;
    if (tipo === 'estaticos' && s.is_dynamic) return false;
    if (!q) return true;
    return s.name.toLocaleLowerCase('es').includes(q) || (s.description ?? '').toLocaleLowerCase('es').includes(q);
  });
}

/** Uso de un segmento según `crm_segment_usages`. */
export interface UsoSegmento {
  campaigns: number;
  voice_campaigns: number;
  sequences: number;
}

export function leerUsos(raw: unknown): Map<string, UsoSegmento> {
  const mapa = new Map<string, UsoSegmento>();
  if (!Array.isArray(raw)) return mapa;
  for (const fila of raw) {
    if (!fila || typeof fila !== 'object') continue;
    const f = fila as Record<string, unknown>;
    if (typeof f.id !== 'string') continue;
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    mapa.set(f.id, { campaigns: n(f.campaigns), voice_campaigns: n(f.voice_campaigns), sequences: n(f.sequences) });
  }
  return mapa;
}

export type PiezaUso = { clave: 'campanas' | 'campanasVoz' | 'secuencias'; n: number };

/** Lo que se pinta en «Usado en»: solo lo que existe; vacío = «Sin uso». */
export function piezasDeUso(uso: UsoSegmento | undefined): PiezaUso[] {
  if (!uso) return [];
  const piezas: PiezaUso[] = [];
  if (uso.campaigns > 0) piezas.push({ clave: 'campanas', n: uso.campaigns });
  if (uso.voice_campaigns > 0) piezas.push({ clave: 'campanasVoz', n: uso.voice_campaigns });
  if (uso.sequences > 0) piezas.push({ clave: 'secuencias', n: uso.sequences });
  return piezas;
}

export const enUso = (uso: UsoSegmento | undefined): boolean => piezasDeUso(uso).length > 0;

/** Instante de «Actualizado»: dinámico → último conteo; estático → foto de miembros. */
export function instanteActualizado(s: Pick<Segment, 'is_dynamic' | 'counted_at' | 'last_run_at' | 'members_snapshotted_at' | 'created_at'>): string | null {
  if (s.is_dynamic) return s.counted_at ?? s.last_run_at ?? null;
  return s.members_snapshotted_at ?? s.created_at ?? null;
}

/** Regla del primer grupo en una frase corta: «Ciudad = Medellín», «etiqueta «ferretería»». */
export interface PiezaRegla {
  campo: string;
  operador: string;
  valor: string;
}

export function reglasDeResumen(filterJson: Segment['filter_json']): { piezas: PiezaRegla[]; gruposExtra: number } {
  const f = normalizarFiltroSegmento(filterJson);
  if (!f) return { piezas: [], gruposExtra: 0 };
  const primero = (f.grupos[0] ?? []) as FilterRule[];
  const piezas = primero.slice(0, 3).map((r) => ({
    campo: r.field,
    operador: r.operator,
    valor: Array.isArray(r.value) ? r.value.join(' – ') : String(r.value ?? ''),
  }));
  return { piezas, gruposExtra: Math.max(0, f.grupos.length - 1) };
}

const UNIDADES: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** «Hace 12 min», «Hace 3 meses», «Ayer» en el idioma activo; '' sin fecha. */
export function haceCuanto(valor: string | null | undefined, locale: string, ahora: number): string {
  if (!valor) return '';
  const ms = new Date(valor).getTime();
  if (Number.isNaN(ms)) return '';
  const segundos = Math.round((ms - ahora) / 1000);
  const abs = Math.abs(segundos);
  const [unidad, tamano] = UNIDADES.find(([, s]) => abs >= s) ?? ['minute', 60];
  const valorUnidad = Math.round(segundos / tamano);
  let texto: string;
  try {
    texto = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(valorUnidad, unidad);
  } catch {
    texto = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto', style: 'short' }).format(valorUnidad, unidad);
  }
  return texto.charAt(0).toLocaleUpperCase(locale) + texto.slice(1);
}

/** Banda de salud (0–100) para el badge de Miembros. */
export type BandaSalud = 'verde' | 'amarilla' | 'roja' | 'sinDato';

export function bandaSalud(score: number | null | undefined): BandaSalud {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'sinDato';
  if (score >= 70) return 'verde';
  if (score >= 40) return 'amarilla';
  return 'roja';
}
