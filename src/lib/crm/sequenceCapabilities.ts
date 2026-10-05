/** Capacidades ejecutables compartidas entre el editor y la validación del servidor. */
export const SEQUENCE_EXECUTABLE_CHANNELS = ['email', 'whatsapp', 'call', 'task', 'wait', 'condition'] as const;
export const SEQUENCE_EXIT_CONDITIONS = ['won_lost', 'opted_out'] as const;
export const MAX_SEQUENCE_NAME_LENGTH = 200;

export function isExecutableSequenceChannel(value: unknown): boolean {
  return typeof value === 'string' && (SEQUENCE_EXECUTABLE_CHANNELS as readonly string[]).includes(value);
}

export function isSupportedSequenceExit(value: unknown): boolean {
  const name = typeof value === 'string' ? value
    : value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as { type?: unknown }).type : undefined;
  return typeof name === 'string' && (SEQUENCE_EXIT_CONDITIONS as readonly string[]).includes(name);
}
