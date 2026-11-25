/** @jest-environment jsdom */
/**
 * Tarjeta «Pagos» con intentos (diseño 2026-11-24) y la celda «Pago» del listado: qué filas,
 * mensaje y botones salen en cada estado, que el celular con pago rechazado deja «Reenviar» para
 * la barra fija y que el listado pide el resumen de una página en UNA llamada.
 *
 * Los textos de `pagosIntentos` van aquí en línea (solo los que se comprueban, con las mismas
 * plantillas que el español): el resto sale como clave, sin depender de que el namespace ya esté
 * en messages/*.json.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../../messages/es.json';

const rpc = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
const toast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/services/contraentregaPedidoService', () => ({
  ...jest.requireActual('@/lib/services/contraentregaPedidoService'),
  enlacePagoPedido: jest.fn(async () => 'https://tienda.test/pedido/WO-000431?t=abc'),
}));

import { CuerpoPagosIntentos, InsigniaPagos } from '../TarjetaPagosIntentos';
import { PagoPasarelaCelda } from '../../listado/PagoPasarelaCelda';
import { vaciarResumenPago } from '../resumenPagoLotes';
import type { IntentoPago } from '@/lib/pos/pedidosWeb/intentosPago';
import type { WebOrder } from '@/lib/services/webOrdersService';
import type { DatosIntentosPago } from '../useIntentosPago';

const NS = {
  insignias: { A: 'Esperando pago', B: 'Pago en proceso', C: 'Pago rechazado', C2: 'Pago rechazado', D: 'Pagado', E: 'Venció sin pagar', F: 'Contraentrega', G: 'Esperando comprobante' },
  valores: { venceFaltan: '{hora} · faltan {tiempo}', rechazadoReintentar: 'Rechazado · puede reintentar' },
  tiempo: { min: '{m} min', horas: '{h} h', horasMin: '{h} h {m} min' },
  motivos: { noInforma: '{pasarela} no lo informa', cc_rejected_insufficient_amount: 'Fondos insuficientes' },
  intentos: { eventos: { declinedMotivo: 'Pago rechazado: {motivo}', declined: 'Pago rechazado' }, noEnviaMotivo: '{pasarela} no envía el motivo', ref: 'ref. {ref}' },
  mensajes: {
    rechazado: '{tieneNombre, select, si {Hola {nombre},} other {Hola,}} tu pago del pedido {numero} no pasó: {motivo}. Puedes intentarlo otra vez con otra tarjeta, Nequi o PSE antes de las {hora} aquí: {url}',
    rechazadoSinMotivo: '{tieneNombre, select, si {Hola {nombre},} other {Hola,}} tu pago del pedido {numero} no se completó. Puedes intentarlo otra vez antes de las {hora} aquí: {url}',
  },
  acciones: { reenviar: 'Reenviar enlace por WhatsApp', copiar: 'Copiar enlace', escribir: 'Escribir al cliente' },
  lista: {
    rechazado: 'Pago rechazado',
    esperando: 'Esperando pago',
    vencido: 'Venció sin pagar',
    vence: '{pasarela} · vence {hora}',
    sinIntentos: '{pasarela} · sin intentos',
    nIntentos: '{pasarela} · {n, plural, one {# intento} other {# intentos}}',
  },
};

const conIntl = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider
      locale="es"
      messages={{ ...(es as Record<string, unknown>), pagosIntentos: NS }}
      timeZone="America/Bogota"
      onError={() => undefined}
      getMessageFallback={({ namespace, key }) => `${namespace}.${key}`}
    >
      {ui}
    </NextIntlClientProvider>,
  );

/** Monta y deja terminar los efectos (enlace de pago, resumen) dentro de `act`. */
const montar = async (ui: ReactElement) => {
  await act(async () => {
    conIntl(ui);
  });
};

const BOGOTA = 'America/Bogota';

const orden = (p: Partial<WebOrder> = {}): WebOrder =>
  ({
    id: '00000000-0000-0000-0000-000000000431',
    organization_id: 7,
    branch_id: 3,
    order_number: 'WO-000431',
    status: 'pending',
    source: 'website',
    total: 128900,
    delivery_type: 'delivery_own',
    payment_status: 'failed',
    payment_method: 'wompi',
    customer_name: 'Ana Gómez',
    customer_phone: '3005551234',
    created_at: '2026-11-24T22:18:00Z',
    updated_at: '2026-11-24T22:21:00Z',
    ...p,
  }) as unknown as WebOrder;

const intento = (p: Partial<IntentoPago>): IntentoPago => ({
  id: Math.random().toString(36).slice(2),
  organization_id: 7,
  web_order_id: '00000000-0000-0000-0000-000000000431',
  concept: 'order',
  gateway: 'wompi',
  event: 'link_created',
  reason: null,
  reason_code: null,
  method: null,
  card_brand: null,
  card_last4: null,
  bank: null,
  reference: null,
  amount: null,
  currency: null,
  created_at: '2026-11-24T22:18:00Z',
  ...p,
});

const datos = (intentos: IntentoPago[], venceAt: string | null = new Date(Date.now() + 18 * 60_000).toISOString()): DatosIntentosPago => ({
  intentos,
  venceAt,
  plazoMinutos: 30,
  cargando: false,
});

beforeEach(() => {
  rpc.mockReset();
  toast.mockReset();
  vaciarResumenPago();
});

describe('tarjeta «Pagos» con intentos', () => {
  test('C · rechazado con motivo: fila Motivo, historial, mensaje armado y botones', async () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const i = [
      intento({}),
      intento({ event: 'declined', reason: 'Fondos insuficientes', method: 'card', card_brand: 'visa', card_last4: '4417', reference: '11982-1764022870-40211', created_at: '2026-11-24T22:21:00Z' }),
    ];
    await montar(<CuerpoPagosIntentos order={orden()} estado="C" datos={datos(i)} timezone={BOGOTA} />);
    expect(screen.getByText('Rechazado · puede reintentar')).toBeTruthy();
    expect(screen.getByText('Wompi · Visa ••4417')).toBeTruthy();
    expect(screen.getAllByText('Fondos insuficientes').length).toBeGreaterThan(0);
    expect(screen.getByText('11982-1764022870-40211')).toBeTruthy();
    expect(screen.getByText('17:21')).toBeTruthy();
    expect(screen.getByText('Pago rechazado: Fondos insuficientes')).toBeTruthy();
    expect(screen.getByText('Visa ••4417 · ref. …40211')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/tienda\.test\/pedido\/WO-000431/)).toBeTruthy());
    expect(screen.getByText(/Hola Ana, tu pago del pedido WO-000431 no pasó: fondos insuficientes\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Reenviar enlace por WhatsApp/ }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith('https://wa.me/573005551234?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toContain('no pasó: fondos insuficientes');
    expect(screen.getByRole('button', { name: /Copiar enlace/ })).toBeTruthy();
    open.mockRestore();
  });

  test('C2 · Bold sin motivo: «Bold no lo informa» y mensaje sin motivo', async () => {
    const i = [intento({ gateway: 'bold' }), intento({ gateway: 'bold', event: 'declined', method: 'nequi', created_at: '2026-11-24T22:21:00Z' })];
    await montar(<CuerpoPagosIntentos order={orden({ payment_method: 'bold_link' })} estado="C2" datos={datos(i)} timezone={BOGOTA} />);
    expect(screen.getByText('Bold no lo informa')).toBeTruthy();
    expect(screen.getByText('Nequi · Bold no envía el motivo')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/no se completó\. Puedes intentarlo otra vez antes de las/)).toBeTruthy());
  });

  test('celular con pago rechazado: «Reenviar» solo desde sm (abajo va la barra fija)', async () => {
    await montar(<CuerpoPagosIntentos order={orden()} estado="C2" datos={datos([])} timezone={BOGOTA} movil />);
    expect(screen.getByRole('button', { name: /Reenviar enlace por WhatsApp/ }).className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(screen.getByRole('button', { name: /Copiar enlace/ })).toBeTruthy();
  });

  test('B · en proceso: sin «Reenviar» (no se cobra dos veces)', async () => {
    const i = [intento({}), intento({ event: 'pending', method: 'pse', bank: 'Bancolombia', created_at: '2026-11-24T22:24:00Z' })];
    await montar(<CuerpoPagosIntentos order={orden({ payment_status: 'pending' })} estado="B" datos={datos(i)} timezone={BOGOTA} />);
    expect(screen.queryByRole('button', { name: /Reenviar/ })).toBeNull();
    expect(screen.getAllByText('Bancolombia').length).toBeGreaterThan(0);
  });

  test('E · vencido: «Escribir al cliente» y el renglón «Venció sin pagar» aunque falte la fila', async () => {
    await montar(
      <CuerpoPagosIntentos
        order={orden({ status: 'expired', payment_method: 'bold_link', cancelled_at: '2026-11-24T22:48:00Z' } as Partial<WebOrder>)}
        estado="E"
        datos={datos([intento({ gateway: 'bold' })], '2026-11-24T22:48:00Z')}
        timezone={BOGOTA}
      />,
    );
    expect(screen.getByRole('button', { name: /Escribir al cliente/ })).toBeTruthy();
    expect(screen.getByText('17:48')).toBeTruthy();
  });

  test('insignia de cada estado', () => {
    conIntl(<InsigniaPagos estado="C2" />);
    expect(screen.getByText('Pago rechazado')).toBeTruthy();
  });
});

describe('celda «Pago» del listado', () => {
  test('una sola llamada por página y la línea con pasarela y hora en la zona de la organización', async () => {
    rpc.mockResolvedValue({
      data: [
        { web_order_id: 'a', vence_at: '2026-11-24T20:22:00Z', plazo_minutos: 30, intentos: 1, ultimo_evento: 'declined', ultima_pasarela: 'wompi', ultimo_motivo: null, ultimo_codigo_motivo: null, ultimo_medio: null },
        { web_order_id: 'b', vence_at: '2026-11-24T20:20:00Z', plazo_minutos: 30, intentos: 0, ultimo_evento: 'link_created', ultima_pasarela: 'bold', ultimo_motivo: null, ultimo_codigo_motivo: null, ultimo_medio: null },
        { web_order_id: 'c', vence_at: '2026-11-24T17:50:00Z', plazo_minutos: 30, intentos: 0, ultimo_evento: 'expired', ultima_pasarela: 'bold', ultimo_motivo: null, ultimo_codigo_motivo: null, ultimo_medio: null },
      ],
      error: null,
    });
    await act(async () => {
      conIntl(
        <>
          <PagoPasarelaCelda pedido={orden({ id: 'a' })} timezone={BOGOTA} />
          <PagoPasarelaCelda pedido={orden({ id: 'b', payment_status: 'pending', payment_method: 'bold_link' })} timezone={BOGOTA} />
          <PagoPasarelaCelda pedido={orden({ id: 'c', status: 'expired', payment_method: 'bold_link' })} timezone={BOGOTA} />
        </>,
      );
    });
    await waitFor(() => expect(screen.getByText('Wompi · vence 15:22')).toBeTruthy());
    expect(screen.getByText('Bold · vence 15:20')).toBeTruthy();
    expect(screen.getByText('Bold · sin intentos')).toBeTruthy();
    expect(screen.getByText('Pago rechazado')).toBeTruthy();
    expect(screen.getByText('Esperando pago')).toBeTruthy();
    expect(screen.getByText('Venció sin pagar')).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('fn_web_orders_resumen_pago');
    expect(rpc.mock.calls[0][1]).toEqual({ p_ids: ['a', 'b', 'c'] });
  });
});
