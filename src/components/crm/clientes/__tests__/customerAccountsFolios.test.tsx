/** @jest-environment jsdom */
import { screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import CuentasTab from '@/components/clientes/id/CuentasTab';
import { createPgMock } from '@/lib/services/crm/__tests__/pgMock';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: String }),
}));
jest.mock('@/components/clientes/id/useFechasFicha', () => ({
  useFechasFicha: () => ({ instante: String, plana: String }),
}));
beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: [], error: null });
  const db = createPgMock({ reservations: [] });
  mockFrom.mockReset().mockImplementation(db.from.bind(db));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('la ficha con sección de folios propia no consulta ni repite folios o un vacío contradictorio', async () => {
  const { container } = renderConIdioma(
    <CuentasTab clienteId="synthetic-customer" organizationId={120} mostrarFolios={false} />,
  );
  await waitFor(() => expect(container.childElementCount).toBe(0));
  expect(mockRpc).toHaveBeenCalledWith('obtener_cuentas_por_cobrar_cliente', {
    p_customer_id: 'synthetic-customer',
    p_organization_id: 120,
  });
  expect(mockFrom).not.toHaveBeenCalled();
});

test('otros callers conservan la sección de folios por defecto', async () => {
  renderConIdioma(<CuentasTab clienteId="synthetic-customer" organizationId={120} />);
  await screen.findByText('No hay cuentas por cobrar');
  expect(mockFrom).toHaveBeenCalledWith('reservations');
});
