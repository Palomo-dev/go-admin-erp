'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * useHistory (FASE 12.3)
 *
 * Pila de estados para undo/redo sobre el `pendingSectionUpdates` / estado de
 * secciones del editor. Límite 50 pasos.
 *
 * El snapshot es una representación serializable del estado (típicamente el
 * array de secciones). El hook compara por referencia serializada para evitar
 * duplicar estados idénticos consecutivos.
 *
 * Uso:
 *   const { state, set, undo, redo, canUndo, canRedo } = useHistory(initial);
 *   set(newSections);   // push del estado anterior + aplicar nuevo
 *   undo();             // retrocede un paso
 *   redo();             // avanza un paso
 */

const MAX_HISTORY = 50;

export function useHistory<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, forceRender] = useState(0);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const computed = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        // Evitar push si el estado no cambió (comparación superficial por JSON)
        if (JSON.stringify(computed) === JSON.stringify(prev)) return prev;
        past.current.push(prev);
        if (past.current.length > MAX_HISTORY) past.current.shift();
        future.current = [];
        forceRender((n) => n + 1);
        return computed;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setState((prev) => {
      if (past.current.length === 0) return prev;
      const previous = past.current.pop()!;
      future.current.push(prev);
      if (future.current.length > MAX_HISTORY) future.current.shift();
      forceRender((n) => n + 1);
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (future.current.length === 0) return prev;
      const next = future.current.pop()!;
      past.current.push(prev);
      if (past.current.length > MAX_HISTORY) past.current.shift();
      forceRender((n) => n + 1);
      return next;
    });
  }, []);

  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    setState(next);
    forceRender((n) => n + 1);
  }, []);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return { state, set, undo, redo, reset, canUndo, canRedo };
}
