/**
 * @jest-environment jsdom
 *
 * Pantalla «Reglas contables — cuentas inválidas» (Figma 2333:132937) con sus
 * diálogos «Corregir cuenta» y «Bloqueo al guardar». Datos inventados. Corre el
 * servicio real: las escrituras salen por fetch a la ruta del servidor.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { ReglasContablesPage } from '../ReglasContablesPage';

const push = jest.fn();
const mockDatos: { REGLAS: unknown[]; PLAN: unknown[]; DIAGNOSTICO: unknown[] } = { REGLAS: [], PLAN: [], DIAGNOSTICO: [] };

const REGLAS = [
  { id: 'r1', organization_id: 10, name: 'Recepción de mercancía', description: null, source_type: 'purchase', event_type: 'created', debit_account_code: '14350101', credit_account_code: '22050501', tax_account_code: null, discount_account_code: null, use_tax_from_document: false, is_active: true, priority: 10, conditions: null },
  { id: 'r2', organization_id: 10, name: 'Folio servicios', description: null, source_type: 'folio_item', event_type: 'created', debit_account_code: '1305', credit_account_code: '4155', tax_account_code: null, discount_account_code: null, use_tax_from_document: false, is_active: true, priority: 12, conditions: null },
  { id: 'r3', organization_id: 10, name: 'Cobro', description: null, source_type: 'sale_payment', event_type: 'paid', debit_account_code: '11050501', credit_account_code: '1305', tax_account_code: null, discount_account_code: null, use_tax_from_document: false, is_active: true, priority: 20, conditions: null },
];
const PLAN = [
  { account_code: '11050501', organization_id: 10, name: 'Caja general', type: 'asset', parent_code: null, is_active: true, description: null, es_movimiento: true },
  { account_code: '1305', organization_id: 10, name: 'Clientes', type: 'asset', parent_code: null, is_active: true, description: null, es_movimiento: true },
  { account_code: '14350501', organization_id: 10, name: 'Mercancías bodega', type: 'asset', parent_code: null, is_active: true, description: null, es_movimiento: true },
  { account_code: '22050501', organization_id: 10, name: 'Proveedores', type: 'liability', parent_code: null, is_active: true, description: null, es_movimiento: true },
  { account_code: '4155', organization_id: 10, name: 'Servicios', type: 'income', parent_code: null, is_active: true, description: null, es_movimiento: false },
  { account_code: '41559501', organization_id: 10, name: 'Servicios del negocio', type: 'income', parent_code: '4155', is_active: true, description: null, es_movimiento: true },
];
const DIAGNOSTICO = [
  { regla_id: 'r1', lado: 'debito', cuenta: '14350101', estado: 'inexistente', propuesta: '14350501', propuesta_nombre: 'Mercancías bodega', evidencia: 'configuracion', usos_propuesta: 12 },
  { regla_id: 'r2', lado: 'credito', cuenta: '4155', estado: 'titulo', propuesta: null, propuesta_nombre: null, evidencia: 'conflicto', usos_propuesta: 0 },
];

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/app/finanzas/reglas-contables',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 10,
  obtenerOrganizacionActiva: () => ({ id: 10 }),
  useOrganization: () => ({ organization: { id: 10 } }),
}));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({ usePermisosFinanzas: () => ({ crear: true, cargando: false }) }));
jest.mock('@/components/shared/RichTextEditor', () => ({ RichTextEditor: () => null }));
jest.mock('@/components/finanzas/configuracion-contable/ConfiguracionContableService', () => ({
  ConfiguracionContableService: { listar: async () => [] },
}));
jest.mock('@/lib/supabase/config', () => {
  const tablas: Record<string, () => unknown[]> = {
    accounting_rules: () => mockDatos.REGLAS,
    chart_of_accounts: () => mockDatos.PLAN,
  };
  return {
    supabase: {
      from: (tabla: string) => {
        const cadena = {
          select: () => cadena,
          eq: () => cadena,
          order: () => cadena,
          then: (ok: (valor: { data: unknown[]; error: null }) => unknown) => ok({ data: tablas[tabla](), error: null }),
        };
        return cadena;
      },
      rpc: async () => ({ data: mockDatos.DIAGNOSTICO, error: null }),
    },
  };
});

function responder(status: number, cuerpo: unknown) {
  global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => cuerpo })) as unknown as typeof fetch;
}

async function abrirMenu(regla: string) {
  const fila = (await screen.findByText(regla)).closest('tr') as HTMLElement;
  fireEvent.click(within(fila).getAllByRole('button').at(-1) as HTMLElement);
}

async function abrirCorreccion(regla: string) {
  await abrirMenu(regla);
  fireEvent.click(await screen.findByText('Corregir cuenta'));
  return screen.findByRole('dialog', { name: 'Corregir cuenta de la regla' });
}

// El menú de fila de escritorio necesita PointerEvent, que jsdom no trae: en celular son las mismas acciones.
beforeEach(() => {
  simularAncho(375);
  mockDatos.REGLAS = REGLAS;
  mockDatos.PLAN = PLAN;
  mockDatos.DIAGNOSTICO = DIAGNOSTICO;
  push.mockClear();
  responder(200, { ...REGLAS[0] });
});

describe('Reglas contables con cuentas inválidas', () => {
  test('avisa cuántas reglas y muestra estado y propuesta', async () => {
    renderConIdioma(<ReglasContablesPage />);
    expect(await screen.findByText('2 reglas apuntan a cuentas que no existen o son de título')).toBeTruthy();
    expect(screen.getByText('14350101 · no existe')).toBeTruthy();
    expect(screen.getByText('4155 · de título')).toBeTruthy();
    expect(screen.getByText('14350501 · usada en 12 asientos')).toBeTruthy();
    expect(screen.getByText('Pendiente del Contador')).toBeTruthy();
  });

  test('«Ver solo estas» deja solo las inválidas', async () => {
    renderConIdioma(<ReglasContablesPage />);
    await screen.findByText('Cobro');
    fireEvent.click(screen.getByRole('button', { name: 'Ver solo estas' }));
    expect(screen.queryByText('Cobro')).toBeNull();
    expect(screen.getByText('Recepción de mercancía')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(screen.getByText('Cobro')).toBeTruthy();
  });

  test('sin reglas inválidas no hay aviso', async () => {
    mockDatos.DIAGNOSTICO = [];
    renderConIdioma(<ReglasContablesPage />);
    await screen.findByText('Cobro');
    expect(screen.queryByText(/apuntan a/)).toBeNull();
  });

  test('corregir precarga la propuesta y solo cambia esa columna', async () => {
    renderConIdioma(<ReglasContablesPage />);
    const dialogo = await abrirCorreccion('Recepción de mercancía');
    expect(within(dialogo).getByText('La cuenta 14350101 no existe en esta empresa')).toBeTruthy();
    expect(within(dialogo).getByText('Sugerida: es la cuenta configurada para este concepto.')).toBeTruthy();
    expect(within(dialogo).getByText(/14350501 · Mercancías bodega/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opciones] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/finanzas/reglas-contables/r1');
    expect(opciones.method).toBe('PATCH');
    expect(JSON.parse(String(opciones.body))).toEqual({ debit_account_code: '14350501' });
  });

  test('pendiente del Contador: sin propuesta, Guardar queda deshabilitado', async () => {
    renderConIdioma(<ReglasContablesPage />);
    const dialogo = await abrirCorreccion('Folio servicios');
    expect(within(dialogo).getByText('La cuenta 4155 es de título')).toBeTruthy();
    expect(within(dialogo).getByText('La configuración y el plan no coinciden. Lo decide el Contador.')).toBeTruthy();
    expect((within(dialogo).getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('el rechazo del servidor abre el bloqueo y lleva al plan de cuentas', async () => {
    responder(422, { codigo: 'cuenta_no_existe', lado: 'debito', cuenta: '14350501' });
    renderConIdioma(<ReglasContablesPage />);
    const dialogo = await abrirCorreccion('Recepción de mercancía');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('No se puede guardar')).toBeTruthy();
    expect(screen.getByText('La cuenta 14350501 no existe en tu plan')).toBeTruthy();
    expect(screen.getByText('Regla «Recepción de mercancía»')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir al plan de cuentas' }));
    expect(push).toHaveBeenCalledWith('/app/finanzas/contabilidad/plan-cuentas');
  });

  test('«Elegir otra cuenta» cierra el bloqueo y no navega', async () => {
    responder(422, { codigo: 'cuenta_de_titulo', lado: 'debito', cuenta: '4155' });
    renderConIdioma(<ReglasContablesPage />);
    const dialogo = await abrirCorreccion('Recepción de mercancía');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('La cuenta 4155 es de título');
    fireEvent.click(screen.getByRole('button', { name: 'Elegir otra cuenta' }));
    await waitFor(() => expect(screen.queryByText('No se puede guardar')).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  test.each(['en', 'fr', 'pt'] as const)('%s: la pantalla carga con sus textos', async (idioma) => {
    renderConIdioma(<ReglasContablesPage />, { idioma });
    await screen.findByText('Recepción de mercancía');
    expect(document.body.textContent).toContain('14350101');
  });
});
