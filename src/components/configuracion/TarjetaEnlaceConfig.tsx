'use client';

/**
 * Tarjeta informativa con enlaces de una sección de Configuración (Figma «22 Logística» 2933:9477
 * y «23 Transporte» 2937:19876): ícono en cuadro, texto que explica dónde vive algo que NO es un
 * ajuste de la sección (catálogos del módulo, conexiones, avisos) y uno o dos botones «Ir a…».
 * Los botones reciben su acción: dentro del diálogo navegan y lo cierran (`onAbrirEnlace`) o
 * cambian de sección (`abrirConfiguracion`).
 */
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';

export interface EnlaceTarjetaConfig {
  etiqueta: string;
  onClick: () => void;
}

interface Props {
  id?: string;
  icono: LucideIcon;
  texto: string;
  enlaces: readonly EnlaceTarjetaConfig[];
}

export function TarjetaEnlaceConfig({ id, icono: Icono, texto, enlaces }: Props) {
  return (
    <div id={id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
        <Icono className="size-4" strokeWidth={1.5} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-fg-secondary">{texto}</p>
      <div className="flex flex-wrap gap-2">
        {enlaces.map((e) => (
          <button key={e.etiqueta} type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={e.onClick}>
            <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {e.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
