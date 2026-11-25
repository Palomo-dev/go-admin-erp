/** @jest-environment jsdom */
/**
 * App del domiciliario: la lista (llamar, WhatsApp no, cómo llegar, cobro) y Entregar (código solo
 * en contraentrega, cambio del efectivo, RPC con código y cobro, intentos restantes). Se pinta en
 * los cuatro idiomas: una clave que falte rompe aquí. La pantalla nunca lee el código de entrega.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

const desdeSupabase = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (...a: unknown[]) => desdeSupabase(...a) } }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ resolveFor: () => ({ timezone: 'America/Bogota' }), timezone: 'America/Bogota' }),
  useFormatDate: () => ({ getToday: () => '2026-11-22', timezone: 'America/Bogota', formatDate: (v: string) => v, formatTime: (v: string) => v }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], branchFilter: 3 }) }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }), usePathname: () => '/app/logistica/mis-envios', useSearchParams: () => null }));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn() }));

const markAsDelivered = jest.fn();
jest.mock('@/lib/services/deliveryIntegrationService', () => {
  class EnvioError extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  }
  return { EnvioError, deliveryIntegrationService: { markAsDelivered: (...a: unknown[]) => markAsDelivered(...a), changeStatus: jest.fn() } };
});
jest.mock('@/lib/services/logistica/misEnviosService', () => ({ subirImagenEnvio: jest.fn(async () => 'https://x/foto.jpg') }));
const avisarCliente = jest.fn();
jest.mock('../../logisticaApi', () => ({ avisarCliente: (...a: unknown[]) => avisarCliente(...a) }));

const contraentrega = {
  id: 'env-1',
  organization_id: 120,
  driver_id: 'drv-1',
  shipment_number: 'WO-000412',
  status: 'out_for_delivery',
  source_type: 'web_order',
  source_id: 'wo-1',
  branch_id: 3,
  delivery_address: 'Cra 45 #12-30',
  delivery_city: 'Bogotá',
  delivery_contact_name: 'Ana Gómez',
  delivery_contact_phone: '315 220 41 87',
  delivery_latitude: 4.65,
  delivery_longitude: -74.05,
  cod_amount: 128900,
  cod_status: 'pending',
  delivery_code_required: true,
  failed_attempts: 0,
  created_at: '2026-11-22T12:00:00Z',
  shipment_items: [],
};
const parada = { orgId: 120, driver: { id: 'drv-1' }, envio: contraentrega as Record<string, unknown> | null, estado: 'listo', recargar: jest.fn() };
const ruta = {
  orgId: 120,
  driver: { id: 'drv-1', full_name: 'Luisa Martínez', branch_id: 3 },
  envios: [contraentrega, { ...contraentrega, id: 'env-2', shipment_number: 'POS-V-1088', status: 'picked', cod_amount: 0, cod_status: null, delivery_code_required: false }],
  estado: 'listo',
  recargar: jest.fn(),
  hoy: '2026-11-22',
  timezone: 'America/Bogota',
  zonaDe: () => 'America/Bogota',
};
jest.mock('../useMiRuta', () => ({ useParada: () => parada, useMiRuta: () => ruta }));

import { EntregarPantalla } from '../EntregarPantalla';
import { MisEnviosPantalla } from '../MisEnviosPantalla';

const IDIOMAS = { es, en, fr, pt } as const;

// Las hojas del kit (`HojaDetalle`) eligen inferior o lateral con matchMedia (jsdom no lo trae): celular.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function pintar(ui: ReactElement, locale: keyof typeof IDIOMAS = 'es') {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return errores;
}

beforeEach(() => {
  jest.clearAllMocks();
  parada.envio = contraentrega;
});

describe('Mis envíos (lista)', () => {
  test.each(Object.keys(IDIOMAS) as (keyof typeof IDIOMAS)[])('se pinta en %s sin claves faltantes', (locale) => {
    expect(pintar(<MisEnviosPantalla />, locale)).toEqual([]);
  });

  test('cada tarjeta trae llamar (tel:) y cómo llegar (Google Maps); el cobro pendiente se ve', () => {
    pintar(<MisEnviosPantalla />);
    const llamar = screen.getAllByRole('link', { name: /Llamar a Ana Gómez/ });
    expect(llamar[0].getAttribute('href')).toBe('tel:3152204187');
    const llegar = screen.getAllByRole('link', { name: /Cómo llegar donde Ana Gómez/ });
    expect(llegar[0].getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=4.65,-74.05');
    expect(screen.getByText(/Cobrar \$ 128\.900/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Pendientes 2' })).toBeTruthy();
  });
});

describe('Entregar', () => {
  test.each(Object.keys(IDIOMAS) as (keyof typeof IDIOMAS)[])('se pinta en %s sin claves faltantes', (locale) => {
    expect(pintar(<EntregarPantalla shipmentId="env-1" />, locale)).toEqual([]);
  });

  test('contraentrega: pide el código (nunca lo lee), calcula el cambio y manda código + cobro a la RPC', async () => {
    markAsDelivered.mockResolvedValue({ ok: true, shipmentId: 'env-1', proofId: 'p1', codStatus: 'collected', aviso: 'entregado' });
    pintar(<EntregarPantalla shipmentId="env-1" />);

    const casillas = screen.getAllByRole('textbox', { name: /Código de entrega \d/ });
    expect(casillas).toHaveLength(4);
    fireEvent.change(casillas[0], { target: { value: '4821' } });

    fireEvent.click(screen.getByRole('radio', { name: '$ 150.000' }));
    expect(screen.getByText('$ 21.100')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar entrega/ }));
    await waitFor(() => expect(markAsDelivered).toHaveBeenCalled());
    const [id, prueba, opts] = markAsDelivered.mock.calls[0];
    expect(id).toBe('env-1');
    expect(prueba).toMatchObject({ recipientName: 'Ana Gómez', recipientRelationship: 'customer', locationType: 'door' });
    expect(opts).toEqual({ codigo: '4821', cobro: { metodo: 'cash', monto: 128900 } });
    await waitFor(() => expect(avisarCliente).toHaveBeenCalledWith(expect.objectContaining({ source_id: 'wo-1' }), 'entregado'));
    // «Entrega confirmada»: a quién, el dinero de esta entrega y la siguiente parada (sin salir de la pantalla).
    expect(await screen.findByText('Entregado a Ana Gómez')).toBeTruthy();
    expect(screen.getByText('Cobrado en efectivo')).toBeTruthy();
    expect(screen.getByText('$ 150.000')).toBeTruthy();
    expect(screen.getByText('Siguiente parada')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Iniciar ruta a la parada/ })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    // Nunca se consulta la tabla de códigos (solo administradores).
    expect(desdeSupabase).not.toHaveBeenCalledWith('shipment_delivery_codes');
  });

  test('código errado: muestra los intentos restantes y no sale de la pantalla', async () => {
    markAsDelivered.mockResolvedValue({ ok: false, error: 'CODIGO_INVALIDO', intentosRestantes: 4 });
    pintar(<EntregarPantalla shipmentId="env-1" />);
    fireEvent.change(screen.getAllByRole('textbox', { name: /Código de entrega \d/ })[0], { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Exacto' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar entrega/ }));
    expect(await screen.findByText('Código incorrecto. Te quedan 4 intentos.')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  test('sin contraentrega: no hay código ni cobro; sin foto ni firma no se confirma', async () => {
    parada.envio = { ...contraentrega, cod_amount: 0, cod_status: null, delivery_code_required: false };
    pintar(<EntregarPantalla shipmentId="env-1" />);
    expect(screen.queryAllByRole('textbox', { name: /Código de entrega \d/ })).toHaveLength(0);
    expect(screen.queryByText('2. Cobrar contraentrega')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Firma' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    expect(await screen.findByText('Toma una foto del paquete entregado.')).toBeTruthy();
    expect(markAsDelivered).not.toHaveBeenCalled();
  });
});
