'use client';

import dynamic from 'next/dynamic';
import type { EditorCodigoProps } from './EditorCodigo';

/**
 * CodeMirror no entra en el bundle de Configuración: se pide al abrir la
 * sección. `ssr: false` porque el editor usa el DOM.
 */
export const EditorCodigoDiferido = dynamic<EditorCodigoProps>(
  () => import('./EditorCodigo').then((m) => m.EditorCodigo),
  {
    ssr: false,
    loading: () => <div className="h-24 animate-pulse rounded-lg border border-line bg-subtle" aria-hidden="true" />,
  },
);
