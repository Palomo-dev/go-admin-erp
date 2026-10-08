/**
 * @jest-environment jsdom
 *
 * Integraciones › detalles en celular (390 px): una sola «←», la del
 * MobileHeader del shell. Credenciales y Webhooks de una conexión y el detalle
 * de un evento conservan título, estado y datos; solo su «←» pasa a lg.
 * (El detalle de la conexión dibuja la cabecera en la propia página, que
 * carga datos: lo cubre el guardarraíl 44 de `guardrails.test.ts`.)
 */
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular } from '@/test-utils/dobleAtrasMovil';

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/integraciones',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '') }),
}));

import { CredentialsHeader } from '@/components/integraciones/conexiones/id/credenciales/CredentialsHeader';
import { WebhooksHeader } from '@/components/integraciones/conexiones/id/webhooks/WebhooksHeader';
import { EventDetail } from '@/components/integraciones/eventos/id/EventDetail';
import type { IntegrationConnection, IntegrationEvent } from '@/lib/services/integrationsService';

const nada = () => undefined;
const conexion = { id: 'cx1', name: 'Pasarela principal', status: 'connected' } as unknown as IntegrationConnection;

afterEach(() => simularAncho(1440));

describe('Integraciones › detalles en celular (390 px): una sola «←»', () => {
  test('credenciales de la conexión', () => {
    renderEnCelular(
      <CredentialsHeader connection={conexion} credentialsCount={2} activeCount={2} refreshing={false} onRefresh={nada} onNewCredential={nada} />,
    );
    comprobarDetalleMovil('Credenciales', ['2 activas', 'Pasarela principal • Gestión de credenciales']);
    expect(cabeceraPublicada()?.volverA).toBe('/app/integraciones/conexiones/cx1');
  });

  test('webhooks de la conexión', () => {
    renderEnCelular(
      <WebhooksHeader connection={conexion} webhooksCount={1} activeCount={1} refreshing={false} onRefresh={nada} onNewWebhook={nada} />,
    );
    comprobarDetalleMovil('Webhooks', ['1 activo', 'Pasarela principal • Gestión de webhooks']);
  });

  test('detalle del evento: tipo, conexión y estado a la vista', () => {
    const evento = {
      id: 'e1',
      connection_id: 'cx1',
      event_type: 'payment.approved',
      direction: 'inbound',
      source: 'webhook',
      status: 'processed',
      payload: { ok: true },
      created_at: '2026-10-01T15:00:00Z',
      processed_at: '2026-10-01T15:00:02Z',
      connection: conexion,
    } as unknown as IntegrationEvent;
    renderEnCelular(<EventDetail event={evento} onReprocess={nada} />);
    comprobarDetalleMovil('payment.approved', ['Pasarela principal • webhook']);
    expect(cabeceraPublicada()?.subtitulo).toBe('Pasarela principal');
  });
});
