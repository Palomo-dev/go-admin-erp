import type { SupabaseClient } from '@supabase/supabase-js';
import { checkHumanCallCompliance } from '../humanCallCompliance';
import { canCallCustomer } from '../voiceAgent/canContact';
import { leerConteosSemana, numeroExcluido, zonaHorariaOrganizacion } from '../voiceAgent/cumplimiento';
import { esNumeroPrueba } from '../voiceAgent/numerosPrueba';
jest.mock('../voiceAgent/canContact', () => ({ canCallCustomer: jest.fn() }));
jest.mock('../voiceAgent/cumplimiento', () => ({ leerConteosSemana: jest.fn(), numeroExcluido: jest.fn(), zonaHorariaOrganizacion: jest.fn() }));
jest.mock('../voiceAgent/numerosPrueba', () => ({ esNumeroPrueba: jest.fn(), EXENCION_NUMERO_PRUEBA: 'numero_prueba' }));
const customers = jest.fn(); const calls = jest.fn();
let seen: Array<{ table: string; key: string; value: unknown }>;
const client = { from: (table: string) => {
  const builder = { select: () => builder, eq: (key: string, value: unknown) => { seen.push({ table, key, value }); return builder; },
    is: () => builder, gte: () => builder, lt: () => builder, filter: () => builder, limit: () => table === 'customers' ? customers() : calls() };
  return builder;
} } as unknown as SupabaseClient;
const now = new Date('2026-10-02T15:00:00Z');
beforeEach(() => { jest.clearAllMocks(); seen = []; jest.mocked(zonaHorariaOrganizacion).mockResolvedValue('America/Bogota');
  jest.mocked(numeroExcluido).mockResolvedValue(false); jest.mocked(canCallCustomer).mockResolvedValue(true);
  jest.mocked(esNumeroPrueba).mockResolvedValue(false); jest.mocked(leerConteosSemana).mockResolvedValue({});
  customers.mockResolvedValue({ data: [], error: null }); calls.mockResolvedValue({ data: [], error: null }); });
it('número excluido no consulta ni marca, incluso con identidad de usuario administrador', async () => {
  jest.mocked(numeroExcluido).mockResolvedValue(true);
  expect(await checkHumanCallCompliance(client, 7, '+573001234567', null, now)).toMatchObject({ allowed: false, code: 'numero_excluido' });
  expect(customers).not.toHaveBeenCalled();
});
it('un alias de ficha con baja bloquea el mismo número normalizado', async () => {
  customers.mockResolvedValue({ data: [{ id: 'a', phone: '+57 300 123 4567', timezone: 'America/Bogota' }, { id: 'b', phone: '+573001234567', timezone: 'America/Bogota' }], error: null });
  jest.mocked(canCallCustomer).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await checkHumanCallCompliance(client, 7, '+573001234567', 'a', now)).toMatchObject({ allowed: false, code: 'contacto_no_autorizado' });
  expect(canCallCustomer).toHaveBeenNthCalledWith(2, 7, 'b', client);
});
it('ficha de otro número no utiliza privilegios para contactar', async () => {
  await expect(checkHumanCallCompliance(client, 7, '+573001234567', 'otra', now)).rejects.toMatchObject({ code: 'cliente_telefono_distinto' });
});
it('respeta horario del destinatario bajo TZ del proceso y todas las lecturas se limitan a sesión org', async () => {
  const result = await checkHumanCallCompliance(client, 7, '+573001234567', null, now);
  expect(result.allowed).toBe(true); expect(result.timezone).toBe('America/Bogota');
  expect(seen.filter((row) => row.key === 'organization_id')).toEqual([{ table: 'customers', key: 'organization_id', value: 7 }, { table: 'calls', key: 'organization_id', value: 7 }]);
  const night = await checkHumanCallCompliance(client, 7, '+573001234567', null, new Date('2026-10-02T02:00:00Z'));
  expect(night.allowed).toBe(false); expect(night.nextAt).not.toBeNull();
});
it('historial sin ficha también aplica el tope legal del número', async () => {
  calls.mockResolvedValue({ data: [{ to_number: '+573001234567', duration_seconds: 10 }, { to_number: '+573001234567', duration_seconds: 15 }], error: null });
  const result = await checkHumanCallCompliance(client, 7, '+573001234567', null, now);
  expect(result.allowed).toBe(false);
});
it('lectura truncada falla cerrado y no interpreta incompleto como cero contactos', async () => {
  customers.mockResolvedValue({ data: Array.from({ length: 501 }, () => ({ id: 'a', phone: '+573001234567' })), error: null });
  await expect(checkHumanCallCompliance(client, 7, '+573001234567', null, now)).rejects.toMatchObject({ code: 'contactos_inciertos' });
});
