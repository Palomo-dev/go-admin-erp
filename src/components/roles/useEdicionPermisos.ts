'use client';

/**
 * Estado de edición de una matriz (rol o cargo): lo guardado (`base`), lo que
 * hay en pantalla (`seleccion`), los cambios y el aviso al salir con cambios
 * sin guardar. Antes cerrar la matriz con cambios los descartaba sin preguntar
 * (análisis §3.3, problema 21) y `hasChanges()` ordenaba (mutaba) el estado
 * en cada render (problema 14): aquí se compara por conjuntos, sin ordenar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { calcularCambios, deshacerCambio, mismosIds, resolverConflicto, type Conflicto } from '@/lib/roles/cambios';
import type { PermisoCatalogo } from '@/lib/roles/matrizPermisos';

export function useEdicionPermisos(catalogo: readonly PermisoCatalogo[]) {
  const [base, setBase] = useState<Set<number>>(new Set());
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());

  const reiniciar = useCallback((ids: readonly number[]) => {
    setBase(new Set(ids));
    setSeleccion(new Set(ids));
  }, []);

  const cambios = useMemo(() => calcularCambios(base, seleccion, catalogo), [base, seleccion, catalogo]);
  const sucio = !mismosIds(base, seleccion);

  const deshacer = useCallback((id: number) => setSeleccion((s) => deshacerCambio(s, base, id)), [base]);
  const descartar = useCallback(() => setSeleccion(new Set(base)), [base]);

  /** Conflicto con lo guardado por otra persona; la base pasa a ser lo suyo. */
  const conflictoCon = useCallback(
    (suyo: readonly number[]): Conflicto => resolverConflicto(base, seleccion, new Set(suyo), catalogo),
    [base, seleccion, catalogo],
  );
  const adoptar = useCallback((nuevaBase: readonly number[], pantalla: Iterable<number>) => {
    setBase(new Set(nuevaBase));
    setSeleccion(new Set(pantalla));
  }, []);

  return { base, seleccion, setSeleccion, reiniciar, cambios, sucio, deshacer, descartar, conflictoCon, adoptar };
}

/** Aviso del navegador al cerrar o recargar la pestaña con cambios sin guardar. */
export function useAvisoSalida(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [activo]);
}
