// El centro de reportes solo necesita los códigos de los módulos activos.
// Antes los sacaba de `useActiveModules`, que además calculaba el estado del
// plan y el acceso por módulo (≈40 peticiones en 5 viajes en serie para una
// organización de 10 módulos) y el inicio esperaba todo eso para pedir los KPI.

const getActiveModules = jest.fn();
jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: { getActiveModules: (...a: unknown[]) => getActiveModules(...a) },
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { modulosActivosDe, olvidarModulosActivos } from '../useContextoReportes';

beforeEach(() => {
  getActiveModules.mockReset();
  olvidarModulosActivos();
});

describe('modulosActivosDe', () => {
  it('una sola lectura por organización, aunque la pidan varias pantallas', async () => {
    getActiveModules.mockResolvedValue([{ code: 'pos' }, { code: 'inventory' }]);
    const [a, b] = await Promise.all([modulosActivosDe(7), modulosActivosDe(7)]);
    expect(a).toEqual(['pos', 'inventory']);
    expect(b).toBe(a);
    await modulosActivosDe(7);
    expect(getActiveModules).toHaveBeenCalledTimes(1);
    expect(getActiveModules).toHaveBeenCalledWith(7);
  });

  it('al olvidar (módulos actualizados) vuelve a leer', async () => {
    getActiveModules.mockResolvedValue([{ code: 'pos' }]);
    await modulosActivosDe(7);
    olvidarModulosActivos();
    await modulosActivosDe(7);
    expect(getActiveModules).toHaveBeenCalledTimes(2);
  });

  it('un fallo devuelve lista vacía y no queda en caché', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    getActiveModules.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce([{ code: 'crm' }]);
    expect(await modulosActivosDe(9)).toEqual([]);
    expect(await modulosActivosDe(9)).toEqual(['crm']);
    aviso.mockRestore();
  });
});
