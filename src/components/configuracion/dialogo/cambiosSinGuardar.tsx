'use client';

/**
 * «N cambios sin guardar · Descartar · Guardar cambios» del diálogo de
 * Configuración (Figma pág. 10, sección 12).
 *
 * El diálogo NO conoce la lógica de cada panel: el panel que ya sabe si tiene
 * cambios (compara lo editado con lo guardado) se registra con
 * `useRegistrarCambios` y el diálogo pinta la barra, confirma al cerrar o al
 * cambiar de sección, y llama a su `guardar`/`descartar`. Fuera del diálogo
 * (o en un panel que no se registra) no pasa nada: cada panel conserva su
 * propio botón Guardar.
 */
import { createContext, useContext, useEffect, useRef } from 'react';

/** Tono de la insignia de la barra cuando el panel cuenta su propio estado. */
export type TonoAvisoBarra = 'advertencia' | 'peligro' | 'informacion';

export interface CambiosPanel {
  /** Cuántos cambios sin guardar (0 = ninguno). */
  cambios: number;
  guardando?: boolean;
  guardar: () => void | Promise<void>;
  descartar: () => void;
  /** Texto del botón Guardar si no es «Guardar cambios» (Salud de clientes: «Guardar y recalcular»). */
  etiquetaGuardar?: string;
  /** Guardar no se puede pulsar (ni con Ctrl+S): `aviso` dice por qué. */
  bloqueado?: boolean;
  /** Insignia de la barra en lugar de «N cambios sin guardar». */
  aviso?: { texto: string; tono: TonoAvisoBarra };
  /**
   * La barra se muestra aunque no haya cambios: lo que se ve aún no está
   * guardado (la propuesta inicial de Salud de clientes). Sin cambios no hay
   * «Descartar» ni se pregunta al cerrar.
   */
  pendiente?: boolean;
}

type Registrar = (cambios: CambiosPanel | null) => void;

export const CambiosContext = createContext<Registrar | null>(null);

/**
 * Cuántas hojas difieren entre dos valores JSON (objetos, arreglos o
 * primitivos). Un arreglo distinto cuenta como un cambio. Sirve para los
 * paneles que comparan `JSON.stringify(editado) !== JSON.stringify(original)`.
 */
export function contarCambios(a: unknown, b: unknown): number {
  if (Object.is(a, b)) return 0;
  const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (esObjeto(a) && esObjeto(b)) {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    let total = 0;
    claves.forEach((k) => {
      total += contarCambios(a[k], b[k]);
    });
    return total;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
}

/**
 * ¿El panel está dentro del diálogo de Configuración? Ahí la barra
 * «Descartar · Guardar» la pinta el diálogo: el panel no muestra la suya.
 */
export function useDentroDelDialogo(): boolean {
  return useContext(CambiosContext) !== null;
}

/**
 * El panel avisa al diálogo de sus cambios sin guardar. Las funciones se leen
 * de una referencia: el panel puede pasarlas sin memorizar.
 */
export function useRegistrarCambios({ cambios, guardando = false, guardar, descartar, etiquetaGuardar, bloqueado = false, aviso, pendiente = false }: CambiosPanel): void {
  const registrar = useContext(CambiosContext);
  const acciones = useRef({ guardar, descartar });
  acciones.current = { guardar, descartar };
  const textoAviso = aviso?.texto;
  const tonoAviso = aviso?.tono;

  useEffect(() => {
    if (!registrar) return;
    registrar({
      cambios,
      guardando,
      guardar: () => acciones.current.guardar(),
      descartar: () => acciones.current.descartar(),
      ...(etiquetaGuardar ? { etiquetaGuardar } : {}),
      ...(bloqueado ? { bloqueado } : {}),
      ...(textoAviso && tonoAviso ? { aviso: { texto: textoAviso, tono: tonoAviso } } : {}),
      ...(pendiente ? { pendiente } : {}),
    });
  }, [registrar, cambios, guardando, etiquetaGuardar, bloqueado, textoAviso, tonoAviso, pendiente]);

  useEffect(() => {
    if (!registrar) return;
    return () => registrar(null);
  }, [registrar]);
}
