'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { claveDocumento, documentoProvisional, refsUnicas, resolverDocumentos } from '@/lib/inventario/documentoMovimiento';
import type { DocumentoMovimiento, RefDocumento } from '@/lib/inventario/nucleo/tipos';

/**
 * Documentos de una página de movimientos, resueltos en UNA llamada
 * (`fn_inv_documentos`). `de(mov)` devuelve el documento resuelto o, mientras
 * llega, el provisional (tipo sin número ni enlace).
 *
 * ```tsx
 * const docs = useDocumentosMovimiento(organizacionId, filas);   // filas: {source, source_id, product_id}[]
 * <EnlaceDocumento documento={docs.de(fila)} cargando={docs.cargando} />
 * ```
 */
export function useDocumentosMovimiento(organizacionId: number | null | undefined, refs: readonly RefDocumento[]) {
  const [mapa, setMapa] = useState<Map<string, DocumentoMovimiento>>(new Map());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Clave estable de la página: solo se vuelve a pedir si cambian las referencias.
  const unicas = useMemo(() => refsUnicas(refs), [refs]);
  const firma = useMemo(() => unicas.map(claveDocumento).join('\n'), [unicas]);

  useEffect(() => {
    if (!organizacionId || unicas.length === 0) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    resolverDocumentos(organizacionId, unicas)
      .then((m) => {
        if (vivo) setMapa(m);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // `firma` resume `unicas`: evitar pedir de nuevo en cada render con el mismo contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionId, firma]);

  const de = useCallback(
    (ref: RefDocumento): DocumentoMovimiento => mapa.get(claveDocumento(ref)) ?? documentoProvisional(ref),
    [mapa],
  );

  return { de, cargando, error };
}
