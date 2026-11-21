/**
 * @jest-environment jsdom
 *
 * Finanzas › Impuestos con el kit (Figma 1012:86383 listo, 830:529055 sin
 * permiso, 830:529376 menú de fila). Datos inventados.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import TaxesIndexPage from '../TaxesIndexPage';

const mockRpc = jest.fn();
let mockListaError: { code: string; message: string } | null = null;

jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/impuestos',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 10 }));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => ({ ver: true, crear: true, anular: true, aprobar: false, posVer: true, posCrear: true, posAnular: true, cargando: false }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', formatear: (n: number) => `$ ${n}`, paraDocumento: () => 'COP' }),
}));

const IMPUESTOS = [
  { id: 'iva19', organization_id: 10, template_id: 1, name: 'IVA 19 %', rate: 19, description: 'IVA general', is_default: false, is_active: true, kind: 'tax' },
  { id: 'iva0', organization_id: 10, template_id: 2, name: 'IVA 0 %', rate: 0, description: 'Exentos y excluidos', is_default: false, is_active: true, kind: 'tax' },
  { id: 'inc8', organization_id: 10, template_id: 3, name: 'Impoconsumo 8 %', rate: 8, description: null, is_default: false, is_active: false, kind: 'tax' },
  { id: 'rete4', organization_id: 10, template_id: null, name: 'Retención en la fuente 4 %', rate: 4, description: null, is_default: false, is_active: true, kind: 'withholding' },
];

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (nombre: string, args: unknown) => {
      mockRpc(nombre, args);
      if (nombre === 'list_organization_taxes') return Promise.resolve(mockListaError ? { data: null, error: mockListaError } : { data: IMPUESTOS, error: null });
      if (nombre === 'fn_impuestos_uso_productos')
        return Promise.resolve({ data: { total: 100, con_impuesto: 6, exentos: 1, por_impuesto: { iva19: 5, iva0: 1 } }, error: null });
      if (nombre === 'get_tax_templates_by_organization_country')
        return Promise.resolve({
          data: [
            { id: 1, country: 'COL', code: 'IVA_19', name: 'IVA 19 %', rate: 19, description: null, kind: 'tax' },
            { id: 2, country: 'COL', code: 'IVA_0', name: 'IVA 0 %', rate: 0, description: null, kind: 'tax' },
            { id: 3, country: 'COL', code: 'INC_8', name: 'INC 8 %', rate: 8, description: null, kind: 'tax' },
            { id: 4, country: 'COL', code: 'IVA_5', name: 'IVA 5 %', rate: 5, description: null, kind: 'tax' },
          ],
          error: null,
        });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => {
      const cadena = { select: () => cadena, eq: () => cadena, order: () => cadena, or: () => cadena, then: (ok: (v: unknown) => unknown) => ok({ data: [], error: null }) };
      return cadena;
    },
  },
}));

beforeEach(() => {
  simularAncho(1440);
  mockRpc.mockClear();
  mockListaError = null;
});

// La tabla y las tarjetas móviles conviven en el DOM (las oculta el CSS): se toma la fila.
const filaDe = async (texto: string) => (await screen.findAllByText(texto)).map((e) => e.closest('tr')).find(Boolean) as HTMLElement;

describe('Finanzas › Impuestos', () => {
  test('listo: tipo, código DIAN, productos, insignias y tarjeta de tarifa', async () => {
    renderConIdioma(<TaxesIndexPage />);
    const iva = await filaDe('IVA 19 %');
    expect(within(iva).getByText('IVA')).toBeTruthy();
    expect(within(iva).getByText('01 · IVA')).toBeTruthy();
    expect(within(iva).getByText('5')).toBeTruthy();
    expect(within(await filaDe('IVA 0 %')).getByText('Exento')).toBeTruthy();
    expect(within(await filaDe('Impoconsumo 8 %')).getByText('04 · INC')).toBeTruthy();
    // La retención no se mezcla con los impuestos.
    expect(screen.queryByText('Retención en la fuente 4 %')?.closest('[role="tabpanel"]')?.hasAttribute('hidden') ?? true).toBe(true);
    expect(await screen.findByText(/Tarifa para productos sin impuesto: Ninguna/)).toBeTruthy();
    expect(screen.getByText(/7 de 100 productos tienen impuesto asignado/)).toBeTruthy();
    // Falta la plantilla IVA 5 % del país: se ofrece cargarla.
    expect(screen.getByText('Cargar plantilla de COL')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nuevo impuesto' })).toBeTruthy();
  });

  test('menú ⋯: no deja eliminar un impuesto que usan productos', async () => {
    // En móvil el menú es la hoja de acciones (830:535609) y abre con un clic.
    simularAncho(375);
    renderConIdioma(<TaxesIndexPage />);
    const iva = await filaDe('IVA 19 %');
    fireEvent.click(within(iva).getAllByRole('button').at(-1) as HTMLElement);
    const eliminar = (await screen.findByText('Eliminar impuesto')).closest('button,[role="menuitem"]') as HTMLElement;
    expect(eliminar.hasAttribute('disabled') || eliminar.getAttribute('aria-disabled') === 'true' || eliminar.hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByText('Duplicar')).toBeTruthy();
    expect(screen.getByText('Hacer predeterminado')).toBeTruthy();
  });

  test('sin permiso: el estado del kit y sin acciones de gestión en la tabla', async () => {
    mockListaError = { code: '42501', message: 'Acceso denegado a la organización' };
    renderConIdioma(<TaxesIndexPage />);
    expect((await screen.findAllByText('No tienes acceso a los impuestos')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Tarifa para productos sin impuesto/)).toBeNull();
  });

  test('activar/desactivar va por la RPC con permiso', async () => {
    renderConIdioma(<TaxesIndexPage />);
    const inc = await filaDe('Impoconsumo 8 %');
    fireEvent.click(within(inc).getByRole('switch', { name: 'Activar Impoconsumo 8 %' }));
    await screen.findAllByText('Impoconsumo 8 %');
    expect(mockRpc).toHaveBeenCalledWith('fn_impuesto_cambiar_activo', { p_organization_id: 10, p_id: 'inc8', p_activo: true });
  });
});
