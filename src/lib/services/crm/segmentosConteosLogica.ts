/**
 * `segments.counts_json`: desglose por canal de un segmento (columna
 * «Contactables» del listado, Figma CRM 1384:17, y KPI de «Miembros»
 * 1384:1045). Lo escribe el recálculo en el servidor; aquí solo se lee y se
 * arma. Puro: lo usan la ruta de recálculo y la pantalla.
 */

/** Conteos por canal que guarda el recálculo (`segments.counts_json`). */
export interface ConteosSegmento {
  total: number;
  base: number;
  with_phone: number;
  with_email: number;
  whatsapp_opt_in: number;
  rne_excluded: number;
  voice_contactable: number;
  email_contactable: number;
  whatsapp_contactable: number;
}

const CLAVES_CONTEO: readonly (keyof ConteosSegmento)[] = [
  'total',
  'base',
  'with_phone',
  'with_email',
  'whatsapp_opt_in',
  'rne_excluded',
  'voice_contactable',
  'email_contactable',
  'whatsapp_contactable',
];

/** `counts_json` válido o null (formato desconocido = sin dato, nunca «0»). */
export function leerConteos(raw: unknown): ConteosSegmento | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out = {} as ConteosSegmento;
  for (const k of CLAVES_CONTEO) {
    const n = Number(o[k]);
    if (!Number.isFinite(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}

/** Desglose del conteo en vivo → `counts_json` (las 9 claves que valida la base). */
export function conteosDesdeDesglose(
  coinciden: number,
  base: number,
  d: { telefono: number; no_llamar: number; correo: number; whatsapp: number } | null,
): ConteosSegmento {
  const tope = (n: number) => Math.max(0, Math.min(Math.round(n), coinciden));
  const tel = tope(d?.telefono ?? 0);
  const rne = tope(d?.no_llamar ?? 0);
  const correo = tope(d?.correo ?? 0);
  const wa = tope(d?.whatsapp ?? 0);
  return {
    total: coinciden,
    base: Math.max(base, coinciden),
    with_phone: tope(tel + rne),
    with_email: correo,
    whatsapp_opt_in: wa,
    rne_excluded: rne,
    voice_contactable: tel,
    email_contactable: correo,
    whatsapp_contactable: wa,
  };
}

export type CanalContacto = 'telefono' | 'correo' | 'whatsapp';

/** Canal → cuántos se pueden contactar; null si no hay conteo guardado. */
export function contactables(conteos: ConteosSegmento | null): Record<CanalContacto, number> | null {
  if (!conteos) return null;
  return { telefono: conteos.voice_contactable, correo: conteos.email_contactable, whatsapp: conteos.whatsapp_contactable };
}
