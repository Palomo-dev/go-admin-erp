// ============================================================
// Cambios sin guardar de una matriz de permisos y conflicto al guardar
// (Figma «13. Equipo › Roles y permisos»: panel «Cambios sin guardar», diálogo
// «¿Guardar N cambios en …?» y flujo D «Conflicto al guardar»).
//
// Lógica pura. El servidor decide si hay conflicto (versión del rol o
// `updated_at` del cargo); aquí solo se calcula qué cambió y cómo reaplicar
// lo propio sobre la versión que guardó otra persona.
// ============================================================

import type { PermisoCatalogo, Sensibilidad } from './matrizPermisos';

export interface CambioPermiso {
  permiso: PermisoCatalogo;
  tipo: 'anadido' | 'quitado';
}

export interface ResumenCambios {
  anadidos: PermisoCatalogo[];
  quitados: PermisoCatalogo[];
  /** Cambios (añadidos o quitados) de permisos sensibles. */
  sensibles: CambioPermiso[];
  total: number;
}

function porNombre(a: PermisoCatalogo, b: PermisoCatalogo): number {
  return a.modulo.localeCompare(b.modulo) || a.nombre.localeCompare(b.nombre, 'es');
}

export function calcularCambios(
  original: ReadonlySet<number>,
  actual: ReadonlySet<number>,
  catalogo: readonly PermisoCatalogo[],
): ResumenCambios {
  const anadidos: PermisoCatalogo[] = [];
  const quitados: PermisoCatalogo[] = [];
  for (const p of catalogo) {
    const antes = original.has(p.id);
    const ahora = actual.has(p.id);
    if (ahora && !antes) anadidos.push(p);
    else if (antes && !ahora) quitados.push(p);
  }
  anadidos.sort(porNombre);
  quitados.sort(porNombre);
  const sensibles: CambioPermiso[] = [
    ...anadidos.filter((p) => p.sensible).map((permiso) => ({ permiso, tipo: 'anadido' as const })),
    ...quitados.filter((p) => p.sensible).map((permiso) => ({ permiso, tipo: 'quitado' as const })),
  ];
  return { anadidos, quitados, sensibles, total: anadidos.length + quitados.length };
}

/** Delta por permiso para pintar «+ Añadido» / «− Quitado» junto a la fila. */
export function deltaDe(id: number, original: ReadonlySet<number>, actual: ReadonlySet<number>): 'anadido' | 'quitado' | null {
  const antes = original.has(id);
  const ahora = actual.has(id);
  if (ahora && !antes) return 'anadido';
  if (antes && !ahora) return 'quitado';
  return null;
}

/** Delta neto de un módulo (chip «+1» / «−1» en la fila del módulo). */
export function deltaModulo(ids: readonly number[], original: ReadonlySet<number>, actual: ReadonlySet<number>): number {
  let neto = 0;
  for (const id of ids) {
    const d = deltaDe(id, original, actual);
    if (d === 'anadido') neto += 1;
    else if (d === 'quitado') neto -= 1;
  }
  return neto;
}

/** Deshace un cambio concreto (botón ↺ del panel de cambios). */
export function deshacerCambio(actual: ReadonlySet<number>, original: ReadonlySet<number>, id: number): Set<number> {
  const siguiente = new Set(actual);
  if (original.has(id)) siguiente.add(id);
  else siguiente.delete(id);
  return siguiente;
}

export function contarSensibles(ids: Iterable<number>, catalogo: readonly PermisoCatalogo[]): number {
  const sensibles = new Set(catalogo.filter((p) => p.sensible).map((p) => p.id));
  let n = 0;
  for (const id of ids) if (sensibles.has(id)) n += 1;
  return n;
}

export function tiposSensibles(cambios: readonly CambioPermiso[]): Sensibilidad[] {
  return [...new Set(cambios.map((c) => c.permiso.sensible).filter((s): s is Sensibilidad => s !== null))];
}

// ─── Conflicto ────────────────────────────────────────────────────────────

export interface Conflicto {
  /** Lo que la otra persona cambió respecto de lo que esta pantalla leyó. */
  suyos: ResumenCambios;
  /** Lo que esta persona quería cambiar. */
  mios: ResumenCambios;
  /** Permisos que los dos tocaron en sentido contrario (se avisa; gana lo mío al reaplicar). */
  choques: PermisoCatalogo[];
  /** Resultado de aplicar mis cambios sobre la versión guardada. */
  rebasado: Set<number>;
}

/**
 * `base`: lo que la pantalla leyó · `mio`: lo que hay en pantalla · `suyo`: lo
 * que hay guardado ahora. «Aplicar mis cambios sobre su versión» = suyo + mis
 * añadidos − mis quitados.
 */
export function resolverConflicto(
  base: ReadonlySet<number>,
  mio: ReadonlySet<number>,
  suyo: ReadonlySet<number>,
  catalogo: readonly PermisoCatalogo[],
): Conflicto {
  const mios = calcularCambios(base, mio, catalogo);
  const suyos = calcularCambios(base, suyo, catalogo);
  const rebasado = new Set(suyo);
  for (const p of mios.anadidos) rebasado.add(p.id);
  for (const p of mios.quitados) rebasado.delete(p.id);
  const suyosAnadidos = new Set(suyos.anadidos.map((p) => p.id));
  const suyosQuitados = new Set(suyos.quitados.map((p) => p.id));
  const choques = [
    ...mios.anadidos.filter((p) => suyosQuitados.has(p.id)),
    ...mios.quitados.filter((p) => suyosAnadidos.has(p.id)),
  ];
  return { suyos, mios, choques, rebasado };
}

export function mismosIds(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
