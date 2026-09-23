'use client';

import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { cn } from '@/utils/Utils';
import { agruparEan13, formatoJsBarcode } from '@/lib/utils/codigoBarras';

/**
 * `Doc/Código de barras` (Figma «Componentes — Etiquetas (Nuevo)»,
 * `511:257339`; Formato × Estado). Barras dibujadas con el paquete
 * `jsbarcode` instalado —no con un CDN: una etiqueta que necesita internet
 * para imprimirse no sirve en una caja sin red— y el número debajo, en HTML,
 * para que no se deforme al escalar.
 *
 * El formato sale del propio código: 13 u 8 dígitos con control válido →
 * EAN; cualquier otro → Code128. Sin código pinta la franja «sin código».
 * Es papel: blanco y negro fijos, también en modo oscuro.
 */
export interface CodigoBarrasProps {
  valor: string | null | undefined;
  /** Número legible bajo las barras. */
  mostrarTexto?: boolean;
  /** Texto de la franja cuando no hay código (lo traduce quien llama). */
  textoSinCodigo: string;
  /** Texto cuando el código no se puede dibujar (caracteres fuera de Code128). */
  textoInvalido?: string;
  className?: string;
  /** Alto de las barras (CSS: `60%`, `8mm`, `40px`). Por defecto ocupa el alto disponible. */
  altoBarras?: string;
  /** Tamaño del número (CSS). */
  tamanoTexto?: string;
  /** Avisa cuando las barras quedaron pintadas (la página de impresión espera a todas). */
  onListo?: () => void;
}

export function CodigoBarras({
  valor,
  mostrarTexto = true,
  textoSinCodigo,
  textoInvalido,
  className,
  altoBarras,
  tamanoTexto = '9px',
  onListo,
}: CodigoBarrasProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [invalido, setInvalido] = useState(false);
  const codigo = (valor ?? '').trim();

  useEffect(() => {
    const nodo = svg.current;
    if (!nodo || !codigo) {
      onListo?.();
      return;
    }
    try {
      JsBarcode(nodo, codigo, {
        format: formatoJsBarcode(codigo),
        displayValue: false,
        margin: 0,
        height: 60,
        width: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
      // Escalable: el tamaño lo pone el contenedor (mm en la etiqueta).
      const w = nodo.getAttribute('width');
      const h = nodo.getAttribute('height');
      if (w && h) {
        nodo.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
        nodo.setAttribute('preserveAspectRatio', 'none');
        nodo.removeAttribute('width');
        nodo.removeAttribute('height');
        nodo.removeAttribute('style');
      }
      setInvalido(false);
    } catch {
      setInvalido(true);
    }
    onListo?.();
    // onListo es un aviso: no debe volver a pintar las barras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  if (!codigo || invalido) {
    return (
      <div
        className={cn(
          'flex min-h-[6mm] w-full items-center justify-center rounded-[1mm] bg-white text-center text-[8px] font-medium text-black/60 outline-dashed outline-1 outline-black/30',
          className,
        )}
        style={altoBarras ? { height: altoBarras } : undefined}
        role="img"
        aria-label={!codigo ? textoSinCodigo : textoInvalido ?? textoSinCodigo}
      >
        {!codigo ? textoSinCodigo : textoInvalido ?? textoSinCodigo}
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 w-full flex-col items-stretch bg-white text-black', className)} role="img" aria-label={codigo}>
      <svg ref={svg} aria-hidden="true" className="block min-h-0 w-full flex-1" style={altoBarras ? { height: altoBarras, flex: 'none' } : undefined} />
      {mostrarTexto && (
        <span className="mt-[0.4mm] block text-center font-mono leading-none tracking-[0.08em]" style={{ fontSize: tamanoTexto }}>
          {agruparEan13(codigo)}
        </span>
      )}
    </div>
  );
}
