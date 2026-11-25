/** @jest-environment jsdom */
/**
 * Mis envíos en el computador (desde 1024 px), mapa de la ruta y «Mi vehículo y documentos»
 * (encargo 2026-11-25). El mapa Leaflet se reemplaza por un doble: aquí se prueba qué pines y qué
 * enlace a Google Maps recibe. En los cuatro idiomas.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ resolveFor: () => ({ timezone: 'America/Bogota' }), timezone: 'America/Bogota' }),
  useFormatDate: () => ({ getToday: () => '2026-11-25', timezone: 'America/Bogota', formatDate: (v: string) => v, formatTime: (v: string) => v }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], branchFilter: 3, selectedBranchId: 3 }) }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }), usePathname: () => '/app/logistica/mis-envios', useSearchParams: () => null }));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn() }));

const changeStatus = jest.fn();
const getAutorizadoresAsignacion = jest.fn();
jest.mock('@/lib/services/deliveryIntegrationService', () => ({
  EnvioError: class extends Error {},
  deliveryIntegrationService: {
    changeStatus: (...a: unknown[]) => changeStatus(...a),
    registerFailedAttempt: jest.fn(),
    getAutorizadoresAsignacion: (...a: unknown[]) => getAutorizadoresAsignacion(...a),
  },
}));
const leerVehiculo = jest.fn();
jest.mock('@/lib/services/logistica/misEnviosService', () => ({
  subirImagenEnvio: jest.fn(),
  cuadresDesde: jest.fn(async () => []),
  leerVehiculo: (...a: unknown[]) => leerVehiculo(...a),
}));
jest.mock('../../logisticaApi', () => ({ avisarCliente: jest.fn(), leerPerfilMisEnvios: jest.fn() }));
const mapa = jest.fn();
jest.mock('../MapaRutaDinamico', () => ({
  MapaRutaDinamico: (p: { pines: Array<{ id: string; numero: number; estado: string }>; etiqueta: string }) => {
    mapa(p);
    return <div role="region" aria-label={p.etiqueta} data-pines={p.pines.map((x) => `${x.numero}:${x.estado}`).join(',')} />;
  },
}));

const base = {
  organization_id: 120,
  driver_id: 'drv-1',
  source_type: 'web_order',
  source_id: 'wo-1',
  branch_id: 3,
  delivery_city: 'Bogotá',
  delivery_contact_name: 'Cliente',
  delivery_contact_phone: '3152204187',
  cod_amount: 0,
  cod_status: null,
  failed_attempts: 0,
  created_at: '2026-11-25T12:00:00Z',
  vehicle_id: 'veh-1',
  shipment_items: [],
};
const excepcion = { causas: [{ causa: 'soat' }], motivo: 'Renovación en trámite', pidio: 'u-sup', autorizo: 'u-sup', at: '2026-11-25T12:52:00Z' };
const envios = [
  { ...base, id: 'e1', shipment_number: 'ENV-1037', status: 'delivered', delivered_at: '2026-11-25T14:22:00Z', delivery_address: 'Cra 15 # 93-40', barrio: 'Chicó', delivery_latitude: 4.68, delivery_longitude: -74.05 },
  { ...base, id: 'e3', shipment_number: 'ENV-1042', status: 'out_for_delivery', delivery_address: 'Cl 72 # 10-34', barrio: 'Chapinero', cod_amount: 128900, cod_status: 'pending', delivery_code_required: true, delivery_latitude: 4.65, delivery_longitude: -74.06, metadata: { excepcion_asignacion: excepcion } },
  { ...base, id: 'e4', shipment_number: 'ENV-1044', status: 'picked', delivery_address: 'Cra 7 # 45-10', barrio: 'Teusaquillo', metadata: { excepcion_asignacion: excepcion } },
  { ...base, id: 'e6', shipment_number: 'ENV-1047', status: 'assigned', delivery_address: 'Cl 26 # 69-76', barrio: 'Salitre', cod_amount: 100000, cod_status: 'pending' },
  { ...base, id: 'e9', shipment_number: 'ENV-1029', status: 'failed_attempt', expected_delivery_date: '2026-11-26', delivery_address: 'Cra 19 # 134-60', barrio: 'Cedritos', cod_amount: 42000, cod_status: 'pending' },
];
const ruta = {
  orgId: 120,
  driver: { id: 'drv-1', full_name: 'Domiciliario Uno', branch_id: 3, default_vehicle_id: 'veh-1', license_category: 'A2', license_expiry: '2029-07-03' },
  envios,
  estado: 'listo',
  recargar: jest.fn(),
  hoy: '2026-11-25',
  timezone: 'America/Bogota',
  zonaDe: () => 'America/Bogota',
  actualizadoEn: new Date('2026-11-25T15:58:00Z'),
  desde: '2026-11-24T05:00:00.000Z',
};
const parada = { orgId: 120, driver: { id: 'drv-1' }, envio: null, estado: 'listo', recargar: jest.fn() };
jest.mock('../useMiRuta', () => ({ useParada: () => parada, useMiRuta: () => ruta, useUltimoCuadre: () => ({ id: 'c1', status: 'closed', difference: '0', expected_total: 0, received_total: 0, opened_at: '2026-11-24T22:00:00Z', closed_at: '2026-11-24T23:00:00Z' }) }));

import { MisEnviosPantalla } from '../MisEnviosPantalla';
import { MapaRutaPantalla } from '../MapaRutaPantalla';
import { MiVehiculoPantalla } from '../MiVehiculoPantalla';

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
  leerVehiculo.mockResolvedValue({ id: 'veh-1', plate: 'KLM48E', vehicle_type: 'motorcycle', ownership: 'driver', capacity_kg: 150, soat_expiry: '2026-12-06', techno_expiry: '2027-08-14' });
  getAutorizadoresAsignacion.mockResolvedValue([{ userId: 'u-sup', nombre: 'Supervisora Uno', tienePin: true }]);
});

describe('computador', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('se pinta en %s sin claves faltantes', async (locale) => {
    ancho(true);
    const errores = pintar(<MisEnviosPantalla />, locale);
    await screen.findByRole('table');
    await screen.findAllByText('KLM48E');
    expect(errores).toEqual([]);
  });

  test('cifras, tabla en el orden de la ruta y la acción de cada fila', async () => {
    ancho(true);
    changeStatus.mockResolvedValue({ status: 'out_for_delivery', aviso: 'en_camino' });
    pintar(<MisEnviosPantalla />);
    await screen.findByRole('table');
    expect(screen.getByText('Asignados hoy')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Todos · 5' })).toBeTruthy();
    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((f) => f.textContent?.match(/ENV-\d+/)?.[0])).toEqual(['ENV-1037', 'ENV-1042', 'ENV-1044', 'ENV-1047', 'ENV-1029']);
    // En camino: Entregar (página) y Novedad (hoja lateral).
    expect(screen.getByRole('link', { name: /^Entregar$/ }).getAttribute('href')).toBe('/app/logistica/mis-envios/e3/entregar');
    // Recogido: Iniciar ruta con la misma RPC.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Iniciar ruta$/ }));
    });
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith('e4', 'out_for_delivery', {}));
    // Por recoger: Recogí el paquete. Reprogramado para mañana: Ver novedad.
    expect(screen.getByRole('button', { name: /Recogí el paquete/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ver novedad/ })).toBeTruthy();
    // Panel: vehículo con SOAT por vencer y último cuadre.
    expect(await screen.findByText('En 11 días')).toBeTruthy();
    expect(screen.getByText('Cuadrado · sin diferencia')).toBeTruthy();
    // Mapa: pines de la ruta (entregado, actual y pendientes con coordenadas).
    expect(screen.getByRole('region', { name: 'Mapa de la ruta de hoy' }).getAttribute('data-pines')).toBe('1:entregado,2:actual');
  });

  test('buscar por barrio filtra la tabla', async () => {
    ancho(true);
    pintar(<MisEnviosPantalla />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'teusa' } });
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
    expect(screen.getAllByRole('row')[1].textContent).toContain('ENV-1044');
  });

  test('Novedad abre la hoja con el mismo formulario', async () => {
    ancho(true);
    pintar(<MisEnviosPantalla />);
    await screen.findByRole('table');
    fireEvent.click(screen.getAllByRole('button', { name: /^Novedad$/ })[0]);
    expect(await screen.findByRole('button', { name: 'Guardar y seguir con la ruta' })).toBeTruthy();
  });
});

describe('celular: mapa y vehículo', () => {
  test('la lista ofrece «Ver mapa de la ruta» y la fila «Mi vehículo hoy»', async () => {
    ancho(false);
    pintar(<MisEnviosPantalla />);
    expect(screen.getByRole('link', { name: /Ver mapa de la ruta/ }).getAttribute('href')).toBe('/app/logistica/mis-envios/mapa');
    const fila = await screen.findByRole('link', { name: /Mi vehículo hoy · KLM48E/ });
    expect(fila.getAttribute('href')).toBe('/app/logistica/mis-envios/vehiculo');
    expect(fila.textContent).toContain('SOAT vence en 11 días');
  });

  test.each(Object.keys(IDIOMAS) as Idioma[])('mapa de la ruta en %s: pines y Google Maps con las pendientes', (locale) => {
    ancho(false);
    const errores = pintar(<MapaRutaPantalla />, locale);
    expect(errores).toEqual([]);
    expect(mapa).toHaveBeenCalled();
    const enlace = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.startsWith('https://www.google.com/maps/dir/'));
    expect(enlace).toBeTruthy();
  });

  test.each(Object.keys(IDIOMAS) as Idioma[])('mi vehículo en %s: documentos, excepción con quien autorizó', async (locale) => {
    ancho(false);
    const errores = pintar(<MiVehiculoPantalla />, locale);
    await screen.findAllByText('KLM48E');
    await waitFor(() => expect(getAutorizadoresAsignacion).toHaveBeenCalledWith(120));
    expect(await screen.findByText('Supervisora Uno')).toBeTruthy();
    expect(errores).toEqual([]);
  });

  test('español: SOAT por vencer, licencia y la excepción de hoy', async () => {
    ancho(false);
    pintar(<MiVehiculoPantalla />);
    expect(await screen.findByText('En 11 días')).toBeTruthy();
    expect(screen.getByText('Licencia de conducción A2')).toBeTruthy();
    expect(screen.getByText('Hoy te asignaron con excepción')).toBeTruthy();
    expect(screen.getByText('Renovación en trámite')).toBeTruthy();
    expect(screen.getByText('2 envíos de hoy')).toBeTruthy();
    expect(screen.getByText(/Esta placa quedó guardada en tus 4 envíos de hoy/)).toBeTruthy();
  });
});
