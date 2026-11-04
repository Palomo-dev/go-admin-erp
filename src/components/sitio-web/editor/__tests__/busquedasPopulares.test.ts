import { OPCIONES_SHELL, normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';
import { busquedasGuardadas, cambioAgregarBusqueda, cambioQuitarBusqueda, MAX_BUSQUEDAS } from '../inspector/busquedasPopularesLogica';

describe('search_popular (contrato)', () => {
  it('opción nueva del encabezado, sin valor por defecto (la tienda usa las categorías del menú)', () => {
    expect(OPCIONES_SHELL.search_popular).toMatchObject({ zona: 'header', porDefecto: null, nueva: true, regla: { tipo: 'listaTextos', max: 8, largo: 30 } });
  });
  it('valida: textos recortados, sin repetir, 1–8 de 1–30 caracteres; lo demás vale null', () => {
    expect(normalizarOpcionShell('search_popular', ['  Ofertas ', 'Sillas   ergonómicas'])).toEqual(['Ofertas', 'Sillas ergonómicas']);
    expect(normalizarOpcionShell('search_popular', [])).toBeNull();
    expect(normalizarOpcionShell('search_popular', ['Ofertas', 'ofertas'])).toBeNull();
    expect(normalizarOpcionShell('search_popular', ['x'.repeat(31)])).toBeNull();
    expect(normalizarOpcionShell('search_popular', Array.from({ length: 9 }, (_, i) => `b${i}`))).toBeNull();
    expect(normalizarOpcionShell('search_popular', ['Ofertas', 5])).toBeNull();
    expect(normalizarOpcionShell('search_popular', 'Ofertas')).toBeNull();
    expect(normalizarOpcionShell('search_popular', ['   '])).toBeNull();
  });
});

describe('«Búsquedas populares» en el panel', () => {
  it('agrega recortado y sin repetir; con 8 no agrega más', () => {
    expect(cambioAgregarBusqueda({}, '  Ofertas ')).toEqual({ search_popular: ['Ofertas'] });
    expect(cambioAgregarBusqueda({ search_popular: ['Ofertas'] }, 'OFERTAS')).toBeNull();
    expect(cambioAgregarBusqueda({}, '   ')).toBeNull();
    const llenas = { search_popular: Array.from({ length: MAX_BUSQUEDAS }, (_, i) => `b${i}`) };
    expect(cambioAgregarBusqueda(llenas, 'otra')).toBeNull();
  });
  it('quitar la última deja null: vuelven las categorías del menú', () => {
    expect(cambioQuitarBusqueda({ search_popular: ['Ofertas', 'Nuevo'] }, 'Ofertas')).toEqual({ search_popular: ['Nuevo'] });
    expect(cambioQuitarBusqueda({ search_popular: ['Ofertas'] }, 'Ofertas')).toEqual({ search_popular: null });
    expect(busquedasGuardadas({ search_popular: 'basura' })).toEqual([]);
  });
});
