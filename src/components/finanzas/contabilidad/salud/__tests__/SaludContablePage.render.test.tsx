/**
 * @jest-environment jsdom
 *
 * Salud contable (Figma 987:*): pestañas con contador, Pendientes como primera
 * pestaña (la bandeja existente), Descuadres con su diferencia, «pendiente de
 * activar» si la función no está en la base (nunca un cero) y sin permiso.
 * Servicio simulado; datos inventados.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { SaludContablePage } from '../SaludContablePage';

let mockPestana = 'pendientes';
const mockFijar = jest.fn((v: string) => {
  mockPestana = v;
});
let mockPermisos = { ver: true, cargando: false };
const mockCruce = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/salud',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/components/kit/useParametroUrl', () => {
  const real = jest.requireActual('@/components/kit/useParametroUrl');
  return { ...real, useOpcionUrl: () => [mockPestana, mockFijar] };
});
jest.mock('@/lib/context/OrganizationTimezoneContext', () => {
  const fns = { formatDate: (v: string) => String(v).slice(0, 10), formatTime: () => '10:30', getToday: () => '2026-09-28' };
  return { useFormatDate: () => fns, useOrgTimezone: () => ({ isLoading: false }) };
});
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }) }));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({ usePermisosFinanzas: () => mockPermisos }));
jest.mock('../../pendientes/PendientesContablesPage', () => ({
  PendientesContablesPage: ({ incrustada }: { incrustada?: boolean }) => <div>bandeja de pendientes {incrustada ? 'incrustada' : ''}</div>,
}));
jest.mock('../SaludContableService', () => ({
  SaludContableService: {
    pendientes: jest.fn(async () => 3),
    balance: jest.fn(async () => ({ cuadra: true, diferencia: 0 })),
    cruce: (...a: unknown[]) => mockCruce(...a),
    estructura: jest.fn(async () => ({ agrupadoras: [], reglas: [] })),
  },
}));

beforeEach(() => {
  simularAncho(1440);
  mockPestana = 'pendientes';
  mockPermisos = { ver: true, cargando: false };
  mockCruce.mockReset();
  mockCruce.mockResolvedValue({
    descuadres: [
      { tipo: 'factura', documentoId: 'a1', numero: 'FV-0988', subtipo: 'asiento_distinto', totalDocumento: 119000, totalAsiento: 138000, diferencia: 19000, asientos: [9312] },
    ],
    totalDescuadres: 1,
    huerfanos: [],
    totalHuerfanos: 0,
  });
});

describe('Salud contable', () => {
  it('abre en Pendientes con la bandeja incrustada y cuenta cada pestaña', async () => {
    renderConIdioma(<SaludContablePage />);
    expect(await screen.findByText(/bandeja de pendientes incrustada/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Descuadres/ }).textContent).toContain('1'));
    expect(screen.getByRole('heading', { name: 'Salud contable' })).toBeTruthy();
  });

  it('Descuadres muestra documento, tipo, diferencia y enlace al asiento', async () => {
    mockPestana = 'descuadres';
    renderConIdioma(<SaludContablePage />);
    expect((await screen.findAllByText('Asiento ≠ documento')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^#9.?312$/ })[0].getAttribute('href')).toBe('/app/finanzas/contabilidad/asientos/9312');
    expect(screen.getAllByText(/\+ \$ 19000/).length).toBeGreaterThan(0);
  });

  it('sin la función en la base dice «pendiente de activar» y no muestra cero', async () => {
    mockPestana = 'descuadres';
    mockCruce.mockResolvedValue(null);
    renderConIdioma(<SaludContablePage />);
    expect(await screen.findByText('Revisión pendiente de activar')).toBeTruthy();
    expect(screen.queryByText('Sin descuadres')).toBeNull();
  });

  it('con la función aplicada y sin problemas: vacío revisado en Descuadres y Huérfanos, nunca «pendiente de activar»', async () => {
    mockCruce.mockResolvedValue({ descuadres: [], totalDescuadres: 0, huerfanos: [], totalHuerfanos: 0 });
    mockPestana = 'descuadres';
    const { unmount } = renderConIdioma(<SaludContablePage />);
    expect((await screen.findAllByText('Sin descuadres')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Revisión pendiente de activar')).toBeNull();
    unmount();
    mockPestana = 'huerfanos';
    renderConIdioma(<SaludContablePage />);
    expect((await screen.findAllByText('Sin asientos huérfanos')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Revisión pendiente de activar')).toBeNull();
  });

  it('sin permiso de Finanzas no consulta nada', () => {
    mockPermisos = { ver: false, cargando: false };
    renderConIdioma(<SaludContablePage />);
    expect(screen.getByText('No tienes acceso a la contabilidad')).toBeTruthy();
    expect(mockCruce).not.toHaveBeenCalled();
  });

  it('el KPI de Descuadres lleva a su pestaña', async () => {
    renderConIdioma(<SaludContablePage />);
    await waitFor(() => expect(mockCruce).toHaveBeenCalled());
    const kpis = await screen.findAllByRole('button', { name: /Descuadres/ });
    fireEvent.click(kpis[0]);
    expect(mockFijar).toHaveBeenCalledWith('descuadres');
  });
});
