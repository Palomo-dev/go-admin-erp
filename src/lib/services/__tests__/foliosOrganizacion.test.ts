import { supabase } from '@/lib/supabase/config';
import foliosService from '../foliosService';
import { createPgMock } from '../crm/__tests__/pgMock';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../stockMovementService', () => ({ stockMovementService: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, getCurrentBranchId: () => 1 }));
const folio = (id: string, organization_id: number, branch_id: number) => ({ id, reservation_id: `reserva-${id}`, balance: 25, status: 'open',
  reservations: { id: `reserva-${id}`, organization_id, branch_id, customers: { first_name: 'Persona', last_name: 'Prueba' } } });

beforeEach(() => {
  jest.clearAllMocks();
  const db = createPgMock({ folios: [folio('propio', 120, 1), folio('otra-sucursal', 120, 2),
    folio('ajeno', 125, 1), { id: 'sin-reserva', reservations: null }] });
  jest.mocked(supabase.from).mockImplementation((table: string) => {
    const builder = db.from(table);
    Object.assign(builder, { returns: () => builder });
    return builder;
  });
});
test('organización y sucursal se filtran juntas y el join descarta filas sin reserva', async () => {
  expect((await foliosService.getFolios({ organizationId: 120, branchId: 1 })).map(f => f.id)).toEqual(['propio']);
});
test('sin sucursal incluye solo las reservas de la organización activa', async () => {
  expect((await foliosService.getFolios()).map(f => f.id)).toEqual(['propio', 'otra-sucursal']);
});
test('el enlace exige que folio y reserva correspondan entre sí', async () => {
  expect(await foliosService.getFolios({ organizationId: 120, folioId: 'propio', reservation_id: 'reserva-ajeno' })).toEqual([]);
  expect((await foliosService.getFolios({ organizationId: 120, folioId: 'propio', reservation_id: 'reserva-propio' }))[0]).toMatchObject({ id: 'propio', reservations: { organization_id: 120 } });
});
test('un detalle de otra organización no devuelve datos', async () => {
  expect(await foliosService.getFolioById('ajeno')).toBeNull();
});
