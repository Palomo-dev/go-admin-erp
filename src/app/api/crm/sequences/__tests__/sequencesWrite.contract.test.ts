import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { baseTables, makeDb, addSequence, ORG } from '@/lib/services/crm/__tests__/f8FakeDb';

let mockClient: SupabaseClient;
let mockCanManage = true;
const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({
    organizationId: ORG, userId: '11111111-1111-4111-8111-111111111111', supabase: mockClient,
  })),
  hasOrgAdminOrPermission: jest.fn(async () => mockCanManage),
}));

import { POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';

const endpoint = 'http://localhost/api/crm/sequences';
const step = { step_number: 1, delay_days: 0, channel: 'wait' };
function request(method: string, body: unknown) {
  return new NextRequest(endpoint, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function patch(body: unknown) {
  return PATCH(request('PATCH', body), { params: Promise.resolve({ id: 'seq-1' }) });
}

beforeEach(() => {
  mockCanManage = true;
  mockClient = makeDb(baseTables()).client;
});
afterEach(() => jest.restoreAllMocks());

describe('Escritura de secuencias: capacidades reales antes de cualquier mutación', () => {
  it('rechaza un paso SMS nuevo con 400 y no crea una secuencia que fallaría al ejecutarse', async () => {
    const from = jest.spyOn(mockClient, 'from');
    const response = await POST(request('POST', { name: 'Seguimiento', steps: [{ ...step, channel: 'sms' }] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, issues: [expect.stringMatching(/sms no está disponible/)] });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([['meeting_booked'], ['stage_changed'], [null], [{}], [{ type: 'replied' }], [['won_lost']], [42]])(
    'rechaza las condiciones de salida no ejecutables o malformadas: %j', async (condition) => {
      const from = jest.spyOn(mockClient, 'from');
      const response = await POST(request('POST', { name: 'Seguimiento', steps: [step], exit_conditions: [condition] }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ success: false, issues: [expect.stringContaining('exit_conditions[0]')] });
      expect(from).not.toHaveBeenCalled();
    },
  );

  it('admite won_lost y opted_out en las formas nativas y devuelve la configuración guardada', async () => {
    const exits = ['won_lost', { type: 'opted_out' }];
    const rpc = jest.spyOn(mockClient, 'rpc');
    const from = jest.spyOn(mockClient, 'from');
    const response = await POST(request('POST', { name: 'Seguimiento', steps: [step], exit_conditions: exits }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { exit_conditions: exits, steps: [expect.objectContaining(step)] } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_crm_create_sequence', {
      p_org: ORG,
      p_input: expect.objectContaining({ created_by: '11111111-1111-4111-8111-111111111111', steps: [expect.objectContaining(step)] }),
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('no ejecuta un rollback compensatorio ni reintenta cuando crear devuelve un error de la transacción', async () => {
    const rpc = jest.spyOn(mockClient, 'rpc').mockResolvedValue({ data: null, error: { name: 'PostgrestError', code: '23503', message: 'plantilla_no_encontrada', details: '', hint: '' }, count: null, status: 400, statusText: 'Bad Request' });
    const from = jest.spyOn(mockClient, 'from');
    const response = await POST(request('POST', { name: 'Seguimiento', steps: [step] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, code: 'plantilla_no_encontrada' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([{ steps: [] }, { steps: null }, { steps: [step] }])('rechaza explícitamente steps en PATCH (%j), sin cambiar los pasos ni metadatos', async ({ steps }) => {
    const tables = baseTables();
    addSequence(tables, [{ channel: 'email' }]);
    mockClient = makeDb(tables).client;
    const from = jest.spyOn(mockClient, 'from');
    const response = await patch({ name: 'Cambio que no debe persistir', steps });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, issues: ['steps: los pasos de una secuencia existente son de sólo lectura'] });
    expect(from).not.toHaveBeenCalled();
    expect(tables.sequences[0].name).not.toBe('Cambio que no debe persistir');
  });

  it('rechaza condiciones no soportadas también en PATCH antes de escribir', async () => {
    const from = jest.spyOn(mockClient, 'from');
    expect((await patch({ exit_conditions: ['meeting_booked'] })).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('conserva un SMS y una condición históricos al editar solamente el nombre', async () => {
    const tables = baseTables();
    addSequence(tables, [{ channel: 'sms' }], { exit_conditions: ['stage_changed'] });
    mockClient = makeDb(tables).client;
    const response = await patch({ name: 'Nombre actualizado' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { name: 'Nombre actualizado', exit_conditions: ['stage_changed'] } });
    expect(tables.sequence_steps[0].channel).toBe('sms');
  });

  it('mantiene la denegación del servidor a un lector que intenta crear o modificar', async () => {
    mockCanManage = false;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const from = jest.spyOn(mockClient, 'from');
    expect((await POST(request('POST', { name: 'Seguimiento', steps: [step] }))).status).toBe(403);
    expect((await patch({ name: 'Modificado' })).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each(['active', 'paused', 'completed', 'exited'])('no elimina una secuencia con historial %s ni sus pasos', async (status) => {
    const tables = baseTables();
    addSequence(tables, [{ channel: 'email' }]);
    tables.sequence_enrollments.push({ id: 'enrollment-1', sequence_id: 'seq-1', organization_id: ORG, status });
    mockClient = makeDb(tables).client;
    const before = JSON.stringify(tables);
    const rpc = jest.spyOn(mockClient, 'rpc');
    const from = jest.spyOn(mockClient, 'from');
    const response = await DELETE(request('DELETE', {}), { params: Promise.resolve({ id: 'seq-1' }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: 'secuencia_con_historial', error: 'Esta secuencia tiene historial. Desactívala para conservarlo.' });
    expect(JSON.stringify(tables)).toBe(before);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('elimina una configuración sin uso con una sola RPC y repetir la acción sigue siendo idempotente', async () => {
    const tables = baseTables();
    addSequence(tables, [{ channel: 'email' }]);
    mockClient = makeDb(tables).client;
    const rpc = jest.spyOn(mockClient, 'rpc');
    const from = jest.spyOn(mockClient, 'from');
    const response = await DELETE(request('DELETE', {}), { params: Promise.resolve({ id: 'seq-1' }) });
    expect(response.status).toBe(200);
    expect(tables.sequences).toEqual([]);
    expect(tables.sequence_steps).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_crm_delete_sequence', { p_org: ORG, p_sequence_id: 'seq-1' });
    expect(from).not.toHaveBeenCalled();
    expect((await DELETE(request('DELETE', {}), { params: Promise.resolve({ id: 'seq-1' }) })).status).toBe(200);
  });
});
