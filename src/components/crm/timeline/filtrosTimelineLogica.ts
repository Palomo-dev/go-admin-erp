/** Adaptación del kit al lector único; días calendario en la zona de la organización. */
import type { TimelineQuery, TimelineKind } from '@/lib/services/crm/timelineService';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateDisplay';
import { filtrosVacios, parametrosTimeline, type FiltrosTimeline, type TipoTimeline } from '../kit/timelineFiltersLogica';

const KINDS: Record<Exclude<TipoTimeline, 'todos'>, TimelineKind[]> = {
  call: ['call', 'call_live', 'sms'], email: ['email'], whatsapp: ['whatsapp'],
  meeting: ['meeting'], note: ['note'], task: ['task'], system: ['system', 'activity'], ai_call: ['ai_call'],
};
export function filtrosDesdeConsulta(q: TimelineQuery, zona: string): FiltrosTimeline {
  const tipo = (Object.keys(KINDS) as Array<Exclude<TipoTimeline, 'todos'>>).find(k =>
    q.kinds?.length === KINDS[k].length && KINDS[k].every(kind => q.kinds?.includes(kind))) ?? 'todos';
  return { ...filtrosVacios(), tipo, responsableId: q.userId ?? '', rango: q.from && q.to
    ? { desde: toPlainDate(new Date(q.from), zona), hasta: addPlainDays(toPlainDate(new Date(q.to), zona), q.toExclusive ? -1 : 0) } : null };
}
export function consultaDesdeFiltros(f: FiltrosTimeline, zona: string): TimelineQuery {
  const parametros = parametrosTimeline(f, zona);
  return { kinds: f.tipo === 'todos' ? undefined : KINDS[f.tipo], userId: parametros.user_id,
    from: parametros.from, to: parametros.to, toExclusive: parametros.to ? true : undefined };
}
