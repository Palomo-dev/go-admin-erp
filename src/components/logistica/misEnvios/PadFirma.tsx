'use client';

/**
 * Firma del que recibe, con el dedo, en el celular. Se exporta como PNG y se sube a
 * `shipment-pod` (proof_of_delivery.signature_url).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Eraser } from 'lucide-react';
import { clasesBoton } from '@/components/kit';

export interface PadFirmaRef {
  aBlob: () => Promise<Blob | null>;
}

export interface PadFirmaProps {
  etiqueta: string;
  textoBorrar: string;
  onTrazoChange: (hayTrazo: boolean) => void;
}

export const PadFirma = forwardRef<PadFirmaRef, PadFirmaProps>(function PadFirma({ etiqueta, textoBorrar, onTrazoChange }, ref) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const hayTrazo = useRef(false);

  const ajustar = useCallback(() => {
    const c = lienzo.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const escala = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(r.width * escala));
    c.height = Math.max(1, Math.round(r.height * escala));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    ajustar();
  }, [ajustar]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const borrar = () => {
    const c = lienzo.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    hayTrazo.current = false;
    onTrazoChange(false);
  };

  useImperativeHandle(ref, () => ({
    aBlob: () =>
      new Promise((ok) => {
        if (!lienzo.current || !hayTrazo.current) return ok(null);
        lienzo.current.toBlob(ok, 'image/png');
      }),
  }));

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={lienzo}
        role="img"
        aria-label={etiqueta}
        className="h-40 w-full touch-none rounded-xl border border-line-strong bg-white"
        onPointerDown={(e) => {
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dibujando.current = true;
          const { x, y } = punto(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          const { x, y } = punto(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          if (!hayTrazo.current) {
            hayTrazo.current = true;
            onTrazoChange(true);
          }
        }}
        onPointerUp={() => {
          dibujando.current = false;
        }}
        onPointerLeave={() => {
          dibujando.current = false;
        }}
      />
      <button type="button" onClick={borrar} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-end' })}>
        <Eraser aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {textoBorrar}
      </button>
    </div>
  );
});
