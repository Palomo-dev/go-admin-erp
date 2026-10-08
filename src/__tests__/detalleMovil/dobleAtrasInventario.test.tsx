/**
 * @jest-environment jsdom
 *
 * Inventario › orden de compra en celular (390 px): una sola «←», la del
 * MobileHeader del shell. El número, el estado y «Editar»/«Enviar» siguen a la
 * vista; solo el botón «← Volver» propio pasa a lg.
 */
import { screen, waitFor } from '@testing-library/react';
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular } from '@/test-utils/dobleAtrasMovil';
import { contextoMoneda } from '@/lib/utils/moneda';

const COP = { ...contextoMoneda('COP', { locale: 'es-CO' }), formatear: String, paraDocumento: () => contextoMoneda('COP', { locale: 'es-CO' }), resuelta: true };

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/inventario/ordenes-compra/oc-1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 1 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ timezone: 'America/Bogota' }),
  useFormatDate: () => ({
    formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : ''),
    formatDateTime: (v: string | null | undefined) => (v ? String(v) : ''),
    getToday: () => '2026-10-08',
  }),
}));
jest.mock('@/lib/supabase/config', () => {
  // Factura y cuenta por pagar vinculadas: ninguna.
  const consulta: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit']) consulta[m] = () => consulta;
  consulta.single = async () => ({ data: null, error: null });
  consulta.maybeSingle = async () => ({ data: null, error: null });
  return { supabase: consulta };
});
jest.mock('@/lib/services/purchaseOrderService', () => ({
  purchaseOrderService: {
    getPurchaseOrderByUuid: jest.fn(async () => ({
      data: {
        id: 15,
        uuid: 'oc-1',
        status: 'draft',
        created_at: '2026-10-08T13:00:00Z',
        total: 0,
        currency: 'COP',
        items: [],
        suppliers: { name: 'Proveedor de prueba' },
      },
      error: null,
    })),
  },
}));

import { OrdenCompraDetalle } from '@/components/inventario/ordenes-compra/detalle/OrdenCompraDetalle';

afterEach(() => simularAncho(1440));

describe('Inventario › orden de compra en celular (390 px): una sola «←»', () => {
  test('número, estado y «Editar» a la vista', async () => {
    renderEnCelular(<OrdenCompraDetalle orderUuid="oc-1" />);
    await screen.findByRole('heading', { level: 1, name: 'OC-15' });
    await waitFor(() => comprobarDetalleMovil('OC-15', ['Borrador', 'Editar']));
    expect(cabeceraPublicada()?.volverA).toBe('/app/inventario/ordenes-compra');
  });
});
