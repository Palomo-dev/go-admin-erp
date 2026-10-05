import { consultaDesdeFiltros, filtrosDesdeConsulta } from '../filtrosTimelineLogica';
import { filtrosVacios } from '../../kit/timelineFiltersLogica';

test('el rango del kit conserva el día en la organización y usa límite exclusivo', () => {
  const f = { ...filtrosVacios(), tipo: 'call' as const, responsableId: 'usuario', rango: { desde: '2026-10-01', hasta: '2026-10-01' } };
  const q = consultaDesdeFiltros(f, 'America/Bogota');
  expect(q).toEqual({ kinds: ['call', 'call_live', 'sms'], userId: 'usuario', from: '2026-10-01T00:00:00.000-05:00', to: '2026-10-02T00:00:00.000-05:00', toExclusive: true });
  expect(filtrosDesdeConsulta(q, 'America/Bogota')).toEqual(f);
});
test('día de 25 horas respeta cambio de horario de verano', () => {
  const q = consultaDesdeFiltros({ ...filtrosVacios(), rango: { desde: '2026-10-25', hasta: '2026-10-25' } }, 'Europe/Madrid');
  expect(Date.parse(q.to!) - Date.parse(q.from!)).toBe(25 * 60 * 60 * 1000);
});
