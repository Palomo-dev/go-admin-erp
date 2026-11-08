/**
 * @jest-environment jsdom
 *
 * Consignaciones › Entregadas en el celular (390 px): el buscador va en su propia fila y el filtro de estado
 * (pestañas segmentadas) debajo, con desplazamiento horizontal. Antes el control segmentado iba al lado del
 * buscador y la lupa se montaba sobre la primera pestaña (mismo bug que vio el dueño en Anticipos).
 */
import { screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/inventario/consignaciones',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', formatear: (v: number) => String(v), resuelta: true }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '') }),
}));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => ({ ver: true, crear: true, anular: true, cargando: false }),
}));
jest.mock('@/components/finanzas/consignaciones/consignacionesService', () => ({
  consignacionesService: { listar: jest.fn(async () => ({ pendiente: false, notas: [] })) },
}));
jest.mock('@/components/finanzas/consignaciones/NuevaNotaConsignacionDialog', () => ({ NuevaNotaConsignacionDialog: () => null }));

import { ListadoConsignaciones } from '@/components/finanzas/consignaciones/ListadoConsignaciones';

afterEach(() => simularAncho(1440));

test('390 px: el buscador en su fila y el filtro de estado debajo, con desplazamiento horizontal', async () => {
  simularAncho(390);
  renderConIdioma(<ListadoConsignaciones incrustada />);
  const filtro = await screen.findByTestId('consignaciones-filtro-estado');
  const grupo = within(filtro).getByRole('radiogroup');
  await waitFor(() => expect(within(grupo).getAllByRole('radio').length).toBe(4));

  // El contenedor del filtro desplaza en horizontal y el grupo conserva su ancho (no se aplasta).
  expect(filtro.className).toMatch(/overflow-x-auto/);
  expect(grupo.className).toMatch(/w-max/);

  // La fila del buscador ya no contiene el filtro: la lupa no puede quedar encima de la primera pestaña.
  const buscador = screen.getByRole('searchbox');
  // El filtro es hijo directo de la barra de la lista; la primera fila de esa barra es la del buscador.
  const barra = filtro.parentElement!;
  const filaBuscador = barra.firstElementChild!;
  expect(filaBuscador).not.toBe(filtro);
  expect(filaBuscador.contains(buscador)).toBe(true);
  expect(filaBuscador.contains(grupo)).toBe(false);
  // Y el filtro va DESPUÉS de la fila del buscador.
  expect(filaBuscador.compareDocumentPosition(filtro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
