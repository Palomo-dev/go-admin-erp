/**
 * @jest-environment jsdom
 *
 * Venta por peso en un paso en la MESA («Agregar productos»,
 * PRODUCTOS-POR-PESO-BASCULA.md §11.7): la misma lógica del POS
 * (`usePesarConBascula`) con otro destino, las líneas de la mesa. Con la
 * báscula estable, tocar el producto agrega la línea de una con origen
 * «bascula» y «Deshacer»; inestable, «Pesar» espera y agrega al estabilizar;
 * con la regla `agregar_al_estabilizar` apagada, Enter.
 *
 * Datos inventados: organización 120.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { EstadoLector } from '@/lib/pos/bascula/lector';

const toastSonner = { success: jest.fn(), info: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({ toast: toastSonner }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}), rpc: jest.fn() } }));
jest.mock('@/lib/supabase/imageUtils', () => ({ getPublicUrl: (p: string) => `https://img/${p}` }));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/hooks/useOrgCurrency', () => {
  const { contextoMoneda, crearFormateadorMoneda } = jest.requireActual('@/lib/utils/moneda') as typeof import('@/lib/utils/moneda');
  const ctx = contextoMoneda('COP', { decimals: 0, locale: 'es-CO' });
  const valor = { ...ctx, resuelta: true, formatear: crearFormateadorMoneda(ctx), paraDocumento: () => ctx };
  return { useMonedaOrganizacion: () => valor };
});
let reglaEstabilizar = true;
jest.mock('@/lib/pos/peso/usePesajeContexto', () => ({
  usePesajeContexto: () => ({ manual: 'permiso', puedePesarAMano: true, pesoEnPantallaCliente: true, agregarAlEstabilizar: reglaEstabilizar, cargando: false }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: 7, branches: [{ id: 7, name: 'Centro' }], selectedBranchId: 7 }) }));
jest.mock('@/components/pos/configuracion/configuracionService', () => ({
  ConfiguracionService: { getCategoriesDisplayConfig: jest.fn(async () => ({ mode: 'chips', orderBy: 'rank' })) },
  defaultCategoriesDisplayConfig: { mode: 'chips', orderBy: 'rank' },
}));
jest.mock('@/components/pos/CategoryFilterBar', () => ({ CategoryFilterBar: () => null }));
jest.mock('@/components/shared/RichTextEditor', () => ({ RichTextEditor: () => null }));
jest.mock('@/lib/services/recipeService', () => ({ recipeService: { getRecipeById: jest.fn() } }));
jest.mock('@/components/pos/VariantSelectorDialog', () => ({ VariantSelectorDialog: () => null }));
jest.mock('@/lib/pos/useFormatoEtiquetaPeso', () => ({ useFormatoEtiquetaPeso: () => null }));

const QUESO = {
  id: 31,
  organization_id: 120,
  sku: 'QUE-1',
  name: 'Queso campesino',
  description: null,
  category_id: null,
  status: 'active',
  is_parent: false,
  variant_data: null,
  price: 18900,
  sale_mode: 'weight',
  qty_decimals: 3,
  unit_code: 'KG  ',
  track_stock: false,
};
jest.mock('@/lib/services/posService', () => ({
  POSService: {
    getProductsPaginated: jest.fn(async () => ({ data: [QUESO], total: 1, page: 1, limit: 200, totalPages: 1 })),
    getProductByBarcode: jest.fn(async () => null),
    getProductByScalePlu: jest.fn(async () => null),
    precioVigenteProducto: jest.fn(async () => 18900),
    getCategories: jest.fn(async () => []),
    toggleProductFavorite: jest.fn(),
  },
}));

const BASCULA = {
  id: '6b0e1c8e-8a52-4f4e-9a38-2f1a3c9d7e11',
  nombre: 'Mostrador',
  transporte: 'desktop_serial',
  protocolo: 'continuous_st_gs',
  dispositivo: 'COM3',
  baudios: 9600,
  bitsDatos: 8,
  paridad: 'none',
  bitsParada: 1,
  unidad: 'KG',
  decimales: 3,
  capacidad: 15,
  division: 0.005,
  estableMs: 500,
};
jest.mock('@/lib/pos/bascula/useBasculaDelEquipo', () => ({
  useBasculaDelEquipo: () => ({ config: BASCULA, cargando: false, recargar: jest.fn() }),
}));

function leyendo(peso: number, estable: boolean): EstadoLector {
  return {
    fase: 'leyendo',
    error: null,
    lectura: { neto: peso, bruto: peso, tara: null, unidad: 'KG', estable, estado: 'ok', netoDeBascula: false },
    peso,
    unidad: 'KG',
    estable,
    ultimaLecturaMs: 0,
    crudo: new Uint8Array(0),
    tramasReconocidas: 1,
    tramasNoReconocidas: 0,
    ceroEnPos: true,
  };
}

// Lector doble con estado de React: `mockPonerLectura` simula una trama nueva.
let lecturaInicial: EstadoLector | null = null;
const setters = new Set<(e: EstadoLector | null) => void>();
function mockPonerLectura(e: EstadoLector) {
  lecturaInicial = e;
  for (const s of setters) s(e);
}
jest.mock('@/lib/pos/bascula/useLectorBascula', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useLectorBascula: () => {
      const [estado, setEstado] = React.useState(lecturaInicial);
      React.useEffect(() => {
        setters.add(setEstado);
        return () => {
          setters.delete(setEstado);
        };
      }, []);
      return { estado, cero: () => undefined, reintentar: () => undefined, conectarWebSerial: async () => null, puedeElegirPuerto: false };
    },
  };
});

import { AddProductDialog } from '@/components/pos/mesas/id/AddProductDialog';

const txt = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ');
const lineasQueso = () => screen.queryAllByRole('button', { name: 'Cambiar el peso de Queso campesino' });

beforeEach(() => {
  jest.clearAllMocks();
  reglaEstabilizar = true;
  lecturaInicial = null;
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});

describe('mesa: venta por peso en un paso con báscula', () => {
  it('lectura estable: tocar el producto lo agrega de una con origen báscula y «Deshacer»', async () => {
    lecturaInicial = leyendo(0.735, true);
    const onAdd = jest.fn(async () => undefined);
    renderConIdioma(<AddProductDialog open onOpenChange={jest.fn()} onAddProducts={onAdd} />);
    fireEvent.click(await screen.findByText('Queso campesino'));
    await waitFor(() => expect(lineasQueso()).toHaveLength(1));
    expect(txt(lineasQueso()[0].textContent)).toContain('735 g');
    expect(screen.queryByRole('textbox', { name: /Peso en kg/i })).toBeNull();
    const [texto, opciones] = toastSonner.success.mock.calls[0];
    expect(txt(texto)).toBe('Agregado: 735 g · Queso campesino · $ 13.892');

    fireEvent.click(screen.getByRole('button', { name: /Agregar al Pedido/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const [lineas] = onAdd.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(lineas[0]).toMatchObject({
      product_id: 31,
      quantity: 0.735,
      unit_price: 18900,
      pesaje: { origen: 'bascula', neto: 0.735, estable: true, bascula_id: BASCULA.id },
    });

    act(() => opciones.action.onClick());
    await waitFor(() => expect(lineasQueso()).toHaveLength(0));
  });

  it('inestable: «Pesar» espera y agrega solo al estabilizarse', async () => {
    lecturaInicial = leyendo(0.74, false);
    renderConIdioma(<AddProductDialog open onOpenChange={jest.fn()} onAddProducts={jest.fn()} />);
    fireEvent.click(await screen.findByText('Queso campesino'));
    await screen.findByText('Esperando peso estable… se agrega solo · Esc cancela');
    expect(lineasQueso()).toHaveLength(0);
    act(() => mockPonerLectura(leyendo(0.74, true)));
    await waitFor(() => expect(lineasQueso()).toHaveLength(1));
    expect(txt(lineasQueso()[0].textContent)).toContain('740 g');
    expect(toastSonner.success).toHaveBeenCalledTimes(1);
  });

  it('con la regla apagada, la lectura estable espera Enter', async () => {
    reglaEstabilizar = false;
    lecturaInicial = leyendo(0.5, true);
    renderConIdioma(<AddProductDialog open onOpenChange={jest.fn()} onAddProducts={jest.fn()} />);
    fireEvent.click(await screen.findByText('Queso campesino'));
    const lectura = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-lectura-bascula]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(lineasQueso()).toHaveLength(0);
    lectura.focus();
    fireEvent.keyDown(lectura, { key: 'Enter' });
    await waitFor(() => expect(lineasQueso()).toHaveLength(1));
  });
});
