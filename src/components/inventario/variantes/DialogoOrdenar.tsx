'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { PanelAdaptable } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { compararNatural, moverEnLista } from './logicaVariantes';

export interface ElementoOrden {
  id: number;
  nombre: string;
  hex?: string | null;
}

export interface DialogoOrdenarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  elementos: readonly ElementoOrden[];
  onGuardar: (ids: number[]) => Promise<void>;
}

/**
 * Ordenar valores (o tipos) — el orden con el que salen en el selector del
 * POS, la tienda y el formulario del producto (Figma «Valores — «Talla» con
 * orden arrastrable» `972:600617`, móvil `972:608438`). Arrastrar con ⠿, o
 * con el teclado: foco en la fila y Alt+↑/↓ (también los botones ↑ ↓, que
 * sirven en táctil). «Orden natural» pone 2 antes de 10.
 */
export function DialogoOrdenar({ abierto, onAbiertoChange, titulo, elementos, onGuardar }: DialogoOrdenarProps) {
  const t = useTranslations('inventarioVariantes.ordenar');
  const locale = useLocale();
  const [lista, setLista] = useState<ElementoOrden[]>([]);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const filas = useRef<Map<number, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (abierto) setLista([...elementos]);
  }, [abierto, elementos]);

  const mover = (indice: number, delta: -1 | 1) => {
    const nueva = moverEnLista(lista, indice, delta);
    setLista(nueva);
    const item = lista[indice];
    const destino = indice + delta;
    if (item && destino >= 0 && destino < lista.length) {
      setAnuncio(t('anuncio', { nombre: item.nombre, posicion: destino + 1, total: lista.length }));
      requestAnimationFrame(() => filas.current.get(item.id)?.focus());
    }
  };

  const teclado = (e: KeyboardEvent<HTMLLIElement>, indice: number) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mover(indice, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      mover(indice, 1);
    }
  };

  const soltarEn = (indiceDestino: number) => {
    if (arrastrando === null) return;
    const origen = lista.findIndex((x) => x.id === arrastrando);
    if (origen < 0 || origen === indiceDestino) return;
    const copia = [...lista];
    const [item] = copia.splice(origen, 1);
    copia.splice(indiceDestino, 0, item);
    setLista(copia);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar(lista.map((x) => x.id));
      onAbiertoChange(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={titulo}
      descripcion={t('descripcion')}
      icono={ArrowUpDown}
      ancho={520}
      ocupado={guardando}
      pie={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => setLista((l) => [...l].sort((a, b) => compararNatural(a.nombre, b.nombre, locale)))}
          >
            {t('natural')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-10" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              {t('cancelar')}
            </Button>
            <Button type="button" className="h-10" onClick={() => void guardar()} disabled={guardando}>
              {t('guardar')}
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-3 text-xs text-fg-secondary">{t('ayudaTeclado')}</p>
      <ol className="flex flex-col gap-1.5" aria-label={titulo}>
        {lista.map((x, i) => (
          <li
            key={x.id}
            ref={(el) => {
              if (el) filas.current.set(x.id, el);
              else filas.current.delete(x.id);
            }}
            tabIndex={0}
            draggable
            onDragStart={(e) => {
              setArrastrando(x.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              soltarEn(i);
            }}
            onDragEnd={() => setArrastrando(null)}
            onKeyDown={(e) => teclado(e, i)}
            aria-label={t('fila', { nombre: x.nombre, posicion: i + 1, total: lista.length })}
            className={`flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              arrastrando === x.id ? 'opacity-60' : ''
            }`}
          >
            <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-fg-muted" strokeWidth={1.5} />
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-fg-secondary">{i + 1}</span>
            {x.hex && <span aria-hidden className="size-4 shrink-0 rounded-full border border-line" style={{ backgroundColor: x.hex }} />}
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{x.nombre}</span>
            <button
              type="button"
              onClick={() => mover(i, -1)}
              disabled={i === 0}
              aria-label={t('subir', { nombre: x.nombre })}
              className="flex size-9 items-center justify-center rounded-md text-fg-secondary hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowUp aria-hidden className="size-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => mover(i, 1)}
              disabled={i === lista.length - 1}
              aria-label={t('bajar', { nombre: x.nombre })}
              className="flex size-9 items-center justify-center rounded-md text-fg-secondary hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowDown aria-hidden className="size-4" strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
    </PanelAdaptable>
  );
}
