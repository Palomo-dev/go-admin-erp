/** @jest-environment jsdom */
/**
 * Parada (siguiente paso con la RPC y aviso «en camino»; WhatsApp y Cómo llegar), No se pudo
 * entregar (motivo, fecha reprogramada, devolver) y Fin de jornada (resumen y cierre por el
 * servidor). En los cuatro idiomas sin claves faltantes.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ resolveFor: () => ({ timezone: 'America/Bogota' }) }),
  useFormatDate: () => ({ getToday: () => '2026-11-22', timezone: 'America/Bogota' }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branches: [], branchFilter: null }) }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn() }));

const changeStatus = jest.fn();
const registerFailedAttempt = jest.fn();
jest.mock('@/lib/services/deliveryIntegrationService', () => ({
  EnvioError: class extends Error {},
  deliveryIntegrationService: {
    changeStatus: (...a: unknown[]) => changeStatus(...a),
    registerFailedAttempt: (...a: unknown[]) => registerFailedAttempt(...a),
  },
}));
jest.mock('@/lib/services/logistica/misEnviosService', () => ({ subirImagenEnvio: jest.fn(), cuadresDesde: jest.fn(async () => []) }));
const avisarCliente = jest.fn();
const cerrarJornada = jest.fn();
jest.mock('../../logisticaApi', () => ({
  avisarCliente: (...a: unknown[]) => avisarCliente(...a),
  cerrarJornada: (...a: unknown[]) => cerrarJornada(...a),
}));

const base = {
  id: 'env-1',
  organization_id: 120,
  driver_id: 'drv-1',
  shipment_number: 'WO-000419',
  status: 'picked',
  source_type: 'web_order',
  source_id: 'wo-9',
  branch_id: 3,
  delivery_address: 'Calle 53 #9-11, apto 302',
  delivery_city: 'Bogotá',
  delivery_contact_name: 'Camila Torres',
  delivery_contact_phone: '3001234567',
  cod_amount: 45900,
  cod_status: 'pending',
  delivery_code_required: true,
  picked_at: '2026-11-22T17:41:00Z',
  shipping_fee: 6000,
  shipment_items: [{ id: 'i1', description: 'Tenis urbano blanco · 39', qty: 1, total_value: 39900 }],
  created_at: '2026-11-22T12:00:00Z',
};
const parada = { orgId: 120, driver: { id: 'drv-1' }, envio: base as Record<string, unknown>, estado: 'listo', recargar: jest.fn() };
const ruta = {
  orgId: 120,
  driver: { id: 'drv-1', full_name: 'Luisa Martínez' },
  envios: [
    { ...base, id: 'a', status: 'delivered', delivered_at: '2026-11-22T15:00:00Z', cod_status: 'collected', cod_collected_method: 'cash', cod_collected_amount: 45900, cod_collected_at: '2026-11-22T15:00:00Z' },
    { ...base, id: 'b', status: 'failed_attempt', expected_delivery_date: '2026-11-23' },
  ],
  estado: 'listo',
  recargar: jest.fn(),
  hoy: '2026-11-22',
  timezone: 'America/Bogota',
  zonaDe: () => 'America/Bogota',
};
jest.mock('../useMiRuta', () => ({ useParada: () => parada, useMiRuta: () => ruta }));

import { ParadaPantalla } from '../ParadaPantalla';
import { NovedadPantalla } from '../NovedadPantalla';
import { FinJornadaPantalla } from '../FinJornadaPantalla';

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
  parada.envio = base;
});

describe.each(Object.keys(IDIOMAS) as (keyof typeof IDIOMAS)[])('cuatro idiomas: %s', (locale) => {
  test('parada, novedad y fin de jornada sin claves faltantes', () => {
    expect(pintar(<ParadaPantalla shipmentId="env-1" />, locale)).toEqual([]);
  });
  test('novedad', () => {
    expect(pintar(<NovedadPantalla shipmentId="env-1" />, locale)).toEqual([]);
  });
  test('fin de jornada', () => {
    expect(pintar(<FinJornadaPantalla />, locale)).toEqual([]);
  });
});

describe('Parada', () => {
  test('llamar, WhatsApp con mensaje y cómo llegar por dirección; contraentrega y código a pedir', () => {
    pintar(<ParadaPantalla shipmentId="env-1" />);
    expect(screen.getByRole('link', { name: 'Llamar' }).getAttribute('href')).toBe('tel:3001234567');
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe(
      'https://wa.me/573001234567?text=Hola%2C%20soy%20el%20domiciliario%20de%20tu%20pedido%20WO-000419.',
    );
    expect(screen.getByRole('link', { name: 'Cómo llegar' }).getAttribute('href')).toContain('destination=Calle%2053');
    expect(screen.getByText('Cobra al entregar $ 45.900')).toBeTruthy();
    expect(screen.getByText(/código de entrega de 4 dígitos/)).toBeTruthy();
  });

  test('«Iniciar ruta» llama la RPC y avisa al cliente con el aviso que devuelve la base', async () => {
    changeStatus.mockResolvedValue({ status: 'out_for_delivery', aviso: 'en_camino' });
    pintar(<ParadaPantalla shipmentId="env-1" />);
    fireEvent.click(screen.getByRole('button', { name: /^Iniciar ruta$/ }));
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith('env-1', 'out_for_delivery', {}));
    expect(avisarCliente).toHaveBeenCalledWith(expect.objectContaining({ source_id: 'wo-9' }), 'en_camino');
  });

  test('en camino: «Entregar» lleva a Entregar y «No se pudo entregar» abre la hoja de novedad sobre la parada', async () => {
    parada.envio = { ...base, status: 'out_for_delivery' };
    pintar(<ParadaPantalla shipmentId="env-1" />);
    expect(screen.getByRole('link', { name: /^Entregar$/ }).getAttribute('href')).toBe('/app/logistica/mis-envios/env-1/entregar');
    fireEvent.click(screen.getByRole('button', { name: /No se pudo entregar/ }));
    expect(await screen.findByRole('button', { name: 'Guardar y seguir con la ruta' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Cliente ausente/ })).toBeTruthy();
  });
});

describe('No se pudo entregar', () => {
  test('motivo «Rechazado» sugiere devolver: registra la novedad sin fecha y luego devuelve', async () => {
    registerFailedAttempt.mockResolvedValue({ intento: 1, aviso: 'novedad' });
    changeStatus.mockResolvedValue({ status: 'returned', aviso: null });
    pintar(<NovedadPantalla shipmentId="env-1" />);
    fireEvent.click(screen.getByRole('radio', { name: /Rechazado/ }));
    expect(screen.getByRole('radio', { name: 'Devolver a la sede' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir con la ruta' }));
    await waitFor(() => expect(registerFailedAttempt).toHaveBeenCalled());
    expect(registerFailedAttempt.mock.calls[0][1]).toMatchObject({ reasonCode: 'rejected', rescheduleDate: undefined });
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith('env-1', 'returned', expect.any(Object)));
  });

  test('«Mañana» reprograma al día siguiente en la zona de la sede', async () => {
    registerFailedAttempt.mockResolvedValue({ intento: 1, aviso: 'novedad' });
    pintar(<NovedadPantalla shipmentId="env-1" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Mañana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir con la ruta' }));
    await waitFor(() => expect(registerFailedAttempt).toHaveBeenCalled());
    const [, datos] = registerFailedAttempt.mock.calls[0];
    expect(datos.reasonCode).toBe('not_home');
    expect(datos.rescheduleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  test('«Otro» exige nota', () => {
    pintar(<NovedadPantalla shipmentId="env-1" />);
    fireEvent.click(screen.getByRole('radio', { name: /^Otro/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir con la ruta' }));
    expect(screen.getByText('Escribe qué pasó.')).toBeTruthy();
    expect(registerFailedAttempt).not.toHaveBeenCalled();
  });
});

describe('Fin de jornada', () => {
  test('resumen del día y cierre por el servidor', async () => {
    cerrarJornada.mockResolvedValue({ ok: true });
    pintar(<FinJornadaPantalla />);
    expect(screen.getByText('Efectivo · 1 envío')).toBeTruthy();
    expect(screen.getAllByText('$ 45.900').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Enviar resumen para el cuadre/ }));
    expect(await screen.findByText(/^Resumen enviado · /)).toBeTruthy();
    expect(cerrarJornada).toHaveBeenCalledTimes(1);
    // Estado del cuadre: aún sin recibir en la sede.
    expect(await screen.findByText('Por recibir')).toBeTruthy();
    expect(screen.getByText('Dinero recibido en la sede')).toBeTruthy();
  });
});
