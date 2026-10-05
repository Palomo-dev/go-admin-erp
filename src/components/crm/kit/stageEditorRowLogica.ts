/**
 * Lógica de `StageEditorRow` (Figma 798:24970): fila editable de una etapa
 * (`stages`: `position`, `color`, `name`, `probability` 0–100 por CHECK,
 * `sla_days`, `is_won`/`is_lost` y `exit_criteria` jsonb; verificado por MCP
 * el 2026-09-29). Sin React.
 *
 * Reglas: nombre obligatorio y sin repetir en el pipeline; una sola etapa
 * ganada y una sola perdida (el trigger `fn_stages_guard_outcome_flags` las
 * vuelve excluyentes); ganada = 100 % y perdida = 0 %.
 */
export type ResultadoEtapa = 'abierta' | 'ganada' | 'perdida';

export interface EtapaEditable {
  /** id de `stages` o uno temporal de la pantalla para las nuevas. */
  clave: string;
  name: string;
  color: string;
  probability: number | null;
  sla_days: number | null;
  is_won: boolean;
  is_lost: boolean;
  exit_criteria?: unknown;
}

export function resultadoDe(e: Pick<EtapaEditable, 'is_won' | 'is_lost'>): ResultadoEtapa {
  return e.is_won ? 'ganada' : e.is_lost ? 'perdida' : 'abierta';
}

/** Cambia el resultado y ajusta la probabilidad que implica (ganada 100, perdida 0). */
export function conResultado<T extends EtapaEditable>(e: T, resultado: ResultadoEtapa): T {
  if (resultado === 'ganada') return { ...e, is_won: true, is_lost: false, probability: 100, sla_days: null };
  if (resultado === 'perdida') return { ...e, is_won: false, is_lost: true, probability: 0, sla_days: null };
  return { ...e, is_won: false, is_lost: false };
}

/** Cuántos requisitos tiene `exit_criteria` en cualquiera de sus 3 formatos (ver `stageGateService`). */
export function contarRequisitos(criterios: unknown): number {
  if (Array.isArray(criterios)) return criterios.length;
  if (!criterios || typeof criterios !== 'object') return 0;
  const o = criterios as Record<string, unknown>;
  if (Array.isArray(o.requirements)) return o.requirements.length;
  return Object.values(o).reduce<number>((n, v) => {
    if (Array.isArray(v)) return n + v.length;
    return v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.trim() !== '') ? n + 1 : n;
  }, 0);
}

export type ErrorEtapa = 'nombreVacio' | 'nombreRepetido' | 'probabilidad' | 'sla' | 'ganadaDuplicada' | 'perdidaDuplicada';

/** Errores por fila (clave → error). La lista entera se valida porque el nombre repetido y los desenlaces dependen del resto. */
export function validarEtapas(etapas: readonly EtapaEditable[]): Record<string, ErrorEtapa> {
  const errores: Record<string, ErrorEtapa> = {};
  const vistos = new Map<string, number>();
  etapas.forEach((e) => {
    const k = e.name.trim().toLocaleLowerCase('es');
    if (k) vistos.set(k, (vistos.get(k) ?? 0) + 1);
  });
  let ganadas = 0;
  let perdidas = 0;
  for (const e of etapas) {
    const nombre = e.name.trim().toLocaleLowerCase('es');
    if (e.is_won) ganadas += 1;
    if (e.is_lost) perdidas += 1;
    if (!nombre) errores[e.clave] = 'nombreVacio';
    else if ((vistos.get(nombre) ?? 0) > 1) errores[e.clave] = 'nombreRepetido';
    else if (e.probability !== null && (!Number.isInteger(e.probability) || e.probability < 0 || e.probability > 100)) errores[e.clave] = 'probabilidad';
    else if (e.sla_days !== null && (!Number.isInteger(e.sla_days) || e.sla_days < 0)) errores[e.clave] = 'sla';
    else if (e.is_won && ganadas > 1) errores[e.clave] = 'ganadaDuplicada';
    else if (e.is_lost && perdidas > 1) errores[e.clave] = 'perdidaDuplicada';
  }
  return errores;
}

/** Número entero de un campo numérico; vacío → null; fuera de rango se deja para `validarEtapas`. */
export function enteroDeCampo(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Mueve la etapa `desde` → `hasta` (arrastre o teclado) y renumera `position` 1..N. */
/** Índice donde entra una etapa nueva (lista ya en orden): antes de la primera de cierre, o al final si no hay. */
export function indiceAntesDelCierre(etapas: readonly { is_won?: boolean | null; is_lost?: boolean | null }[]): number {
  const cierre = etapas.findIndex((e) => e.is_won || e.is_lost);
  return cierre === -1 ? etapas.length : cierre;
}

/** Inserta `nueva` antes de Ganada/Perdida: una etapa abierta nunca queda después del cierre. */
export function insertarAntesDelCierre<T extends Pick<EtapaEditable, 'is_won' | 'is_lost'>>(etapas: readonly T[], nueva: T): T[] {
  const i = indiceAntesDelCierre(etapas);
  return [...etapas.slice(0, i), nueva, ...etapas.slice(i)];
}

export function reordenar<T extends object>(etapas: readonly T[], desde: number, hasta: number): (T & { position: number })[] {
  const copia = [...etapas];
  if (desde >= 0 && desde < copia.length && hasta >= 0 && hasta < copia.length) {
    const [e] = copia.splice(desde, 1);
    copia.splice(hasta, 0, e);
  }
  return copia.map((e, i) => ({ ...e, position: i + 1 }));
}
