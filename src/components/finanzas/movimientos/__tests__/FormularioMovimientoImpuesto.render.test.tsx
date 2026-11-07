/**
 * @jest-environment jsdom
 *
 * «Nuevo egreso — pago de impuesto» (Figma 2334:134963): el padre no se elige,
 * la subcategoría sugiere el pasivo, el selector de cuenta solo ofrece clase 2
 * y la vista previa debita el pasivo. Datos inventados.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { FormularioMovimientoTesoreria } from '../FormularioMovimientoTesoreria';

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 10,
  getCurrentUserId: async () => 'u1',
  obtenerOrganizacionActiva: () => ({ id: 10 }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ selectedBranchId: 1 }) }));
jest.mock('@/components/inventario/BranchSelectorField', () => ({ BranchSelectorField: () => null }));
// Ronda 3: el formulario se arma con el kit real; solo el selector de tercero se apaga.
jest.mock('@/components/kit', () => ({ ...jest.requireActual('@/components/kit'), ThirdPartyPicker: () => null, useAtajos: () => undefined }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }) }));
jest.mock('@/components/finanzas/tesoreria/compartido/useCajasDinero', () => ({
  useCajasDinero: () => ({ cajas: [], modo: 'branch', estado: 'listo', recargar: jest.fn() }),
}));
jest.mock('@/lib/services/movimientosService', () => ({
  movimientosService: { getBankAccounts: async () => [], getOpenSessionIdForBranch: async () => 7 },
}));
jest.mock('@/lib/supabase/config', () => {
  const categorias = [
    { id: 1, nombre: 'Impuestos', icono: 'landmark', cuenta_sugerida: null, clave: 'impuestos', padre_id: null },
    { id: 2, nombre: 'Pago de IVA', icono: 'landmark', cuenta_sugerida: '24080501', clave: 'imp_iva', padre_id: 1 },
    { id: 3, nombre: 'Pago de renta', icono: 'landmark', cuenta_sugerida: null, clave: 'imp_renta', padre_id: 1 },
    { id: 4, nombre: 'GMF 4x1000', icono: 'banknote', cuenta_sugerida: '511595', clave: 'gmf', padre_id: 1 },
    { id: 5, nombre: 'Arriendo', icono: 'home', cuenta_sugerida: '5120', clave: 'arriendo', padre_id: null },
  ];
  const plan = [
    { account_code: '24080501', name: 'IVA por pagar', es_movimiento: true, requiere_centro_costo: false, centro_costo_modo: 'no_aplica', requiere_tercero: false },
    { account_code: '11050501', name: 'Caja general', es_movimiento: true, requiere_centro_costo: false, centro_costo_modo: 'no_aplica', requiere_tercero: false },
    { account_code: '511595', name: 'Otros impuestos', es_movimiento: true, requiere_centro_costo: false, centro_costo_modo: 'no_aplica', requiere_tercero: false },
    { account_code: '5120', name: 'Arrendamientos', es_movimiento: true, requiere_centro_costo: false, centro_costo_modo: 'no_aplica', requiere_tercero: false },
  ];
  const tablas: Record<string, unknown[]> = {
    categorias_tesoreria: categorias,
    chart_of_accounts: plan,
    cost_centers: [],
    branches: [],
    cost_center_distributions: [],
  };
  return {
    supabase: {
      from: (tabla: string) => {
        const cadena = {
          select: () => cadena,
          eq: () => cadena,
          order: () => cadena,
          then: (ok: (valor: { data: unknown[]; error: null }) => unknown) => ok({ data: tablas[tabla] ?? [], error: null }),
        };
        return cadena;
      },
      rpc: jest.fn((_nombre: string, args: { p_cuenta: string }) => Promise.resolve({
        data: [{ debito: args.p_cuenta, credito: '11050501', fallo: null, cuenta_tesoreria: '11050501' }],
        error: null,
      })),
      storage: { from: () => ({ upload: jest.fn(), remove: jest.fn() }) },
    },
  };
});

async function abrirCategorias() {
  renderConIdioma(<FormularioMovimientoTesoreria tipo="egreso" open onOpenChange={() => undefined} onSuccess={() => undefined} />);
  const dialogo = await screen.findByRole('dialog');
  const boton = await waitFor(() => {
    const encontrado = within(dialogo).getAllByRole('button').find((el) => el.textContent?.includes('Categoría'));
    if (!encontrado) throw new Error('sin selector de categoría');
    return encontrado;
  });
  fireEvent.click(boton);
}

const elegir = async (etiqueta: string) => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(etiqueta) }));
};

describe('Nuevo egreso con categoría de impuestos', () => {
  test('el padre no aparece y las hijas llevan la ruta', async () => {
    await abrirCategorias();
    expect(await screen.findByText('Impuestos › Pago de IVA')).toBeTruthy();
    expect(screen.getByText('Impuestos › GMF 4x1000')).toBeTruthy();
    expect(screen.queryByText('Impuestos')).toBeNull();
  });

  test('pagar IVA sugiere el pasivo, avisa que no va a gasto y la vista previa lo debita', async () => {
    await abrirCategorias();
    await elegir('Impuestos › Pago de IVA');
    expect(await screen.findByText('Cancela el pasivo. No va a gasto.')).toBeTruthy();
    expect(await screen.findByText('24080501 · IVA por pagar', {}, { timeout: 3000 })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('24080501 · IVA por pagar').length).toBeGreaterThan(1), { timeout: 3000 });
    expect(screen.getByText('11050501 · Caja general')).toBeTruthy();
  });

  test('una subcategoría sin cuenta avisa y no hereda la anterior', async () => {
    await abrirCategorias();
    await elegir('Impuestos › Pago de renta');
    expect(await screen.findByText('Tu plan no tiene la cuenta sugerida. Elige una o créala en el plan de cuentas.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Registrar egreso' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('GMF sigue siendo gasto directo', async () => {
    await abrirCategorias();
    await elegir('Impuestos › GMF 4x1000');
    expect(await screen.findByText('Es gasto directo.')).toBeTruthy();
  });
});
