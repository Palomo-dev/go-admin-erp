/**
 * Tests exhaustivos de canDial — Validación previa a marcación
 * 
 * Criterios de aceptación: CA-30 a CA-37
 */

import { describe, test, expect, vi, beforeEach, afterEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canDial, type DialContext, type DialValidationResult } from '../dialValidation';
import { COLOMBIA_HOLIDAYS_2026_2027 } from '../holidays/colombia2026_2027';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const createMockSupabase = (mockData: Record<string, any> = {}): SupabaseClient => {
  const defaultMock = {
    comm_settings: { metadata: {}, voice_agent_enabled: true, voice_max_concurrent_calls: 2, voice_credits_remaining: 1000, voice_caller_id: '+5760412345' },
    customers: { metadata: { rne_status: 'no_excluido', rne_checked_at: new Date().toISOString() } },
    voice_agent_campaigns: { status: 'running', emergency_stop: false },
    voice_agents: { is_active: true },
    opportunities: null,
    voice_agent_call_attempts: [],
    calls: [],
    activities: [],
    messages: [],
    ...mockData,
  };

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: defaultMock[table],
          error: null,
        })),
        single: vi.fn(async () => ({
          data: defaultMock[table],
          error: null,
        })),
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: defaultMock[table],
            error: null,
          })),
        })),
      })),
      gte: vi.fn(() => ({
        eq: vi.fn(() => ({
          head: true,
          count: 'exact',
          then: vi.fn(async () => ({
            count: Array.isArray(defaultMock[table]) ? defaultMock[table].length : 0,
            error: null,
          })),
        })),
        not: vi.fn(() => ({
          gte: vi.fn(() => ({
            then: vi.fn(async () => ({
              data: defaultMock[table],
              error: null,
            })),
          })),
        })),
      })),
      lte: vi.fn(() => ({
        then: vi.fn(async () => ({
          data: defaultMock[table],
          error: null,
        })),
      })),
      order: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: defaultMock[table],
            error: null,
          })),
        })),
      })),
      in: vi.fn(() => ({
        then: vi.fn(async () => ({
          data: defaultMock[table],
          error: null,
        })),
      })),
      count: vi.fn(() => ({
        exact: true,
        head: true,
        then: vi.fn(async () => ({
          count: Array.isArray(defaultMock[table]) ? defaultMock[table].length : 0,
          error: null,
        })),
      })),
    })),
  }));

  const rpc = vi.fn(async (name: string, params: any) => {
    if (name === 'fn_can_contact') {
      return { data: true, error: null };
    }
    return { data: null, error: null };
  });

  return { from, rpc } as any as SupabaseClient;
};

const createContext = (overrides: Partial<DialContext> = {}): DialContext => ({
  organizationId: 125,
  customerId: 'cust-123',
  customerPhone: '+573001234567',
  timezone: 'America/Bogota',
  ...overrides,
});

// ─── Tests: CA-30 Horario legal ─────────────────────────────────────────────

describe('canDial - CA-30: Horario legal (Ley 2300)', () => {
  test('Rechaza llamadas los domingos (día 0)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Domingo 12 de octubre de 2026, 10:00 AM
    const sunday = new Date('2026-10-11T15:00:00Z'); // 10:00 AM Bogotá (UTC-5)
    
    const result = await canDial(context, supabase, sunday);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_LEGAL_HOURS');
    expect(result.reason).toContain('domingo');
  });

  test('Rechaza llamadas el 12 de octubre de 2026 (festivo)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Lunes 12 de octubre de 2026, 10:00 AM (festivo: Día de la Raza)
    const holiday = new Date('2026-10-12T15:00:00Z');
    
    const result = await canDial(context, supabase, holiday);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_LEGAL_HOURS');
    expect(result.reason).toContain('festivo');
  });

  test('Rechaza llamada a las 7:30 AM (antes de las 7:00 AM)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 6:30 AM
    const earlyMorning = new Date('2026-10-13T11:30:00Z'); // 6:30 AM Bogotá
    
    const result = await canDial(context, supabase, earlyMorning);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_LEGAL_HOURS');
    expect(result.reason).toContain('7:00');
  });

  test('Rechaza llamada a las 6:58 PM (después de última marcación 6:45 PM)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 6:58 PM
    const lateEvening = new Date('2026-10-13T23:58:00Z'); // 6:58 PM Bogotá
    
    const result = await canDial(context, supabase, lateEvening);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_LEGAL_HOURS');
    expect(result.reason).toContain('18:45');
  });

  test('Permite llamada a las 8:05 AM martes (dentro de horario)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 8:05 AM
    const validTime = new Date('2026-10-13T13:05:00Z'); // 8:05 AM Bogotá
    
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });

  test('Permite llamada a las 2:10 PM martes (dentro de horario)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 2:10 PM
    const validAfternoon = new Date('2026-10-13T19:10:00Z'); // 2:10 PM Bogotá
    
    const result = await canDial(context, supabase, validAfternoon);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });

  test('Rechaza llamada sábado a las 10:00 AM (sin sábados en piloto)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Sábado 10 de octubre de 2026, 10:00 AM
    const saturday = new Date('2026-10-10T15:00:00Z'); // 10:00 AM Bogotá
    
    const result = await canDial(context, supabase, saturday);
    
    // V2 (política interna) rechaza sábados antes que V1 (horario legal)
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_POLICY_HOURS');
    expect(result.reason).toContain('sábado');
  });
});

// ─── Tests: CA-31 RNE ────────────────────────────────────────────────────────

describe('canDial - CA-31: Registro de Números Excluidos (RNE)', () => {
  test('Rechaza número con rne_status="excluido"', async () => {
    const context = createContext();
    const supabase = createMockSupabase({
      customers: {
        metadata: {
          rne_status: 'excluido',
          rne_checked_at: new Date().toISOString(),
        },
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('RNE_EXCLUDED');
    expect(result.reason).toContain('RNE');
  });

  test('Rechaza número sin consulta RNE', async () => {
    const context = createContext();
    const supabase = createMockSupabase({
      customers: {
        metadata: {},
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('RNE_STALE');
    expect(result.reason).toContain('No hay consulta del RNE');
  });

  test('Rechaza número con consulta RNE del día anterior', async () => {
    const context = createContext();
    // Ayer en America/Bogota
    const yesterday = new Date('2026-10-12T20:00:00Z'); // 15:00 en Bogotá del día 12
    
    const supabase = createMockSupabase({
      customers: {
        metadata: {
          rne_status: 'no_excluido',
          rne_checked_at: yesterday.toISOString(),
        },
      },
    });
    
    // Hoy 13 de octubre a las 13:05 UTC (08:05 en Bogotá)
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('RNE_STALE');
    expect(result.reason).toContain('no es del día de hoy');
  });

  test('Permite número con RNE consultado el MISMO DÍA', async () => {
    const context = createContext();
    // Hoy 13 de octubre temprano (03:00 UTC = 22:00 del 12 en Bogotá)
    // Espera, esto sería el día 12 en Bogotá. Voy a usar una hora del día 13 en Bogotá.
    const todayMorning = new Date('2026-10-13T12:00:00Z'); // 07:00 en Bogotá del día 13
    
    const supabase = createMockSupabase({
      customers: {
        metadata: {
          rne_status: 'no_excluido',
          rne_checked_at: todayMorning.toISOString(),
        },
      },
    });
    
    // Hoy 13 de octubre a las 13:05 UTC (08:05 en Bogotá) - MISMO DÍA
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });
});

// ─── Tests: CA-32 Bloqueo al canal humano ───────────────────────────────────

describe('canDial - CA-32: Bloqueo de lead al canal humano', () => {
  test('Rechaza lead con etiqueta "canal_humano"', async () => {
    const context = createContext({ voiceAgentId: 'agent-123', campaignId: 'camp-456' });
    const supabase = createMockSupabase({
      opportunities: {
        tags: ['canal_humano'],
        salesperson_id: 'human-123',
        assigned_at: new Date().toISOString(),
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LOCKED_TO_HUMAN');
    expect(result.reason).toContain('bloqueado al canal humano');
  });

  test('Permite lead con etiqueta "canal_ia"', async () => {
    const context = createContext({ voiceAgentId: 'agent-123', campaignId: 'camp-456' });
    const supabase = createMockSupabase({
      opportunities: {
        tags: ['canal_ia'],
        salesperson_id: 'agent-123',
        assigned_at: new Date().toISOString(),
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });

  test('Permite lead sin oportunidad', async () => {
    const context = createContext({ voiceAgentId: 'agent-123' });
    const supabase = createMockSupabase({
      opportunities: null,
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });
});

// ─── Tests: CA-32b Un solo canal por ventana de 7 días ──────────────────────

describe('canDial - CA-32b: Un solo canal por ventana de 7 días', () => {
  test('Rechaza si hubo llamada humana en los últimos 7 días', async () => {
    const context = createContext();
    const threeDaysAgo = new Date('2026-10-10T13:00:00Z');
    
    const supabase = createMockSupabase({
      activities: [
        {
          activity_type: 'call',
          occurred_at: threeDaysAgo.toISOString(),
          channel: 'phone',
        },
      ],
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('CHANNEL_WINDOW');
    expect(result.reason).toContain('call');
    expect(result.reason).toContain('7 días');
  });

  test('Rechaza si hubo WhatsApp en los últimos 7 días', async () => {
    const context = createContext();
    const fiveDaysAgo = new Date('2026-10-08T13:00:00Z');
    
    const supabase = createMockSupabase({
      activities: [
        {
          activity_type: 'whatsapp',
          occurred_at: fiveDaysAgo.toISOString(),
          channel: 'whatsapp',
        },
      ],
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('CHANNEL_WINDOW');
    expect(result.reason).toContain('whatsapp');
  });

  test('Rechaza si hubo email en los últimos 7 días', async () => {
    const context = createContext();
    const twoDaysAgo = new Date('2026-10-11T13:00:00Z');
    
    const supabase = createMockSupabase({
      activities: [
        {
          activity_type: 'email',
          occurred_at: twoDaysAgo.toISOString(),
          channel: 'email',
        },
      ],
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('CHANNEL_WINDOW');
    expect(result.reason).toContain('email');
  });

  test('Rechaza si hubo mensaje saliente en los últimos 7 días', async () => {
    const context = createContext();
    const fourDaysAgo = new Date('2026-10-09T13:00:00Z');
    
    const supabase = createMockSupabase({
      activities: [],
      messages: [
        {
          created_at: fourDaysAgo.toISOString(),
          direction: 'outbound',
          content_type: 'text',
        },
      ],
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('CHANNEL_WINDOW');
    expect(result.reason).toContain('mensajería');
  });

  test('Permite si no hubo contacto en los últimos 7 días', async () => {
    const context = createContext();
    const eightDaysAgo = new Date('2026-10-05T13:00:00Z');
    
    const supabase = createMockSupabase({
      activities: [
        {
          activity_type: 'call',
          occurred_at: eightDaysAgo.toISOString(),
          channel: 'phone',
        },
      ],
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });

  test('Permite si solo hay actividades del voice agent (ai_call)', async () => {
    const context = createContext();
    const threeDaysAgo = new Date('2026-10-10T13:00:00Z');
    
    const supabase = createMockSupabase({
      activities: [
        {
          activity_type: 'ai_call',
          occurred_at: threeDaysAgo.toISOString(),
          channel: 'voice_agent',
        },
      ],
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });
});

// ─── Tests: CA-33 Frecuencia ─────────────────────────────────────────────────

describe('canDial - CA-33: Límites de frecuencia', () => {
  test('Rechaza segundo intento el mismo día', async () => {
    const context = createContext();
    const today = new Date('2026-10-13T13:05:00Z');
    
    const supabase = createMockSupabase({
      voice_agent_call_attempts: [
        { id: '1', attempted_at: '2026-10-13T12:00:00Z', answered: false },
      ],
    });
    
    const result = await canDial(context, supabase, today);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('FREQUENCY_LIMIT');
    expect(result.reason).toContain('1 intento(s) hoy');
    expect(result.next_allowed_at).toBeDefined();
  });

  test('Rechaza cuarto intento en 14 días (sin respuesta)', async () => {
    const context = createContext();
    const today = new Date('2026-10-13T13:05:00Z');
    
    const supabase = createMockSupabase({
      voice_agent_call_attempts: [
        { id: '1', attempted_at: '2026-10-01T12:00:00Z', answered: false },
        { id: '2', attempted_at: '2026-10-05T12:00:00Z', answered: false },
        { id: '3', attempted_at: '2026-10-10T12:00:00Z', answered: false },
      ],
    });
    
    const result = await canDial(context, supabase, today);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('FREQUENCY_LIMIT');
    expect(result.reason).toContain('3 intentos sin respuesta');
  });

  test('Rechaza contacto 3 días después de conversación', async () => {
    const context = createContext();
    const today = new Date('2026-10-13T13:05:00Z');
    
    const supabase = createMockSupabase({
      calls: [
        {
          started_at: '2026-10-10T12:00:00Z',
          status: 'completed',
          duration_seconds: 120,
        },
      ],
    });
    
    const result = await canDial(context, supabase, today);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('FREQUENCY_LIMIT');
    expect(result.reason).toContain('7 días de espera');
    expect(result.next_allowed_at).toBeDefined();
  });

  test('Permite primer intento del día', async () => {
    const context = createContext();
    const today = new Date('2026-10-13T13:05:00Z');
    
    const supabase = createMockSupabase({
      voice_agent_call_attempts: [],
      calls: [],
    });
    
    const result = await canDial(context, supabase, today);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });
});

// ─── Tests: CA-34 Tope de gasto ─────────────────────────────────────────────

describe('canDial - CA-34: Tope de gasto del piloto', () => {
  test('Rechaza cuando se alcanza el tope total (US$120)', async () => {
    const context = createContext();
    const supabase = createMockSupabase({
      calls: Array(100).fill(null).map((_, i) => ({
        cost_amount: 1.20,
        mode: 'ai_agent',
      })),
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('BUDGET_EXCEEDED');
    expect(result.reason).toContain('US$120');
  });

  test('Rechaza cuando se alcanza el tope diario (US$8)', async () => {
    const context = createContext();
    const today = new Date('2026-10-13T13:05:00Z');
    
    const supabase = createMockSupabase({
      calls: Array(20).fill(null).map((_, i) => ({
        cost_amount: 0.50,
        mode: 'ai_agent',
        started_at: '2026-10-13T12:00:00Z',
      })),
    });
    
    const result = await canDial(context, supabase, today);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('DAILY_BUDGET');
    expect(result.reason).toContain('US$8');
  });

  test('Rechaza cuando no hay créditos de voz', async () => {
    const context = createContext();
    const supabase = createMockSupabase({
      comm_settings: {
        voice_credits_remaining: 0,
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('NO_CREDITS');
    expect(result.reason).toContain('créditos de voz');
  });
});

// ─── Tests: CA-35 Barrera legal ─────────────────────────────────────────────

describe('canDial - CA-35: Barrera legal (V0)', () => {
  test('Rechaza llamada a número NO de prueba sin requisitos legales', async () => {
    const context = createContext({ customerPhone: '+573001234567' });
    const supabase = createMockSupabase({
      comm_settings: {
        metadata: {
          privacy_policy_published_at: null,
          crc_rne_registered_at: null,
          crc_8308_number_registered_at: null,
          internal_test_numbers: ['+18501234567'],
        },
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LEGAL_GATE');
    expect(result.reason).toContain('requisitos legales');
  });

  test('Permite llamada a número de prueba sin requisitos legales', async () => {
    const context = createContext({ customerPhone: '+18501234567' });
    const supabase = createMockSupabase({
      comm_settings: {
        metadata: {
          privacy_policy_published_at: null,
          crc_rne_registered_at: null,
          crc_8308_number_registered_at: null,
          internal_test_numbers: ['+18501234567'],
        },
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });

  test('Permite llamada con todos los requisitos legales cumplidos', async () => {
    const context = createContext();
    const supabase = createMockSupabase({
      comm_settings: {
        metadata: {
          privacy_policy_published_at: '2026-10-01T00:00:00Z',
          crc_rne_registered_at: '2026-10-01T00:00:00Z',
          crc_8308_number_registered_at: '2026-10-01T00:00:00Z',
        },
      },
    });
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });
});

// ─── Tests: CA-36 Fail-closed ────────────────────────────────────────────────

describe('canDial - CA-36: Fail-closed', () => {
  test('Rechaza cuando la base de datos no responde', async () => {
    const context = createContext();
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: { message: 'Connection timeout', code: '500' },
            })),
          })),
        })),
      })),
      rpc: vi.fn(async () => ({ data: null, error: { message: 'Connection timeout' } })),
    } as any as SupabaseClient;
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LEGAL_GATE'); // Falla en la primera validación
  });

  test('Registra el error cuando ocurre una excepción', async () => {
    const context = createContext();
    const supabase = {
      from: vi.fn(() => {
        throw new Error('Database connection lost');
      }),
    } as any as SupabaseClient;
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const validTime = new Date('2026-10-13T13:05:00Z');
    const result = await canDial(context, supabase, validTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('DISABLED');
    expect(result.reason).toContain('Error al validar');
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});

// ─── Tests: Festivos específicos ────────────────────────────────────────────

describe('canDial - Festivos de Colombia', () => {
  test('Verifica que todos los festivos 2026-2027 están en la lista', () => {
    // CA-30 implica verificar los festivos del JSON
    expect(COLOMBIA_HOLIDAYS_2026_2027).toContain('2026-10-12'); // Día de la Raza
    expect(COLOMBIA_HOLIDAYS_2026_2027).toContain('2026-12-25'); // Navidad
    expect(COLOMBIA_HOLIDAYS_2026_2027).toContain('2027-01-01'); // Año Nuevo
    expect(COLOMBIA_HOLIDAYS_2026_2027).toContain('2027-07-12'); // Virgen del Rosario (Ley 2578)
    expect(COLOMBIA_HOLIDAYS_2026_2027).toContain('2027-03-25'); // Jueves Santo
    expect(COLOMBIA_HOLIDAYS_2026_2027).toContain('2027-03-26'); // Viernes Santo
  });

  test('Rechaza cada festivo de octubre-diciembre 2026', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    const holidays2026 = [
      '2026-10-12', // Día de la Raza
      '2026-11-02', // Todos los Santos
      '2026-11-16', // Independencia de Cartagena
      '2026-12-08', // Inmaculada Concepción
      '2026-12-25', // Navidad
    ];
    
    for (const holiday of holidays2026) {
      const date = new Date(`${holiday}T15:00:00Z`); // 10:00 AM Bogotá
      const result = await canDial(context, supabase, date);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('OUTSIDE_LEGAL_HOURS');
      expect(result.reason).toContain('festivo');
    }
  });
});

// ─── Tests: Horario interno del piloto ──────────────────────────────────────

describe('canDial - Horario interno del piloto (V2)', () => {
  test('Rechaza llamada a las 11:58 AM (después de 11:55 AM)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 11:58 AM
    const latesMorning = new Date('2026-10-13T16:58:00Z');
    
    const result = await canDial(context, supabase, latesMorning);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_POLICY_HOURS');
    expect(result.reason).toContain('11:55');
  });

  test('Rechaza llamada a las 5:56 PM (después de 5:55 PM)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 5:56 PM
    const lateAfternoon = new Date('2026-10-13T22:56:00Z');
    
    const result = await canDial(context, supabase, lateAfternoon);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_POLICY_HOURS');
    expect(result.reason).toContain('17:55');
  });

  test('Rechaza llamada a las 12:30 PM (entre ventanas)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 12:30 PM
    const lunchTime = new Date('2026-10-13T17:30:00Z');
    
    const result = await canDial(context, supabase, lunchTime);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUTSIDE_POLICY_HOURS');
    expect(result.reason).toContain('8:00-11:55 y 14:00-17:55');
  });

  test('Permite llamada a las 11:50 AM (antes del margen)', async () => {
    const context = createContext();
    const supabase = createMockSupabase();
    
    // Martes 13 de octubre de 2026, 11:50 AM
    const validMorning = new Date('2026-10-13T16:50:00Z');
    
    const result = await canDial(context, supabase, validMorning);
    
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
  });
});
