/** Errores y UUID del CRM; sin dependencias de sesión ni servidor. */
export class CrmHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CrmHttpError';
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 400 si el id de la ruta no es un uuid (evita un 500 de Postgres por el cast). */
export function exigirUuid(id: string, campo = 'id'): string {
  if (!UUID_RE.test(id)) throw new CrmHttpError(400, 'id_invalido', `${campo} inválido`);
  return id;
}
