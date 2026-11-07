/**
 * Funciones aplicadas el 2026-11-08 (Finanzas ronda 3, frente C):
 * - `listarLibroDiario` llama a `fn_libro_diario_trabajo` y conserva su
 *   contrato; «Ocultar pares revertidos» es exacto (sin `paresOcultos`).
 * - Salud contable lee `fn_salud_contable`; «pendiente de activar» (`null`)
 *   solo si la función no existe, nunca ante otro error.
 * Cliente de Supabase simulado: nada toca la base. Datos inventados.
 */
const mockRpc = jest.fn();

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: jest.fn(async () => 'America/Bogota') }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  obtenerOrganizacionActiva: () => ({ id: 333 }),
  getCurrentBranchId: () => 3,
  getOrganizationId: () => 333,
}));

import { ContabilidadService, paginaLibroDiarioDeRpc } from '../ContabilidadService';
import { SaludContableService } from '../salud/SaludContableService';

beforeEach(() => mockRpc.mockReset());

describe('listarLibroDiario → fn_libro_diario_trabajo', () => {
  it('manda los filtros a la función con el rango en la zona de la organización', async () => {
    mockRpc.mockResolvedValue({ data: { total: 715, filas: [] }, error: null });
    const r = await ContabilidadService.listarLibroDiario({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      estado: 'publicados',
      fuentes: ['sales', 'sale'],
      cuenta: '130505',
      branchId: 3,
      texto: 'venta',
      numero: null,
      ocultarPares: true,
      limite: 25,
      desplazamiento: 50,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [nombre, args] = mockRpc.mock.calls[0];
    expect(nombre).toBe('fn_libro_diario_trabajo');
    expect(args).toMatchObject({
      p_organization_id: 333,
      p_estado: 'publicados',
      p_fuentes: ['sales', 'sale'],
      p_cuenta: '130505',
      p_branch_id: 3,
      p_texto: 'venta',
      p_numero: null,
      p_ocultar_pares: true,
      p_limite: 25,
      p_desplazamiento: 50,
    });
    // Día 1 de septiembre en Bogotá = 05:00 UTC.
    expect(new Date(args.p_desde).toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(new Date(args.p_hasta).getTime()).toBeGreaterThan(new Date('2026-10-01T04:59:00Z').getTime());
    expect(r).toEqual({ filas: [], total: 715, paresOcultos: 0 });
  });

  it('sin rango ni filtros manda nulos (todo el libro)', async () => {
    mockRpc.mockResolvedValue({ data: { total: 0, filas: [] }, error: null });
    await ContabilidadService.listarLibroDiario({ limite: 25, desplazamiento: 0 });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_desde: null, p_hasta: null, p_estado: 'todos', p_fuentes: null, p_cuenta: null, p_branch_id: null, p_texto: null, p_ocultar_pares: false });
  });

  it('un error de la base se propaga (la pantalla muestra el error, no un libro vacío)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permiso' } });
    await expect(ContabilidadService.listarLibroDiario({ limite: 25, desplazamiento: 0 })).rejects.toMatchObject({ code: '42501' });
  });

  it('convierte las filas conservando el contrato (importe y revertidoPor)', () => {
    const p = paginaLibroDiarioDeRpc({
      total: '2',
      filas: [
        { id: 9560, memo: 'Gastos bancarios', source: 'manual', posted: true, importe: '250000.004', revertido_por: 9577 },
        { id: 9580, memo: 'Venta', source: 'invoice_sales', posted: true, importe: 119000, revertido_por: null },
      ],
    });
    expect(p.total).toBe(2);
    expect(p.paresOcultos).toBe(0);
    expect(p.filas[0]).toMatchObject({ id: 9560, importe: 250000, revertidoPor: 9577 });
    expect(p.filas[0]).not.toHaveProperty('revertido_por');
    expect(p.filas[1].revertidoPor).toBeNull();
    expect(paginaLibroDiarioDeRpc(null)).toEqual({ filas: [], total: 0, paresOcultos: 0 });
  });
});

describe('Salud contable → fn_salud_contable', () => {
  it('con la función aplicada devuelve los datos reales', async () => {
    mockRpc.mockResolvedValue({
      data: { descuadres: [], total_descuadres: 0, huerfanos: [{ asiento_id: 7, motivo: 'sin_lineas', importe: 0 }], total_huerfanos: 1 },
      error: null,
    });
    const r = await SaludContableService.cruce();
    expect(mockRpc).toHaveBeenCalledWith('fn_salud_contable', { p_organization_id: 333 });
    expect(r).toMatchObject({ totalDescuadres: 0, totalHuerfanos: 1 });
  });

  it('solo si la función no existe devuelve null («pendiente de activar»)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_salud_contable(p_organization_id) in the schema cache' } });
    await expect(SaludContableService.cruce()).resolves.toBeNull();
  });

  it('cualquier otro error se lanza: sin permiso o una tabla ausente no se disfrazan de «sin activar»', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } });
    await expect(SaludContableService.cruce()).rejects.toMatchObject({ code: '42501' });
    mockRpc.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "public.tips" does not exist' } });
    await expect(SaludContableService.cruce()).rejects.toMatchObject({ code: '42P01' });
  });
});
