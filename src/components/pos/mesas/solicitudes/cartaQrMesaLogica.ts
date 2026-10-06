/**
 * Lectura pura (para Jest) de lo que la Carta QR deja en la cuenta de una mesa:
 * pagos en línea, intentos de pago y la valoración de la visita.
 */

export interface FilaPagoEnLinea {
  id: string;
  amount: number | string | null;
  change_amount?: number | string | null;
  method: string | null;
  reference: string | null;
  status: string | null;
  created_at: string;
  processor_response?: Record<string, unknown> | null;
}

export interface PagoEnLinea {
  id: string;
  importe: number;
  propina: number;
  metodo: string;
  referencia: string | null;
  comensal: string | null;
  modo: string | null;
  fecha: string;
  anulado: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown, max = 60): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Nombre corto del método («wompi» → «Wompi»; los sub-métodos de la pasarela tal cual). */
export function nombreMetodo(metodo: string | null | undefined): string {
  const m = (metodo ?? '').trim();
  if (!m) return 'En línea';
  const conocidos: Record<string, string> = { wompi: 'Wompi', card: 'Tarjeta', nequi: 'Nequi', pse: 'PSE', bancolombia_transfer: 'Bancolombia' };
  return conocidos[m.toLowerCase()] ?? m.charAt(0).toUpperCase() + m.slice(1);
}

export function aPagoEnLinea(f: FilaPagoEnLinea): PagoEnLinea {
  const r = f.processor_response ?? {};
  return {
    id: f.id,
    importe: Math.max(0, num(f.amount) - num(f.change_amount)),
    propina: Math.max(0, num(r.tip_amount)),
    metodo: nombreMetodo(f.method),
    referencia: texto(f.reference, 80),
    comensal: texto(r.diner_label, 40),
    modo: texto(r.split_mode, 20),
    fecha: f.created_at,
    anulado: (f.status ?? 'completed') !== 'completed',
  };
}

/** Lo pagado en línea que descuenta el saldo (sin anulados). */
export function totalPagadoEnLinea(pagos: readonly PagoEnLinea[]): number {
  return Math.round(pagos.filter((p) => !p.anulado).reduce((s, p) => s + p.importe, 0) * 100) / 100;
}

export interface FilaIntentoPago {
  id: string;
  reference?: string | null;
  amount?: number | string | null;
  tip_amount?: number | string | null;
  status?: string | null;
  diner_label?: string | null;
  split_mode?: string | null;
  created_at?: string | null;
}

export interface IntentoPagoEnLinea {
  id: string;
  referencia: string | null;
  importe: number;
  estado: 'en_curso' | 'sin_aplicar';
  comensal: string | null;
  fecha: string | null;
}

export function aIntentoPagoEnLinea(f: FilaIntentoPago): IntentoPagoEnLinea {
  return {
    id: f.id,
    referencia: texto(f.reference, 80),
    importe: Math.max(0, num(f.amount) + num(f.tip_amount)),
    estado: f.status === 'paid_unapplied' ? 'sin_aplicar' : 'en_curso',
    comensal: texto(f.diner_label, 40),
    fecha: f.created_at ?? null,
  };
}

/** Fila de `table_visit_feedback` (valoración de la visita desde la Carta QR). */
export interface FilaValoracion {
  id: string;
  rating: number | string | null;
  comment?: string | null;
  aspects?: unknown;
  diner_label?: string | null;
  created_at: string;
}

export interface ValoracionMesa {
  id: string;
  estrellas: number;
  comentario: string | null;
  aspectos: string[];
  comensal: string | null;
  fecha: string;
}

export function aValoracion(f: FilaValoracion): ValoracionMesa {
  const estrellas = Math.min(5, Math.max(0, Math.round(num(f.rating))));
  const aspectos = Array.isArray(f.aspects)
    ? [...new Set((f.aspects as unknown[]).map((a) => texto(a, 40)).filter((a): a is string => !!a))].slice(0, 8)
    : [];
  return {
    id: f.id,
    estrellas,
    comentario: texto(f.comment, 500),
    aspectos,
    comensal: texto(f.diner_label, 40),
    fecha: f.created_at,
  };
}

/** Promedio de estrellas (una cifra decimal) o null sin valoraciones. */
export function promedioEstrellas(vals: readonly ValoracionMesa[]): number | null {
  const conNota = vals.filter((v) => v.estrellas > 0);
  if (conNota.length === 0) return null;
  return Math.round((conNota.reduce((s, v) => s + v.estrellas, 0) / conNota.length) * 10) / 10;
}

/**
 * Quién pidió cada línea: la línea guarda el pedido web del que vino
 * (`notes.from_web_order`) y el pedido, el comensal (`web_orders.diner_label`).
 */
export function quienPidio(notas: unknown, comensales: ReadonlyMap<string, string>): string | null {
  if (!notas || typeof notas !== 'object') return null;
  const n = notas as Record<string, unknown>;
  const propio = texto(n.diner_label, 40);
  if (propio) return propio;
  const pedido = typeof n.from_web_order === 'string' || typeof n.from_web_order === 'number' ? String(n.from_web_order) : null;
  return pedido ? comensales.get(pedido) ?? null : null;
}
