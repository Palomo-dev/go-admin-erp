'use client';

import { useEffect } from 'react';
import type { useEditorSitio } from './useEditorSitio';

type Acciones = Pick<ReturnType<typeof useEditorSitio>, 'guardarAhora' | 'canUndo' | 'canRedo' | 'deshacer' | 'rehacer' | 'activeSectionId' | 'duplicarSeccion'>;

/** Escape pertenece al popover/diálogo abierto: conserva la selección y los paneles. */
export function useAtajosEditor(ed: Acciones, eliminar: (id: string) => void) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key === 'Escape') return;
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') || target?.isContentEditable;
      const k = e.key.toLowerCase();
      if (ctrl && k === 's') {
        e.preventDefault();
        void ed.guardarAhora();
        return;
      }
      if (escribiendo) return;
      if (ctrl && !e.shiftKey && k === 'z') {
        e.preventDefault();
        if (ed.canUndo) ed.deshacer();
      } else if (ctrl && ((e.shiftKey && k === 'z') || k === 'y')) {
        e.preventDefault();
        if (ed.canRedo) ed.rehacer();
      } else if (ctrl && k === 'd' && ed.activeSectionId) {
        e.preventDefault();
        void ed.duplicarSeccion(ed.activeSectionId);
      } else if (e.key === 'Delete' && ed.activeSectionId) {
        e.preventDefault();
        eliminar(ed.activeSectionId);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [ed, eliminar]);
}
