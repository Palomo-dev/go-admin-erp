/**
 * GO Assistant — preguntar con opciones, al estilo de Claude.
 *
 * El dueño lo dijo así: "prefiero que no uses formulario y mejor haga
 * preguntas, que saque un modal para confirmar datos con respuesta A, B, C u
 * Otro". Esta herramienta es ese modal.
 *
 * No escribe nada y no llama a ningún proveedor: solo PAUSA el turno y le
 * enseña al usuario una pregunta con 2–4 opciones (y "Otro" para responder a
 * mano). Lo que elija entra como su siguiente mensaje, y el modelo sigue con
 * ese dato. Una pregunta por turno: un cuestionario de cinco preguntas es un
 * formulario con otro nombre.
 *
 * Cuándo la usa el modelo (lo dice el prompt): cuando falta UN dato con pocas
 * respuestas posibles —¿persona o empresa?, ¿qué sucursal?, ¿borrador o
 * emitida?, ¿contado o crédito?, ¿cuál de estos tres productos?—. Cuando la
 * respuesta es texto libre (un nombre, un teléfono), pregunta en prosa.
 */

import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

export const QUESTION_TOOL = 'preguntar_opciones';

export interface PreguntaOpcion {
  /** A, B, C… lo pone el servidor. */
  key: string;
  label: string;
  /** Valor que el modelo quiere recibir de vuelta (id, código…), si difiere del texto. */
  value?: string;
}

export interface PreguntaArgs {
  question: string;
  options: PreguntaOpcion[];
  allowOther: boolean;
}

const LETRAS = ['A', 'B', 'C', 'D'];

export const preguntarOpciones: ToolDefinition<PreguntaArgs> = {
  name: QUESTION_TOOL,
  description:
    'Hace UNA pregunta al usuario con 2 a 4 opciones cerradas (más "Otro" si allow_other). Úsala cuando te falte un solo dato y las respuestas posibles sean pocas: ¿persona o empresa?, ¿qué sucursal?, ¿cuál de estos productos?, ¿la emito o queda en borrador?, ¿contado o crédito? NO la uses para pedir texto libre (nombres, teléfonos, importes): eso pregúntalo en prosa. Después de llamarla, termina tu turno: la respuesta llegará como el siguiente mensaje del usuario.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'La pregunta, corta y en segunda persona.' },
      options: {
        type: 'array',
        description: 'Entre 2 y 4 opciones.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Texto que ve el usuario.' },
            value: { type: 'string', description: 'Identificador que quieres recibir de vuelta (id de sucursal, código…). Opcional.' },
          },
          required: ['label'],
        },
      },
      allow_other: { type: 'boolean', description: 'Si el usuario puede responder algo distinto (por defecto sí).' },
    },
    required: ['question', 'options'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(raw: unknown): PreguntaArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const question = typeof o.question === 'string' ? o.question.trim().slice(0, 300) : '';
    if (!question || !Array.isArray(o.options)) return null;
    const options: PreguntaOpcion[] = [];
    for (const entry of o.options) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const label = typeof e.label === 'string' ? e.label.trim().slice(0, 120) : '';
      if (!label) continue;
      const value = typeof e.value === 'string' && e.value.trim() ? e.value.trim().slice(0, 120) : undefined;
      options.push({ key: LETRAS[options.length] ?? String(options.length + 1), label, value });
      if (options.length === 4) break;
    }
    if (options.length < 2) return null;
    return { question, options, allowOther: o.allow_other !== false };
  },

  async preview(): Promise<ToolPreview> {
    return { title: 'Pregunta', summary: 'Pregunta al usuario.', lines: [], warnings: [], estimatedCredits: 0, reversible: true };
  },

  // Nunca se ejecuta: `runAgent` intercepta la llamada, emite el evento
  // `question` y pausa el turno. Si algo llegara aquí, no hay nada que hacer.
  async execute(_ctx: ToolContext, args: PreguntaArgs): Promise<ToolResult> {
    return { ok: true, message: args.question, data: { options: args.options } };
  },
};

/** Texto de la pregunta para el historial, para que el modelo la recuerde en el siguiente turno. */
export function preguntaComoTexto(args: PreguntaArgs): string {
  const lineas = args.options.map((o) => `${o.key}) ${o.label}`);
  if (args.allowOther) lineas.push('Otro: escríbelo');
  return `${args.question}\n${lineas.join('\n')}`;
}

export const PREGUNTA_TOOLS = [preguntarOpciones];
