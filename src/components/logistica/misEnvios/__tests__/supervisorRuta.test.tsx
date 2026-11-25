/** @jest-environment jsdom */
/**
 * «Ver la ruta de» del supervisor (encargo 2026-11-25): elige domiciliario, ve su ruta con las
 * mismas piezas, Reasigna con la MISMA hoja de la oficina (solo en estados que la base deja) y
 * registra Novedad. Nunca entrega ni cobra. Computador y celular, en los cuatro idiomas.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ resolveFor: () => ({ timezone: 'America/Bogota' }), timezone: 'America/Bogota' }),
  useFormatDate: () => ({ getToday: () => '2026-11-25', timezone: 'America/Bogota', formatDate: (v: string) => v, formatTime: (v: string) => v }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], branchFilter: 3 }) }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }), usePathname: () => '/app/logistica/mis-envios', useSearchParams: () => null }));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn(), toastWarning: jest.fn() }));
jest.mock('@/lib/services/deliveryIntegrationService', () => ({
  EnvioError: class extends Error {},
  AsignacionNoPasoError: class extends Error {},
  deliveryIntegrationService: { registerFailedAttempt: jest.fn(), changeStatus: jest.fn(), getAutorizadoresAsignacion: jest.fn(async () => []) },
}));
jest.mock('@/lib/services/logistica/misEnviosService', () => ({ subirImagenEnvio: jest.fn(), cuadresDesde: jest.fn(async () => []), leerVehiculo: jest.fn(async () => null) }));
jest.mock('../MapaRutaDinamico', () => ({ MapaRutaDinamico: () => <div data-testid="mapa" /> }));
const hojaAsignar = jest.fn();
jest.mock('../../asignar/HojaAsignarDomiciliario', () => ({
  HojaAsignarDomiciliario: (p: { abierto: boolean; envios: Array<{ id: string; numero: string; status: string; domiciliarioId: string | null }> }) => {
    hojaAsignar(p);
    return p.abierto ? <div role="dialog" aria-label="Asignar domiciliario">{p.envios.map((e) => e.numero).join(',')}</div> : null;
  },
}));

const opciones = [
  { id: 'drv-1', nombre: 'Domiciliario Uno', corto: 'Domiciliario U.', telefono: '3001234567', estado: 'en_ruta', paradas: 4, entregados: 1, placa: 'KLM48E', tipo: 'motorcycle', documento: { estado: 'por_vencer', dias: 11, clave: 'soat' } },
  { id: 'drv-2', nombre: 'Domiciliaria Dos', corto: 'Domiciliaria D.', telefono: null, estado: 'libre', paradas: 0, entregados: 0, placa: null, tipo: 'on_foot', documento: null },
];
const base = { organization_id: 120, driver_id: 'drv-1', source_type: 'web_order', source_id: 'wo-1', branch_id: 3, delivery_city: 'Bogotá', delivery_contact_name: 'Cliente', cod_amount: 0, cod_status: null, failed_attempts: 0, created_at: '2026-11-25T12:00:00Z', fulfillment_mode: 'own', shipment_items: [] };
const envios = [
  { ...base, id: 'e1', shipment_number: 'ENV-1037', status: 'delivered', delivered_at: '2026-11-25T14:22:00Z', delivery_address: 'Cra 15' },
  { ...base, id: 'e3', shipment_number: 'ENV-1042', status: 'out_for_delivery', delivery_address: 'Cl 72', cod_amount: 128900, cod_status: 'pending', delivery_code_required: true },
  { ...base, id: 'e6', shipment_number: 'ENV-1047', status: 'assigned', delivery_address: 'Cl 26', cod_amount: 100000, cod_status: 'pending' },
];
const leerOpcionesRutaDe = jest.fn();
const leerRutaDe = jest.fn();
jest.mock('../../logisticaApi', () => {
  class LogisticaApiError extends Error {
    constructor(public codigo: string, public status: number) {
      super(codigo);
    }
  }
  return {
    LogisticaApiError,
    avisarCliente: jest.fn(),
    leerOpcionesRutaDe: () => leerOpcionesRutaDe(),
    leerRutaDe: (id: string) => leerRutaDe(id),
  };
});
jest.mock('../useMiRuta', () => ({
  useDiaRuta: () => ({ hoy: '2026-11-25', timezone: 'America/Bogota', zonaDe: () => 'America/Bogota' }),
  useUltimoCuadre: () => null,
}));

import { SupervisorRuta } from '../SupervisorRuta';

const IDIOMAS = { es, en, fr, pt } as const;
type Idioma = keyof typeof IDIOMAS;
function pintar(ui: ReactElement, locale: Idioma = 'es') {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return errores;
}
function ancho(escritorio: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: escritorio, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  jest.clearAllMocks();
  leerOpcionesRutaDe.mockResolvedValue({ hoy: '2026-11-25', opciones });
  leerRutaDe.mockResolvedValue({ hoy: '2026-11-25', domiciliario: { id: 'drv-1', organization_id: 120, full_name: 'Domiciliario Uno', branch_id: 3 }, envios });
});

describe('celular', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('se pinta en %s sin claves faltantes', async (locale) => {
    ancho(false);
    const errores = pintar(<SupervisorRuta domiciliarioId={null} onElegir={jest.fn()} />, locale);
    await screen.findByText('ENV-1042');
    expect(errores).toEqual([]);
  });

  test('sin elegir, ve la ruta del primero; los chips cambian de domiciliario', async () => {
    ancho(false);
    const onElegir = jest.fn();
    pintar(<SupervisorRuta domiciliarioId={null} onElegir={onElegir} />);
    await screen.findByText('ENV-1042');
    expect(leerRutaDe).toHaveBeenCalledWith('drv-1');
    expect(screen.getByRole('radio', { name: /Domiciliario U\./ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('SOAT vence en 11 días')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Domiciliaria D\./ }));
    expect(onElegir).toHaveBeenCalledWith('drv-2');
  });

  test('nunca ofrece Entregar ni cobrar; Reasignar solo donde la base lo deja (no si ya lleva el paquete)', async () => {
    ancho(false);
    pintar(<SupervisorRuta domiciliarioId="drv-1" onElegir={jest.fn()} />);
    await screen.findByText('ENV-1042');
    expect(screen.queryByRole('link', { name: /^Entregar$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirmar entrega/ })).toBeNull();
    const reasignar = screen.getAllByRole('button', { name: /Reasignar/ });
    // ENV-1042 va en camino (no reasignable); ENV-1047 por recoger (sí).
    expect(reasignar[0].hasAttribute('disabled')).toBe(true);
    expect(reasignar[1].hasAttribute('disabled')).toBe(false);
  });

  test('Reasignar abre la MISMA hoja «Asignar domiciliario» de la oficina con esa parada', async () => {
    ancho(false);
    pintar(<SupervisorRuta domiciliarioId="drv-1" onElegir={jest.fn()} />);
    await screen.findByText('ENV-1047');
    fireEvent.click(screen.getAllByRole('button', { name: /Reasignar/ })[1]);
    const hoja = await screen.findByRole('dialog', { name: 'Asignar domiciliario' });
    expect(within(hoja).getByText('ENV-1047')).toBeTruthy();
    const props = hojaAsignar.mock.calls.at(-1)?.[0];
    expect(props.envios[0]).toMatchObject({ id: 'e6', status: 'assigned', domiciliarioId: 'drv-1', modo: 'own' });
  });

  test('Novedad abre la hoja del mismo formulario', async () => {
    ancho(false);
    pintar(<SupervisorRuta domiciliarioId="drv-1" onElegir={jest.fn()} />);
    await screen.findByText('ENV-1042');
    fireEvent.click(screen.getAllByRole('button', { name: /^Novedad$/ })[0]);
    expect(await screen.findByRole('button', { name: 'Guardar y seguir con la ruta' })).toBeTruthy();
  });

  test('sin permiso (403): lo dice y no muestra rutas', async () => {
    ancho(false);
    const { LogisticaApiError } = jest.requireMock('../../logisticaApi') as { LogisticaApiError: new (c: string, s: number) => Error };
    leerOpcionesRutaDe.mockRejectedValue(new LogisticaApiError('SIN_PERMISO', 403));
    pintar(<SupervisorRuta domiciliarioId={null} onElegir={jest.fn()} />);
    expect(await screen.findByText('Solo quien despacha ve la ruta de otro domiciliario')).toBeTruthy();
    expect(leerRutaDe).not.toHaveBeenCalled();
  });
});

describe('computador', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('se pinta en %s sin claves faltantes', async (locale) => {
    ancho(true);
    const errores = pintar(<SupervisorRuta domiciliarioId="drv-1" onElegir={jest.fn()} />, locale);
    await screen.findByRole('table');
    expect(errores).toEqual([]);
  });

  test('selector, nota sin «arrastrar» y tabla con Reasignar / Novedad', async () => {
    ancho(true);
    pintar(<SupervisorRuta domiciliarioId="drv-1" onElegir={jest.fn()} />);
    await screen.findByRole('table');
    expect(screen.getByText(/Entregar con código y cobrar la contraentrega solo lo hace el domiciliario/)).toBeTruthy();
    expect(screen.queryByText(/arrastrando/)).toBeNull();
    expect(screen.getByRole('link', { name: /Ir a Por despachar/ }).getAttribute('href')).toBe('/app/logistica/por-despachar');
    expect(screen.getByRole('link', { name: /Llamar a Domiciliario U\./ }).getAttribute('href')).toBe('tel:3001234567');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Reasignar/ }).length).toBe(2));
    expect(screen.queryByRole('link', { name: /^Entregar$/ })).toBeNull();
  });
});
