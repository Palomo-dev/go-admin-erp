/**
 * «Ajustes de reseñas» de la tienda (Figma «16 Sitio web» 3131-92277). Puro: lo usan el servidor
 * (`tiendaSitio.server.ts`), la hoja de ajustes y el inspector.
 *
 * Viven en `website_settings` (fila principal), migración 20261125013000_resenas_reales_flujo.
 * NULL = comportamiento de antes del 2026-11-25, igual que en la tienda (`lib/resenas/ajustesResenas.ts`
 * de goadmin-websites):
 * - reviews_default_source NULL → ejemplos (las tiendas nuevas nacen con `real`).
 * - reviews_auto_approve: «Moderar antes de publicar» es su contrario (mismo ajuste).
 * - reviews_who_can_write NULL → cualquier cliente; `buyers` lo exige el servidor de la tienda.
 * - reviews_allow_photos NULL → sí. reviews_request_enabled NULL → sin correo (tiendas de antes);
 *   las tiendas nuevas nacen con true (DEFAULT, migración 20261125060000).
 * - reviews_request_days NULL → 7. reviews_request_reminder NULL → sí.
 */
import { esOrigenResenas, type OrigenResenas } from '@/lib/website/v2/seccionesFicha';

export type QuienEscribe = 'any' | 'buyers';

export interface AjustesResenas {
  origenTienda: OrigenResenas | null;
  moderar: boolean;
  quienEscribe: QuienEscribe;
  fotos: boolean;
  correo: { activo: boolean; dias: number; recordatorio: boolean };
}

export const COLUMNAS_AJUSTES_RESENAS =
  'reviews_default_source, reviews_auto_approve, reviews_who_can_write, reviews_allow_photos, reviews_request_enabled, reviews_request_days, reviews_request_reminder';

export const DIAS_CORREO_MIN = 1;
export const DIAS_CORREO_MAX = 30;
export const DIAS_CORREO_POR_DEFECTO = 7;

export function leerAjustesResenas(fila: Record<string, unknown> | null | undefined): AjustesResenas {
  const f = fila ?? {};
  const dias = Number(f.reviews_request_days);
  return {
    origenTienda: esOrigenResenas(f.reviews_default_source) ? f.reviews_default_source : null,
    moderar: f.reviews_auto_approve !== true,
    quienEscribe: f.reviews_who_can_write === 'buyers' ? 'buyers' : 'any',
    fotos: f.reviews_allow_photos !== false,
    correo: {
      activo: f.reviews_request_enabled === true,
      dias: Number.isInteger(dias) && dias >= DIAS_CORREO_MIN && dias <= DIAS_CORREO_MAX ? dias : DIAS_CORREO_POR_DEFECTO,
      recordatorio: f.reviews_request_reminder !== false,
    },
  };
}

/** Lo que la hoja manda al guardar. El origen NO se cambia aquí: se elige en el editor. */
export interface CambiosAjustesResenas {
  moderar?: boolean;
  quienEscribe?: QuienEscribe;
  fotos?: boolean;
  correo?: { activo?: boolean; dias?: number; recordatorio?: boolean };
}

export type ResultadoCambios = { ok: true; columnas: Record<string, unknown> } | { ok: false; mensaje: string };

/** Valida el cuerpo y lo traduce a columnas. Solo escribe lo que viene. */
export function columnasDeCambios(body: unknown): ResultadoCambios {
  if (!body || typeof body !== 'object') return { ok: false, mensaje: 'Petición no válida.' };
  const b = body as Record<string, unknown>;
  const columnas: Record<string, unknown> = {};
  if (b.moderar !== undefined) {
    if (typeof b.moderar !== 'boolean') return { ok: false, mensaje: '«Moderar» debe ser sí o no.' };
    columnas.reviews_auto_approve = !b.moderar;
  }
  if (b.quienEscribe !== undefined) {
    if (b.quienEscribe !== 'any' && b.quienEscribe !== 'buyers') return { ok: false, mensaje: '«Quién puede escribir» no es válido.' };
    columnas.reviews_who_can_write = b.quienEscribe;
  }
  if (b.fotos !== undefined) {
    if (typeof b.fotos !== 'boolean') return { ok: false, mensaje: '«Permitir fotos» debe ser sí o no.' };
    columnas.reviews_allow_photos = b.fotos;
  }
  if (b.correo !== undefined) {
    if (!b.correo || typeof b.correo !== 'object') return { ok: false, mensaje: 'El correo no es válido.' };
    const c = b.correo as Record<string, unknown>;
    if (c.activo !== undefined) {
      if (typeof c.activo !== 'boolean') return { ok: false, mensaje: '«Enviar» debe ser sí o no.' };
      columnas.reviews_request_enabled = c.activo;
    }
    if (c.dias !== undefined) {
      const d = Number(c.dias);
      if (!Number.isInteger(d) || d < DIAS_CORREO_MIN || d > DIAS_CORREO_MAX) {
        return { ok: false, mensaje: `Los días van de ${DIAS_CORREO_MIN} a ${DIAS_CORREO_MAX}.` };
      }
      columnas.reviews_request_days = d;
    }
    if (c.recordatorio !== undefined) {
      if (typeof c.recordatorio !== 'boolean') return { ok: false, mensaje: '«Recordatorio» debe ser sí o no.' };
      columnas.reviews_request_reminder = c.recordatorio;
    }
  }
  if (Object.keys(columnas).length === 0) return { ok: false, mensaje: 'No hay cambios.' };
  return { ok: true, columnas };
}
