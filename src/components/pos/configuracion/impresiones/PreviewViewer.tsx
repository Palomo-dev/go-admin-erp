'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PrintPreview, RenderPath } from './usePrintPreview';

interface PreviewViewerProps {
  preview: PrintPreview;
  path: RenderPath;
}

/**
 * Muestra el ticket al ancho real del papel.
 *
 * El HTML va en un iframe con el ancho exacto en px CSS que tendra al
 * imprimirse (`paper.cssPx`), de modo que lo que se ve aqui es lo que sale
 * por la impresora, no una aproximacion.
 */
export function PreviewViewer({ preview, path }: PreviewViewerProps) {
  const { paper, html, text, overflow } = preview;

  return (
    <div className="space-y-3">
      <OverflowNotice overflow={overflow} charsPerLine={paper.charsPerLine} />

      <div className="flex justify-center overflow-auto rounded-lg bg-gray-100 dark:bg-gray-900 p-6">
        {path === 'html' ? (
          <iframe
            title="Previsualizacion del ticket"
            srcDoc={html ?? ''}
            // El alto es generoso a proposito: el papel es continuo y el
            // contenido crece. El scroll queda dentro del iframe.
            style={{ width: paper.cssPx, height: 620, border: 'none', background: '#fff' }}
            className="shadow-lg"
          />
        ) : (
          <EscposView text={text ?? ''} charsPerLine={paper.charsPerLine} />
        )}
      </div>
    </div>
  );
}

/**
 * Vista del flujo ESC/POS como texto monoespaciado, con una regla de columnas
 * encima. La regla hace evidente de un vistazo si algo se sale del papel.
 */
function EscposView({ text, charsPerLine }: { text: string; charsPerLine: number }) {
  const ruler = buildRuler(charsPerLine);

  return (
    <div className="bg-white shadow-lg p-4 font-mono text-[11px] leading-[1.35] text-black">
      <pre className="text-gray-400 select-none border-b border-dashed border-gray-300 pb-1 mb-1">
        {ruler}
      </pre>
      <pre className="whitespace-pre">{text}</pre>
    </div>
  );
}

/** Regla tipo `----+----1----+----2` para contar columnas de un vistazo. */
function buildRuler(charsPerLine: number): string {
  let out = '';
  for (let i = 1; i <= charsPerLine; i++) {
    if (i % 10 === 0) out += String((i / 10) % 10);
    else if (i % 5 === 0) out += '+';
    else out += '-';
  }
  return out;
}

function OverflowNotice({ overflow, charsPerLine }: { overflow: PrintPreview['overflow']; charsPerLine: number }) {
  if (overflow.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 px-3 py-2 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Ninguna linea supera las {charsPerLine} columnas del papel.</span>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {overflow.length} linea{overflow.length > 1 ? 's' : ''} supera{overflow.length > 1 ? 'n' : ''} las{' '}
          {charsPerLine} columnas y se cortara{overflow.length > 1 ? 'n' : ''} al imprimir.
        </span>
      </div>
      <ul className="mt-2 space-y-1 font-mono text-xs">
        {overflow.map((line, i) => (
          <li key={i} className="truncate">
            ({line.length}) {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
