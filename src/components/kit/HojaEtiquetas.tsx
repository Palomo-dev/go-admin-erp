'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/utils/Utils';
import { EtiquetaProducto } from './EtiquetaProducto';
import {
  posicionCasilla,
  tamanoPagina,
  type CamposEtiqueta,
  type DatosEtiqueta,
  type PlantillaEtiqueta,
} from '@/lib/utils/etiquetasImpresion';

/**
 * Una página de etiquetas a tamaño real (Figma «Carta 216 × 279 mm — rejilla
 * 3 × 8», «A4 210 × 297 mm», «Rollo 50 × 25 mm»): cada casilla en su
 * posición en milímetros según la plantilla. `null` = casilla vacía (hoja ya
 * empezada o final de la última hoja).
 */
export interface HojaEtiquetasProps {
  plantilla: PlantillaEtiqueta;
  celdas: (DatosEtiqueta | null)[];
  campos: CamposEtiqueta;
  textoSinCodigo: string;
  textoInvalido?: string;
  /** Bordes de corte y casillas vacías visibles (vista previa). */
  guias?: boolean;
  className?: string;
  style?: CSSProperties;
  onEtiquetaLista?: () => void;
}

export function HojaEtiquetas({
  plantilla,
  celdas,
  campos,
  textoSinCodigo,
  textoInvalido,
  guias = false,
  className,
  style,
  onEtiquetaLista,
}: HojaEtiquetasProps) {
  const pagina = tamanoPagina(plantilla);
  return (
    <div
      className={cn('relative box-border overflow-hidden bg-white', className)}
      style={{ width: `${pagina.anchoMm}mm`, height: `${pagina.altoMm}mm`, ...style }}
    >
      {celdas.map((dato, i) => {
        const { xMm, yMm } = posicionCasilla(plantilla, i);
        return (
          <EtiquetaProducto
            // El índice ES la identidad de la casilla en la hoja.
            key={i}
            datos={dato}
            campos={campos}
            anchoMm={plantilla.anchoMm}
            altoMm={plantilla.altoMm}
            textoSinCodigo={textoSinCodigo}
            textoInvalido={textoInvalido}
            guia={guias}
            className="absolute"
            style={{ left: `${xMm}mm`, top: `${yMm}mm` }}
            onListo={dato ? onEtiquetaLista : undefined}
          />
        );
      })}
    </div>
  );
}
