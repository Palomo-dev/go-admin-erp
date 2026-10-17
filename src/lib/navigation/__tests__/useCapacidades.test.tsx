/**
 * @jest-environment jsdom
 *
 * Activar un módulo avisa con `modules-updated`. Eso no puede volver a poner
 * las capacidades en carga: la pantalla de módulos desmontaba la lista y
 * parecía que toda la página se recargaba. Cambiar de organización sí invalida.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { olvidarCapacidades, useCapacidades, type Capacidades } from '../useCapacidades';

const RESPUESTA: Capacidades = {
  organizationId: 7,
  esAdmin: true,
  capacidades: {
    gestionarNotificaciones: false,
    verAnaliticaWeb: false,
    variasSedes: false,
    crearSucursal: false,
    gestionarOrganizacion: true,
    gestionarMiembros: true,
    gestionarFacturacion: false,
  },
  sucursales: { permitidas: [1], verTodas: false, accesoTotal: false },
};

function jsonOk(): Response {
  return { ok: true, json: async () => RESPUESTA } as unknown as Response;
}

beforeEach(() => {
  olvidarCapacidades();
});

afterEach(() => {
  olvidarCapacidades();
});

describe('useCapacidades', () => {
  test('modules-updated no recarga ni vacía la organización', async () => {
    global.fetch = jest.fn(async () => jsonOk()) as unknown as typeof fetch;
    const { result } = renderHook(() => useCapacidades());
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.datos.organizationId).toBe(7);
    const llamadas = (global.fetch as jest.Mock).mock.calls.length;

    act(() => {
      window.dispatchEvent(new CustomEvent('modules-updated', { detail: { activeModuleCodes: ['pos'] } }));
      window.dispatchEvent(new Event('modules-updated'));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(llamadas);
    expect(result.current.cargando).toBe(false);
    expect(result.current.datos.organizationId).toBe(7);
    expect(result.current.error).toBe(false);
  });

  test('cambiar de organización sí vuelve a pedir las capacidades', async () => {
    let soltar: () => void = () => undefined;
    let retener = false;
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          if (!retener) {
            resolve(jsonOk());
            return;
          }
          soltar = () => resolve(jsonOk());
        }),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useCapacidades());
    await waitFor(() => expect(result.current.datos.organizationId).toBe(7));
    retener = true;

    act(() => {
      window.dispatchEvent(new Event('organization-changed'));
    });
    expect(result.current.cargando).toBe(true);
    expect(result.current.datos.organizationId).toBeNull();

    await act(async () => {
      soltar();
    });
    await waitFor(() => expect(result.current.datos.organizationId).toBe(7));
    expect(result.current.cargando).toBe(false);
  });
});
