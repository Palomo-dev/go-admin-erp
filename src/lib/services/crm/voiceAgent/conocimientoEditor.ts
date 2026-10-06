/**
 * «Qué sabe el agente» (Figma CRM 1804:905093, estados 1806:147282): lo que el
 * editor del agente muestra de la base de conocimiento. No decide nada: aplica
 * `seleccionarConocimientoVoz`, el MISMO criterio con el que el runtime arma
 * el prompt de la llamada (regla dura 7), y solo recorta el texto para la
 * pantalla (título + primera línea).
 */
import {
  MAX_CONOCIMIENTO_VOZ,
  seleccionarConocimientoVoz,
  type FilaFragmentoVoz,
} from './agentRuntime';

/** Largo de la primera línea que se muestra de cada fragmento. */
export const LARGO_RESUMEN_FRAGMENTO = 140;

export interface FragmentoEditorVoz {
  id: string | null;
  titulo: string;
  resumen: string;
  prioridad: number | null;
  caracteres: number;
}

export interface ConocimientoEditorVoz {
  fragmentos: FragmentoEditorVoz[];
  solo_chat: { id: string | null; titulo: string }[];
  fuera_del_tope: { id: string | null; titulo: string; prioridad: number | null }[];
  caracteres: number;
  tope: number;
}

/** Primera línea no vacía, recortada con «…». */
export function primeraLinea(texto: string, largo = LARGO_RESUMEN_FRAGMENTO): string {
  const linea = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return linea.length > largo ? `${linea.slice(0, largo - 1).trimEnd()}…` : linea;
}

export function conocimientoParaEditor(filas: readonly FilaFragmentoVoz[]): ConocimientoEditorVoz {
  const sel = seleccionarConocimientoVoz(filas);
  return {
    fragmentos: sel.incluidos.map((f) => ({
      id: f.id ?? null,
      titulo: f.title,
      resumen: primeraLinea(f.content),
      prioridad: f.priority,
      caracteres: f.content.length,
    })),
    solo_chat: sel.soloChat.map((f) => ({ id: f.id ?? null, titulo: f.title })),
    fuera_del_tope: sel.fueraDelTope.map((f) => ({ id: f.id ?? null, titulo: f.title, prioridad: f.priority })),
    caracteres: sel.caracteres,
    tope: MAX_CONOCIMIENTO_VOZ,
  };
}
