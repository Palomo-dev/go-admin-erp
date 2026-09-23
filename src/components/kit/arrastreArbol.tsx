'use client';

import * as React from 'react';
import { Home } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useKitT } from './useIdiomaKit';

/**
 * Arrastrar y soltar para cambiar de padre en un árbol (HTML5 nativo, sin
 * librería). Es un atajo de escritorio: la vía accesible y la de móvil es
 * «Mover a…», que hace lo mismo con teclado y lector de pantalla.
 *
 * ```tsx
 * const arrastre = useArrastreArbol({
 *   puedeSoltar: (origen, destino) => (descendientes(origen).has(destino) ? 'Crearía un ciclo' : true),
 *   onSoltar: (origen, destino) => mover([origen], destino),   // destino null = raíz
 * });
 * <TreeCell … arrastre={arrastre.nodo(cat.id)} />
 * <ZonaSoltarRaiz {...arrastre.raiz} />
 * ```
 *
 * La validación de verdad está en el servidor (disparador anticiclos); aquí
 * solo se evita ofrecer un destino que va a fallar.
 */
export interface PropsNodoArrastre {
  props: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  esOrigen: boolean;
  esDestino: boolean;
}

export interface OpcionesArrastreArbol {
  /** `true` si se puede soltar `origen` sobre `destino` (`null` = raíz); un texto = motivo para no. */
  puedeSoltar: (origen: number, destino: number | null) => true | string;
  onSoltar: (origen: number, destino: number | null) => void;
  deshabilitado?: boolean;
  /** Ayuda al pasar el ratón sobre un nodo arrastrable; por defecto la de categorías. */
  ayuda?: string;
}

export interface ArrastreArbol {
  nodo: (id: number) => PropsNodoArrastre | undefined;
  raiz: ZonaSoltarRaizProps;
  arrastrando: number | null;
}

const TIPO = 'application/x-go-arbol';

export function useArrastreArbol({ puedeSoltar, onSoltar, deshabilitado, ayuda: ayudaProp }: OpcionesArrastreArbol): ArrastreArbol {
  const t = useKitT();
  const ayuda = ayudaProp ?? t('arbol.arrastrar');
  const [origen, setOrigen] = React.useState<number | null>(null);
  const [destino, setDestino] = React.useState<number | 'raiz' | null>(null);

  const terminar = React.useCallback(() => {
    setOrigen(null);
    setDestino(null);
  }, []);

  const nodo = React.useCallback(
    (id: number): PropsNodoArrastre | undefined => {
      if (deshabilitado) return undefined;
      return {
        esOrigen: origen === id,
        esDestino: destino === id,
        props: {
          draggable: true,
          title: ayuda,
          onDragStart: (e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(TIPO, String(id));
            setOrigen(id);
          },
          onDragEnd: terminar,
          onDragOver: (e) => {
            if (origen === null || origen === id) return;
            if (puedeSoltar(origen, id) !== true) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (destino !== id) setDestino(id);
          },
          onDragLeave: () => {
            if (destino === id) setDestino(null);
          },
          onDrop: (e) => {
            e.preventDefault();
            e.stopPropagation();
            const desde = origen;
            terminar();
            if (desde !== null && desde !== id && puedeSoltar(desde, id) === true) onSoltar(desde, id);
          },
        },
      };
    },
    [deshabilitado, origen, destino, puedeSoltar, onSoltar, terminar, ayuda],
  );

  const raizValida = origen !== null && puedeSoltar(origen, null) === true;
  const raiz: ZonaSoltarRaizProps = {
    visible: origen !== null && raizValida,
    activa: destino === 'raiz',
    props: {
      onDragOver: (e) => {
        if (!raizValida) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (destino !== 'raiz') setDestino('raiz');
      },
      onDragLeave: () => {
        if (destino === 'raiz') setDestino(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const desde = origen;
        terminar();
        if (desde !== null && puedeSoltar(desde, null) === true) onSoltar(desde, null);
      },
    },
  };

  return { nodo, raiz, arrastrando: origen };
}

export interface ZonaSoltarRaizProps {
  visible: boolean;
  activa: boolean;
  props: React.HTMLAttributes<HTMLDivElement>;
  etiqueta?: string;
  className?: string;
}

/** Franja punteada que aparece mientras se arrastra: soltar aquí deja el nodo en la raíz. */
export function ZonaSoltarRaiz({ visible, activa, props, etiqueta: etiquetaProp, className }: ZonaSoltarRaizProps) {
  const t = useKitT();
  const etiqueta = etiquetaProp ?? t('arbol.soltarRaiz');
  if (!visible) return null;
  return (
    <div
      {...props}
      role="region"
      aria-label={etiqueta}
      className={cn(
        'hidden items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-[13px] font-medium lg:flex',
        activa ? 'border-line-brand bg-brand-tint text-brand' : 'border-line-strong text-fg-secondary',
        className,
      )}
    >
      <Home aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {etiqueta}
    </div>
  );
}
