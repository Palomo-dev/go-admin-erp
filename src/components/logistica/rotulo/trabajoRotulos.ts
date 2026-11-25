import type { ShipmentLabelPayload } from '@printing';
import type { Printer } from '@/components/pos/configuracion/printersService';
import {
  CLAVE_FORMATO_ROTULO,
  CLAVE_TRABAJO_ROTULOS,
  esFormatoRotulo,
  esTrabajoRotulos,
  type FormatoRotulo,
  type TrabajoRotulos,
} from '@/lib/logistica/rotuloEnvio';

/**
 * Trabajo de impresión de rótulos: el hook lo deja en el almacenamiento local y la página
 * `/imprimir/guias` lo lee (mismo patrón que `/imprimir/etiquetas`). La página no lee la base:
 * los textos llegan ya resueltos, los mismos de la vista previa.
 */

/** Guarda el trabajo y devuelve su clave (null si el navegador no deja guardar). */
export function guardarTrabajoRotulos(formato: FormatoRotulo, rotulos: ShipmentLabelPayload[]): string | null {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    // Limpia trabajos viejos que una pestaña cerrada dejó sin leer.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(CLAVE_TRABAJO_ROTULOS) || k.startsWith(CLAVE_FORMATO_ROTULO)) continue;
      let creado = 0;
      try {
        creado = Number(JSON.parse(localStorage.getItem(k) ?? '{}').creadoEn) || 0;
      } catch {
        creado = 0;
      }
      if (Date.now() - creado > 60 * 60 * 1000) localStorage.removeItem(k);
    }
    const trabajo: TrabajoRotulos = { version: 2, creadoEn: Date.now(), formato, rotulos };
    localStorage.setItem(`${CLAVE_TRABAJO_ROTULOS}${id}`, JSON.stringify(trabajo));
    return id;
  } catch {
    return null;
  }
}

export function leerTrabajoRotulos(id: string): TrabajoRotulos | null {
  try {
    const crudo = id ? localStorage.getItem(`${CLAVE_TRABAJO_ROTULOS}${id}`) : null;
    const leido: unknown = crudo ? JSON.parse(crudo) : null;
    return esTrabajoRotulos(leido) ? leido : null;
  } catch {
    return null;
  }
}

/** Último formato elegido en esta sede (o en «todas»), si hay uno guardado. */
export function leerFormatoRecordado(sede: number | null | undefined): FormatoRotulo | null {
  try {
    const v = localStorage.getItem(`${CLAVE_FORMATO_ROTULO}${sede ?? 'todas'}`);
    return esFormatoRotulo(v) ? v : null;
  } catch {
    return null;
  }
}

export function recordarFormato(sede: number | null | undefined, formato: FormatoRotulo): void {
  try {
    localStorage.setItem(`${CLAVE_FORMATO_ROTULO}${sede ?? 'todas'}`, formato);
  } catch {
    /* sin almacenamiento: el diálogo vuelve a proponer el formato inicial */
  }
}

/** Dónde puede salir la guía en una sede: impresoras de la estación y si el agente está en línea. */
export interface EstacionRotulos {
  enLinea: boolean;
  impresoras: Printer[];
}

/** Hay una impresora de rótulos en línea en la sede. */
export function hayTermicaEnLinea(estacion: EstacionRotulos | null | undefined): boolean {
  return !!estacion?.enLinea && estacion.impresoras.length > 0;
}

/** Formato inicial: el último elegido en la sede; si no, la térmica cuando hay impresora en línea. */
export function formatoInicialRotulo(sede: number | null | undefined, estacion: EstacionRotulos | null | undefined): FormatoRotulo {
  return leerFormatoRecordado(sede) ?? (hayTermicaEnLinea(estacion) ? '80mm' : '10x15');
}
