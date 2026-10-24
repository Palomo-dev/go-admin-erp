/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { InformeContablePage, type RespuestaPantallaInformes } from '../InformeContablePage';
let mockOrgId = 1;
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => mockOrgId, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));

jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branches: [{ id: 1, name: 'Sede de prueba' }], branchFilter: 1, canSelectAll: true }) }));
let mockTimezoneCargando = false;
let mockDiaOrganizacion = '2026-10-24';
const mockGetToday = () => mockDiaOrganizacion;
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ getToday: mockGetToday }), useOrgTimezone: () => ({ isLoading: mockTimezoneCargando }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => function CertificadoExistente() { return <p>Acceso al certificado de proveedores existente</p>; } }));
jest.mock('@/components/kit/AvisoTonal', () => ({ AvisoTonal: ({ titulo, descripcion, accion }: { titulo: string; descripcion?: ReactNode; accion?: { etiqueta: string; onClick?: () => void } }) => <div role="note"><p>{titulo}</p>{descripcion}{accion && <button onClick={accion.onClick}>{accion.etiqueta}</button>}</div> }));
jest.mock('@/components/kit', () => ({
  PageHeader: ({ titulo, acciones }: { titulo: string; acciones: ReactNode }) => <header><h1>{titulo}</h1>{acciones}</header>,
  FormSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  FormField: ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => <label>{etiqueta}{children}</label>,
  CampoFecha: ({ valor, onValorChange }: { valor: string; onValorChange: (valor: string) => void }) => <input type="date" value={valor} onChange={(evento) => onValorChange(evento.target.value)} />,
  Tarjeta: ({ titulo, children }: { titulo: string; children: ReactNode }) => <section><h2>{titulo}</h2>{children}</section>,
  ListCard: () => null,
  EmptyState: ({ titulo, onReintentar }: { titulo: string; onReintentar?: () => void }) => <div>{titulo}<button onClick={onReintentar}>Reintentar</button></div>,
  DataTable: ({ filas, columnas, estado }: { filas: Record<string, unknown>[]; columnas: { id: string; encabezado: string; celda: (fila: Record<string, unknown>) => ReactNode }[]; estado?: string }) => estado === 'cargando' ? <p>Cargando informe</p> : <table><thead><tr>{columnas.map((columna) => <th key={columna.id}>{columna.encabezado}</th>)}</tr></thead><tbody>{filas.map((fila, i) => <tr key={i}>{columnas.map((columna) => <td key={columna.id}>{columna.celda(fila)}</td>)}</tr>)}</tbody></table>,
  clasesBoton: () => '',
}));
jest.mock('../exportar', () => ({ exportarInformesPDF: jest.fn().mockResolvedValue(undefined), exportarInformesExcel: jest.fn().mockResolvedValue(undefined) }));

const datos: RespuestaPantallaInformes = {
  grupoNiif: 2,
  monedaBase: 'COP',
  documentos: {
    'situacion-financiera': { titulo: 'Estado de situación financiera', tablas: [{ titulo: 'Activos', columnas: [{ clave: 'rubro', titulo: 'Rubro' }, { clave: 'actual', titulo: 'Actual', formato: 'pesos' }, { clave: 'anterior', titulo: 'Anterior', formato: 'pesos' }], filas: [{ rubro: 'Efectivo y equivalentes', actual: 1234.49, anterior: 1000 }] }] },
    'flujo-indirecto': { titulo: 'Flujo indirecto', tablas: [{ titulo: 'Conciliación de efectivo', columnas: [{ clave: 'valor', titulo: 'Valor' }], filas: [{ valor: 'Movimiento de prueba' }] }] },
  },
};

beforeEach(() => {
  window.history.replaceState({}, '', '/app/finanzas/contabilidad/informes/situacion-financiera');
  jest.clearAllMocks();
  mockTimezoneCargando = false;
  mockOrgId = 1;
  mockDiaOrganizacion = '2026-10-24';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => datos });
});

it('al cambiar de organización descarta cifras y filtros particulares antes de volver a consultar', async () => {
  render(<InformeContablePage informe="situacion-financiera" />);
  await screen.findByText('Efectivo y equivalentes');
  mockOrgId = 2;
  let completar: (respuesta: Response) => void = () => undefined;
  jest.mocked(global.fetch).mockImplementation(() => new Promise<Response>((resolve) => { completar = resolve; }));
  fireEvent(window, new Event('organization-changed'));
  expect(screen.queryByText('Efectivo y equivalentes')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Excel' }).every((boton) => (boton as HTMLButtonElement).disabled)).toBe(true);
  await waitFor(() => expect(jest.mocked(global.fetch).mock.calls.length).toBe(2));
  expect((jest.mocked(global.fetch).mock.calls[1][1]?.headers as Record<string, string>)['X-Organization-Id']).toBe('2');
  completar({ ok: true, json: async () => datos } as Response);
  await screen.findByText('Efectivo y equivalentes');
});

it('consulta filtros de sesión y presenta comparativo con pesos enteros', async () => {
  render(<InformeContablePage informe="situacion-financiera" />);
  await screen.findByText('Efectivo y equivalentes');
  expect(screen.getByText('1.234')).toBeDefined();
  expect(screen.getByText('1.000')).toBeDefined();
  expect(String(jest.mocked(global.fetch).mock.calls[0][0])).toContain('desde=2026-01-01&hasta=2026-10-24');
  expect(String(jest.mocked(global.fetch).mock.calls[0][0])).toContain('branch_id=1');
  expect(screen.getAllByRole('button', { name: 'Excel' }).every((boton) => !(boton as HTMLButtonElement).disabled)).toBe(true);
});

it('el acceso de proveedores delega al flujo existente sin consultar un cálculo paralelo', () => {
  render(<InformeContablePage informe="retenciones-proveedores" />);
  expect(screen.getByText('Acceso al certificado de proveedores existente')).toBeDefined();
  expect(global.fetch).not.toHaveBeenCalled();
});

it('espera la zona horaria y conserva el año y nivel predeterminados del mayor', async () => {
  mockTimezoneCargando = true;
  const vista = render(<InformeContablePage informe="mayor-consolidado" />);
  expect(global.fetch).not.toHaveBeenCalled();
  mockDiaOrganizacion = '2025-12-31';
  mockTimezoneCargando = false;
  vista.rerender(<InformeContablePage informe="mayor-consolidado" />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(String(jest.mocked(global.fetch).mock.calls[0][0])).toContain('desde=2025-01-01&hasta=2025-12-31&nivel=auxiliar');
});

it('un error de datos conserva reintento y no se presenta como periodo vacío', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'Sin permiso para consultar contabilidad' }) } as Response);
  render(<InformeContablePage informe="situacion-financiera" />);
  await screen.findByText('Sin permiso para consultar contabilidad');
  expect(screen.queryByText('No hay movimientos en este periodo')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Excel' }).every((boton) => (boton as HTMLButtonElement).disabled)).toBe(true);
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => datos } as Response);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Efectivo y equivalentes');
});

it('grupo 3 no presenta el flujo indirecto ni permite exportarlo individualmente', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...datos, grupoNiif: 3 }) } as Response);
  render(<InformeContablePage informe="flujo-indirecto" />);
  await screen.findByText('Presentación del grupo 3');
  expect(screen.queryByText('Movimiento de prueba')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'PDF' }).every((boton) => (boton as HTMLButtonElement).disabled)).toBe(true);
});

it('el enlace del mayor conserva el corte y la cuenta al abrir el auxiliar', async () => {
  window.history.replaceState({}, '', '/app/finanzas/contabilidad/informes/auxiliar-cuenta?desde=2025-01-01&hasta=2025-12-31&cuenta=143505&cost_center_id=00000000-0000-0000-0000-000000000001');
  render(<InformeContablePage informe="auxiliar-cuenta" />);
  await waitFor(() => expect(jest.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes('cuenta=143505') && String(url).includes('cost_center_id=00000000-0000-0000-0000-000000000001') && String(url).includes('hasta=2025-12-31'))).toBe(true));
});

it('el paquete PDF conserva las advertencias de los estados y notas', async () => {
  const { exportarInformesPDF } = await import('../exportar');
  const conAdvertencia: RespuestaPantallaInformes = { ...datos, documentos: { ...datos.documentos, 'resultados-integral': { titulo: 'Resultados', tablas: [] }, 'cambios-patrimonio': { titulo: 'Patrimonio', tablas: [] }, certificacion: { titulo: 'Certificación', textos: ['Borrador · firmas pendientes'], tablas: [] }, 'notas-estados': { titulo: 'Notas', avisos: ['Falta revisar las políticas contables'], tablas: [] } } };
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => conAdvertencia } as Response);
  render(<InformeContablePage informe="situacion-financiera" />);
  await screen.findByText('Efectivo y equivalentes');
  fireEvent.click(screen.getAllByRole('button', { name: 'PDF con los estados y notas' })[0]);
  await waitFor(() => expect(exportarInformesPDF).toHaveBeenCalled());
  const documentos = jest.mocked(exportarInformesPDF).mock.calls[0][0];
  expect(documentos.find((item) => item.titulo === 'Notas')?.avisos).toEqual(['Falta revisar las políticas contables']);
});

it('identifica la moneda base sin convertir o rotular USD como pesos', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...datos, monedaBase: 'USD' }) } as Response);
  render(<InformeContablePage informe="situacion-financiera" />);
  await screen.findByText(/Valores enteros · USD/);
  expect(screen.queryByText(/Pesos enteros/)).toBeNull();
});
