/**
 * Contratos de las rutas del editor que no son del núcleo V2: una revisión con su documento
 * (base para combinar y «Ver esta versión»), publicaciones programadas (A/05g) e instantáneas
 * del borrador («Guardado automático» del historial, A/05h; «Descartar» del conflicto, A/05i).
 * Sin dependencias: los usan el servicio del servidor y el cliente del navegador.
 */
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';

export interface RevisionConDocumento {
  id: string;
  numero: number;
  nota: string | null;
  publicadaEn: string;
  autor: string | null;
  documento: DocumentoSitio;
}

export type EstadoProgramacion = 'pendiente' | 'publicada' | 'cancelada' | 'fallida';

export interface ProgramacionPublicacion {
  id: string;
  /** Instante (ISO) en que se publica. */
  ejecutarEn: string;
  /** Versión del borrador que se programó: si el borrador cambia, la programación falla y avisa. */
  version: number;
  nota: string | null;
  estado: EstadoProgramacion;
  error: string | null;
  creadaEn: string;
}

export type MotivoInstantanea = 'autoguardado' | 'descartado' | 'antes_de_restaurar';

export interface InstantaneaBorrador {
  id: string;
  version: number;
  motivo: MotivoInstantanea;
  creadaEn: string;
  autor: string | null;
}

/** Límites que el servidor también comprueba. */
export const LIMITES_PROGRAMACION = {
  /** Mínimo de antelación: 2 minutos (el job corre cada minuto). */
  antelacionMinimaMs: 2 * 60 * 1000,
  /** Máximo: un año. */
  antelacionMaximaMs: 366 * 24 * 60 * 60 * 1000,
  nota: 500,
} as const;

/** ¿Se puede programar para `ejecutarEn` visto desde `ahora`? */
export function validarFechaProgramacion(ejecutarEn: Date, ahora: Date = new Date()): 'ok' | 'pasada' | 'muy_lejana' | 'invalida' {
  const t = ejecutarEn.getTime();
  if (!Number.isFinite(t)) return 'invalida';
  const diferencia = t - ahora.getTime();
  if (diferencia < LIMITES_PROGRAMACION.antelacionMinimaMs) return 'pasada';
  if (diferencia > LIMITES_PROGRAMACION.antelacionMaximaMs) return 'muy_lejana';
  return 'ok';
}
