/**
 * Filtros de Pipeline y Oportunidades (ola 3B; Figma 768:454922 y 773:23160):
 * responsable, cierre esperado, prioridad (D4: `temperature`), embudo, etapa
 * y búsqueda. Todo se resuelve en el servidor; aquí solo se arma la query en
 * el día de la organización (nunca `toISOString().split`). Sin React.
 */
import { addPlainDays, plainDateToInstant } from '@/lib/utils/dateDisplay';
import type { Temperatura } from '@/components/crm/kit/opportunityCardLogica';

export const PRESETS_CIERRE = ['mes', 'trimestre', 'vencido'] as const;
export type PresetCierre = (typeof PRESETS_CIERRE)[number] | '';
export const PRIORIDADES: readonly Temperatura[] = ['hot', 'warm', 'cold'];
export type OrdenOportunidades = 'creada' | 'cierre' | 'monto' | 'proximo' | 'nombre';

export interface FiltrosOportunidades {
  q: string;
  /** '' = todos · 'yo' · 'ninguno' · uuid del usuario. */
  responsable: string;
  cierre: PresetCierre;
  prioridades: Temperatura[];
  pipelineId: string;
  etapaId: string;
}

export function filtrosVacios(): FiltrosOportunidades {
  return { q: '', responsable: '', cierre: '', prioridades: [], pipelineId: '', etapaId: '' };
}

/** Cuenta para el botón «Filtros (3)»: sin la búsqueda ni el embudo del selector. */
export function contarFiltros(f: FiltrosOportunidades, incluirPipeline = false): number {
  return [f.responsable, f.cierre, f.prioridades.length ? 'x' : '', f.etapaId, incluirPipeline ? f.pipelineId : ''].filter(Boolean).length;
}

export function hayFiltros(f: FiltrosOportunidades, incluirPipeline = false): boolean {
  return contarFiltros(f, incluirPipeline) > 0 || f.q.trim() !== '';
}

const dos = (n: number) => String(n).padStart(2, '0');

export function primerDiaMes(hoy: string): string {
  return `${hoy.slice(0, 7)}-01`;
}

export function ultimoDiaMes(hoy: string): string {
  const [a, m] = hoy.split('-').map(Number);
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${dos(m + 1)}-01`;
  return addPlainDays(siguiente, -1);
}

export function rangoTrimestre(hoy: string): { desde: string; hasta: string } {
  const [a, m] = hoy.split('-').map(Number);
  const inicio = Math.floor((m - 1) / 3) * 3 + 1;
  return { desde: `${a}-${dos(inicio)}-01`, hasta: ultimoDiaMes(`${a}-${dos(inicio + 2)}-01`) };
}

/** Rango `date` del preset de cierre en el día de la organización. */
export function rangoCierre(preset: PresetCierre, hoy: string): { desde?: string; hasta?: string } {
  switch (preset) {
    case 'mes':
      return { desde: primerDiaMes(hoy), hasta: ultimoDiaMes(hoy) };
    case 'trimestre':
      return rangoTrimestre(hoy);
    case 'vencido':
      return { hasta: addPlainDays(hoy, -1) };
    default:
      return {};
  }
}

/** Query de `GET /api/crm/opportunities` (y de `…/resumen` y `…/board`, que ignoran lo que no usan). */
export function parametrosFiltros(f: FiltrosOportunidades, hoy: string, usuarioId: string | null): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim().slice(0, 100));
  if (f.responsable === 'yo' && usuarioId) p.set('salesperson_id', usuarioId);
  else if (f.responsable === 'ninguno') p.set('salesperson_id', 'none');
  else if (f.responsable && f.responsable !== 'yo') p.set('salesperson_id', f.responsable);
  const r = rangoCierre(f.cierre, hoy);
  if (r.desde) p.set('close_from', r.desde);
  if (r.hasta) p.set('close_to', r.hasta);
  if (f.prioridades.length) p.set('temperature', f.prioridades.join(','));
  if (f.pipelineId) p.set('pipeline_id', f.pipelineId);
  if (f.etapaId) p.set('stage_id', f.etapaId);
  return p;
}

/** Periodo de los KPI: el mes de la organización y los últimos 90 días (instante en su zona). */
export function parametrosPeriodo(hoy: string, zona: string): URLSearchParams {
  return new URLSearchParams({
    period_from: primerDiaMes(hoy),
    period_to: ultimoDiaMes(hoy),
    since: plainDateToInstant(addPlainDays(hoy, -90), zona),
    today: hoy,
  });
}

export function unirParametros(...partes: URLSearchParams[]): string {
  const p = new URLSearchParams();
  partes.forEach((x) => x.forEach((v, k) => p.set(k, v)));
  return p.toString();
}

export interface ChipFiltroClave {
  clave: 'responsable' | 'cierre' | 'prioridad' | 'pipeline' | 'etapa';
}

/** Quita un filtro por la clave del chip. */
export function quitarFiltro(f: FiltrosOportunidades, clave: ChipFiltroClave['clave']): FiltrosOportunidades {
  switch (clave) {
    case 'responsable':
      return { ...f, responsable: '' };
    case 'cierre':
      return { ...f, cierre: '' };
    case 'prioridad':
      return { ...f, prioridades: [] };
    case 'pipeline':
      return { ...f, pipelineId: '', etapaId: '' };
    case 'etapa':
      return { ...f, etapaId: '' };
  }
}

export function alternarPrioridad(f: FiltrosOportunidades, p: Temperatura): FiltrosOportunidades {
  const ya = f.prioridades.includes(p);
  return { ...f, prioridades: ya ? f.prioridades.filter((x) => x !== p) : PRIORIDADES.filter((x) => x === p || f.prioridades.includes(x)) };
}
