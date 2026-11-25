'use client';

/**
 * Hoja A4 con cuatro rótulos de 10 × 15 cm al 97 % y líneas de corte — Figma «21 Logística»
 * 3226:15989 («A4 · 4 por hoja», para la impresora normal de la sede). Cada cuarto es el mismo
 * `RotuloEnvio`; los cuartos que sobran quedan en blanco.
 */
import type { ShipmentLabelPayload } from '@printing';
import { A4_MM, ESCALA_A4, ROTULO_MM, ROTULOS_POR_HOJA } from '@/lib/logistica/rotuloEnvio';
import { RotuloEnvio } from './RotuloEnvio';

export interface HojaRotulosA4Props {
  rotulos: readonly ShipmentLabelPayload[];
  className?: string;
  onListo?: () => void;
}

const CORTE = '0.3mm dashed #000000';

export function HojaRotulosA4({ rotulos, className, onListo }: HojaRotulosA4Props) {
  const cuartos = Array.from({ length: ROTULOS_POR_HOJA }, (_, i) => rotulos[i] ?? null);
  const ancho = A4_MM.ancho / 2;
  const alto = A4_MM.alto / 2;
  return (
    <div
      className={className}
      data-hoja-a4
      style={{
        boxSizing: 'border-box',
        width: `${A4_MM.ancho}mm`,
        height: `${A4_MM.alto}mm`,
        display: 'grid',
        gridTemplateColumns: `${ancho}mm ${ancho}mm`,
        gridTemplateRows: `${alto}mm ${alto}mm`,
        background: '#ffffff',
        overflow: 'hidden',
      }}
    >
      {cuartos.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRight: i % 2 === 0 ? CORTE : undefined,
            borderBottom: i < 2 ? CORTE : undefined,
          }}
        >
          {r && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: `${ROTULO_MM.ancho}mm`,
                height: `${ROTULO_MM.alto}mm`,
                transform: `translate(-50%, -50%) scale(${ESCALA_A4})`,
              }}
            >
              <RotuloEnvio textos={r} formato="10x15" onListo={onListo} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
