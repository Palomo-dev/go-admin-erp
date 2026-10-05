/** @jest-environment jsdom */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { contextoMoneda } from '@/lib/utils/moneda';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { CrearOportunidadDesdeOrigen } from '../CrearOportunidadDesdeOrigen';
import { ConexionesOportunidad, enlaceConversacionOrigen } from '../ConexionesOportunidad';
import type { OportunidadDetalleApi } from '../apiOportunidades';
import type { Lineas } from '../lineasLogica';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

const mockPedir = jest.fn();
const mockCrear = jest.fn();
const mockOrg = jest.fn(() => 120);
const mockCat = { usuarioId: 'u1', permisos: { 'crm.opportunities.create': true }, pipelines: [{ id: 'p1', name: 'Ventas' }], etapas: [{ id: 's1', pipeline_id: 'p1', name: 'Calificación', position: 1, probability: 20 }], usuarios: [{ id: 'u1', nombre: 'Usuario sintético' }], cargando: false };
jest.mock('@/components/crm/acciones/useCatalogosCrm', () => ({ useCatalogosCrm: () => mockCat }));
jest.mock('@/components/crm/acciones/apiCrm', () => ({ ...jest.requireActual('@/components/crm/acciones/apiCrm'), pedirCrm: (...args: unknown[]) => mockPedir(...args) }));
jest.mock('../apiOportunidades', () => ({ crearOportunidad: (...args: unknown[]) => mockCrear(...args) }));
jest.mock('../LineasOportunidad', () => ({ LineasOportunidad: ({ onCambiar }: { onCambiar: (lineas: Lineas) => void }) => <>
  <button type="button" onClick={() => onCambiar({ products: [], spaces: [], custom: [{ concept: 'Concepto sintético', quantity: 2, unit_price: 25 }] })}>Línea con precio</button>
  <button type="button" onClick={() => onCambiar({ products: [], spaces: [], custom: [{ concept: 'Concepto sintético', quantity: 2, unit_price: 0 }] })}>Línea gratuita</button>
</> }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => mockOrg(), ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ ...contextoMoneda('COP'), paraDocumento: (code?: string) => contextoMoneda(code ?? 'COP') }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota', getToday: () => '2026-10-02', formatDateTime: (date: string) => date, formatPlain: (date: string) => date, formatTime: (date: string) => date }) }));

const MENSAJES = { es, en, fr, pt };
const ORIGEN = { tipo: 'factura', id: '00000000-0000-4000-8000-000000000001', updated_at: '2026-10-02T01:00:00Z', customer_id: 'c1', cliente_nombre: 'Cliente sintético', numero: 'FV-TEST', amount: 12000, currency: 'COP', canal: null, occurred_at: null, opportunity_id: null, lineas: [{ concepto: 'Concepto sintético', cantidad: 2, total: 12000 }] };
beforeEach(() => {
  jest.clearAllMocks();
  mockOrg.mockReturnValue(120);
  mockCat.permisos['crm.opportunities.create'] = true;
  mockPedir.mockResolvedValue({ data: ORIGEN });
  mockCrear.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000005' });
});

describe.each(['es', 'en', 'fr', 'pt'] as IdiomaPrueba[])('origen en %s', idioma => {
  test.each([390, 1440])('abre el formulario único a %s px con valores financieros bloqueados y vínculo canónico', async ancho => {
    simularAncho(ancho);
    const textos = MENSAJES[idioma].crm;
    renderConIdioma(<CrearOportunidadDesdeOrigen tipo="factura" id={ORIGEN.id} />, { idioma });
    fireEvent.click(screen.getByRole('button', { name: textos.origenOportunidad.crear }));
    await waitFor(() => expect(screen.getByDisplayValue('FV-TEST · Cliente sintético')).toBeTruthy());
    expect(screen.getByDisplayValue('12000')).toHaveProperty('disabled', true);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: textos.kit.formulario.crear }));
    await waitFor(() => expect(mockCrear).toHaveBeenCalledTimes(1));
    expect(mockCrear).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'c1', amount: 12000, currency: 'COP', origen: 'factura', origen_ref: { tipo: 'factura', id: ORIGEN.id, updated_at: ORIGEN.updated_at } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('link', { name: textos.origenOportunidad.ver }).getAttribute('href')).toContain('/app/crm/oportunidades/');
  });
});
test('error conserva el formulario, un doble clic manda una sola petición y reintenta el mismo contenido', async () => {
  let rechazar: (error: unknown) => void = () => undefined;
  mockCrear.mockImplementationOnce(() => new Promise((_resolve, reject) => { rechazar = reject; }));
  renderConIdioma(<CrearOportunidadDesdeOrigen tipo="cotizacion" id={ORIGEN.id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
  await waitFor(() => expect(screen.getByDisplayValue('FV-TEST · Cliente sintético')).toBeTruthy());
  const submit = within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear oportunidad' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(mockCrear).toHaveBeenCalledTimes(1);
  const nombre = screen.getByDisplayValue('FV-TEST · Cliente sintético');
  expect(nombre.closest('fieldset')).toHaveProperty('disabled', true);
  fireEvent.change(nombre, { target: { value: 'Edición durante guardado' } });
  expect(screen.getByDisplayValue('FV-TEST · Cliente sintético')).toBeTruthy();
  rechazar(new ErrorApiCrm(0, 'red', 'Error de red'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByDisplayValue('FV-TEST · Cliente sintético')).toBeTruthy();
  const primerIntento = mockCrear.mock.calls[0][0];
  fireEvent.click(submit);
  await waitFor(() => expect(mockCrear).toHaveBeenCalledTimes(2));
  expect(mockCrear.mock.calls[1][0]).toEqual(primerIntento);
});
test('Chat conserva coherencia entre monto mostrado y enviado al pasar una línea a precio cero', async () => {
  mockPedir.mockResolvedValue({ data: { ...ORIGEN, tipo: 'conversacion', numero: null, amount: 0, canal: 'whatsapp', occurred_at: ORIGEN.updated_at, lineas: [] } });
  renderConIdioma(<CrearOportunidadDesdeOrigen tipo="conversacion" id={ORIGEN.id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
  await waitFor(() => expect(screen.getByDisplayValue('0')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: es.crm.kit.formulario.agregarLineas }));
  fireEvent.click(screen.getByRole('button', { name: 'Línea con precio' }));
  await waitFor(() => expect(screen.getByDisplayValue('50')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Línea gratuita' }));
  await waitFor(() => expect(screen.getByDisplayValue('0')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: es.crm.origenOportunidad.volver }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear oportunidad' }));
  await waitFor(() => expect(mockCrear).toHaveBeenCalledWith(expect.objectContaining({ amount: 0, custom_lines: [{ concept: 'Concepto sintético', quantity: 2, unit_price: 0 }] })));
});
test('un origen ya vinculado ofrece ver y no crea una segunda oportunidad', async () => {
  mockPedir.mockResolvedValue({ data: { ...ORIGEN, opportunity_id: 'o1' } });
  renderConIdioma(<CrearOportunidadDesdeOrigen tipo="conversacion" id={ORIGEN.id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
  await waitFor(() => expect(screen.getByRole('link', { name: 'Ver oportunidad' })).toBeTruthy());
  expect(mockCrear).not.toHaveBeenCalled();
});
test('la UI sin permiso no ofrece crear y un cambio de organización descarta una fuente en vuelo', async () => {
  mockCat.permisos['crm.opportunities.create'] = false;
  const denied = renderConIdioma(<CrearOportunidadDesdeOrigen tipo="factura" id={ORIGEN.id} />);
  expect(screen.queryByRole('button', { name: 'Crear oportunidad' })).toBeNull();
  denied.unmount();
  mockCat.permisos['crm.opportunities.create'] = true;
  let resolver: (value: unknown) => void = () => undefined;
  mockPedir.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; }));
  renderConIdioma(<CrearOportunidadDesdeOrigen tipo="factura" id={ORIGEN.id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
  mockOrg.mockReturnValue(999);
  fireEvent(window, new Event('organization-changed'));
  resolver({ data: ORIGEN });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByDisplayValue('FV-TEST · Cliente sintético')).toBeNull();
});
test('detalle de oportunidad permite volver a factura, cotización y conversación enlazadas', async () => {
  mockPedir.mockImplementation(async (url: string) => ({ data: url.endsWith('/finance') ? {
    quotations: [{ id: ORIGEN.id, number: 'COT-TEST', status: 'sent' }], invoices: [{ id: ORIGEN.id, number: 'FV-TEST', status: 'issued' }], commissions: [] } : [] }));
  const op = { id: 'o1', amount: 12000, metadata: { origen: 'conversacion', origen_ref: { tipo: 'conversacion', id: ORIGEN.id } } } as unknown as OportunidadDetalleApi;
  renderConIdioma(<ConexionesOportunidad op={op} tareasAbiertas={0} />);
  await waitFor(() => expect(screen.getByRole('link', { name: /COT-TEST/ })).toBeTruthy());
  expect(screen.getByRole('link', { name: /COT-TEST/ }).getAttribute('href')).toBe(`/app/finanzas/cotizaciones/${ORIGEN.id}`);
  expect(screen.getByRole('link', { name: /FV-TEST/ }).getAttribute('href')).toBe(`/app/finanzas/facturas-venta/${ORIGEN.id}`);
  expect(screen.getByRole('link', { name: 'Ver origen' }).getAttribute('href')).toBe(`/app/chat/conversations/${ORIGEN.id}`);
  expect(enlaceConversacionOrigen({ origen: 'conversacion', origen_ref: { tipo: 'conversacion', id: '../otro' } })).toBeNull();
});
test('el panel de conexiones conserva error/reintento en lugar de presentar documentos inexistentes', async () => {
  mockPedir.mockRejectedValue(new ErrorApiCrm(500, null, 'Error interno'));
  const op = { id: 'o1', amount: 12000 } as OportunidadDetalleApi;
  renderConIdioma(<ConexionesOportunidad op={op} tareasAbiertas={0} />);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.queryByText(es.crm.oportunidad.conexiones.sinCotizacion)).toBeNull();
  mockPedir.mockImplementation(async (url: string) => ({ data: url.endsWith('/finance') ? { quotations: [], invoices: [{ id: ORIGEN.id, number: 'FV-TEST', status: 'issued' }], commissions: [] } : [] }));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.getByRole('link', { name: /FV-TEST/ })).toBeTruthy());
  expect(screen.queryByRole('alert')).toBeNull();
});
