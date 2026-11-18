/**
 * Cola sin conexión del kiosco (plan de Marcación D7, §4.5; Figma 20.29.6).
 *
 * Sin internet, la tablet sigue recibiendo PIN y carnés: guarda cada marca con un
 * `id_local` (UUID generado en la tablet) y la hora del servidor estimada con el
 * desfase medido en la última conexión. Al volver la red manda la cola en lotes de
 * hasta 50 a `POST /api/hrm/kiosco/marcas`; la base es idempotente por
 * (equipo, id_local): reenviar el mismo lote nunca duplica una marca.
 *
 * Puro: la persistencia (IndexedDB con el PIN cifrado) vive en
 * `src/components/hrm/kiosco/colaPersistente.ts`; esto lo prueban
 * `__tests__/cola.test.ts`.
 */
import type { TipoCredencial } from './kiosco';

export const MAX_LOTE = 50;
/** Tras tantos errores del servidor seguidos (no rechazos), la marca se descarta y se avisa. */
export const MAX_REINTENTOS = 20;
/** Sin enviar en 7 días, la base ya no acepta su hora: se manda igual (queda con la del servidor, a revisión). */
export const DIAS_HORA_VALIDA = 7;

export interface MarcaPendiente {
  id_local: string;
  credencial: { tipo: TipoCredencial; valor: string };
  /** Hora del servidor estimada (reloj de la tablet + desfase medido). */
  hora: string;
  /** Hora del reloj de la tablet, tal cual (queda como dato en la marca). */
  hora_equipo: string;
  intentos: number;
}

export type EstadoResultado = 'aceptada' | 'a_revision' | 'repetida' | 'duplicada' | 'rechazada' | 'vencida' | 'error';

export interface ResultadoMarca {
  id_local: string;
  estado: EstadoResultado;
  motivo?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdLocal(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Hora del servidor estimada a partir del reloj local y el desfase (ms) de la última conexión. */
export function horaServidor(ahoraLocalMs: number, desfaseMs: number): string {
  return new Date(ahoraLocalMs + (Number.isFinite(desfaseMs) ? desfaseMs : 0)).toISOString();
}

export function nuevaMarca(args: { idLocal: string; credencial: MarcaPendiente['credencial']; ahoraLocalMs: number; desfaseMs: number }): MarcaPendiente {
  return {
    id_local: args.idLocal,
    credencial: args.credencial,
    hora: horaServidor(args.ahoraLocalMs, args.desfaseMs),
    hora_equipo: new Date(args.ahoraLocalMs).toISOString(),
    intentos: 0,
  };
}

/** Agrega sin duplicar: el mismo `id_local` no entra dos veces. */
export function encolar(cola: readonly MarcaPendiente[], m: MarcaPendiente): MarcaPendiente[] {
  if (!esIdLocal(m.id_local) || cola.some((x) => x.id_local === m.id_local)) return [...cola];
  return [...cola, m];
}

/** El lote que se manda: las más antiguas primero (la entrada antes que la salida). */
export function siguienteLote(cola: readonly MarcaPendiente[], max = MAX_LOTE): MarcaPendiente[] {
  return [...cola].sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, Math.max(1, Math.min(max, MAX_LOTE)));
}

/** Cuerpo de `POST /api/hrm/kiosco/marcas` para un lote de la cola. */
export function cuerpoLote(lote: readonly MarcaPendiente[]): { marcas: Array<Omit<MarcaPendiente, 'intentos'> & { fuera_de_linea: true }> } {
  return {
    marcas: lote.map((m) => ({ id_local: m.id_local, credencial: m.credencial, hora: m.hora, hora_equipo: m.hora_equipo, fuera_de_linea: true })),
  };
}

/** Estados con los que la base ya decidió: la marca sale de la cola (aunque fuera rechazada). */
const DEFINITIVOS: ReadonlySet<EstadoResultado> = new Set(['aceptada', 'a_revision', 'repetida', 'duplicada', 'rechazada', 'vencida']);

/**
 * Aplica la respuesta del servidor: quita las resueltas, suma un intento a las que
 * dieron error y descarta las que agotaron los reintentos. Las que no vinieron en la
 * respuesta (lote cortado, red caída a mitad) se quedan tal cual.
 */
export function aplicarResultados(
  cola: readonly MarcaPendiente[],
  resultados: readonly ResultadoMarca[]
): { cola: MarcaPendiente[]; resueltas: ResultadoMarca[]; descartadas: MarcaPendiente[] } {
  const porId = new Map(resultados.filter((r) => r && esIdLocal(r.id_local)).map((r) => [r.id_local, r]));
  const resueltas: ResultadoMarca[] = [];
  const descartadas: MarcaPendiente[] = [];
  const quedan: MarcaPendiente[] = [];
  for (const m of cola) {
    const r = porId.get(m.id_local);
    if (!r) {
      quedan.push(m);
    } else if (DEFINITIVOS.has(r.estado)) {
      resueltas.push(r);
    } else {
      const intentos = m.intentos + 1;
      if (intentos >= MAX_REINTENTOS) descartadas.push({ ...m, intentos });
      else quedan.push({ ...m, intentos });
    }
  }
  return { cola: quedan, resueltas, descartadas };
}

/** Rechazadas de una sincronización (por ejemplo, un PIN mal escrito sin conexión). */
export function rechazadas(resueltas: readonly ResultadoMarca[]): number {
  return resueltas.filter((r) => r.estado === 'rechazada').length;
}

/** Desfase del reloj de la tablet contra el servidor, con la latencia de ida y vuelta repartida. */
export function medirDesfase(ahoraServidorIso: string | null | undefined, enviadoMs: number, recibidoMs: number): number | null {
  const s = ahoraServidorIso ? Date.parse(ahoraServidorIso) : NaN;
  if (!Number.isFinite(s) || recibidoMs < enviadoMs) return null;
  return Math.round(s - (enviadoMs + recibidoMs) / 2);
}
