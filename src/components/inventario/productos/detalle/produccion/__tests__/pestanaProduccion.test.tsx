/**
 * @jest-environment jsdom
 *
 * Pestaña «Producción» del detalle de producto y el diálogo «Completar orden»
 * con el proveedor real de next-intl en los 4 idiomas (una clave que falte
 * rompe la prueba). Las RPC son dobles.
 */
const resumen = jest.fn();
const distribucion = jest.fn();
const listar = jest.fn();
const necesidades = jest.fn();
const completar = jest.fn();
let psub = 'unidades';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/inventario/productos/7',
  useSearchParams: () => new URLSearchParams(`tab=produccion&psub=${psub}`),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: 2, branches: [{ id: 2, name: 'Sede' }], isLoading: false }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: () => '29 sep 2026', formatDateTime: () => '29 sep 2026, 9:40', getToday: () => '2026-09-29' }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (n: number) => `$ ${Math.round(Number(n))}` }) }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 2, getOrganizationName: () => 'Org' }));
jest.mock('@/lib/services/productionOrderService', () => {
  const real = jest.requireActual('@/lib/services/productionOrderService');
  return {
    ...real,
    resumenProduccionProducto: (...a: unknown[]) => resumen(...a),
    distribucionProducto: (...a: unknown[]) => distribucion(...a),
    productionOrderService: {
      listar: (...a: unknown[]) => listar(...a),
      necesidades: (...a: unknown[]) => necesidades(...a),
      completar: (...a: unknown[]) => completar(...a),
      detalle: jest.fn(async () => { throw new Error('x'); }),
    },
  };
});

import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { aNecesidades, aOrdenFila, aResumenProduccion, ErrorProduccion } from '@/lib/services/productionOrderService';
import { PestanaProduccion } from '../PestanaProduccion';
import { debeMostrarPestanaProduccion } from '../mostrar';
import { DialogoCompletarOrden } from '@/components/inventario/produccion/DialogoCompletarOrden';

const RESUMEN = aResumenProduccion({
  producto: { id: 7, nombre: 'Pan', unidad: 'UN', track_stock: true, es_padre: false, modo: 'al_producir', decimales: 0 },
  receta_efectiva: { recipe_id: 88, product_id: 7, heredada: false, al_producir: true, version: 1 },
  receta_propia: { recipe_id: 88, version: 1, nombre: 'Pan', creada_en: '2026-09-29T10:00:00Z' },
  versiones: 1,
  ordenes: 1,
  ordenes_abiertas: 1,
  traslados: 1,
  conversiones: [{ id: 1, de: 'KG', a: 'GR', factor: 1000, alcance: 'global' }],
  permisos: { ver: true, producir: true, trasladar: true, costos: true },
  mostrar: true,
});
const ORDEN = aOrdenFila({
  id: 2, numero: 'OP-2', estado: 'in_progress',
  producto: { id: 7, nombre: 'Pan', unidad: 'UN', decimales: 0 },
  receta: { id: 88, version: 1, rinde: 12 }, sucursal: { id: 2, nombre: 'Sede' }, a_producir: 24,
});

beforeEach(() => {
  resumen.mockResolvedValue(RESUMEN);
  distribucion.mockResolvedValue([
    { id: 5, codigo: 'TR-0005', estado: 'in_transit', origen: { id: 2, nombre: 'Sede' }, destino: { id: 3, nombre: 'Norte' }, enviado: 10, recibido: 0, orden_produccion: { id: 2, numero: 'OP-2' }, creado_en: null },
  ]);
  listar.mockResolvedValue({ filas: [ORDEN], total: 1, kpis: {}, permisos: RESUMEN.permisos });
  necesidades.mockResolvedValue(
    aNecesidades({ rinde: 12, cantidad: 24, costo_unidad: 527.75, costo_total: 12666, completo: true, lineas: [
      { orden: 1, ingredient_product_id: 10, nombre: 'Harina', unidad: 'KG', track_stock: true, necesario: 3.333, disponible: 1, faltante: 2.333 },
    ] }),
  );
});

describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('Producción del producto (%s)', (idioma) => {
  it('Unidades y Distribución cargan sin claves faltantes', async () => {
    psub = 'unidades';
    const { unmount } = renderConIdioma(<PestanaProduccion producto={{ id: 7, name: 'Pan', sku: 'PAN' }} />, { idioma });
    await waitFor(() => expect(screen.getAllByText(/KG/).length).toBeGreaterThan(0));
    unmount();
    psub = 'distribucion';
    renderConIdioma(<PestanaProduccion producto={{ id: 7, name: 'Pan', sku: 'PAN' }} />, { idioma });
    await waitFor(() => expect(screen.getByText('TR-0005')).toBeTruthy());
  });
  it('Órdenes lista la orden del producto', async () => {
    psub = 'ordenes';
    renderConIdioma(<PestanaProduccion producto={{ id: 7, name: 'Pan', sku: 'PAN' }} />, { idioma });
    await waitFor(() => expect(screen.getByText('OP-2')).toBeTruthy());
    expect(listar).toHaveBeenCalledWith(2, expect.objectContaining({ producto: 7 }), expect.anything());
  });
  it('Completar: con faltante exige confirmar y manda la confirmación', async () => {
    completar.mockResolvedValue({ success: true, order_id: 2, produced_qty: 24, ya_completada: false, total_cost: 12666, unit_cost: 527.75 });
    const onCompletada = jest.fn();
    renderConIdioma(<DialogoCompletarOrden orden={ORDEN} onAbiertoChange={() => undefined} onCompletada={onCompletada} />, { idioma });
    const casilla = await screen.findByRole('checkbox');
    fireEvent.click(casilla);
    const boton = screen.getAllByRole('button').find((b) => !b.hasAttribute('disabled') && b.getAttribute('data-primario') !== null) ?? screen.getAllByRole('button').at(-1)!;
    fireEvent.click(boton);
    await waitFor(() => expect(completar).toHaveBeenCalled());
    expect(completar.mock.calls[0][0]).toBe(2);
    expect(completar.mock.calls[0][1]).toBe(24);
    expect(completar.mock.calls[0][2]).toMatchObject({ confirmarFaltante: true });
  });
});

describe('utilidades de la pestaña', () => {
  it('se muestra para compuestos y preparaciones, no para servicios', () => {
    expect(debeMostrarPestanaProduccion({ is_composite: true })).toBe(true);
    expect(debeMostrarPestanaProduccion({ production_type: 'preparation' })).toBe(true);
    expect(debeMostrarPestanaProduccion({ is_composite: false })).toBe(false);
    expect(debeMostrarPestanaProduccion({ is_composite: true, product_type: 'service' })).toBe(false);
  });
  it('error faltante_sin_confirmar trae la lista', () => {
    const e = new ErrorProduccion({ message: 'faltante_sin_confirmar', code: '23514', details: '[{"product_id":1,"nombre":"A","unidad":"KG","necesario":2,"disponible":1,"faltante":1}]' });
    expect(e.faltantes).toHaveLength(1);
    expect(new ErrorProduccion({ message: 'x', code: '42501' }).sinPermiso).toBe(true);
    expect(new ErrorProduccion({ message: 'SUCURSAL_NO_ES_DE_LA_ORG', code: '42501' }).sinPermiso).toBe(false);
  });
});
