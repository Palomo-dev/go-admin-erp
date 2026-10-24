/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ConfiguracionInformesPage } from '../ConfiguracionInformesPage';
import { plantillaNotasPredeterminada } from '@/lib/finanzas/informes/notasCertificacion';
let mockOrgId = 1;
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => mockOrgId, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('../AnotacionesAsientosForm', () => ({ AnotacionesAsientosForm: () => null }));
jest.mock('../ParametrosFiscalesForm', () => ({ ParametrosFiscalesForm: () => null }));

jest.mock('@/components/kit', () => ({
  PageHeader: ({ titulo }: { titulo: string }) => <h1>{titulo}</h1>,
  FormSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  FormField: ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => <label>{etiqueta}{children}</label>,
  Tarjeta: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  Dialogo: ({ abierto, children, primario }: { abierto: boolean; children: ReactNode; primario: { etiqueta: string; onClick: () => void; deshabilitada?: boolean } }) => abierto ? <section>{children}<button disabled={primario.deshabilitada} onClick={primario.onClick}>{primario.etiqueta}</button></section> : null,
  DataTable: ({ filas, onFilaClick }: { filas: { account_code: string }[]; onFilaClick?: (fila: { account_code: string }) => void }) => <div>{filas.map((fila) => <button key={fila.account_code} onClick={() => onFilaClick?.(fila)}>Editar cuenta {fila.account_code}</button>)}</div>,
  EmptyState: ({ titulo }: { titulo: string }) => <p>{titulo}</p>,
}));
jest.mock('@/components/kit/AvisoTonal', () => ({ AvisoTonal: ({ titulo, accion }: { titulo: string; accion?: { etiqueta: string; onClick: () => void } }) => <div><p>{titulo}</p>{accion && <button onClick={accion.onClick}>{accion.etiqueta}</button>}</div> }));
jest.mock('@/components/kit/SettingsSaveBar', () => ({ SettingsSaveBar: ({ cambios, onGuardar, guardando, deshabilitado }: { cambios: number; onGuardar: () => void; guardando: boolean; deshabilitado?: boolean }) => cambios > 0 ? <button disabled={guardando || deshabilitado} onClick={onGuardar}>Guardar cambios</button> : null }));

function configuracion(bases = plantillaNotasPredeterminada(2).basesPreparacion) {
  return {
    version: 0,
    grupo_niif: 2,
    presenta_cambios_patrimonio: false,
    notas: { ...plantillaNotasPredeterminada(2), basesPreparacion: bases },
    certificacion: { entidad: 'Entidad de prueba', nit: '900000000', representante: { nombre: '', cedula: '' }, contador: { nombre: '', cedula: '', tarjetaProfesional: '' } },
    cuentas: [{ account_code: '143505', name: 'Mercancías', clasificacion_corriente: null, costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null }],
    parametros_fiscales: { anios: { '2026': { periodicidad_iva: 'bimestral' } } },
    anotaciones_asientos: { '123': { concepto_patrimonio: 'correccion_errores' } },
  };
}

beforeEach(() => {
  mockOrgId = 1;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => configuracion() });
});

it('al cambiar de organización descarta el snapshot y no admite respuestas tardías de la anterior', async () => {
  let completarPrimera: (r: Response) => void = () => undefined;
  jest.mocked(global.fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { completarPrimera = resolve; }));
  render(<ConfiguracionInformesPage />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  mockOrgId = 2;
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...configuracion(), notas: { ...configuracion().notas, entidad: 'Texto de la organización nueva' } }) } as Response);
  fireEvent(window, new Event('organization-changed'));
  await screen.findByDisplayValue('Texto de la organización nueva');
  completarPrimera({ ok: true, json: async () => ({ ...configuracion(), notas: { ...configuracion().notas, entidad: 'Texto anterior que debe ignorarse' } }) } as Response);
  await waitFor(() => expect(screen.queryByDisplayValue('Texto anterior que debe ignorarse')).toBeNull());
  expect((jest.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>)['X-Organization-Id']).toBe('1');
  expect((jest.mocked(global.fetch).mock.calls[1][1]?.headers as Record<string, string>)['X-Organization-Id']).toBe('2');
});

it('guarda con la organización del snapshot para que el servidor rechace una cookie distinta', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Entidad y actividad económica'), { target: { value: 'Edición de la primera organización' } });
  jest.mocked(global.fetch).mockImplementation(async (_url, init) => {
    if (init?.method === 'PATCH') {
      expect((init.headers as Record<string, string>)['X-Organization-Id']).toBe('1');
      // Cambio concurrente de cookie posterior al último control del cliente.
      return { ok: false, status: 403, json: async () => ({ error: 'La organización de la solicitud no coincide con la sesión.' }) } as Response;
    }
    return { ok: true, json: async () => configuracion() } as Response;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('La organización de la solicitud no coincide con la sesión.');
  expect(screen.queryByText('La configuración quedó guardada para esta organización.')).toBeNull();
});

it('no envía cambios previos si la organización cambió antes de guardar aunque falte el evento', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Entidad y actividad económica'), { target: { value: 'Edición pendiente anterior' } });
  mockOrgId = 2;
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(jest.mocked(global.fetch).mock.calls.length).toBe(2));
  expect(jest.mocked(global.fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  expect(screen.queryByDisplayValue('Edición pendiente anterior')).toBeNull();
});

it('una respuesta de guardado tardía no reemplaza la configuración de la organización nueva', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Entidad y actividad económica'), { target: { value: 'Edición en guardado anterior' } });
  let completarGuardado: (respuesta: Response) => void = () => undefined;
  jest.mocked(global.fetch).mockImplementation((_url, init) => init?.method === 'PATCH'
    ? new Promise<Response>((resolve) => { completarGuardado = resolve; })
    : Promise.resolve({ ok: true, json: async () => ({ ...configuracion(), notas: { ...configuracion().notas, entidad: 'Configuración nueva vigente' } }) } as Response));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  mockOrgId = 2;
  fireEvent(window, new Event('organization-changed'));
  await screen.findByDisplayValue('Configuración nueva vigente');
  completarGuardado({ ok: true, json: async () => ({ ...configuracion(), version: 1, notas: { ...configuracion().notas, entidad: 'Edición en guardado anterior' } }) } as Response);
  await waitFor(() => expect(screen.queryByDisplayValue('Edición en guardado anterior')).toBeNull());
  expect(screen.queryByText('La configuración quedó guardada para esta organización.')).toBeNull();
});

it('al pasar a grupo 3 cambia solamente las bases predeterminadas al anexo 3', async () => {
  render(<ConfiguracionInformesPage />);
  const selector = await screen.findByLabelText('Grupo NIIF');
  fireEvent.change(selector, { target: { value: '3' } });
  expect((screen.getByLabelText('Bases de preparación') as HTMLTextAreaElement).value).toContain('anexo 3');
  expect((screen.getByLabelText('Políticas contables') as HTMLTextAreaElement).value).toBe(plantillaNotasPredeterminada(2).politicas);
});

it('conserva las bases personalizadas al cambiar de grupo', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => configuracion('Bases revisadas por la entidad') } as Response);
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Grupo NIIF'), { target: { value: '3' } });
  expect((screen.getByLabelText('Bases de preparación') as HTMLTextAreaElement).value).toBe('Bases revisadas por la entidad');
});

it('guarda sin reenviar las cuentas intactas ni una organización del navegador', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Entidad y actividad económica'), { target: { value: 'Texto de entidad revisado' } });
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...configuracion(), version: 1, notas: { ...configuracion().notas, entidad: 'Texto de entidad revisado' } }) } as Response);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('La configuración quedó guardada para esta organización.');
  const llamada = jest.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(llamada).toBeDefined();
  const body = JSON.parse(String(llamada?.[1]?.body));
  expect(body.cuentas).toEqual([]);
  expect(body.notas.entidad).toBe('Texto de entidad revisado');
  expect(body.organization_id).toBeUndefined();
  expect(body.version).toBe(0);
  expect(body.parametros_fiscales).toEqual(configuracion().parametros_fiscales);
  expect(body.anotaciones_asientos).toEqual(configuracion().anotaciones_asientos);
  fireEvent.change(screen.getByLabelText('Entidad y actividad económica'), { target: { value: 'Segunda edición' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(jest.mocked(global.fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(2));
  const segunda = jest.mocked(global.fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')[1];
  expect(JSON.parse(String(segunda[1]?.body)).version).toBe(1);
});

it('un rechazo del servidor conserva los cambios para corregirlos o reintentar', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Entidad y actividad económica'), { target: { value: 'Edición pendiente' } });
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'No tienes permiso para cambiar esta configuración.' }) } as Response);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('No tienes permiso para cambiar esta configuración.');
  expect((screen.getByLabelText('Entidad y actividad económica') as HTMLTextAreaElement).value).toBe('Edición pendiente');
  await waitFor(() => expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByText('La configuración quedó guardada para esta organización.')).toBeNull();
});

it('un conflicto de versión permite recargar explícitamente sin sobrescribir otra sesión', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Entidad y actividad económica'), { target: { value: 'Edición local' } });
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'La configuración cambió en otra sesión.' }) } as Response);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('La configuración cambió en otra sesión.');
  expect((screen.getByLabelText('Entidad y actividad económica') as HTMLTextAreaElement).value).toBe('Edición local');
  expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true);
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...configuracion(), version: 2, notas: { ...configuracion().notas, entidad: 'Edición de otra sesión' } }) } as Response);
  fireEvent.click(screen.getByRole('button', { name: 'Recargar y descartar cambios locales' }));
  await waitFor(() => expect((screen.getByLabelText('Entidad y actividad económica') as HTMLTextAreaElement).value).toBe('Edición de otra sesión'));
});

it('bloquea nuevas ediciones mientras guarda para no perder cambios durante la respuesta', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.change(await screen.findByLabelText('Entidad y actividad económica'), { target: { value: 'Edición en curso' } });
  let resolver: (respuesta: Response) => void = () => undefined;
  jest.mocked(global.fetch).mockImplementation(() => new Promise<Response>((resolve) => { resolver = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(screen.getByLabelText('Entidad y actividad económica').closest('fieldset')?.disabled).toBe(true);
  resolver({ ok: true, json: async () => ({ ...configuracion(), version: 1, notas: { ...configuracion().notas, entidad: 'Edición en curso' } }) } as Response);
  await screen.findByText('La configuración quedó guardada para esta organización.');
  expect(screen.getByLabelText('Entidad y actividad económica').closest('fieldset')?.disabled).toBe(false);
});

it('cambiar el costo conserva Según plazo y no reescribe la clasificación del PUC', async () => {
  const cfg = { ...configuracion(), cuentas: [{ ...configuracion().cuentas[0], clasificacion_corriente: 'segun_plazo' }] };
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => cfg } as Response);
  render(<ConfiguracionInformesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar cuenta 143505' }));
  expect((screen.getByLabelText('Corriente / no corriente') as HTMLSelectElement).value).toBe('segun_plazo');
  fireEvent.change(screen.getByLabelText('Costo fijo / variable'), { target: { value: 'variable' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar clasificación' }));
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...cfg, version: 1, cuentas: [{ ...cfg.cuentas[0], costo_comportamiento: 'variable' }] }) } as Response);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('La configuración quedó guardada para esta organización.');
  const llamada = jest.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
  const cuenta = JSON.parse(String(llamada?.[1]?.body)).cuentas[0];
  expect(cuenta.costo_comportamiento).toBe('variable');
  expect(cuenta.clasificacion_corriente).toBeUndefined();
});

it('envía la clasificación al PUC cuando el usuario la cambia explícitamente', async () => {
  render(<ConfiguracionInformesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar cuenta 143505' }));
  fireEvent.change(screen.getByLabelText('Corriente / no corriente'), { target: { value: 'segun_plazo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar clasificación' }));
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...configuracion(), version: 1 }) } as Response);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('La configuración quedó guardada para esta organización.');
  const llamada = jest.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(String(llamada?.[1]?.body)).cuentas[0].clasificacion_corriente).toBe('segun_plazo');
});
