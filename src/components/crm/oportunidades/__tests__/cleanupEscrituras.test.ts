jest.mock('@/lib/supabase/config', () => ({ supabase: {
  from: () => { throw new Error('No se permite SQL en esta mutación de navegador'); },
} }));
jest.mock('@/lib/services/pmService', () => ({ pmService: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, getCurrentBranchId: () => null }));
jest.mock('@/components/crm/pipeline/drawer/StageSelect', () => ({ requestStageChange: jest.fn() }));

import { opportunitiesService } from '../opportunitiesService';
import { updateCustomer } from '@/components/crm/pipeline/services/pipelineService';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';

const fetchMock = jest.fn();
const fetchOriginal = global.fetch;
const ID = '00000000-0000-4000-8000-000000000010';
const datosCliente = { full_name: 'Cliente sintético', email: 'cliente@example.test', phone: '+573001234567', address: '', notes: '' };

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { id: ID, ...datosCliente, updated_at: '2026-10-02T12:00:00+00:00' } }), { status: 200 }));
  global.fetch = fetchMock;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  global.fetch = fetchOriginal;
  jest.restoreAllMocks();
});

it('el checkbox solo envía estado; el timestamp del navegador no decide el cierre', async () => {
  await opportunitiesService.updateTask(ID, { status: 'completed', completed_at: '2000-01-01T00:00:00Z' });
  expect(fetchMock).toHaveBeenCalledWith(`/api/crm/tasks/${ID}`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'done' }) }));
});

it('borrar y fijar notas delegan las rutas que verifican autoría', async () => {
  await opportunitiesService.deleteNote(ID);
  await opportunitiesService.toggleNotePin(ID, false);
  expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/crm/notes/${ID}`, expect.objectContaining({ method: 'DELETE', body: undefined }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/crm/notes/${ID}`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_pinned: true }) }));
});

it('la ficha usa la ruta de sesión y no envía una organización introducida en el formulario', async () => {
  expect(await updateCustomer(ID, { ...datosCliente, organization_id: 121 } as typeof datosCliente)).toEqual({ success: true, customer: { id: ID, ...datosCliente, updated_at: '2026-10-02T12:00:00+00:00' } });
  expect(fetchMock).toHaveBeenCalledWith(`/api/crm/customers/${ID}`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify(datosCliente) }));
});

it('la ficha envía la versión que se abrió y recibe los campos normalizados del servidor', async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { id: ID, full_name: 'Nombre canónico', email: null, phone: null, address: null, notes: null, updated_at: '2026-10-02T12:00:00+00:00' } }), { status: 200 }));
  const anterior = '2026-09-01T00:00:00+00:00';
  expect(await updateCustomer(ID, datosCliente, anterior)).toEqual({ success: true, customer: { id: ID, full_name: 'Nombre canónico', email: undefined, phone: undefined, address: undefined, notes: undefined, updated_at: '2026-10-02T12:00:00+00:00' } });
  expect(fetchMock).toHaveBeenCalledWith(`/api/crm/customers/${ID}`, expect.objectContaining({ body: JSON.stringify({ ...datosCliente, expected_updated_at: anterior }) }));
});

it('un rechazo del servidor conserva el fallo en notas, tareas y ficha', async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false, error: 'Sin permiso' }), { status: 403 }));
  await expect(opportunitiesService.deleteNote(ID)).rejects.toBeInstanceOf(ErrorApiCrm);
  await expect(opportunitiesService.updateTask(ID, { status: 'done' })).rejects.toMatchObject({ status: 403 });
  expect(await updateCustomer(ID, datosCliente)).toEqual({ success: false, error: expect.any(ErrorApiCrm) });
});
