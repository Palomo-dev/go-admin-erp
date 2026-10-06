/**
 * @jest-environment jsdom
 *
 * Editor de rol · flujo de punta a punta con la API simulada: marcar un
 * permiso → «Revisar y guardar» → guardar con la versión leída → otra persona
 * guardó antes (409 `conflicto`) → «Aplicar mis cambios sobre su versión» →
 * guardar de nuevo con la versión NUEVA y la unión de los dos cambios. Y un
 * rol del sistema: solo lectura con «Duplicar como rol propio».
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { clasificarCatalogo } from '@/lib/roles/matrizPermisos';
import type { CapacidadesRoles, DetalleRol, RolResumen } from '@/lib/roles/tipos';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import { EditorRol } from '../EditorRol';
import { DialogoEliminarRol } from '../DialogoEliminarRol';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/app/roles/77',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    timezone: 'America/Bogota',
    getToday: () => '2026-10-06',
    formatDate: (v: string) => v,
    formatDateTime: (v: string) => v,
    formatTime: (v: string) => v,
    formatPlain: (v: string) => v,
  }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/services/roles/clienteRoles', () => {
  const real = jest.requireActual('@/lib/services/roles/clienteRoles');
  return { ...real, clienteRoles: { detalle: jest.fn(), guardar: jest.fn(), listar: jest.fn(), eliminar: jest.fn() } };
});

const api = clienteRoles as jest.Mocked<typeof clienteRoles>;
const CATALOGO = clasificarCatalogo([
  { id: 1, code: 'pos.view', module: 'pos', name: 'View', description: 'Ver el punto de venta' },
  { id: 2, code: 'pos.create', module: 'pos', name: 'Create', description: 'Crear ventas' },
  { id: 3, code: 'pos.refund', module: 'pos', name: 'Refund', description: 'Devolver una venta' },
]);
const TODAS: CapacidadesRoles = { ver: true, crear: true, editar: true, eliminar: true, asignar: true, verPersonas: true, editarCargos: true, editarAlcance: true };
const ROL: RolResumen = {
  id: 77,
  nombre: 'Cajero de turno',
  descripcion: null,
  sistema: false,
  basadoEn: 4,
  basadoEnNombre: 'Empleado',
  version: 3,
  actualizado: '2026-10-06T10:00:00Z',
  permisoIds: [1],
  personas: 0,
  muestraPersonas: [],
  esAdmin: false,
  duplicable: true,
};
const detalle = (rol: RolResumen): DetalleRol => ({ rol, miembros: [], catalogo: CATALOGO, capacidades: TODAS, modeloListo: true });

beforeEach(() => jest.clearAllMocks());

test('conflicto al guardar: mis cambios se aplican sobre la versión de la otra persona y se guarda con la versión nueva', async () => {
  api.detalle.mockResolvedValue(detalle(ROL));
  api.guardar
    .mockRejectedValueOnce(
      new ErrorPeticionRoles('conflicto', 409, {
        codigo: 'conflicto',
        actual: { version: 4, nombre: 'Cajero de turno', descripcion: null, permisoIds: [1, 2] },
      }),
    )
    .mockResolvedValueOnce({ id: 77, version: 5 });

  const { container } = renderConIdioma(<EditorRol id={77} />);
  // Abrir el módulo y marcar «Devolver una venta».
  const pos = await waitFor(() => {
    const el = container.querySelector('[data-modulo="pos"]');
    if (!el) throw new Error('sin matriz');
    return el as HTMLElement;
  });
  fireEvent.click(within(pos).getAllByRole('button')[0]);
  const fila = container.querySelector('[data-permiso="pos.refund"]') as HTMLElement;
  fireEvent.click(within(fila).getByRole('checkbox'));

  fireEvent.click(screen.getAllByRole('button', { name: /Revisar y guardar \(1\)/ })[0]);
  let dialogo = await screen.findByRole('dialog');
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar 1 cambio' }));
  await waitFor(() => expect(api.guardar).toHaveBeenCalledTimes(1));
  expect(api.guardar.mock.calls[0]).toEqual([77, { version: 3, nombre: 'Cajero de turno', descripcion: null, permisoIds: [1, 3] }]);

  dialogo = await screen.findByRole('dialog', { name: 'Alguien guardó este rol mientras editabas' });
  expect(within(dialogo).getByText('Crear ventas')).toBeTruthy(); // lo que añadió la otra persona
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar mis 1 cambio sobre su versión' }));

  dialogo = await screen.findByRole('dialog', { name: /¿Guardar 1 cambio en «Cajero de turno»\?/ });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar 1 cambio' }));
  await waitFor(() => expect(api.guardar).toHaveBeenCalledTimes(2));
  const [, segundo] = api.guardar.mock.calls[1];
  expect(segundo.version).toBe(4);
  expect([...segundo.permisoIds].sort()).toEqual([1, 2, 3]);
});

test('rol del sistema: matriz de solo lectura, sin «Revisar y guardar» y con «Duplicar como rol propio»', async () => {
  api.detalle.mockResolvedValue(detalle({ ...ROL, id: 4, nombre: 'Empleado', sistema: true, basadoEn: null, basadoEnNombre: null }));
  const { container } = renderConIdioma(<EditorRol id={4} />);
  await waitFor(() => expect(container.querySelector('[data-modulo="pos"]')).toBeTruthy());
  expect(screen.queryByRole('button', { name: /Revisar y guardar/ })).toBeNull();
  expect(screen.getAllByRole('button', { name: /Duplicar/ }).length).toBeGreaterThan(0);
  const casillas = [...container.querySelectorAll('[data-modulo] [role="checkbox"]')] as HTMLButtonElement[];
  expect(casillas.every((c) => c.disabled)).toBe(true);
});

test('eliminar un rol que solo usan invitaciones pendientes: la base exige destino y el diálogo lo pide', async () => {
  api.eliminar.mockRejectedValueOnce(new ErrorPeticionRoles('requiere_destino', 400, { codigo: 'requiere_destino' }));
  const eliminado = jest.fn();
  renderConIdioma(<DialogoEliminarRol rol={ROL} roles={[ROL, { ...ROL, id: 4, nombre: 'Empleado', sistema: true }]} onAbiertoChange={() => undefined} onEliminado={eliminado} />);
  const dialogo = await screen.findByRole('dialog');
  expect(within(dialogo).queryByRole('combobox')).toBeNull();
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));
  await waitFor(() => expect(api.eliminar).toHaveBeenCalledWith(77, null));
  expect(await within(dialogo).findByRole('combobox')).toBeTruthy();
  expect(within(dialogo).getByText(/invitaciones pendientes/)).toBeTruthy();
  expect(eliminado).not.toHaveBeenCalled();
});
