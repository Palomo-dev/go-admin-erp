/**
 * Latencia percibida del agente de voz (2026-10-07, llamada de prueba de la
 * org 125). Tres piezas puras y una de configuración:
 *  1. `AgrupadorTrozos`: trozos de 2–3 palabras completas, sin cortar
 *     palabras y sin perder ni cambiar texto.
 *  2. `resolverFinDeTurno`: nova-3 por defecto (sin cambios); Flux solo si el
 *     agente o el entorno lo activan, y nunca con valores fuera de rango.
 *  3. `buildSystemPrompt`: lo estable delante (prompt caching de OpenAI), lo
 *     de cada llamada (fecha, cliente, grabación) al final.
 *  4. `resolveVoiceModel`: configurable por organización, mismo resultado
 *     que antes cuando nadie configura nada.
 */

import {
  AgrupadorTrozos,
  MAX_SIN_ESPACIO,
  PALABRAS_POR_TROZO,
  PALABRAS_PRIMER_TROZO,
} from '@/lib/services/crm/voiceAgent/trozosVoz';
import { resolverFinDeTurno, UMBRAL_FLUX_POR_DEFECTO } from '@/lib/services/crm/voiceAgent/finDeTurno';
import { buildSystemPrompt } from '@/lib/services/crm/voiceAgent/agentRuntime';
import { resolveModel, resolveVoiceModel, type OrgModelSettings } from '@/lib/ai/agent/modelRouter';

function trocear(deltas: string[]): { trozos: string[]; resto: string } {
  const a = new AgrupadorTrozos();
  const trozos: string[] = [];
  for (const d of deltas) {
    const t = a.agregar(d);
    if (t) trozos.push(t);
  }
  return { trozos, resto: a.vaciar() };
}

describe('1. AgrupadorTrozos', () => {
  test('primer trozo de 2 palabras, luego de 3; nunca media palabra', () => {
    const deltas = ['Ent', 'iendo ', 'que ', 'man', 'ejan ', 'cuatro ', 'sedes ', 'en ', 'total ', 'hoy'];
    const { trozos, resto } = trocear(deltas);
    expect(trozos).toEqual(['Entiendo que ', 'manejan cuatro sedes ']);
    // «en total» (2 palabras) espera a la tercera; «hoy» aún no tiene espacio detrás.
    expect(resto).toBe('en total hoy');
    expect(PALABRAS_PRIMER_TROZO).toBe(2);
    expect(PALABRAS_POR_TROZO).toBe(3);
  });

  test('la puntuación cierra el trozo antes (respuesta corta sale enseguida)', () => {
    const { trozos } = trocear(['Sí, ', 'claro ', 'que ', 'sí.']);
    expect(trozos[0]).toBe('Sí, ');
  });

  test('un delta grande sale entero hasta la última palabra completa', () => {
    const { trozos, resto } = trocear(['Gracias por su tiempo, que tenga buen día']);
    expect(trozos).toEqual(['Gracias por su tiempo, que tenga buen ']);
    expect(resto).toBe('día');
  });

  test('texto largo sin espacios (una URL) no se retiene indefinidamente', () => {
    const url = 'https://example.com/' + 'a'.repeat(MAX_SIN_ESPACIO);
    const { trozos } = trocear([url]);
    expect(trozos).toEqual([url]);
  });

  test('la concatenación es idéntica al texto del modelo, partido como sea', () => {
    const texto = '¿Le parece bien que le llamemos hoy miércoles 7 de octubre a la 1:00 p. m.? Quedo atento.';
    for (const paso of [1, 2, 3, 5, 8, 13]) {
      const deltas: string[] = [];
      for (let i = 0; i < texto.length; i += paso) deltas.push(texto.slice(i, i + paso));
      const { trozos, resto } = trocear(deltas);
      expect(trozos.join('') + resto).toBe(texto);
      for (const t of trozos) expect(/\s$/.test(t) || t.length > MAX_SIN_ESPACIO).toBe(true);
    }
  });
});

describe('2. resolverFinDeTurno', () => {
  const agente = (voice_settings: Record<string, unknown> = {}) => ({ stt_provider: 'deepgram', voice_settings });

  test('por defecto, nova-3 como hasta hoy (sin atributos nuevos)', () => {
    expect(resolverFinDeTurno(agente(), 'es-MX', {})).toEqual({
      modelo: 'nova-3',
      speechModel: 'nova-3-general',
      transcriptionLanguage: 'es-MX',
      origen: 'default',
    });
  });

  test('otro proveedor de STT: no emite nada', () => {
    expect(resolverFinDeTurno({ stt_provider: 'google' }, 'es-MX', { VOICE_FIN_DE_TURNO: 'flux' })).toBeNull();
  });

  test('Flux por entorno: multilingüe y umbral por defecto', () => {
    expect(resolverFinDeTurno(agente(), 'es-MX', { VOICE_FIN_DE_TURNO: 'flux' })).toEqual({
      modelo: 'flux',
      speechModel: 'flux',
      transcriptionLanguage: 'multi',
      eotThreshold: UMBRAL_FLUX_POR_DEFECTO,
      origen: 'entorno',
    });
  });

  test('el agente manda sobre el entorno, con su umbral y su techo de silencio', () => {
    const r = resolverFinDeTurno(
      agente({ fin_de_turno: { modelo: 'flux', umbral: 0.6, silencio_max_ms: 1500 } }),
      'es-MX',
      { VOICE_FIN_DE_TURNO: 'nova-3', VOICE_EOT_THRESHOLD: '0.9' }
    );
    expect(r).toMatchObject({ speechModel: 'flux', eotThreshold: 0.6, speechTimeout: 1500, origen: 'agente' });
  });

  test('el agente puede volver a nova-3 aunque el entorno active Flux', () => {
    const r = resolverFinDeTurno(agente({ fin_de_turno: { modelo: 'nova-3' } }), 'es-MX', { VOICE_FIN_DE_TURNO: 'flux' });
    expect(r).toMatchObject({ speechModel: 'nova-3-general', origen: 'agente' });
  });

  test('valores fuera de rango se descartan (Twilio los rechazaría)', () => {
    const r = resolverFinDeTurno(agente(), 'es-MX', {
      VOICE_FIN_DE_TURNO: 'flux',
      VOICE_EOT_THRESHOLD: '0.3',
      VOICE_SPEECH_TIMEOUT_MS: '100',
    });
    expect(r?.eotThreshold).toBe(UMBRAL_FLUX_POR_DEFECTO);
    expect(r).not.toHaveProperty('speechTimeout');
    expect(resolverFinDeTurno(agente(), 'es-MX', { VOICE_FIN_DE_TURNO: 'cualquiera' })?.speechModel).toBe('nova-3-general');
  });
});

describe('3. Prompt de sistema con prefijo estable', () => {
  const base = {
    organizationName: 'Org 125',
    identityDisclosure: 'Le atiende un asistente virtual con inteligencia artificial.',
    agent: {
      name: 'Pedro',
      system_prompt: 'Guion de la organización.',
      purpose_type: 'qualify_lead',
      guardrails: {},
      transfer_to_human_rules: {},
      max_turns: 20,
    },
    stage: null,
    recordingEnabled: true,
    consentMessage: 'Esta llamada será grabada.',
    conocimiento: [{ title: 'Producto', content: 'Qué ofrece la empresa.' }],
  };

  test('dos llamadas distintas comparten todo hasta el bloque de la llamada', () => {
    const a = buildSystemPrompt({
      ...base,
      customerName: 'Ana',
      contexto: { ahora: new Date('2026-10-07T17:30:00Z'), zonaHoraria: 'America/Bogota', politicaDatosUrl: 'https://example.com/p' },
    });
    const b = buildSystemPrompt({
      ...base,
      customerName: 'Luis',
      contexto: { ahora: new Date('2026-10-08T14:05:00Z'), zonaHoraria: 'America/Bogota', politicaDatosUrl: 'https://example.com/p' },
    });
    let comun = 0;
    while (comun < a.length && a[comun] === b[comun]) comun++;
    // Todo lo estable (guardarraíles, instrucciones, conocimiento, límites) es prefijo común.
    expect(a.slice(0, comun)).toContain('INSTRUCCIONES DE LA ORGANIZACIÓN');
    expect(a.slice(0, comun)).toContain('INFORMACIÓN DE Org 125');
    expect(a.slice(0, comun)).toContain('no debe pasar de 20 turnos');
    // Lo variable va después.
    expect(a.indexOf('FECHA Y HORA ACTUALES')).toBeGreaterThan(a.indexOf('no debe pasar de 20 turnos'));
    expect(a.indexOf('Hablas con Ana')).toBeGreaterThan(a.indexOf('no debe pasar de 20 turnos'));
  });

  test('los guardarraíles obligatorios siguen siendo lo primero', () => {
    const p = buildSystemPrompt({ ...base, customerName: null });
    expect(p.startsWith('REGLAS OBLIGATORIAS')).toBe(true);
    expect(p).toContain('AVISO DE GRABACIÓN');
    expect(p).toContain('Propósito del agente: qualify_lead.');
  });
});

describe('4. resolveVoiceModel', () => {
  const vacio: OrgModelSettings = {
    model: null, temperature: null, maxTokens: null, systemRules: null, tone: null, language: null, overrides: {},
  };
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  test('sin configuración de voz: exactamente el modelo de conversación de antes', () => {
    delete process.env.OPENAI_VOICE_MODEL;
    for (const s of [vacio, { ...vacio, model: 'gpt-5.6-luna' }, { ...vacio, overrides: { conversation: 'x-conv' } }]) {
      expect(resolveVoiceModel(s)).toEqual(resolveModel('conversation', s));
    }
  });

  test('la organización manda: model_overrides.voice', () => {
    process.env.OPENAI_VOICE_MODEL = 'modelo-entorno';
    expect(resolveVoiceModel({ ...vacio, overrides: { voice: 'modelo-org' } })).toMatchObject({ model: 'modelo-org', source: 'organization' });
  });

  test('ai_settings.model de la organización va antes que el entorno', () => {
    process.env.OPENAI_VOICE_MODEL = 'modelo-entorno';
    expect(resolveVoiceModel({ ...vacio, model: 'gpt-5.6-luna' })).toMatchObject({ model: 'gpt-5.6-luna', source: 'organization' });
  });

  test('sin nada en la organización, OPENAI_VOICE_MODEL antes que el default', () => {
    process.env.OPENAI_VOICE_MODEL = 'modelo-entorno';
    expect(resolveVoiceModel(vacio)).toMatchObject({ model: 'modelo-entorno', source: 'environment' });
  });
});
