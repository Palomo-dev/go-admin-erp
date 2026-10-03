import { readRulesWithErrors } from '../useRulesWithErrors';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
jest.mock('@/components/crm/acciones/apiCrm', () => ({ pedirCrm: jest.fn() }));
it('pagina los fallos reales y para al salir del periodo, sin contar ejecuciones ni pruebas en seco', async () => {
  const read = pedirCrm as jest.Mock;
  read.mockResolvedValueOnce({ data: Array.from({ length: 200 }, () => ({ automation_rule_id: 'a', status: 'failed', created_at: '2026-10-02T12:00:00Z' })), extra: { count: 201 } }).mockResolvedValueOnce({ data: [{ automation_rule_id: 'old', status: 'failed', created_at: '2026-09-01T12:00:00Z' }], extra: { count: 201 } });
  expect([...await readRulesWithErrors('2026-09-25T00:00:00Z', '2026-10-03T00:00:00Z')]).toEqual(['a']);
  expect(read.mock.calls.map(call => call[0])).toEqual(['/api/crm/automation-runs?status=failed&limit=200&offset=0', '/api/crm/automation-runs?status=failed&limit=200&offset=200']);
});
it('una respuesta inválida o rechazada no se transforma en lista sin errores', async () => {
  (pedirCrm as jest.Mock).mockResolvedValueOnce({ data: null, extra: {} });
  await expect(readRulesWithErrors('2026-09-25T00:00:00Z', '2026-10-03T00:00:00Z')).rejects.toThrow('Historial no disponible');
});
