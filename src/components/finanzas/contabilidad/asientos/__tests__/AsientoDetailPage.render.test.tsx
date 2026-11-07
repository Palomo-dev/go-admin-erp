/**
 * @jest-environment jsdom
 *
 * Detalle de asiento (Figma 985:66805 automático · 985:68446 manual · 985:69884
 * contra-asiento · 985:71310 no encontrado): qué acciones ve cada tipo. Un
 * automático no se revierte ni se duplica aquí; un manual publicado sí, con el
 * permiso; un contra-asiento no se duplica. Servicio simulado; datos inventados.
 */
import { screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { AsientoDetailPage } from '../AsientoDetailPage';

type Asiento = Record<string, unknown>;
let mockAsiento: Asiento | null = null;
let mockReversion = { revertidoPor: null as number | null, reversionDe: null as number | null };
let mockPuedeRevertir = true;

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/asientos/1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => {
  const fns = {
    formatDate: (v: string) => String(v).slice(0, 10),
    formatDateTime: (v: string) => String(v),
    toDate: () => '2026-09-27',
    getToday: () => '2026-09-28',
  };
  return { useFormatDate: () => fns, useFormatDateFor: () => fns };
});
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('../OrigenCompraAsiento', () => ({ OrigenCompraAsiento: () => null }));
jest.mock('../../ContabilidadService', () => ({
  ContabilidadService: {
    obtenerAsiento: jest.fn(async () => mockAsiento),
    obtenerReversion: jest.fn(async () => mockReversion),
    centrosDeCosto: jest.fn(async () => new Map()),
    puedeRevertir: jest.fn(async () => mockPuedeRevertir),
    nombreSucursal: jest.fn(async () => 'Principal'),
    nombreUsuario: jest.fn(async () => 'Persona de prueba'),
    motivoReversa: jest.fn(async () => 'el gasto se registró dos veces'),
    periodoAbierto: jest.fn(async () => true),
  },
}));

const lineas = [
  { id: 1, journal_entry_id: 1, account_code: '53050501', description: 'Comisiones', debit: 250000, credit: 0, account: { name: 'Gastos bancarios' } },
  { id: 2, journal_entry_id: 1, account_code: '11100501', description: 'Cuenta corriente', debit: 0, credit: 250000, account: { name: 'Bancos nacionales' } },
];
const asiento = (cambio: Asiento): Asiento => ({
  id: 9560,
  organization_id: 10,
  branch_id: 3,
  entry_date: '2026-09-27T15:00:00Z',
  memo: 'Gastos bancarios de septiembre',
  posted: true,
  source: 'manual',
  source_id: null,
  created_by: null,
  created_at: '2026-09-27T15:00:00Z',
  updated_at: '2026-09-27T15:00:00Z',
  lines: lineas,
  ...cambio,
});

beforeEach(() => {
  simularAncho(1440);
  mockReversion = { revertidoPor: null, reversionDe: null };
  mockPuedeRevertir = true;
});

describe('Detalle de asiento', () => {
  it('manual publicado: Revertir y Duplicar, y la tabla con totales', async () => {
    mockAsiento = asiento({});
    renderConIdioma(<AsientoDetailPage entryId={9560} />);
    expect(await screen.findByRole('button', { name: /Revertir/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Duplicar/ })).toBeTruthy();
    expect(screen.getAllByText('Totales').length).toBeGreaterThan(0);
    await waitFor(() => expect((screen.getByRole('button', { name: /Revertir/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('manual sin permiso: Revertir deshabilitado con motivo', async () => {
    mockPuedeRevertir = false;
    mockAsiento = asiento({});
    renderConIdioma(<AsientoDetailPage entryId={9560} />);
    const boton = (await screen.findByRole('button', { name: /Revertir/ })) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toMatch(/Revertir asientos/);
  });

  it('automático: sin Revertir ni Duplicar, con el aviso y el enlace al documento', async () => {
    mockAsiento = asiento({ source: 'invoice_sales', source_id: '7c1e2b9a-1111-4222-8333-944455556666' });
    renderConIdioma(<AsientoDetailPage entryId={9560} />);
    expect(await screen.findByText('Asiento automático')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Revertir/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Duplicar/ })).toBeNull();
    const enlace = screen.getByRole('link', { name: /Ir a Factura/ });
    expect(enlace.getAttribute('href')).toBe('/app/finanzas/facturas-venta/7c1e2b9a-1111-4222-8333-944455556666');
  });

  it('contra-asiento: sin Duplicar ni Revertir, con «Ver original» y el motivo', async () => {
    mockAsiento = asiento({ id: 9577, source: 'reversal', source_id: '9560' });
    mockReversion = { revertidoPor: null, reversionDe: 9560 };
    renderConIdioma(<AsientoDetailPage entryId={9577} />);
    expect(await screen.findByRole('link', { name: 'Ver original' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Duplicar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revertir/ })).toBeNull();
    expect((await screen.findAllByText(/el gasto se registró dos veces/)).length).toBeGreaterThan(0);
  });

  it('no encontrado: estado propio en vez de redirigir', async () => {
    mockAsiento = null;
    renderConIdioma(<AsientoDetailPage entryId={123} />);
    expect(await screen.findByText('Asiento no encontrado')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver al libro diario' }).getAttribute('href')).toBe('/app/finanzas/contabilidad/asientos');
  });
});
