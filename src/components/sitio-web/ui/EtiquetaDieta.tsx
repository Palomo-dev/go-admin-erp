'use client';

import { Badge } from '@/components/ui/badge';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { useTextosComun } from './textos';

/**
 * Etiqueta de dieta o alérgeno de un plato (Figma B/13-02: «Vegano», «Sin
 * gluten», «Picante», «Contiene mariscos»). El texto sale de la etiqueta del
 * inventario; el tono, de su tipo: dieta en éxito, alérgeno en advertencia y
 * picante en peligro, siempre con texto. La usan la carta del módulo, su vista
 * previa y la sección Carta del editor.
 */
export type TipoEtiquetaDieta = 'dieta' | 'alergeno' | 'picante';

const TONO: Record<TipoEtiquetaDieta, TonoBadge> = {
  dieta: 'exito',
  alergeno: 'advertencia',
  picante: 'peligro',
};

export interface EtiquetaDietaProps {
  texto: string;
  tipo: TipoEtiquetaDieta;
  className?: string;
}

export function EtiquetaDieta({ texto, tipo, className }: EtiquetaDietaProps) {
  const tx = useTextosComun();
  return (
    <Badge tono={TONO[tipo]} apariencia="contorno" tamano="sm" title={tx(`dieta.${tipo}`)} className={className}>
      {texto}
    </Badge>
  );
}
