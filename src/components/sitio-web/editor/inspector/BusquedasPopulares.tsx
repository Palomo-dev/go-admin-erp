'use client';

/** «Búsquedas populares»: chips con «Quitar» y un campo para agregar (Encabezado › Diseño › Buscador). */
import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';
import { EtiquetaGrupo } from './PartesZonaGlobal';
import { LARGO_BUSQUEDA, MAX_BUSQUEDAS, busquedasGuardadas, cambioAgregarBusqueda, cambioQuitarBusqueda } from './busquedasPopularesLogica';

export function BusquedasPopulares({
  ajustes,
  categorias = [],
  onCambiar,
}: {
  ajustes: Record<string, unknown>;
  /** Primeras categorías del menú: lo que la tienda muestra sin búsquedas propias. */
  categorias?: string[];
  onCambiar: (cambio: Record<string, unknown>) => void;
}) {
  const id = useId();
  const [nuevo, setNuevo] = useState('');
  const lista = busquedasGuardadas(ajustes);
  const agregar = () => {
    const c = cambioAgregarBusqueda(ajustes, nuevo);
    if (c) {
      onCambiar(c);
      setNuevo('');
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>Búsquedas populares</EtiquetaGrupo>
      {lista.length > 0 ? (
        <ul aria-labelledby={id} className="flex flex-wrap gap-2">
          {lista.map((v) => (
            <li key={v} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-tint pl-3 pr-1 text-[13px] font-medium text-brand">
              {v}
              <button
                type="button"
                aria-label={`Quitar «${v}»`}
                onClick={() => onCambiar(cambioQuitarBusqueda(ajustes, v))}
                className="flex size-6 items-center justify-center rounded-full hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-4 text-fg-secondary">
          {categorias.length > 0
            ? `Sin búsquedas propias se muestran las primeras categorías del menú: ${categorias.join(', ')}.`
            : 'Sin búsquedas propias se muestran las primeras categorías del menú.'}
        </p>
      )}
      {lista.length < MAX_BUSQUEDAS && (
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-nuevo`} className="sr-only">Agregar búsqueda popular</label>
          <Input
            id={`${id}-nuevo`}
            value={nuevo}
            maxLength={LARGO_BUSQUEDA}
            placeholder="Ej.: Ofertas"
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregar();
              }
            }}
            className="h-9 rounded-lg"
          />
          <button
            type="button"
            onClick={agregar}
            disabled={!nuevo.trim()}
            aria-label="Agregar búsqueda popular"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg border border-line-strong text-fg hover:bg-hover disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            )}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
      <p className="text-[11px] leading-[14px] text-fg-muted">Chips que salen al abrir el buscador vacío. Hasta {MAX_BUSQUEDAS}.</p>
    </div>
  );
}
