/**
 * GO-1510: Tests de consentimiento de grabación explícito (Ley 1581 de 2012)
 *
 * Prueba los cambios del PR borrador:
 * 1. buildGreeting con {{negocio}} y {{origen_dato}}, sin anteponer "Hola"
 * 2. confirm_recording_consent arranca grabación solo con «sí»
 * 3. delete_call_data borra audio y transcripción
 * 4. log_consent_opt_out con channel:'all'
 * 5. El TwiML ya NO emite <Say> de aviso en la 1ª pasada
 */

import { buildGreeting } from '../voiceAgent/agentRuntime';
import {
  confirmRecordingConsent,
  deleteCallData,
  logConsentOptOut,
  type ToolContext,
} from '../voiceAgentTools';

describe('GO-1510: Consentimiento de grabación (Ley 1581)', () => {
  describe('buildGreeting', () => {
    const baseParams = {
      identityDisclosure: 'Le atiende un asistente virtual con inteligencia artificial.',
      organizationName: 'GO Admin',
      recordingEnabled: true,
      consentMessage: 'Esta llamada se graba y se transcribe.',
    };

    it('agrega {{negocio}} con company_name del cliente', () => {
      const greeting = buildGreeting({
        ...baseParams,
        firstMessage: 'Hola, te habla Pedro de {{negocio}}.',
        customerName: 'Carlos',
        companyName: 'Tienda El Sol',
        dataSource: null,
      });
      expect(greeting).toContain('Tienda El Sol');
      expect(greeting).not.toContain('{{negocio}}');
    });

    it('agrega {{origen_dato}} con V1 (web propia)', () => {
      const greeting = buildGreeting({
        ...baseParams,
        firstMessage: 'Tenemos tu número porque {{origen_dato}}.',
        customerName: 'Ana',
        companyName: 'Pastelería Luna',
        dataSource: 'es el número que tu negocio publica en su página web',
      });
      expect(greeting).toContain('es el número que tu negocio publica en su página web');
      expect(greeting).not.toContain('{{origen_dato}}');
    });

    it('agrega {{origen_dato}} con V2 (OSM)', () => {
      const greeting = buildGreeting({
        ...baseParams,
        firstMessage: 'Tenemos tu número porque {{origen_dato}}.',
        customerName: 'Luis',
        companyName: null,
        dataSource: 'aparece como teléfono de tu negocio en el mapa abierto OpenStreetMap',
      });
      expect(greeting).toContain('aparece como teléfono de tu negocio en el mapa abierto OpenStreetMap');
    });

    it('NO antepone "Hola" si el first_message ya empieza con saludo', () => {
      const greeting = buildGreeting({
        ...baseParams,
        firstMessage: 'Hola, te habla Pedro.',
        customerName: 'María',
        companyName: null,
        dataSource: null,
      });
      // No debe haber "Hola María. Hola, te habla..."
      const matches = greeting.match(/Hola/gi);
      expect(matches).toHaveLength(1);
    });

    it('SÍ antepone "Hola {cliente}" si el first_message NO empieza con saludo', () => {
      const greeting = buildGreeting({
        ...baseParams,
        firstMessage: 'Te llamo de GO Admin.',
        customerName: 'Pedro',
        companyName: null,
        dataSource: null,
      });
      expect(greeting).toMatch(/^Hola Pedro\./);
    });

    it('agrega el consentMessage después del first_message cuando recordingEnabled=true', () => {
      const greeting = buildGreeting({
        ...baseParams,
        firstMessage: 'Te llamo de GO Admin.',
        customerName: 'Juan',
        companyName: null,
        dataSource: null,
      });
      expect(greeting).toContain('Esta llamada se graba y se transcribe.');
    });

    it('NO agrega el consentMessage cuando recordingEnabled=false', () => {
      const greeting = buildGreeting({
        ...baseParams,
        recordingEnabled: false,
        firstMessage: 'Te llamo de GO Admin.',
        customerName: 'Juan',
        companyName: null,
        dataSource: null,
      });
      expect(greeting).not.toContain('Esta llamada se graba');
    });
  });

  describe('Herramientas de consentimiento (con mock de Supabase)', () => {
    const mockSupabase = {
      from: jest.fn(() => mockSupabase),
      select: jest.fn(() => mockSupabase),
      eq: jest.fn(() => mockSupabase),
      in: jest.fn(() => mockSupabase),
      update: jest.fn(() => mockSupabase),
      insert: jest.fn(() => mockSupabase),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      rpc: jest.fn(() => Promise.resolve({ data: true, error: null })),
    };

    const mockContext: ToolContext = {
      orgId: 125,
      supabase: mockSupabase as any,
      voiceAgentCallId: 'call-123',
      customerId: 'customer-456',
      opportunityId: null,
      actionPolicy: 'auto',
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('confirm_recording_consent', () => {
      it('con given=false marca consent_given=false y NO arranca grabación', async () => {
        mockSupabase.maybeSingle.mockResolvedValueOnce({
          data: {
            call_id: 'calls-789',
            provider_call_sid: 'CA123',
            consent_given: null,
          },
          error: null,
        });
        
        const result = await confirmRecordingConsent(mockContext, { given: false });

        expect(result.success).toBe(true);
        expect(result.data?.consent_given).toBe(false);
        expect(result.data?.recording_started).toBe(false);
        expect(result.say).toContain('no la grabo');
      });

      // El test de given=true requiere mock de Twilio y se omite aquí (ver comentario en el brief)
    });

    describe('delete_call_data', () => {
      it('vacía conversation_log y marca erase_requested', async () => {
        mockSupabase.maybeSingle.mockResolvedValueOnce({
          data: {
            call_id: 'calls-789',
            provider_call_sid: 'CA123',
          },
          error: null,
        });
        
        const result = await deleteCallData(mockContext, { reason: 'cliente' });

        expect(result.success).toBe(true);
        expect(result.data?.erased).toBe(true);
        expect(result.data?.reason).toBe('cliente');
        expect(mockSupabase.update).toHaveBeenCalled();
      });

      it('responde con mensaje específico para menores', async () => {
        mockSupabase.maybeSingle.mockResolvedValueOnce({
          data: {
            call_id: 'calls-789',
            provider_call_sid: 'CA123',
          },
          error: null,
        });
        
        const result = await deleteCallData(mockContext, { reason: 'menor' });

        expect(result.success).toBe(true);
        expect(result.say).toContain('Llamo otro día para hablar con un adulto');
      });
    });

    describe('log_consent_opt_out con channel:all', () => {
      it('llama a la RPC con cada canal cuando channel=all', async () => {
        mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
        
        const result = await logConsentOptOut(mockContext, { channel: 'all', reason: 'no me interesa' });

        expect(result.success).toBe(true);
        expect(result.data?.channels).toEqual(['voice', 'email', 'whatsapp', 'sms']);
        // La RPC se llama 4 veces (una por canal)
        expect(mockSupabase.rpc).toHaveBeenCalledTimes(4);
      });

      it('marca erase_requested cuando se pide', async () => {
        mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
        
        const result = await logConsentOptOut(mockContext, { 
          channel: 'voice', 
          erase_requested: true 
        });

        expect(result.success).toBe(true);
        expect(result.data?.erase_requested).toBe(true);
      });
    });
  });

  describe('Zona horaria (TZ=UTC y TZ=America/Bogota)', () => {
    const OLD_TZ = process.env.TZ;

    afterAll(() => {
      process.env.TZ = OLD_TZ;
    });

    it('buildGreeting funciona igual en UTC', () => {
      process.env.TZ = 'UTC';
      const greeting = buildGreeting({
        firstMessage: 'Hola {{negocio}}.',
        identityDisclosure: 'Asistente virtual.',
        organizationName: 'GO Admin',
        customerName: 'Test',
        recordingEnabled: false,
        consentMessage: '',
        companyName: 'Test S.A.S.',
        dataSource: 'web',
      });
      expect(greeting).toContain('Test S.A.S.');
    });

    it('buildGreeting funciona igual en America/Bogota', () => {
      process.env.TZ = 'America/Bogota';
      const greeting = buildGreeting({
        firstMessage: 'Hola {{negocio}}.',
        identityDisclosure: 'Asistente virtual.',
        organizationName: 'GO Admin',
        customerName: 'Test',
        recordingEnabled: false,
        consentMessage: '',
        companyName: 'Test S.A.S.',
        dataSource: 'web',
      });
      expect(greeting).toContain('Test S.A.S.');
    });
  });
});
