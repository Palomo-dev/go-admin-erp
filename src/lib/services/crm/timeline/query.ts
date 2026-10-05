/** Parámetros del historial: validar antes de construir filtros PostgREST. */
import { CrmHttpError, exigirUuid, UUID_RE } from '../crmErrors';
import { z } from 'zod';
import { decodeCursor, TIMELINE_KINDS, compareTs, type TimelineQuery, type TimelineKind } from './types';

const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i;
const fecha = z.string().datetime({ offset: true });
const instanteValido = (valor: string) => INSTANTE.test(valor) && fecha.safeParse(valor).success && Number.isFinite(Date.parse(valor));
const FINANCIAL_ID = /^(sale|reservation|web_order)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CANALES = new Set(['phone', 'call', 'voice_ai', 'ai_call', 'email', 'whatsapp', 'sms', 'meeting']);
const invalido = (campo: string): never => { throw new CrmHttpError(400, 'filtro_invalido', `${campo} inválido`); };
const csv = (valor: string | null) => valor ? valor.split(',').map(v => v.trim()).filter(Boolean) : [];

export function leerConsultaTimeline(params: URLSearchParams): TimelineQuery {
  const q: TimelineQuery = {};
  const kinds = [...csv(params.get('kinds')), ...csv(params.get('type'))];
  if (kinds.some(k => !(TIMELINE_KINDS as readonly string[]).includes(k))) invalido('kinds');
  if (kinds.length) q.kinds = [...new Set(kinds)] as TimelineKind[];
  const channels = [...csv(params.get('channels')), ...csv(params.get('channel'))];
  if (channels.some(c => !CANALES.has(c))) invalido('channels');
  if (channels.length) q.channels = [...new Set(channels)];
  const userId = params.get('user_id') ?? params.get('user');
  if (userId) q.userId = exigirUuid(userId, 'user_id');
  for (const [campo, alias] of [['from', 'date_from'], ['to', 'date_to']] as const) {
    const valor = params.get(campo) ?? params.get(alias);
    if (valor) {
      if (!instanteValido(valor)) invalido(campo);
      q[campo] = valor;
    }
  }
  if (q.from && q.to && compareTs(q.from, q.to) > 0) invalido('rango');
  const exclusive = params.get('to_exclusive');
  if (exclusive !== null) {
    if (!['true', 'false'].includes(exclusive) || !q.to) invalido('to_exclusive');
    q.toExclusive = exclusive === 'true';
  }
  const limit = params.get('limit');
  if (limit !== null) {
    if (!/^\d{1,3}$/.test(limit) || Number(limit) < 1) invalido('limit');
    q.limit = Math.min(Number(limit), 50);
  }
  const cursor = params.get('cursor');
  if (cursor !== null) {
    const decoded = cursor.length <= 256 ? decodeCursor(cursor) : null;
    if (!decoded || !instanteValido(decoded.at) || (!UUID_RE.test(decoded.id) && !FINANCIAL_ID.test(decoded.id))) invalido('cursor');
    q.cursor = cursor;
  }
  return q;
}
