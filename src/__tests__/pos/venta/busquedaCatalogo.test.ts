/**
 * L14 (docs/implementacion/POS-PLAN.md §2.2): al cambiar la búsqueda, la
 * categoría o la sucursal, el catálogo vuelve a la página 1 y consulta a los
 * 300 ms; un cambio antes de ese tiempo cancela la consulta pendiente.
 * `programarBusqueda` es la extracción literal del efecto de
 * `src/components/pos/ProductSearch.tsx` (que la llama con
 * `[searchTerm, selectedCategory, branchFilter]` como dependencias).
 */
import { ESPERA_BUSQUEDA_MS, programarBusqueda } from '@/lib/pos/venta/catalogo';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('búsqueda del catálogo (L14)', () => {
  it('espera 300 ms antes de consultar la página 1', () => {
    const cargar = jest.fn();
    programarBusqueda({ paginaActual: 1, volverAPaginaUno: jest.fn(), cargarPaginaUno: cargar });
    expect(ESPERA_BUSQUEDA_MS).toBe(300);
    jest.advanceTimersByTime(299);
    expect(cargar).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('teclear rápido: cada cambio limpia el anterior y solo sale la última consulta', () => {
    const cargar = jest.fn();
    let limpiar = programarBusqueda({ paginaActual: 1, volverAPaginaUno: jest.fn(), cargarPaginaUno: () => cargar('p') });
    jest.advanceTimersByTime(200);
    limpiar();
    limpiar = programarBusqueda({ paginaActual: 1, volverAPaginaUno: jest.fn(), cargarPaginaUno: () => cargar('pa') });
    jest.advanceTimersByTime(200);
    limpiar();
    programarBusqueda({ paginaActual: 1, volverAPaginaUno: jest.fn(), cargarPaginaUno: () => cargar('pan') });
    jest.advanceTimersByTime(300);
    expect(cargar.mock.calls).toEqual([['pan']]);
  });

  it('vuelve a la página 1 al instante solo si no estaba en ella', () => {
    const volver = jest.fn();
    programarBusqueda({ paginaActual: 3, volverAPaginaUno: volver, cargarPaginaUno: jest.fn() });
    expect(volver).toHaveBeenCalledTimes(1);
    const quieto = jest.fn();
    programarBusqueda({ paginaActual: 1, volverAPaginaUno: quieto, cargarPaginaUno: jest.fn() });
    expect(quieto).not.toHaveBeenCalled();
  });
});
