/**
 * @jest-environment jsdom
 *
 * Finanzas › detalles en celular (390 px): una sola «←», la del MobileHeader
 * del shell. La cotización y el egreso conservan número, estado y acciones
 * (imprimir, PDF, duplicar, anular); solo su «←» pasa a lg. Las demás
 * pantallas de finanzas usan el mismo cambio y las cubre el guardarraíl 44.
 */
import { screen } from '@testing-library/react';
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, esperarUnaSolaFlecha, renderEnCelular, visibleEnCelular } from '@/test-utils/dobleAtrasMovil';
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
  useFormatDate: () => ({ formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : ''), formatDateTime: (v: string | null | undefined) => (v ? String(v) : ''), formatPlain: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : ''), getToday: () => '2026-10-15' }),
}));
jest.mock('@/components/shared/HtmlContentRenderer', () => ({ HtmlContentRenderer: () => null }));
// Permisos del servidor: con «crear», el detalle de la cotización muestra su primaria.
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => ({ ver: true, crear: true, anular: true, aprobar: false, posVer: false, posCrear: false, posAnular: false, cargando: false }),
}));
jest.mock('@/lib/services/movimientosService', () => ({
  movimientosService: {
    getMovementByUuid: jest.fn(async () => ({ id: 71, uuid: 'm1', source: 'cash', concept: 'Compra de insumos', amount: 50000, created_at: '2026-10-08T13:00:00Z' })),
    getAnulacion: jest.fn(async () => null),
  },
}));

import { DetalleCotizacion } from '@/components/finanzas/cotizaciones/id/DetalleCotizacion';
import { EgresoDetalle } from '@/components/finanzas/egresos/EgresoDetalle';
import type { CotizacionDetalle } from '@/lib/finanzas/ventas/contratoCotizaciones';

afterEach(() => simularAncho(1440));

describe('Finanzas › detalles en celular (390 px): una sola «←»', () => {
  test('cotización: número, estado y acciones a la vista', () => {
    // Detalle v2 (Finanzas R3, Figma `1022:94293`): «Convertir en factura» es la
    // primaria de una enviada y «Imprimir» pasó al menú «⋯» (antes era un botón suelto).
    const cotizacion = {
      id: 'q1',
      number: 'COT-0007',
      status: 'sent',
      stored_status: 'sent',
      currency: 'COP',
      total: 100000,
      subtotal: 100000,
      tax_total: 0,
      discount_total: 0,
      issue_date: '2026-10-01',
      valid_until: '2026-10-31',
      branch_id: null,
      customer_id: '',
      converted_invoice_id: null,
      opportunity_id: null,
      customers: null,
      quotation_items: [],
    } as unknown as CotizacionDetalle;
    renderEnCelular(<DetalleCotizacion cotizacion={cotizacion} />);
    // Cabecera del kit (`DocumentoCabecera`): en celular no dibuja «←»; el título va al MobileHeader.
    esperarUnaSolaFlecha();
    expect(cabeceraPublicada()?.titulo).toBe('Cotización COT-0007');
    expect(screen.getAllByText('Enviada').some(visibleEnCelular)).toBe(true);
    // Con `movil.accionesEnFila` el botón existe en la cabecera de escritorio (oculta por
    // debajo de lg) y en la fila móvil: basta con que esté al menos una vez.
    expect(screen.getAllByRole('button', { name: /Convertir en factura/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /COT-0007/ }).length).toBeGreaterThan(0);
    expect(cabeceraPublicada()?.volverA).toBe('/app/finanzas/cotizaciones');
  });

  test('egreso: número, «Confirmado» y acciones a la vista', async () => {
    // Cabecera del kit (`PageHeader`, Finanzas ronda 2 · G2): en celular no se dibuja; el título y el
    // menú «⋯» (Duplicar, Anular) van al MobileHeader y el estado queda bajo la cabecera.
    renderEnCelular(<EgresoDetalle id="m1" />);
    await screen.findByText('Confirmado');
    esperarUnaSolaFlecha();
    expect(cabeceraPublicada()?.titulo).toBe('Egreso #71');
    expect(cabeceraPublicada()?.accion).toBeTruthy();
    expect(visibleEnCelular(screen.getByText('Confirmado'))).toBe(true);
    expect(cabeceraPublicada()?.volverA).toBe('/app/finanzas/egresos');
  });
});
