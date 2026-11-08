/**
 * Vigencias del perfil tributario dentro de un PERÍODO (P8 del Contador): «no
 * usar automáticamente el perfil del último día para interpretar todo el
 * período». Si hay más de una vigencia dentro del período, el Centro tributario
 * y el borrador lo SEÑALAN («cambio de vigencia dentro del período — revisar
 * procedencia») y no deciden solos cuál aplica. Si parte del período no tiene
 * vigencia, también se señala. Sin React ni Supabase.
 */
import type { VigenciaPerfil } from './perfil';

export interface ResumenVigencia {
  id: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
  regimenRenta: VigenciaPerfil['regimenRenta'];
  condicionIva: VigenciaPerfil['condicionIva'];
  periodicidadIva: VigenciaPerfil['periodicidadIva'];
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
    })),
    cambioDeVigencia: dentro.length > 1,
    sinPerfilCompleto: cubiertoHasta !== hasta,
  };
}
