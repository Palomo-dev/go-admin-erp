/**
 * @jest-environment jsdom
 *
 * Parking y PMS › detalles en celular (390 px): una sola «←», la del
 * MobileHeader del shell. La sesión de parqueo y el espacio conservan placa o
 * nombre, estado y acciones; solo su «←» pasa a lg.
 */
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular } from '@/test-utils/dobleAtrasMovil';

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(),
}));

import { SessionDetailHeader } from '@/components/parking/sesiones/id/SessionDetailHeader';
import { SpaceDetailHeader } from '@/components/pms/espacios/id/SpaceDetailHeader';
import type { Space } from '@/lib/services/spacesService';

const nada = () => undefined;

afterEach(() => simularAncho(1440));

describe('Parking y PMS › detalles en celular (390 px): una sola «←»', () => {
  test('sesión de parqueo: placa, estado y acciones a la vista', () => {
    renderEnCelular(
      <SessionDetailHeader
        session={{ id: 's1', vehicle_plate: 'ABC123', vehicle_type: 'car', status: 'open', entry_at: '2026-10-08T13:00:00Z' }}
        isLoading={false}
        onRefresh={nada}
        onPrint={nada}
        onMarkIncident={nada}
      />,
    );
    comprobarDetalleMovil('ABC123', ['Activa', 'Actualizar']);
    expect(cabeceraPublicada()?.volverA).toBe('/app/parking/sesiones');
  });

  test('espacio del PMS: nombre, estado y tipo a la vista', () => {
    const espacio = { id: 'sp1', label: 'Habitación 101', status: 'available', floor_zone: 'Piso 1', space_types: { name: 'Doble', category: { display_name: 'Habitaciones' } } } as unknown as Space;
    renderEnCelular(
      <SpaceDetailHeader
        space={espacio}
        onEdit={nada}
        onMarkMaintenance={nada}
        onAssignCleaning={nada}
        onViewRevenue={nada}
        onNewReservation={nada}
        onAddConsumption={nada}
      />,
    );
    comprobarDetalleMovil('Habitación 101', ['Disponible', 'Doble • Habitaciones']);
    expect(cabeceraPublicada()?.subtitulo).toBe('Doble');
  });
});
