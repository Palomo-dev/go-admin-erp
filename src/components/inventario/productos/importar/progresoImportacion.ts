/**
 * Progreso del importador en `sessionStorage` (paquete 5-nov, A3).
 *
 * Si la pestaña se recarga o la sesión se cae a mitad de la importación, el
 * progreso (paso, bloque y SKU ya enviados) queda guardado en la pestaña. Al
 * volver a cargar el MISMO archivo/selección, `importar` salta los bloques
 * cuyos SKU ya se enviaron y continúa desde el siguiente.
 *
 * Solo se guardan metadatos (no las filas): el archivo puede pesar varios MB.
 */

export const VERSION_PROGRESO = 1;

export interface ProgresoImportacion {
  version: number;
  orgId: number;
  branchId: number;
  /** Huella de las filas a importar (orden + SKU): identifica el mismo archivo. */
  huella: string;
  paso: string;
  loteActual: number;
  totalLotes: number;
  total: number;
  skusEnviados: string[];
  creados: number;
  actualizados: number;
  fallidos: number;
  estado: 'corriendo' | 'detenido' | 'interrumpido';
  guardadoEn: string;
}

export function claveProgreso(orgId: number): string {
  return `goadmin:importar-productos:progreso:${orgId}`;
}

/** Huella corta (FNV-1a) de la lista de SKU, estable entre recargas. */
export function huellaFilas(skus: readonly string[]): string {
  let h = 0x811c9dc5;
  const texto = `${skus.length}|${skus.join('\u0001')}`;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${skus.length}-${h.toString(36)}`;
}

function almacen(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function leerProgreso(orgId: number | undefined, store: Storage | null = almacen()): ProgresoImportacion | null {
  if (!orgId || !store) return null;
  try {
    const crudo = store.getItem(claveProgreso(orgId));
    if (!crudo) return null;
    const p = JSON.parse(crudo) as ProgresoImportacion;
    if (p?.version !== VERSION_PROGRESO || p.orgId !== orgId || !Array.isArray(p.skusEnviados)) return null;
    return p;
  } catch {
    return null;
  }
}

export function guardarProgreso(p: ProgresoImportacion, store: Storage | null = almacen()): void {
  if (!store) return;
  try {
    store.setItem(claveProgreso(p.orgId), JSON.stringify(p));
  } catch {
    // Cuota llena o modo privado: el progreso es una ayuda, no bloquea la importación.
  }
}

export function borrarProgreso(orgId: number | undefined, store: Storage | null = almacen()): void {
  if (!orgId || !store) return;
  try {
    store.removeItem(claveProgreso(orgId));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Índice del primer bloque que hay que enviar: los bloques cuyos SKU ya están
 * todos en `skusEnviados` se saltan (solo si es la misma org, sede y huella).
 */
export function primerLotePendiente(
  lotes: readonly (readonly { sku: string }[])[],
  previo: ProgresoImportacion | null,
  actual: { orgId: number; branchId: number; huella: string },
): number {
  if (!previo || previo.orgId !== actual.orgId || previo.branchId !== actual.branchId || previo.huella !== actual.huella) return 0;
  const enviados = new Set(previo.skusEnviados);
  let i = 0;
  while (i < lotes.length && lotes[i].every((f) => enviados.has(f.sku))) i++;
  return i;
}
