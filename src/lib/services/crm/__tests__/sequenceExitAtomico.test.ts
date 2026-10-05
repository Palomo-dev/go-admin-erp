import { enrollInSequence, resumeEnrollment, unenrollFromSequence } from '../sequenceService';
import { makeDb, baseTables, addSequence, ORG, OTHER_ORG } from './f8FakeDb';

jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));

describe('Secuencias: retiro atómico y errores de la RPC', () => {
  it('retira una inscripción sin alterar pasos ejecutados, en curso o de otra organización', async () => {
    const tables = baseTables();
    addSequence(tables, [{}, { step_number: 2 }]);
    const { client, tables: db } = makeDb(tables);
    const enrollment = await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const pending = db.sequence_step_runs[0];
    const second = db.sequence_step_runs[1];
    second.status = 'running';
    const foreign = { ...pending, id: 'foreign-run', organization_id: OTHER_ORG, status: 'pending' };
    const completed = { ...pending, id: 'completed-run', status: 'completed' };
    db.sequence_step_runs.push(foreign, completed);
    const rpc = jest.spyOn(client, 'rpc');
    const direct = jest.spyOn(client, 'from');

    const result = await unenrollFromSequence(ORG, enrollment.id, client);

    expect(result).toMatchObject({ id: enrollment.id, status: 'exited', exit_reason: 'manual_unenroll' });
    expect(pending.status).toBe('skipped');
    expect(second.status).toBe('running');
    expect(completed.status).toBe('completed');
    expect(foreign.status).toBe('pending');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_exit_sequence_enrollment', { p_org: ORG, p_enrollment_id: enrollment.id, p_reason: 'manual_unenroll' });
    expect(direct).not.toHaveBeenCalled();
  });

  it('un fallo del segundo cambio no deja la inscripción retirada con pasos pendientes', async () => {
    const tables = baseTables();
    addSequence(tables, [{}]);
    const { client, tables: db } = makeDb(tables, {
      failUpdate: (table) => table === 'sequence_step_runs'
        ? { code: '23514', message: 'paso_invalido', details: null, hint: null } : null,
    });
    const enrollment = await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await expect(unenrollFromSequence(ORG, enrollment.id, client)).rejects.toMatchObject({ code: '23514', message: 'paso_invalido' });
    expect(db.sequence_enrollments[0].status).toBe('active');
    expect(db.sequence_step_runs[0].status).toBe('pending');
  });

  it('retirar nuevamente o desde otra organización no modifica la inscripción', async () => {
    const tables = baseTables();
    addSequence(tables, [{}]);
    const { client, tables: db } = makeDb(tables);
    const enrollment = await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    expect(await unenrollFromSequence(OTHER_ORG, enrollment.id, client)).toBeNull();
    expect(db.sequence_enrollments[0].status).toBe('active');
    await unenrollFromSequence(ORG, enrollment.id, client);
    expect(await unenrollFromSequence(ORG, enrollment.id, client)).toBeNull();
  });

  it.each([
    ['enroll', '42501', 'sin_permiso'],
    ['resume', 'P0001', 'registro_cambio'],
    ['exit', 'P0002', 'enrollment_not_found'],
  ] as const)('%s conserva el código nativo sin repetir la llamada ni ejecutar escrituras separadas', async (action, code, message) => {
    const { client } = makeDb(baseTables());
    const rpc = jest.spyOn(client, 'rpc').mockResolvedValue({ data: null, error: { name: 'PostgrestError', code, message, details: '', hint: '' }, count: null, status: 409, statusText: 'Conflict' });
    const direct = jest.spyOn(client, 'from');
    const result = action === 'enroll' ? enrollInSequence(ORG, 'seq-1', 'opp-1', client)
      : action === 'resume' ? resumeEnrollment(ORG, 'enr-1', client)
        : unenrollFromSequence(ORG, 'enr-1', client);
    await expect(result).rejects.toMatchObject({ code, message });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(direct).not.toHaveBeenCalled();
  });
});
