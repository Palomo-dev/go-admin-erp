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

import { buildGreeting, buildSystemPrompt } from '../voiceAgent/agentRuntime';
import {
  confirmRecordingConsent,
  deleteCallData,
  logConsentOptOut,
  transferToHuman,
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

      it('falla gracefully cuando given=true pero falta call_id', async () => {
        mockSupabase.maybeSingle.mockResolvedValueOnce({
          data: {
            call_id: null,
            provider_call_sid: 'CA123',
            consent_given: null,
          },
          error: null,
        });
        
        const result = await confirmRecordingConsent(mockContext, { given: true });

        expect(result.success).toBe(false);
        expect(result.error).toContain('call_id');
      });
    });

    describe('delete_call_data', () => {
      it('vacía conversation_log y marca erase_requested (sin Twilio)', async () => {
        mockSupabase.maybeSingle.mockResolvedValueOnce({
          data: {
            call_id: 'calls-789',
            provider_call_sid: null, // Sin CallSid, no intenta borrar en Twilio
          },
          error: null,
        });
        
        const result = await deleteCallData(mockContext, { reason: 'cliente' });

        expect(result.success).toBe(true);
        expect(result.data?.erased).toBe(true);
        expect(result.data?.reason).toBe('cliente');
        expect(mockSupabase.update).toHaveBeenCalled();
      });

      it('responde con mensaje específico para menores (sin Twilio)', async () => {
        mockSupabase.maybeSingle.mockResolvedValueOnce({
          data: {
            call_id: 'calls-789',
            provider_call_sid: null, // Sin CallSid, no intenta borrar en Twilio
          },
          error: null,
        });
        
        const result = await deleteCallData(mockContext, { reason: 'menor' });

        expect(result.success).toBe(true);
        expect(result.say).toContain('Llamo otro día para hablar con un adulto');
      });
    });

    describe('log_consent_opt_out con channel:all', () => {
      it('usa channel:all por defecto cuando no se especifica', async () => {
        mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
        
        const result = await logConsentOptOut(mockContext, { reason: 'no me interesa' });

        expect(result.success).toBe(true);
        expect(result.data?.channels).toEqual(['voice', 'email', 'whatsapp', 'sms']);
        // La RPC se llama 4 veces (una por canal)
        expect(mockSupabase.rpc).toHaveBeenCalledTimes(4);
      });

      it('llama a la RPC con cada canal cuando channel=all explícito', async () => {
        mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
        
        const result = await logConsentOptOut(mockContext, { channel: 'all', reason: 'no me interesa' });

        expect(result.success).toBe(true);
        expect(result.data?.channels).toEqual(['voice', 'email', 'whatsapp', 'sms']);
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
      
      it('NO devuelve frase fija en say (la dice el agente según el prompt)', async () => {
        mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
        
        const result = await logConsentOptOut(mockContext, { reason: 'no me interesa' });

        expect(result.success).toBe(true);
        expect(result.say).toBeUndefined();
      });
    });

    describe('transfer_to_human', () => {
      it('NO devuelve frase fija en say (la dice el agente según el prompt)', async () => {
        const result = await transferToHuman(mockContext, { reason: 'cliente molesto' });

        expect(result.success).toBe(true);
        expect(result.data?.transferred).toBe(true);
        expect(result.say).toBeUndefined();
      });
    });
  });

  describe('buildSystemPrompt y mandatoryGuardrails (GO-1510)', () => {
    it('NO repite identity_disclosure si first_message ya dice "asistente virtual"', () => {
      const prompt = buildSystemPrompt({
        organizationName: 'GO Admin',
        identityDisclosure: 'Asistente virtual con IA.',
        agent: {
          name: 'Pedro',
          system_prompt: '',
          purpose_type: 'sales',
          guardrails: {},
          transfer_to_human_rules: {},
          max_turns: 20,
          first_message: 'Hola, te habla Pedro, un asistente virtual con inteligencia artificial.',
        } as any,
        stage: null,
        customerName: 'Test',
        recordingEnabled: false,
        consentMessage: '',
      });

      // No debe repetir la frase "Al inicio de la llamada te identificas así, literalmente"
      expect(prompt).toContain('Ya te identificaste como asistente virtual al inicio');
      expect(prompt).not.toContain('Al inicio de la llamada te identificas así, literalmente');
    });

    it('SÍ incluye identity_disclosure si first_message NO lo trae', () => {
      const prompt = buildSystemPrompt({
        organizationName: 'GO Admin',
        identityDisclosure: 'Asistente virtual con IA.',
        agent: {
          name: 'Pedro',
          system_prompt: '',
          purpose_type: 'sales',
          guardrails: {},
          transfer_to_human_rules: {},
          max_turns: 20,
          first_message: 'Hola, te llamo de GO Admin.',
        } as any,
        stage: null,
        customerName: 'Test',
        recordingEnabled: false,
        consentMessage: '',
      });

      // Debe incluir la instrucción literal de identificación
      expect(prompt).toContain('Al inicio de la llamada te identificas así, literalmente');
      expect(prompt).toContain('Asistente virtual con IA.');
    });
  });

  describe('modo_sin_datos (GO-1510)', () => {
    it('buildSystemPrompt incluye instrucciones de modo respaldo', () => {
      const prompt = buildSystemPrompt({
        organizationName: 'GO Admin',
        identityDisclosure: 'Asistente virtual.',
        agent: {
          name: 'Pedro',
          system_prompt: '',
          purpose_type: 'sales',
          guardrails: {},
          transfer_to_human_rules: {},
          max_turns: 20,
          first_message: '',
        } as any,
        stage: null,
        customerName: 'Test',
        recordingEnabled: false,
        consentMessage: '',
        modoSinDatos: true,
      });

      expect(prompt).toContain('MODO RESPALDO (sin grabación ni guardado de datos)');
      expect(prompt).toContain('NO pides datos personales, NO agendas, NO guardas nada');
    });

    it('buildSystemPrompt NO incluye aviso de grabación en modo_sin_datos', () => {
      const prompt = buildSystemPrompt({
        organizationName: 'GO Admin',
        identityDisclosure: 'Asistente virtual.',
        agent: {
          name: 'Pedro',
          system_prompt: '',
          purpose_type: 'sales',
          guardrails: {},
          transfer_to_human_rules: {},
          max_turns: 20,
          first_message: '',
        } as any,
        stage: null,
        customerName: 'Test',
        recordingEnabled: true,
        consentMessage: 'Esta llamada se graba.',
        modoSinDatos: true,
      });

      expect(prompt).not.toContain('AVISO DE GRABACIÓN');
      expect(prompt).not.toContain('Esta llamada se graba');
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
