/**
 * Tipos y formato compartidos por los pasos de «Clonar mi voz» (sin React).
 */

import { MAX_CLONE_SAMPLES, MIN_SAMPLE_SECONDS } from "@/lib/services/crm/voiceCloneScript";

export interface CloneSample {
  /** Estable entre renders: sirve de `key` y para quitar la muestra. */
  id: string;
  file: File;
  durationSeconds: number;
  /** `true` cuando la duración no se pudo leer del archivo subido. */
  durationUnknown?: boolean;
  source: "recording" | "file";
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function describeSample(s: CloneSample): string {
  const mb = (s.file.size / (1024 * 1024)).toFixed(1);
  const dur = s.durationUnknown ? "duración no disponible" : `${formatClock(s.durationSeconds)} min`;
  return `${dur} · ${mb} MB · ${s.source === "recording" ? "grabada aquí" : s.file.name}`;
}

export interface RecordHintInput {
  recording: boolean;
  /** Segundos de la grabación en curso. */
  elapsed: number;
  /** Muestras ya listas. */
  count: number;
  /** Duración sumada de las muestras con duración conocida. */
  totalSeconds: number;
  /** Alguna muestra subida sin duración legible (no se le puede reprochar que falte). */
  unknownDuration: boolean;
}

/** Pista bajo la barra del paso 2: con 0:05 dice lo que falta, no «pulsa Continuar» (ronda 3). */
export function describeRecordHint(i: RecordHintInput): string {
  if (i.recording) {
    return i.elapsed >= MIN_SAMPLE_SECONDS
      ? "Ya hay muestra suficiente; termina el guion y pulsa Detener."
      : `Mínimo ${MIN_SAMPLE_SECONDS} s en total. Sigue leyendo…`;
  }
  if (i.count >= MAX_CLONE_SAMPLES) return `Ya tienes ${MAX_CLONE_SAMPLES} muestras, el máximo. Quita alguna si quieres grabar otra.`;
  if (i.count === 0) return "Pulsa Grabar, lee el guion completo y pulsa Detener.";
  const listed = `${formatClock(i.totalSeconds)} min en ${i.count === 1 ? "una muestra" : `${i.count} muestras`}.`;
  const missing = Math.ceil(MIN_SAMPLE_SECONDS - i.totalSeconds);
  if (missing > 0 && !i.unknownDuration) {
    return `${listed} Faltan ${missing} s para el mínimo de ${MIN_SAMPLE_SECONDS} s: graba otra muestra o sube un archivo.`;
  }
  return `${listed} Pulsa Continuar para escucharlas, o graba otra: con dos o tres el clon sale mejor.`;
}

/** `id` del botón «Quitar» de una muestra (pasos 2 y 3, nunca a la vez): el asistente enfoca el vecino al quitar. */
export const sampleRemoveId = (sampleId: string) => `clone-sample-remove-${sampleId}`;
/** `id` de «Grabar otra muestra» en el paso 3. */
export const ADD_MORE_ID = "clone-add-more";
