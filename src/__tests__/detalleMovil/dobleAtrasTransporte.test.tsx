/**
 * @jest-environment jsdom
 *
 * Transporte › detalles en celular (390 px): una sola «←», la del
 * MobileHeader del shell. Incidente, ruta y viaje conservan título, estado y
 * acciones; solo su «←» pasa a lg. (Envío y manifiesto dibujan la cabecera en
 * la propia página, que carga datos: los cubre el guardarraíl 44.)
 */
import { screen } from '@testing-library/react';
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular, visibleEnCelular } from '@/test-utils/dobleAtrasMovil';

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/transporte',
  useSearchParams: () => new URLSearchParams(),
}));

import { IncidentHeader } from '@/components/transporte/incidentes/id/IncidentHeader';
import { RouteDetailHeader } from '@/components/transporte/rutas/[id]/RouteDetailHeader';
import { TripDetailHeader } from '@/components/transporte/viajes/id/TripDetailHeader';
import type { IncidentWithDetails } from '@/lib/services/incidentsService';
import type { TransportRoute } from '@/lib/services/transportRoutesService';
import type { TripWithDetails } from '@/lib/services/tripsService';

const nada = () => undefined;

afterEach(() => simularAncho(1440));

describe('Transporte › detalles en celular (390 px): una sola «←»', () => {
  test('incidente: título, severidad, estado y «Editar» a la vista', () => {
    const incidente = {
      id: 'i1',
      title: 'Llanta pinchada',
      incident_type: 'breakdown',
      severity: 'high',
      status: 'open',
      occurred_at: '2026-10-08T13:00:00Z',
      sla_breached: false,
      reference_type: 'trip',
      reference_id: '7f1c2d1e-0000-4000-8000-000000000001',
    } as unknown as IncidentWithDetails;
    renderEnCelular(<IncidentHeader incident={incidente} onEdit={nada} onChangeStatus={nada} onClose={nada} />);
    comprobarDetalleMovil('Llanta pinchada', ['Alta', 'Abierto', 'Editar']);
    expect(cabeceraPublicada()?.subtitulo).toBe('Avería mecánica');
  });

  test('ruta: nombre, tipo y código a la vista', () => {
    const ruta = { id: 'r1', name: 'Centro — Norte', code: 'R-01', route_type: 'cargo', is_active: false } as unknown as TransportRoute;
    renderEnCelular(<RouteDetailHeader route={ruta} onRefresh={nada} onEdit={nada} onDuplicate={nada} />);
    comprobarDetalleMovil('Centro — Norte', ['Carga', 'Inactiva']);
    const codigo = screen.getAllByText(/Código: R-01/).find((e) => !e.closest('[data-testid="shell-movil"]'));
    expect(codigo && visibleEnCelular(codigo)).toBe(true);
  });

  test('viaje: código, estado y acción de estado a la vista', () => {
    const viaje = { id: 't1', trip_code: 'VJ-0001', status: 'scheduled', trip_date: '2026-10-08', transport_routes: { name: 'Centro — Norte' } } as unknown as TripWithDetails;
    renderEnCelular(<TripDetailHeader trip={viaje} onEdit={nada} onStatusChange={nada} />);
    comprobarDetalleMovil('VJ-0001', ['Programado', 'Iniciar Abordaje']);
    expect(cabeceraPublicada()?.volverA).toBe('/app/transporte/viajes');
  });
});
