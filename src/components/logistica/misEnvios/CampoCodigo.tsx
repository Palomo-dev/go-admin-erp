'use client';

/**
 * Código de entrega de 4 dígitos (Figma 2802:10233): cuatro casillas grandes con teclado numérico.
 * El domiciliario se lo PIDE al cliente y lo escribe; la pantalla nunca lo conoce de antemano. La
 * base lo compara (`logistica_marcar_entregado`) y cuenta los intentos fallidos.
 */
import { useRef } from 'react';
import { cn } from '@/utils/Utils';

export interface CampoCodigoProps {
  valor: string;
  onValorChange: (valor: string) => void;
  etiqueta: string;
  invalido?: boolean;
  deshabilitado?: boolean;
  idDescripcion?: string;
}

const LARGO = 4;

export function CampoCodigo({ valor, onValorChange, etiqueta, invalido, deshabilitado, idDescripcion }: CampoCodigoProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digitos = Array.from({ length: LARGO }, (_, i) => valor[i] ?? '');

  const fijar = (i: number, texto: string) => {
    const limpios = texto.replace(/\D/g, '');
    if (!limpios) return;
    // Pegar o autocompletar «4821» en una casilla llena las siguientes.
    const nuevo = (valor.slice(0, i) + limpios).slice(0, LARGO);
    onValorChange(nuevo);
    refs.current[Math.min(nuevo.length, LARGO - 1)]?.focus();
  };

  const alPulsar = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digitos[i]) onValorChange(valor.slice(0, i));
      else if (i > 0) {
        onValorChange(valor.slice(0, i - 1));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < LARGO - 1) refs.current[i + 1]?.focus();
  };

  return (
    <div role="group" aria-label={etiqueta} aria-describedby={idDescripcion} className="flex justify-center gap-3">
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LARGO}
          disabled={deshabilitado}
          aria-label={`${etiqueta} ${i + 1}`}
          aria-invalid={invalido || undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => fijar(i, e.target.value)}
          onKeyDown={(e) => alPulsar(i, e)}
          className={cn(
            'size-16 rounded-xl border-2 bg-surface text-center text-2xl font-semibold text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            invalido ? 'border-line-danger' : 'border-line-brand',
            'disabled:opacity-50',
          )}
        />
      ))}
    </div>
  );
}
