/**
 * D-17: Pruebas del barrido de llamadas atascadas.
 */

import { sweepStalledCalls } from '../stalledCallsSweeper';

describe('sweepStalledCalls', () => {
  const orgId = 123;
  let mockSupabase: any;
  let vacUpdates: any[];
  let callUpdates: any[];

  const createMockSupabase = (stalledData: any[] = []) => {
    vacUpdates = [];
    callUpdates = [];

    return {
      from: jest.fn((table: string) => {
        if (table === 'voice_agent_calls') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            lt: jest.fn().mockResolvedValue({ data: stalledData, error: null }),
            update: jest.fn((patch: any) => {
              vacUpdates.push(patch);
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ error: null })
                })
              };
            })
          };
        }
        if (table === 'calls') {
          return {
            update: jest.fn((patch: any) => {
              callUpdates.push(patch);
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ error: null })
                })
              };
            })
          };
        }
        return {};
      })
    };
  };

  test('no hace nada si no hay llamadas atascadas', async () => {
    mockSupabase = createMockSupabase([]);
    await sweepStalledCalls(orgId, mockSupabase);

    expect(vacUpdates).toHaveLength(0);
    expect(callUpdates).toHaveLength(0);
  });

  test('cierra llamadas en dialing atascadas por más de 10 minutos', async () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const stalledCalls = [
      { id: 'vac-1', call_id: 'call-1', status: 'dialing', started_at: elevenMinutesAgo },
      { id: 'vac-2', call_id: 'call-2', status: 'ringing', started_at: elevenMinutesAgo }
    ];

    mockSupabase = createMockSupabase(stalledCalls);
    await sweepStalledCalls(orgId, mockSupabase);

    expect(vacUpdates).toHaveLength(2);
    expect(callUpdates).toHaveLength(2);
    
    expect(vacUpdates[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        outcome: 'stuck_timeout',
        locked_by: null
      })
    );
  });

  test('cierra solo voice_agent_calls si no hay call_id espejo', async () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const stalledCalls = [
      { id: 'vac-1', call_id: null, status: 'dialing', started_at: elevenMinutesAgo }
    ];

    mockSupabase = createMockSupabase(stalledCalls);
    await sweepStalledCalls(orgId, mockSupabase);

    expect(vacUpdates).toHaveLength(1);
    expect(callUpdates).toHaveLength(0);
  });

  test('maneja errores de base de datos sin lanzar excepción', async () => {
    mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
      }))
    };

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(sweepStalledCalls(orgId, mockSupabase)).resolves.not.toThrow();
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error al buscar llamadas atascadas'),
      expect.any(Object)
    );

    consoleErrorSpy.mockRestore();
  });

  test('verifica que el barrido funciona con el flujo correcto', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const stalledCalls = [
      { id: 'vac-test', call_id: 'call-test', status: 'dialing', started_at: elevenMinutesAgo }
    ];

    mockSupabase = createMockSupabase(stalledCalls);
    await sweepStalledCalls(orgId, mockSupabase);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cerrando llamada atascada'),
      expect.objectContaining({ vacId: 'vac-test' })
    );
    
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 llamadas atascadas cerradas')
    );

    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});
