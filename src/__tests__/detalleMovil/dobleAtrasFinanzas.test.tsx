/**
 * @jest-environment jsdom
 *
 * Finanzas › detalles en celular (390 px): una sola «←», la del MobileHeader
 * del shell. La cotización y el egreso conservan número, estado y acciones
 * (imprimir, PDF, exportar, anular); solo su «←» pasa a lg. Las demás
 * pantallas de finanzas usan el mismo cambio y las cubre el guardarraíl 44.
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
  usePathname: () => '/app/finanzas',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : ''), formatDateTime: (v: string | null | undefined) => (v ? String(v) : '') }),
}));
jest.mock('@/components/shared/HtmlContentRenderer', () => ({ HtmlContentRenderer: () => null }));
jest.mock('@/lib/services/movimientosService', () => ({
  movimientosService: {
    getMovementByUuid: jest.fn(async () => ({ id: 71, uuid: 'm1', source: 'cash', concept: 'Compra de insumos', amount: 50000, created_at: '2026-10-08T13:00:00Z' })),
  },
}));

import { DetalleCotizacion } from '@/components/finanzas/cotizaciones/id/DetalleCotizacion';
import { EgresoDetalle } from '@/components/finanzas/egresos/EgresoDetalle';
import type { Quotation } from '@/lib/services/cotizacionesService';

afterEach(() => simularAncho(1440));

describe('Finanzas › detalles en celular (390 px): una sola «←»', () => {
  test('cotización: número, estado e «Imprimir» a la vista', () => {
    const cotizacion = {
      id: 'q1',
      number: 'COT-0007',
      status: 'sent',
      stored_status: 'sent',
      currency: 'COP',
      total: 100000,
      subtotal: 100000,
      tax_total: 0,
      quote_date: '2026-10-01',
      expiry_date: '2026-10-31',
      customers: null,
      items: [],
    } as unknown as Quotation;
    renderEnCelular(<DetalleCotizacion cotizacion={cotizacion} />);
    comprobarDetalleMovil('Cotización COT-0007', ['Cotización COT-0007', 'Enviada']);
    expect(screen.getByRole('button', { name: /Imprimir/ })).toBeTruthy();
    expect(cabeceraPublicada()?.volverA).toBe('/app/finanzas/cotizaciones');
  });

  test('egreso: número, «Confirmado» y acciones a la vista', async () => {
    renderEnCelular(<EgresoDetalle id="m1" />);
    await screen.findByRole('heading', { level: 1, name: 'Egreso #71' });
    await waitFor(() => comprobarDetalleMovil('Egreso #71', ['Confirmado', 'Exportar', 'Duplicar']));
    expect(cabeceraPublicada()?.volverA).toBe('/app/finanzas/egresos');
  });
});
