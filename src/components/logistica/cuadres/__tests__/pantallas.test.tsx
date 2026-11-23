/** @jest-environment jsdom */
/**
 * Pantallas Cuadres y Domiciliarios con datos: los cuatro idiomas sin claves faltantes, la pestaña
 * de transportadoras deshabilitada con su aviso, las filas «por recibir» y el estado de cada
 * domiciliario (libre, en ruta, fuera de turno) con su carga del día.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

const lineasCuadre = { data: [], error: null };
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ in: async () => lineasCuadre }) }) }),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async () => ({ data: null }),
  },
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120, name: 'Org 120' } }), getOrganizationId: () => 120 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    getToday: () => '2026-11-22',
    timezone: 'America/Bogota',
    formatDate: (v: string) => v.slice(0, 10),
    formatTime: () => '10:00',
  }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], branchFilter: 3, selectedBranchId: 3, isLoading: false }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn() }));

jest.mock('@/lib/services/logistica/cuadresDomiciliarioService', () => ({
  CuadreError: class extends Error {},
  anularCuadre: jest.fn(),
  listarCuadres: jest.fn(async () => [
    {
      id: 'c1', branch_id: 3, driver_id: 'd3', status: 'closed', expected_total: 182000, received_total: 178000, difference: -4000,
      expected_by_method: { cash: 182000 }, received_by_method: { cash: 178000 }, difference_reason: 'Cambio de más',
      accounting_status: 'pending_accountant', opened_at: '2026-11-22T12:00:00Z', closed_at: '2026-11-22T13:00:00Z',
    },
  ]),
  pendientesPorCuadrar: jest.fn(async () => [
    { id: 's1', shipment_number: 'WO-1', driver_id: 'd1', branch_id: 3, cod_amount: 128900, cod_collected_amount: 128900, cod_collected_method: 'cash', cod_collected_at: '2026-11-22T15:00:00Z' },
  ]),
}));
const domiciliarios = [
  { id: 'd1', full_name: 'Luisa Martínez', branch_id: 3, is_active: true, is_external: true, phone: '3152204187', metadata: {} },
  { id: 'd2', full_name: 'Andrés Pérez', branch_id: 3, is_active: true, is_external: true, phone: null, metadata: { fin_jornada_at: '2026-11-22T23:00:00Z' } },
  { id: 'd3', full_name: 'Jhon Ramírez', branch_id: null, is_active: true, is_external: false, phone: null, metadata: { cobra_contraentrega: false } },
];
jest.mock('@/lib/services/logistica/domiciliariosService', () => ({
  listarDomiciliarios: jest.fn(async () => domiciliarios),
  enviosDeCarga: jest.fn(async () => [
    { id: 'e1', shipment_number: 'WO-1', driver_id: 'd1', status: 'out_for_delivery', delivered_at: null, cod_status: 'pending', cod_collected_amount: null, updated_at: '' },
    { id: 'e2', shipment_number: 'WO-2', driver_id: 'd1', status: 'delivered', delivered_at: '2026-11-22T15:00:00Z', cod_status: 'collected', cod_collected_amount: 50000, updated_at: '' },
  ]),
}));
jest.mock('../../logisticaApi', () => ({
  LogisticaApiError: class extends Error {},
  leerCandidatos: jest.fn(async () => ({ empleados: [], miembros: [] })),
  cambiarActivoDomiciliario: jest.fn(),
  registrarDomiciliario: jest.fn(),
}));

import { CuadresPantalla } from '../CuadresPantalla';
import { DomiciliariosPantalla } from '../../domiciliarios/DomiciliariosPantalla';

const IDIOMAS = { es, en, fr, pt } as const;
function pintar(ui: ReactElement, locale: keyof typeof IDIOMAS = 'es') {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return errores;
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: true, media: q, onchange: null, addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn() }),
  });
});

describe.each(Object.keys(IDIOMAS) as (keyof typeof IDIOMAS)[])('%s', (locale) => {
  test('Cuadres sin claves faltantes', async () => {
    const errores = pintar(<CuadresPantalla />, locale);
    await screen.findAllByText(/Luisa Martínez/);
    expect(errores).toEqual([]);
  });
  test('Domiciliarios sin claves faltantes', async () => {
    const errores = pintar(<DomiciliariosPantalla />, locale);
    await screen.findAllByText(/Luisa Martínez/);
    expect(errores).toEqual([]);
  });
});

test('Cuadres: transportadoras deshabilitada con aviso; cobros por recibir y cuadre con diferencia', async () => {
  pintar(<CuadresPantalla />);
  const pestana = screen.getByRole('tab', { name: /Transportadoras y terceros · Fase 2–3/ }) as HTMLButtonElement;
  expect(pestana.disabled || pestana.getAttribute('aria-disabled') === 'true').toBe(true);
  expect(screen.getByText(/llegan en las fases 2 y 3/)).toBeTruthy();
  await screen.findAllByText('Jhon Ramírez');
  // Etiqueta del KPI + insignia de la fila.
  expect(screen.getAllByText('Por recibir').length).toBeGreaterThan(1);
  expect(screen.getAllByText('Con diferencia').length).toBeGreaterThan(1);
  expect(screen.getAllByText('Faltan $ 4.000').length).toBeGreaterThan(0);
});

test('Domiciliarios: estado y carga del día', async () => {
  pintar(<DomiciliariosPantalla />);
  await screen.findAllByText('Luisa Martínez');
  expect(screen.getAllByText('En ruta').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Fuera de turno').length).toBeGreaterThan(0);
  expect(screen.getAllByText('1 de 2 entregados').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/No cobra contraentrega/).length).toBeGreaterThan(0);
});
