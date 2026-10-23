'use client';

import { ThirdPartyPicker, type TerceroElegido } from '@/components/kit';

/**
 * Tercero de una línea de asiento o de plantilla. El texto que se escribe no
 * es el NIT: `onCambiar` solo corre al elegir, crear o confirmar un NIT con
 * dígito de verificación. Sin atajo F2, porque hay una línea por fila.
 */
export function CampoTerceroAsiento({
  nit,
  nombre,
  onCambiar,
  obligatorio = false,
}: {
  nit: string;
  nombre: string;
  onCambiar: (nit: string, nombre: string) => void;
  obligatorio?: boolean;
}) {
  const nitLimpio = nit.trim();
  const nombreLimpio = nombre.trim();
  const valor: TerceroElegido | null =
    nitLimpio || nombreLimpio
      ? {
          tipo: nitLimpio ? 'nit' : 'cliente',
          id: null,
          nit: nitLimpio || null,
          dv: null,
          nombre: nombreLimpio || nitLimpio,
        }
      : null;

  return (
    <ThirdPartyPicker
      valor={valor}
      atajo=""
      etiqueta={obligatorio ? 'Tercero *' : 'Tercero'}
      onCambiar={(tercero) => onCambiar(tercero.nit ?? '', tercero.nombre)}
      onQuitar={() => onCambiar('', '')}
    />
  );
}
