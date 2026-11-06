/**
 * @jest-environment jsdom
 *
 * «Categorías de tesorería — impuestos con subcategorías» (Figma 2334:134283):
 * el padre agrupa y no pide cuenta, las hijas van debajo y dicen si cancelan
 * pasivo o son gasto. Datos inventados.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { CategoriasTesoreriaPage } from '../CategoriasTesoreriaPage';

const mockActualizar = jest.fn();

jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/categorias-tesoreria',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 10,
  obtenerOrganizacionActiva: () => ({ id: 10 }),
}));
jest.mock('@/lib/supabase/config', () => {
  const base = { tipo: 'egreso', icono: 'landmark', activa: true, es_predefinida: true };
  const tablas: Record<string, unknown[]> = {
    categorias_tesoreria: [
      { ...base, id: 1, nombre: 'Impuestos', cuenta_sugerida: null, padre_id: null, clave: 'impuestos', orden: 150 },
      { ...base, id: 2, nombre: 'Pago de IVA', cuenta_sugerida: '24080501', padre_id: 1, clave: 'imp_iva', orden: 10 },
      { ...base, id: 3, nombre: 'Pago de renta', cuenta_sugerida: null, padre_id: 1, clave: 'imp_renta', orden: 70 },
      { ...base, id: 4, nombre: 'GMF 4x1000', cuenta_sugerida: '511595', padre_id: 1, clave: 'gmf', orden: 170 },
      { ...base, id: 5, nombre: 'Arriendo', cuenta_sugerida: '5120', padre_id: null, clave: 'arriendo', orden: 40 },
    ],
    chart_of_accounts: [
      { account_code: '24080501', name: 'IVA por pagar', es_movimiento: true },
      { account_code: '511595', name: 'Otros impuestos', es_movimiento: true },
      { account_code: '5120', name: 'Arrendamientos', es_movimiento: true },
    ],
  };
  return {
    supabase: {
      from: (tabla: string) => {
        const cadena = {
          select: () => cadena,
          eq: () => cadena,
          order: () => cadena,
          update: (valores: unknown) => {
            mockActualizar(valores);
            return cadena;
          },
          then: (ok: (valor: { data: unknown[]; error: null }) => unknown) => ok({ data: tablas[tabla] ?? [], error: null }),
        };
        return cadena;
      },
      rpc: async () => ({ data: 0, error: null }),
    },
  };
});

beforeEach(() => {
  simularAncho(375);
  mockActualizar.mockClear();
});

const filaDe = async (nombre: string) => (await screen.findByText(nombre)).closest('tr') as HTMLElement;

async function editar(nombre: string) {
  const fila = await filaDe(nombre);
  fireEvent.click(within(fila).getAllByRole('button').at(-1) as HTMLElement);
  fireEvent.click(await screen.findByText('Editar'));
  return screen.findByRole('dialog', { name: 'Editar' });
}

describe('Categorías con impuestos', () => {
  test('el padre agrupa y las hijas muestran su tipo', async () => {
    renderConIdioma(<CategoriasTesoreriaPage />);
    const padre = await filaDe('Impuestos');
    expect(within(padre).getByText('Sin cuenta: organiza, no recibe movimientos')).toBeTruthy();
    expect(within(padre).getByText('Agrupa')).toBeTruthy();
    const iva = await filaDe('Pago de IVA');
    expect(within(iva).getByText('Cancela pasivo')).toBeTruthy();
    expect(within(iva).getByText(/24080501/)).toBeTruthy();
    const gmf = await filaDe('GMF 4x1000');
    expect(within(gmf).getByText('Gasto')).toBeTruthy();
  });

  test('la subcategoría sin cuenta dice que se exige al usarla', async () => {
    renderConIdioma(<CategoriasTesoreriaPage />);
    const renta = await filaDe('Pago de renta');
    expect(within(renta).getByText('Sin cuenta: se exige al usarla')).toBeTruthy();
  });

  test('las hijas van justo debajo del padre', async () => {
    renderConIdioma(<CategoriasTesoreriaPage />);
    await filaDe('Impuestos');
    const nombres = screen.getAllByRole('row').map((fila) => fila.textContent ?? '');
    const padre = nombres.findIndex((texto) => texto.startsWith('Impuestos'));
    expect(nombres[padre + 1]).toContain('Pago de IVA');
    expect(nombres[padre + 2]).toContain('Pago de renta');
    expect(nombres[padre + 3]).toContain('GMF 4x1000');
  });

  test('editar el padre no ofrece cuenta y guarda sin ella', async () => {
    renderConIdioma(<CategoriasTesoreriaPage />);
    const dialogo = await editar('Impuestos');
    expect(within(dialogo).queryByText('Cuenta sugerida')).toBeNull();
    expect(within(dialogo).getByText(/agrupa las subcategorías de impuestos/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(mockActualizar).toHaveBeenCalledWith(expect.objectContaining({ cuenta_sugerida: null }));
  });

  test('editar una subcategoría de pasivo explica que solo admite clase 2', async () => {
    renderConIdioma(<CategoriasTesoreriaPage />);
    const dialogo = await editar('Pago de IVA');
    expect(within(dialogo).getByText('Solo cuentas de la clase 2: el pago cancela el pasivo.')).toBeTruthy();
  });

  test('explica que pagar un impuesto no vuelve a causar el gasto', async () => {
    renderConIdioma(<CategoriasTesoreriaPage />);
    expect(await screen.findByText('Pagar un impuesto no vuelve a causar el gasto')).toBeTruthy();
  });
});
