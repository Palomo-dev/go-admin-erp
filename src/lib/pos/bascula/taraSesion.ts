/**
 * Tara de la bandeja recordada por producto durante la sesión del navegador
 * (§11): si el cajero pesó el queso con la bandeja de 15 g, la siguiente
 * pesada de queso ya abre con esa tara. Se guarda en `sessionStorage` (se
 * olvida al cerrar la pestaña) con respaldo en memoria.
 */

const CLAVE = 'pos_taras_sesion';
const memoria = new Map<string, number>();

function almacen(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function leerTodo(): Record<string, number> {
  const s = almacen();
  if (!s) return Object.fromEntries(memoria);
  try {
    const raw = s.getItem(CLAVE);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return Object.fromEntries(memoria);
  }
}

/** Tara recordada del producto (unidad del producto) o null. */
export function taraRecordada(productoId: number | string | null | undefined): number | null {
  if (productoId === null || productoId === undefined) return null;
  const v = leerTodo()[String(productoId)];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Recuerda la tara del producto; 0 también se recuerda («sin bandeja»). */
export function recordarTara(productoId: number | string | null | undefined, tara: number): void {
  if (productoId === null || productoId === undefined || !Number.isFinite(tara) || tara < 0) return;
  const clave = String(productoId);
  memoria.set(clave, tara);
  const s = almacen();
  if (!s) return;
  try {
    const todo = leerTodo();
    todo[clave] = tara;
    s.setItem(CLAVE, JSON.stringify(todo));
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
}

/** La tara con la que abre la pesada: la recordada en la sesión o la predefinida del producto. */
export function taraInicial(producto: { id: number | string; default_tare_qty?: number | string | null } | null | undefined): number {
  if (!producto) return 0;
  const recordada = taraRecordada(producto.id);
  if (recordada !== null) return recordada;
  const d = Number(producto.default_tare_qty);
  return Number.isFinite(d) && d > 0 ? d : 0;
}
