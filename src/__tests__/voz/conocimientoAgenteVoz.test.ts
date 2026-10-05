/**
 * El agente de voz usa la base de conocimiento de la organización (la misma
 * del chat con IA): sin ella solo sabía lo que traía el guion y daba muy poca
 * información de la empresa.
 */
import { buildSystemPrompt, cargarConocimientoVoz, MAX_CONOCIMIENTO_VOZ } from '@/lib/services/crm/voiceAgent/agentRuntime';

const agente = {
  name: 'Pedro',
  system_prompt: 'Guion de prueba',
  purpose_type: 'book_meeting',
  guardrails: {},
  transfer_to_human_rules: {},
  max_turns: 20,
} as never;

function clienteCon(filas: unknown[], error: { message: string } | null = null) {
  const cadena: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'order']) cadena[m] = () => cadena;
  cadena.limit = async () => ({ data: error ? null : filas, error });
  return cadena as never;
}

describe('base de conocimiento en el agente de voz', () => {
  it('el prompt incluye los fragmentos después de las instrucciones de la organización', () => {
    const prompt = buildSystemPrompt({
      organizationName: 'Tu marca',
      identityDisclosure: 'Soy un asistente virtual',
      agent: agente,
      stage: null,
      customerName: null,
      recordingEnabled: false,
      consentMessage: '',
      conocimiento: [{ title: 'Diferencial', content: 'Todo en una sola plataforma' }],
    });
    expect(prompt).toContain('INFORMACIÓN DE Tu marca');
    expect(prompt).toContain('- Diferencial: Todo en una sola plataforma');
    expect(prompt.indexOf('INSTRUCCIONES DE LA ORGANIZACIÓN')).toBeLessThan(prompt.indexOf('INFORMACIÓN DE Tu marca'));
  });

  it('sin fragmentos no agrega el bloque', () => {
    const prompt = buildSystemPrompt({
      organizationName: 'Tu marca',
      identityDisclosure: 'Soy un asistente virtual',
      agent: agente,
      stage: null,
      customerName: null,
      recordingEnabled: false,
      consentMessage: '',
      conocimiento: [],
    });
    expect(prompt).not.toContain('INFORMACIÓN DE');
  });

  it('omite los «solo-chat», los vacíos y respeta el tope de longitud', async () => {
    const largo = 'x'.repeat(MAX_CONOCIMIENTO_VOZ - 10);
    const r = await cargarConocimientoVoz(
      clienteCon([
        { title: 'Solo chat', content: 'no va', tags: ['solo-chat'] },
        { title: 'Vacío', content: '   ', tags: null },
        { title: 'Largo', content: largo, tags: [] },
        { title: 'No cabe', content: 'y'.repeat(50), tags: [] },
      ]),
      125,
    );
    expect(r.map((f) => f.title)).toEqual(['Largo']);
  });

  it('si la lectura falla la llamada sigue sin conocimiento', async () => {
    const r = await cargarConocimientoVoz(clienteCon([], { message: 'boom' }), 125);
    expect(r).toEqual([]);
  });
});
