'use client';

/**
 * Miniatura de una plantilla en la galería (Figma A/06b): un esquema del sitio
 * con los tokens de SU estilo —barra con logo, enlaces y botón; portada con
 * titular y botón; tres tarjetas—, sin imágenes. Los colores y la fuente son
 * datos de la plantilla y solo existen aquí dentro.
 */
import type { CSSProperties } from 'react';
import type { EstiloCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { radioBoton, textoSobreAcento } from '@/lib/website/v2/tokensEstilo';
import { mezclar } from './catalogo';

export function MiniaturaPlantilla({ estilo }: { estilo: EstiloCatalogo }) {
  const tenue = mezclar(estilo.texto, estilo.fondo, 0.55);
  const banda = mezclar(estilo.fondo, estilo.texto, 0.08);
  const tarjeta = mezclar(estilo.fondo, estilo.texto, 0.12);
  const radio = Math.min(radioBoton(estilo), 6);
  const boton: CSSProperties = { backgroundColor: estilo.acento, borderRadius: radio };
  const linea = (ancho: string, color = tenue, alto = 3): CSSProperties => ({ width: ancho, height: alto, backgroundColor: color, borderRadius: 2 });

  return (
    <span aria-hidden="true" className="flex size-full flex-col" style={{ backgroundColor: estilo.fondo }}>
      <span className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="size-2.5 rounded-sm" style={{ backgroundColor: estilo.acento }} />
        <span style={linea('22%', estilo.texto)} />
        <span className="ml-auto flex items-center gap-1">
          <span style={linea('10px')} />
          <span style={linea('10px')} />
          <span style={linea('10px')} />
          <span className="h-2 w-5" style={boton} />
        </span>
      </span>
      <span className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3" style={{ backgroundColor: banda }}>
        <span style={linea('46%', estilo.texto, 5)} />
        <span style={linea('30%')} />
        <span className="mt-0.5 h-2.5 w-8" style={{ ...boton, color: textoSobreAcento(estilo.acento) }} />
      </span>
      <span className="grid grid-cols-3 gap-1.5 p-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex h-7 flex-col justify-end gap-0.5 p-1" style={{ backgroundColor: tarjeta, borderRadius: Math.min(estilo.radio, 6) }}>
            <span style={linea('70%', estilo.texto, 2)} />
            <span style={linea('40%', estilo.acento, 2)} />
          </span>
        ))}
      </span>
    </span>
  );
}
