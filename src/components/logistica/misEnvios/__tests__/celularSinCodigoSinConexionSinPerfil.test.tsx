/** @jest-environment jsdom */
/**
 * Mis envíos en el celular (encargo 2026-11-25): vocabulario único («Recogí el paquete» / «Iniciar
 * ruta»), hoja «¿El cliente no tiene el código?» sin forma de saltárselo, «Entrega confirmada» con
 * «Iniciar ruta a la parada N» (misma RPC), pausa sin conexión y «Mis envíos» sin perfil de
 * domiciliario (b1 con permiso de registrar, b2 sin él). En los cuatro idiomas.
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
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro', phone: '601 555 0101' }], branchFilter: 3, selectedBranchId: 3 }),
}));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }), usePathname: () => '/app/logistica/mis-envios', useSearchParams: () => null }));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn() }));

const changeStatus = jest.fn();
const markAsDelivered = jest.fn();
jest.mock('@/lib/services/deliveryIntegrationService', () => ({
  EnvioError: class extends Error {},
  deliveryIntegrationService: {
    changeStatus: (...a: unknown[]) => changeStatus(...a),
    markAsDelivered: (...a: unknown[]) => markAsDelivered(...a),
    registerFailedAttempt: jest.fn(),
    getAvailableVehicles: jest.fn(async () => []),
  },
}));
jest.mock('@/lib/services/logistica/misEnviosService', () => ({ subirImagenEnvio: jest.fn(), cuadresDesde: jest.fn(async () => []) }));
const avisarCliente = jest.fn();
const leerPerfilMisEnvios = jest.fn();
jest.mock('../../logisticaApi', () => ({
  avisarCliente: (...a: unknown[]) => avisarCliente(...a),
  leerPerfilMisEnvios: () => leerPerfilMisEnvios(),
  leerCandidatos: jest.fn(async () => ({ empleados: [], miembros: [] })),
  registrarDomiciliario: jest.fn(),
  LogisticaApiError: class extends Error {},
}));

const enCamino = {
  id: 'env-3',
  organization_id: 120,
  driver_id: 'drv-1',
  shipment_number: 'ENV-1042',
  status: 'out_for_delivery',
  source_type: 'web_order',
  source_id: 'wo-1',
  branch_id: 3,
  delivery_address: 'Cl 72 # 10-34, oficina 301',
  delivery_city: 'Bogotá',
  barrio: 'Chapinero',
  delivery_contact_name: 'Cliente Tres',
  delivery_contact_phone: '3152204187',
  cod_amount: 128900,
  cod_status: 'pending',
  delivery_code_required: true,
  failed_attempts: 0,
  created_at: '2026-11-25T12:00:00Z',
  shipment_items: [],
};
const recogido = { ...enCamino, id: 'env-4', shipment_number: 'ENV-1044', status: 'picked', cod_amount: 0, cod_status: null, delivery_code_required: false, barrio: 'Teusaquillo' };
const entregado = { ...enCamino, id: 'env-1', shipment_number: 'ENV-1037', status: 'delivered', delivered_at: '2026-11-25T14:22:00Z', cod_amount: 0, cod_status: null };

const parada = { orgId: 120, driver: { id: 'drv-1' }, envio: enCamino as Record<string, unknown> | null, estado: 'listo', recargar: jest.fn() };
const ruta = {
  orgId: 120,
  driver: { id: 'drv-1', full_name: 'Domiciliario Uno', branch_id: 3 } as Record<string, unknown> | null,
  envios: [entregado, enCamino, recogido] as Record<string, unknown>[],
  estado: 'listo',
  recargar: jest.fn(),
  hoy: '2026-11-25',
  timezone: 'America/Bogota',
  zonaDe: () => 'America/Bogota',
  actualizadoEn: new Date('2026-11-25T15:58:00Z'),
  desde: '2026-11-24T05:00:00.000Z',
};
jest.mock('../useMiRuta', () => ({ useParada: () => parada, useMiRuta: () => ruta }));

import { MisEnviosPantalla } from '../MisEnviosPantalla';
import { ParadaPantalla } from '../ParadaPantalla';
import { EntregarPantalla } from '../EntregarPantalla';

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

function ponerConexion(enLinea: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => enLinea });
}

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  jest.clearAllMocks();
  ponerConexion(true);
  parada.envio = enCamino;
  ruta.estado = 'listo';
  ruta.driver = { id: 'drv-1', full_name: 'Domiciliario Uno', branch_id: 3 };
});

describe('lista del celular', () => {
  test('tarjeta con municipio · barrio · cliente y número de parada después de las entregadas', () => {
    pintar(<MisEnviosPantalla />);
    expect(screen.getByText('Bogotá · Chapinero · Cliente Tres')).toBeTruthy();
    expect(screen.getByText('Ruta en curso · parada 2 de 3')).toBeTruthy();
    // La primera pendiente es la parada 2 (hay 1 entregada).
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  test('sin conexión: franja con la hora de la última carga, aviso de pausa y «Terminar jornada» deshabilitado', () => {
    ponerConexion(false);
    pintar(<MisEnviosPantalla />);
    expect(screen.getByText(/Sin conexión · ves la ruta de las/)).toBeTruthy();
    expect(screen.getByText(/Sin señal no se pueden registrar entregas/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terminar jornada y cuadrar' }).hasAttribute('disabled')).toBe(true);
    // Llamar y cómo llegar siguen.
    expect(screen.getAllByRole('link', { name: /Llamar a Cliente Tres/ }).length).toBeGreaterThan(0);
  });
});

describe('parada', () => {
  test('recogido: «Iniciar ruta» con el aviso al cliente; sin conexión queda deshabilitado', () => {
    parada.envio = recogido;
    const errores = pintar(<ParadaPantalla shipmentId="env-4" />);
    expect(errores).toEqual([]);
    expect(screen.getByText('Recogí el paquete')).toBeTruthy();
    expect(screen.getByText(/Después de «Iniciar ruta» la parada queda «En camino»/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Iniciar ruta$/ }).hasAttribute('disabled')).toBe(false);
  });

  test('sin conexión: se pausan Iniciar ruta y la novedad', () => {
    ponerConexion(false);
    parada.envio = recogido;
    pintar(<ParadaPantalla shipmentId="env-4" />);
    expect(screen.getByRole('button', { name: /^Iniciar ruta$/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /No se pudo entregar/ }).hasAttribute('disabled')).toBe(true);
  });
});

describe('entregar', () => {
  test('«¿El cliente no tiene el código?»: tres salidas, llamar a la tienda y ninguna forma de saltarse el código', async () => {
    pintar(<EntregarPantalla shipmentId="env-3" />);
    fireEvent.click(screen.getByRole('button', { name: '¿El cliente no tiene el código?' }));
    expect(await screen.findByText('Que lo busque en su WhatsApp o correo')).toBeTruthy();
    expect(screen.getByText(/No hay forma de saltarse el código en contraentrega/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Llamar a la tienda/ }).getAttribute('href')).toBe('tel:6015550101');
    // No existe ningún campo de PIN ni botón para omitir el código.
    expect(screen.queryByText(/PIN/)).toBeNull();
    // «No se pudo entregar» abre la novedad.
    fireEvent.click(screen.getByRole('button', { name: /No se pudo entregar/ }));
    expect(await screen.findByRole('button', { name: 'Guardar y seguir con la ruta' })).toBeTruthy();
  });

  test('sin conexión no se confirma la entrega', () => {
    ponerConexion(false);
    pintar(<EntregarPantalla shipmentId="env-3" />);
    expect(screen.getByRole('button', { name: /Confirmar entrega/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Sin señal no se pueden registrar entregas/)).toBeTruthy();
  });

  test('entrega confirmada: «Iniciar ruta a la parada 3» usa la MISMA RPC sobre la siguiente parada y avisa al cliente', async () => {
    markAsDelivered.mockResolvedValue({ ok: true, aviso: 'entregado' });
    changeStatus.mockResolvedValue({ status: 'out_for_delivery', aviso: 'en_camino' });
    pintar(<EntregarPantalla shipmentId="env-3" />);
    fireEvent.change(screen.getAllByRole('textbox', { name: /Código de entrega \d/ })[0], { target: { value: '4827' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Exacto' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar entrega/ }));
    const iniciar = await screen.findByRole('button', { name: 'Iniciar ruta a la parada 3' });
    await act(async () => {
      fireEvent.click(iniciar);
    });
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith('env-4', 'out_for_delivery', {}));
    expect(avisarCliente).toHaveBeenCalledWith(expect.objectContaining({ id: 'env-4' }), 'en_camino');
    expect(push).toHaveBeenCalledWith('/app/logistica/mis-envios/env-4');
  });
});

describe('sin perfil de domiciliario', () => {
  const b1 = {
    gestiona: true,
    correo: 'persona@correo.test',
    userId: 'u-1',
    atajos: [
      { href: '/app/logistica/por-despachar', nombre: 'Por despachar' },
      { href: '/app/logistica/cuadres', nombre: 'Cuadres' },
    ],
    kpis: { porDespachar: 12, sinDomiciliario: 12, enRuta: 22, domiciliariosEnCalle: 4, novedades: 3, porReprogramarHoy: 2, porCuadrar: 412000, domiciliariosPorCuadrar: 2 },
  };
  const b2 = { gestiona: false, correo: 'persona@correo.test', userId: 'u-2', atajos: [{ href: '/app/pos', nombre: 'Punto de venta' }], kpis: null };

  test.each(Object.keys(IDIOMAS) as Idioma[])('b1 y b2 se pintan en %s sin claves faltantes', async (locale) => {
    ruta.estado = 'sin_domiciliario';
    ruta.driver = null;
    leerPerfilMisEnvios.mockResolvedValue(b1);
    const errores = pintar(<MisEnviosPantalla />, locale);
    await screen.findAllByText('412.000', { exact: false });
    expect(errores).toEqual([]);
  });

  test('b1: cifras de despacho, «Registrarme como domiciliario» y atajos de su menú', async () => {
    ruta.estado = 'sin_domiciliario';
    ruta.driver = null;
    leerPerfilMisEnvios.mockResolvedValue(b1);
    pintar(<MisEnviosPantalla />);
    expect(await screen.findByText('Tu cuenta no tiene perfil de domiciliario en Sede Centro')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Registrarme como domiciliario/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('12 sin domiciliario asignado')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Por despachar' }).getAttribute('href')).toBe('/app/logistica/por-despachar');
  });

  test('b2: sin permiso no hay «Registrarme»; muestra su correo para que lo vinculen', async () => {
    ruta.estado = 'sin_domiciliario';
    ruta.driver = null;
    leerPerfilMisEnvios.mockResolvedValue(b2);
    const errores = pintar(<MisEnviosPantalla />);
    expect(await screen.findByText('Esta página es para domiciliarios')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Registrarme como domiciliario/ })).toBeNull();
    expect(screen.getByText('persona@correo.test')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copiar mi correo/ })).toBeTruthy();
    expect(errores).toEqual([]);
  });
});
