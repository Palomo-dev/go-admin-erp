/** @jest-environment jsdom */
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RetencionesProveedoresPage } from '../RetencionesProveedoresPage';

let mockOrg = 1;
const mockGetToday = () => '2026-10-24';
const mockExportarExcel = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ getToday: mockGetToday }), useOrgTimezone: () => ({ isLoading: false }) }));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: 2, branches: [{ id: 2, name: 'Sede de prueba' }], canSelectAll: true }) }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => mockOrg, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('@/lib/services/compras/lecturasCompras', () => ({ buscarProveedores: jest.fn().mockResolvedValue([]) }));
jest.mock('../exportar', () => ({ exportarInformesExcel: (...args: unknown[]) => mockExportarExcel(...args), exportarInformesPDF: jest.fn() }));
jest.mock('@/components/kit/AvisoTonal', () => ({ AvisoTonal: ({ titulo, descripcion }: { titulo: string; descripcion: string }) => <div><strong>{titulo}</strong><p>{descripcion}</p></div> }));
jest.mock('@/components/kit', () => ({
  PageHeader: ({ titulo }: { titulo: string }) => <h1>{titulo}</h1>,
  FormSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  FormField: ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => <label>{etiqueta}{children}</label>,
  CampoFecha: ({ valor, onValorChange }: { valor: string; onValorChange: (value: string) => void }) => <input type="date" value={valor} onChange={(e) => onValorChange(e.target.value)} />,
  DataTable: ({ etiqueta }: { etiqueta: string }) => <p>{etiqueta}</p>,
  SupplierPicker: ({ onCambiar }: { onCambiar: (proveedor: { id: string; nombre: string }) => void }) => <button onClick={() => onCambiar({ id: '7', nombre: 'Proveedor de prueba' })}>Seleccionar proveedor</button>,
  clasesBoton: () => '',
}));
jest.mock('@/components/finanzas/cuentas-por-pagar/CertificadoRetencionesDialog', () => ({ CertificadoRetencionesDialog: ({ abierto, proveedorId, rangoFijo, filtrosContables, organizacionEsperada }: { abierto: boolean; proveedorId: number; rangoFijo: { desde: string; hasta: string }; filtrosContables: object; organizacionEsperada: number }) => abierto ? <div data-testid="dialogo-existente" data-proveedor={proveedorId} data-desde={rangoFijo.desde} data-hasta={rangoFijo.hasta} data-filtros={JSON.stringify(filtrosContables)} data-organizacion={organizacionEsperada} /> : null }));
const documento = { titulo: 'Retenciones a proveedores · Borrador', tablas: [{ titulo: 'Periodo actual', columnas: [], filas: [] }] };
beforeEach(() => {
  mockOrg = 1;
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ centros: [{ id: '00000000-0000-4000-8000-000000000001', code: 'C1', name: 'Centro de prueba' }], documento }) });
});

it('delega fecha exacta y alcance contabilizado a la expedición canónica, y exporta el mismo borrador', async () => {
  render(<RetencionesProveedoresPage />);
  expect((screen.getByRole('button', { name: 'Preparar certificado' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar proveedor' }));
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-03-07' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2025-05-09' } });
  await screen.findByRole('option', { name: 'C1 · Centro de prueba' });
  fireEvent.change(screen.getByLabelText('Centro de costo'), { target: { value: '00000000-0000-4000-8000-000000000001' } });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Preparar certificado' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar certificado' }));
  const dialogo = screen.getByTestId('dialogo-existente');
  expect(dialogo.getAttribute('data-proveedor')).toBe('7');
  expect(dialogo.getAttribute('data-desde')).toBe('2025-03-07');
  expect(dialogo.getAttribute('data-hasta')).toBe('2025-05-09');
  expect(JSON.parse(dialogo.getAttribute('data-filtros')!)).toEqual({ contabilizados: true, branch_id: 2, cost_center_id: '00000000-0000-4000-8000-000000000001' });
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(mockExportarExcel).toHaveBeenCalledWith([documento], 'retenciones-proveedores-2025-05-09', expect.any(Array)));
});

it('un periodo invertido no permite abrir ni exportar el certificado anterior', async () => {
  render(<RetencionesProveedoresPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar proveedor' }));
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-24' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-01-01' } });
  expect((screen.getByRole('button', { name: 'Preparar certificado' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByTestId('dialogo-existente')).toBeNull();
});

it('un cambio de organización cierra el diálogo y descarta el proveedor de la sesión anterior', async () => {
  render(<RetencionesProveedoresPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar proveedor' }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Preparar certificado' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar certificado' }));
  expect(screen.getByTestId('dialogo-existente')).not.toBeNull();
  act(() => { mockOrg = 2; window.dispatchEvent(new Event('organization-changed')); });
  expect(screen.queryByTestId('dialogo-existente')).toBeNull();
  expect((screen.getByRole('button', { name: 'Preparar certificado' }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.not.stringContaining('supplier_id='), expect.objectContaining({ headers: { 'x-organization-id': '2' } })));
});

it('presenta la advertencia de borrador parcial antes de exportar o expedir', async () => {
  const aviso = 'Hay retenciones manuales sin base histórica. La expedición está bloqueada.';
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ centros: [], documento: { ...documento, avisos: [aviso] } }) } as Response);
  render(<RetencionesProveedoresPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar proveedor' }));
  expect(await screen.findByText(aviso)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(mockExportarExcel).toHaveBeenCalledWith([expect.objectContaining({ avisos: [aviso] })], expect.any(String), expect.any(Array)));
});
