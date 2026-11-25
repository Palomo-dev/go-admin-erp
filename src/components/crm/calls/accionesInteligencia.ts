/**
 * Acciones de transcripción y análisis IA de una llamada, desde el navegador.
 *
 * Todo lo decide el servidor (`/api/crm/calls/[id]/{transcribe,analyze,analysis/apply}`):
 * aquí solo se llama a la ruta y se interpreta su respuesta, para que el detalle
 * de la llamada (Figma 1363:20) y los paneles del timeline digan lo mismo.
 * Sin React: se prueba con jest.
 */

export type ResultadoEncolar = 'reutilizado' | 'sinComprobar' | 'encolado' | 'listo';

export class ErrorInteligencia extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErrorInteligencia';
  }
}

async function postJson(url: string, cuerpo: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const json = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  return { status: res.status, json };
}

function interpretarEncolado(status: number, json: Record<string, unknown>): ResultadoEncolar {
  const data = (json.data ?? {}) as Record<string, unknown>;
  // La ruta reutiliza el trabajo vivo en vez de encolar (y cobrar) otro.
  if (data.deduped === true) return 'reutilizado';
  // No pudo comprobar si ya había otro trabajo vivo: podría duplicarse.
  if (data.dedupe_checked === false) return 'sinComprobar';
  return status === 202 ? 'encolado' : 'listo';
}

/** POST /transcribe. `forzar` vuelve a transcribir aunque ya exista una. */
export async function pedirTranscripcion(callId: string, forzar: boolean): Promise<ResultadoEncolar> {
  const { status, json } = await postJson(`/api/crm/calls/${encodeURIComponent(callId)}/transcribe`, { force: forzar });
  if (status < 200 || status >= 300) throw new ErrorInteligencia(status, (json.error as string | undefined) ?? `HTTP ${status}`);
  return interpretarEncolado(status, json);
}

/** POST /analyze. `forzar` re-analiza una llamada ya analizada. */
export async function pedirAnalisis(callId: string, forzar: boolean): Promise<ResultadoEncolar> {
  const { status, json } = await postJson(`/api/crm/calls/${encodeURIComponent(callId)}/analyze`, { force: forzar });
  if (status < 200 || status >= 300) throw new ErrorInteligencia(status, (json.error as string | undefined) ?? `HTTP ${status}`);
  return interpretarEncolado(status, json);
}

export interface AccionesAplicar {
  stage?: boolean;
  tasks?: number[] | 'all';
  tags?: boolean;
  discovery?: boolean;
  objections?: boolean;
}

export type ResultadoAplicar =
  | { tipo: 'criterios'; faltan: string[] }
  | { tipo: 'aplicado'; aplicadas: string[]; omitidas: Array<{ action: string; reason: string }> };

/**
 * POST /analysis/apply. Un 409 con `gate` es «faltan criterios de salida de la
 * etapa» (el vendedor decide si omitirlos; solo un admin puede: `ignorarCriterios`).
 */
export async function aplicarAnalisis(callId: string, analysisId: string, acciones: AccionesAplicar, ignorarCriterios = false): Promise<ResultadoAplicar> {
  const { status, json } = await postJson(`/api/crm/calls/${encodeURIComponent(callId)}/analysis/apply`, {
    analysisId,
    actions: acciones,
    ignore_gate: ignorarCriterios,
  });
  const data = (json.data ?? {}) as { gate?: { missing?: Array<{ label?: string; detail?: string }> }; applied?: string[]; skipped?: Array<{ action: string; reason: string }> };
  if (status === 409 && data.gate) {
    return { tipo: 'criterios', faltan: (data.gate.missing ?? []).map((m) => m.detail ?? m.label ?? '').filter(Boolean) };
  }
  if (status < 200 || status >= 300) throw new ErrorInteligencia(status, (json.error as string | undefined) ?? `HTTP ${status}`);
  return { tipo: 'aplicado', aplicadas: data.applied ?? [], omitidas: data.skipped ?? [] };
}
