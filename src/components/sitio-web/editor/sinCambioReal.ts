/**
 * Compara DESPUÉS de normalizar (auditoría 27-oct, punto 4): una normalización del editor que deja el
 * documento o los ajustes igual (p. ej. limpiar `mobile_search_style`/`mobile_header` ya vacíos al abrir
 * un panel) no debe marcar «cambios sin guardar». `undefined`, ausencia y el orden de las claves no cuentan.
 */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const salida: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) salida[k] = canon(x);
    }
    return salida;
  }
  return v;
}

export function igualesNormalizados(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** Solo las claves cuyo valor cambia de verdad (null y ausencia cuentan igual). */
export function cambiosEfectivos(cambios: Record<string, unknown>, actual: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cambios)) {
    const previo = actual ? actual[k] : undefined;
    const vacio = (x: unknown) => x === null || x === undefined;
    if (vacio(v) && vacio(previo)) continue;
    if (!igualesNormalizados(v, previo)) salida[k] = v;
  }
  return salida;
}
