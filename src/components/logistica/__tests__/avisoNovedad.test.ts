/**
 * Aviso al cliente desde Logística: «novedad» va a la misma ruta que «en camino»
 * (`/api/web-orders/[id]/aviso-estado`) con `{ momento: 'novedad' }`; «en camino» y «entregado»
 * siguen con `{ estado }`. Sin pedido web no se llama a nada.
 */
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120 }));

import { avisarCliente } from '../logisticaApi';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

const pedido = { source_type: 'web_order', source_id: 'wo-1' };

test('novedad: momento novedad, nunca un motivo del navegador', async () => {
  await expect(avisarCliente(pedido, 'novedad')).resolves.toBe(true);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/web-orders/wo-1/aviso-estado');
  expect(JSON.parse(init.body)).toEqual({ momento: 'novedad' });
  expect(init.headers['x-organization-id']).toBe('120');
});

test('en camino y entregado: condición de estado del pedido', async () => {
  await avisarCliente(pedido, 'en_camino');
  await avisarCliente(pedido, 'entregado');
  expect(fetchMock.mock.calls.map(([, i]) => JSON.parse(i.body))).toEqual([{ estado: 'in_delivery' }, { estado: 'delivered' }]);
});

test('sin pedido web o sin aviso conocido no se llama a la ruta', async () => {
  await expect(avisarCliente({ source_type: 'sale', source_id: 's-1' }, 'novedad')).resolves.toBe(false);
  await expect(avisarCliente(pedido, null)).resolves.toBe(false);
  await expect(avisarCliente(pedido, 'otra_cosa')).resolves.toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('un aviso que falla no lanza', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ code: 'ERROR' }) });
  await expect(avisarCliente(pedido, 'novedad')).resolves.toBe(false);
});
