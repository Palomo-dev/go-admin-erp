import { decodeMobileHistory, encodeMobileHistory, mobileHistoryKey, mobileHistoryRow, MOBILE_HISTORY_TTL } from '../mobile/mobileHistoryCache';
import type { CallListRow } from '@/lib/services/crm/callManagementService';
const now = Date.parse('2026-10-02T15:00:00Z');
const scope = { organizationId: 120, userId: 'user-a', branch: '1:1,2' };
const call = { id: '10000000-0000-4000-8000-000000000001', direction: 'outbound', mode: 'bridge', status: 'completed', started_at: '2026-10-02T14:00:00Z', created_at: '2026-10-02T14:00:00Z', from_number: '+573101234567', to_number: '+573001234567', customer: { id: '20000000-0000-4000-8000-000000000001', full_name: 'Contacto de prueba' }, duration_seconds: 252, disposition_outcome: 'answered', metadata: { live_note: 'Nota privada', token: 'token privado' }, recordings: [{ signed_url: 'https://private.example.test' }] } as unknown as CallListRow;
const row = mobileHistoryRow(call), raw = encodeMobileHistory(scope, [row], now);
it('persiste sólo la proyección visible y un máximo de veinte llamadas', () => {
  const encoded = encodeMobileHistory(scope, Array.from({ length: 30 }, () => row), now);
  expect(JSON.parse(encoded).rows).toHaveLength(20);
  for (const secret of ['Nota privada', 'token privado', 'signed_url', 'metadata', 'https://private']) expect(encoded).not.toContain(secret);
  expect(row.number).toBe(call.to_number);
  expect(mobileHistoryRow({ ...call, direction: 'inbound' }).number).toBe(call.from_number);
});
it.each([{ ...scope, organizationId: 121 }, { ...scope, userId: 'user-b' }, { ...scope, branch: '2:1,2' }, { ...scope, branch: '1:1' }])('rechaza caché de otra organización, persona o alcance de sucursal', different => {
  expect(mobileHistoryKey(different)).not.toBe(mobileHistoryKey(scope));
  expect(decodeMobileHistory(raw, different, now / 1000 + 3600, now)).toBeNull();
});
it('rechaza sesión vencida, fecha futura y caché de más de quince minutos', () => {
  expect(decodeMobileHistory(raw, scope, undefined, now)).toBeNull();
  expect(decodeMobileHistory(raw, scope, now / 1000, now)).toBeNull();
  expect(decodeMobileHistory(raw, scope, now / 1000 + 3600, now - 1)).toBeNull();
  expect(decodeMobileHistory(raw, scope, now / 1000 + 3600, now + MOBILE_HISTORY_TTL + 1)).toBeNull();
  expect(decodeMobileHistory(raw, scope, now / 1000 + 3600, now)).toEqual([row]);
});
it.each([{ ...row, id: 'invalid' }, { ...row, startedAt: 'invalid' }, { ...row, duration: -1 }, { ...row, direction: 'unknown' }, { ...row, mode: 'unknown' }, { ...row, name: 42 }])('no muestra filas corruptas de almacenamiento local', invalid => {
  const data = JSON.stringify({ scope, savedAt: now, rows: [invalid] });
  expect(decodeMobileHistory(data, scope, now / 1000 + 3600, now)).toBeNull();
});
