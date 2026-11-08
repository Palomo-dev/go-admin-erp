/**
 * Vigencias del perfil tributario dentro de un PERÍODO (P8 del Contador): «no
 * usar automáticamente el perfil del último día para interpretar todo el
 * período». Si hay más de una vigencia dentro del período, el Centro tributario
 * y el borrador lo SEÑALAN («cambio de vigencia dentro del período — revisar
 * procedencia») y no deciden solos cuál aplica. Si parte del período no tiene
 * vigencia, también se señala. Sin React ni Supabase.
 */
import type { VigenciaPerfil } from './perfil';
import { esDiaValido } from './periodos';

export interface ResumenVigencia {
  id: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
  regimenRenta: VigenciaPerfil['regimenRenta'];
  condicionIva: VigenciaPerfil['condicionIva'];
  periodicidadIva: VigenciaPerfil['periodicidadIva'];
  cambioPeriodicidadEstado: VigenciaPerfil['cambioPeriodicidadEstado'];
}

export interface AnalisisPeriodo {
  desde: string;
  hasta: string;
  /** Las vigencias que tocan algún día del período, de la más vieja a la más nueva. */
  vigencias: ResumenVigencia[];
  /** Más de una vigencia dentro del período. */
  cambioDeVigencia: boolean;
  /** Algún día del período no tiene vigencia. */
  sinPerfilCompleto: boolean;
  /** Alguna vigencia del período cambió la periodicidad sin documentar hecho, norma y fecha (P8, ronda 2). */
  cambioPendienteSoporte: boolean;
  /**
   * Resumen de las vigencias que tocan el período (id, fechas y última
   * modificación). Una decisión registrada con otra huella ya no aplica: la
   * alerta se reabre.
   */
  huella: string;
}

/** Día calendario siguiente (`YYYY-MM-DD`), en aritmética de calendario, sin zona horaria. */
const diaSiguiente = (dia: string): string => {
  const d = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)) + 1));
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
};

/** Vigencias que tocan `[desde, hasta]` (días calendario). */
export function vigenciasEnRango<T extends Pick<VigenciaPerfil, 'vigenteDesde' | 'vigenteHasta'>>(vigencias: readonly T[], desde: string, hasta: string): T[] {
  return vigencias
    .filter((v) => v.vigenteDesde <= hasta && (v.vigenteHasta === null || v.vigenteHasta >= desde))
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
}

export function analizarPeriodo(vigencias: readonly VigenciaPerfil[], desde: string, hasta: string): AnalisisPeriodo {
  const dentro = vigenciasEnRango(vigencias, desde, hasta);
  // ¿Cubren todo el período sin huecos? (las vigencias se guardan encadenadas, pero el período puede empezar antes de la primera)
  let cubiertoHasta: string | null = null;
  let cursor = desde;
  for (const v of dentro) {
    if (v.vigenteDesde > cursor) break;
    cubiertoHasta = v.vigenteHasta;
    if (v.vigenteHasta === null || v.vigenteHasta >= hasta) {
      cubiertoHasta = hasta;
      break;
    }
    cursor = diaSiguiente(v.vigenteHasta);
  }
  return {
    desde,
    hasta,
    vigencias: dentro.map((v) => ({
      id: v.id,
      vigenteDesde: v.vigenteDesde,
      vigenteHasta: v.vigenteHasta,
      regimenRenta: v.regimenRenta,
      condicionIva: v.condicionIva,
      periodicidadIva: v.periodicidadIva,
      cambioPeriodicidadEstado: v.cambioPeriodicidadEstado,
    })),
    cambioDeVigencia: dentro.length > 1,
    sinPerfilCompleto: cubiertoHasta !== hasta,
    cambioPendienteSoporte: dentro.some((v) => v.cambioPeriodicidadEstado === 'pendiente_soporte'),
    huella: huellaVigencias(dentro),
  };
}

/** Huella estable de un conjunto de vigencias: cambia si se crea, borra, corrige o mueve alguna. */
export function huellaVigencias(vigencias: readonly Pick<VigenciaPerfil, 'id' | 'vigenteDesde' | 'vigenteHasta' | 'actualizadoEn'>[]): string {
  return [...vigencias]
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
    .map((v) => `${v.id}|${v.vigenteDesde}|${v.vigenteHasta ?? '-'}|${v.actualizadoEn ?? '-'}`)
    .join(';');
}

/** Decisión que cierra la alerta de un período con varias vigencias (cuerpo de POST /api/finanzas/tributario/centro/decision). */
export interface SolicitudDecision {
  obligacion: string;
  desde: string;
  hasta: string;
  decision: string;
  fundamento: string;
  alcance: string;
  vigenciaAplicadaId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lista blanca del cuerpo. */
export function validarSolicitudDecision(cuerpo: unknown): SolicitudDecision | null {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return null;
  const b = cuerpo as Record<string, unknown>;
  const textoEntre = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length >= 3 && v.trim().length <= max ? v.trim() : null);
  const obligacion = typeof b.obligacion === 'string' && /^[a-z][a-z0-9_:.-]{1,80}$/.test(b.obligacion) ? b.obligacion : null;
  const desde = typeof b.desde === 'string' && esDiaValido(b.desde) ? b.desde : null;
  const hasta = typeof b.hasta === 'string' && esDiaValido(b.hasta) ? b.hasta : null;
  const decision = textoEntre(b.decision, 2000);
  const fundamento = textoEntre(b.fundamento, 2000);
  const alcance = textoEntre(b.alcance, 1000);
  const vigencia = b.vigenciaAplicadaId === null || b.vigenciaAplicadaId === undefined || b.vigenciaAplicadaId === '' ? null : String(b.vigenciaAplicadaId);
  if (!obligacion || !desde || !hasta || hasta < desde || !decision || !fundamento || !alcance) return null;
  if (vigencia !== null && !UUID_RE.test(vigencia)) return null;
  return { obligacion, desde, hasta, decision, fundamento, alcance, vigenciaAplicadaId: vigencia };
}

