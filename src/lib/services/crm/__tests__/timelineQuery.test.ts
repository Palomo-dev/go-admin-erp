import { leerConsultaTimeline } from '../timeline/query';
import { encodeCursor } from '../timeline/types';
const id = '11111111-1111-4111-8111-111111111111';
const at = '2026-10-01T10:00:00.123456Z';
test('preserva microsegundos, aliases válidos y limita página a 50', () => {
  expect(leerConsultaTimeline(new URLSearchParams({ type: 'call,call_live', channel: 'phone', user: id, from: at, limit: '100', cursor: encodeCursor(at, id) })))
    .toEqual({ kinds: ['call', 'call_live'], channels: ['phone'], userId: id, from: at, limit: 50, cursor: encodeCursor(at, id) });
});
const invalidos: Array<Record<string, string>> = [{ kinds: 'inventado' }, { channels: 'otro' }, { user_id: 'no-uuid' }, { from: 'ayer' }, { from: '2026-10-01T10:00:00' }, { limit: '3abc' }, { limit: '0' }, { limit: '1.5' }, { cursor: 'roto' }, { cursor: encodeCursor(at, 'invalid') }, { from: '2026-10-02T00:00:00Z', to: at }];
test.each(invalidos)('rechaza filtro inválido %j antes de PostgREST', params => {
  expect(() => leerConsultaTimeline(new URLSearchParams(params))).toThrow();
});
