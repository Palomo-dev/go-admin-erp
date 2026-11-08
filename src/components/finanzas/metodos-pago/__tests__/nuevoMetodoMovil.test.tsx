/**
 * @jest-environment jsdom
 *
 * Métodos de pago en móvil (Figma 1010:86844, captura
 * `docs/design/figma/86-arreglos-metodos-pago-movil.png`): «+» en el
 * MobileHeader abre el diálogo de nuevo método. Fallo del dueño (2026-11-07):
 * el único botón «Nuevo método» iba en `acciones` del PageHeader, que por
 * debajo de `lg` no se dibuja; la página no publicaba acción móvil.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { CabeceraMovilProvider, useCabeceraMovilActual } from '@/components/shell/header/cabeceraMovil';

const vacio = { data: [], error: null };
const consulta: Record<string, unknown> = {};
for (const m of ['select', 'eq', 'order', 'single']) consulta[m] = () => consulta;
consulta.then = (ok: (v: unknown) => unknown) => Promise.resolve(vacio).then(ok);
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: () => consulta, rpc: () => Promise.resolve(vacio) },
}));
jest.mock('@/lib/finanzas/metodosPagoAlcance', () => ({
  seleccionarConColumnaOpcional: () => Promise.resolve({ data: [], error: null }),
  metodoCatalogoVisible: () => true,
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 7, country_code: 'CO' }, isLoading: false }),
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../PaymentMethodsList', () => ({ __esModule: true, default: () => null }));
jest.mock('../CobrosQrPestana', () => ({ CobrosQrPestana: () => null }));
jest.mock('../PaymentMethodForm', () => ({
  __esModule: true,
  default: ({ abierto, selectedMethod }: { abierto: boolean; selectedMethod: unknown }) =>
    abierto ? <p>{selectedMethod ? 'dialogo-editar' : 'dialogo-nuevo-metodo'}</p> : null,
}));

import PaymentMethodsPage from '../PaymentMethodsPage';

function MobileHeaderDePrueba() {
  const c = useCabeceraMovilActual();
  return <div data-prueba="mobile-header">{c?.accion}</div>;
}

beforeEach(() => simularAncho(390));
afterAll(() => simularAncho(1440));

test('«+» del MobileHeader abre el diálogo de nuevo método', async () => {
  const { container } = renderConIdioma(
    <CabeceraMovilProvider>
      <MobileHeaderDePrueba />
      <PaymentMethodsPage />
    </CabeceraMovilProvider>,
  );
  const cabecera = container.querySelector('[data-prueba="mobile-header"]') as HTMLElement;
  const mas = await within(cabecera).findByRole('button', { name: 'Nuevo método' });
  expect(cabecera.contains(mas)).toBe(true);
  expect(screen.queryByText('dialogo-nuevo-metodo')).toBeNull();
  fireEvent.click(mas);
  expect(screen.getByText('dialogo-nuevo-metodo')).toBeTruthy();
});
