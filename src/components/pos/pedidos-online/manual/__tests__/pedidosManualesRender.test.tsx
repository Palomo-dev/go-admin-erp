/**
 * @jest-environment jsdom
 *
 * Pedido manual, reconstrucción y «Pagos sin pedido»: render en es, en, fr y pt con el proveedor
 * real de next-intl (una clave que falte hace fallar la prueba) y `fetch` simulado. No hay red.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';
import { DialogoPedidoManual } from '../DialogoPedidoManual';
import { DialogoReconstruirPedido } from '../DialogoReconstruirPedido';
import PagosSinPedidoPage from '@/app/app/pos/pedidos-online/pagos-sin-pedido/page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({
    branches: [
      { id: 21, organization_id: 333, name: 'Sede Centro' },
      { id: 22, organization_id: 333, name: 'Sede Norte' },
    ],
    selectedBranchId: 21,
  }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$${Number(v)}` }) }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 333 } }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ timezone: 'America/Bogota', formatDateTime: (v: string) => `fecha:${v}`, formatDate: (v: string) => v }),
}));
jest.mock('@/lib/supabase/config', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or']) q[m] = () => q;
  q.limit = async () => ({ data: [] });
  return { supabase: { from: () => q } };
});
jest.mock('@/components/kit/PhoneInput', () => ({
  PhoneInput: (p: { id?: string; value?: string; onChange: (v: string) => void }) => <input id={p.id} value={p.value ?? ''} onChange={(e) => p.onChange(e.target.value)} />,
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const MENSAJES = { es, en, fr, pt } as const;
const PASARELAS = {
  pasarelas: [
    { id: 'cx1', connectorCode: 'wompi_co', nombre: 'Wompi', consultable: true },
    { id: 'cx2', connectorCode: 'payu_co', nombre: 'PayU', consultable: false },
  ],
};
const COBRO = { estado: 'aprobada', proveedor: 'wompi_co', transaccionId: 'tx-9', referencia: 'LINK_123', montoCentavos: 2880000, fecha: '2026-11-06T15:45:33.722Z', metodo: 'nequi' };
const VERIFICACION = { cobro: COBRO, decision: { tipo: 'crear_nuevo' }, sede_sugerida: 22 };
const PAGOS = { pagos: [{ cobro: COBRO, conexion: { id: 'cx1', nombre: 'Wompi', proveedor: 'wompi_co' }, sinPrefijo: true, registradoEn: '2026-11-06T16:00:00Z' }] };

let errores: jest.SpyInstance;
let llamadas: Array<{ url: string; body?: unknown }>;
beforeEach(() => {
  llamadas = [];
  errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const u = String(url);
    const json = u.includes('/verificar') ? VERIFICACION : u.includes('/pagos-sin-pedido') ? PAGOS : PASARELAS;
    return { ok: true, json: async () => json } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  const intl = errores.mock.calls
    .map((c) => String(c[0] instanceof Error ? `${c[0].name} ${c[0].message}` : c[0]))
    .filter((m) => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INVALID_KEY/.test(m));
  errores.mockRestore();
  expect(intl).toEqual([]);
  expect(document.body.textContent ?? '').not.toMatch(/pedidosManuales\./);
});

describe.each(IDIOMAS)('pedidos manuales en %s', (idioma) => {
  const m = MENSAJES[idioma].pedidosManuales;

  test('pedido manual: tienda, cliente y productos; sin datos no deja crear', () => {
    renderConIdioma(<DialogoPedidoManual organizationId={333} abierto onAbiertoChange={() => undefined} onCreado={() => undefined} />, { idioma });
    expect(screen.getByText(m.manual.titulo, { selector: 'h2' })).toBeTruthy();
    expect(screen.getByText('Sede Centro')).toBeTruthy();
    expect((screen.getByRole('button', { name: new RegExp(m.manual.crear) }) as HTMLButtonElement).getAttribute('aria-disabled') === 'true' || (screen.getByRole('button', { name: new RegExp(m.manual.crear) }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('reconstruir: verifica sin escribir y, sin prefijo, pide confirmar la tienda sugerida', async () => {
    renderConIdioma(
      <DialogoReconstruirPedido organizationId={333} abierto onAbiertoChange={() => undefined} precarga={{ connection_id: 'cx1', transaccion: 'tx-9', valor: 28800 }} onReconstruido={() => undefined} />,
      { idioma },
    );
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/web-orders/reconstruir')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: m.reconstruir.verificar }));
    await waitFor(() => expect(screen.getByText(m.reconstruir.decision.crear_nuevo)).toBeTruthy());
    expect(llamadas.find((l) => l.url.endsWith('/verificar'))?.body).toMatchObject({ connection_id: 'cx1', transaccion: 'tx-9', valor: 28800 });
    // La sede sugerida por los productos queda elegida y hay que confirmarla antes de crear.
    expect(screen.getByText(m.reconstruir.confirmarTienda.replace('{tienda}', 'Sede Norte'))).toBeTruthy();
  });
});

test('pagos sin pedido: lista el cobro y «Reconstruir» abre el paso 2 precargado', async () => {
  renderConIdioma(<PagosSinPedidoPage />, { idioma: 'es' });
  await waitFor(() => expect(screen.getByText('tx-9')).toBeTruthy());
  expect(screen.getByText(es.pedidosManuales.sinPedido.sinPrefijo)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: es.pedidosManuales.sinPedido.reconstruir }));
  await waitFor(() => expect(screen.getByDisplayValue('tx-9')).toBeTruthy());
});
