'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { filtrarOpcionesMulti, alternarValorMulti } from './multiSelectLogica';
import { useKitT } from './useIdiomaKit';

/**
 * Selección múltiple con chips (Figma `MultiSelect` / `TaxMultiSelect`,
 * `02 Componentes`): el disparador muestra los elegidos como chips con «×»;
 * el panel busca, marca con casilla y, con `onCrear`, ofrece «Crear “…”» al
 * final. Teclado: ↑/↓ recorren, Enter marca, Escape cierra, Retroceso en el
 * buscador vacío quita el último chip.
 *
 * Sustituye a los 20 chips toggle de categorías adicionales, al dropdown a
 * mano de etiquetas y al `SearchSelect` de un solo impuesto.
 */
export interface OpcionMulti {
  valor: string;
  etiqueta: string;
  /** Punto de color del chip y de la fila (etiquetas: siempre hex). */
  color?: string | null;
  descripcion?: string;
  deshabilitada?: boolean;
}

export interface MultiSelectProps {
  opciones: readonly OpcionMulti[];
  valores: readonly string[];
  onValoresChange: (valores: string[]) => void;
  placeholder?: string;
  placeholderBusqueda?: string;
  textoVacio?: string;
  /** Crea un registro con lo escrito; quien llama lo agrega a `opciones` y a `valores`. */
  onCrear?: (texto: string) => void;
  textoCrear?: (texto: string) => string;
  /** Nombre accesible del botón «quitar» de cada chip. */
  etiquetaQuitar?: (etiqueta: string) => string;
  deshabilitado?: boolean;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

export function MultiSelect({
  opciones,
  valores,
  onValoresChange,
  placeholder: placeholderProp,
  placeholderBusqueda: placeholderBusquedaProp,
  textoVacio: textoVacioProp,
  onCrear,
  textoCrear: textoCrearProp,
  etiquetaQuitar: etiquetaQuitarProp,
  deshabilitado,
  id,
  className,
  ...aria
}: MultiSelectProps) {
  const t = useKitT();
  const placeholder = placeholderProp ?? t('picker.placeholder');
  const placeholderBusqueda = placeholderBusquedaProp ?? t('picker.buscar');
  const textoVacio = textoVacioProp ?? t('picker.sinResultados');
  const textoCrear = textoCrearProp ?? ((texto: string) => t('picker.crear', { texto }));
  const etiquetaQuitar = etiquetaQuitarProp ?? ((etiqueta: string) => t('picker.quitarDe', { etiqueta }));
  const [abierto, setAbierto] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState('');
  const [activo, setActivo] = React.useState(0);
  const idLista = React.useId();

  const seleccion = React.useMemo(() => new Set(valores), [valores]);
  const elegidas = React.useMemo(
    () => valores.map((v) => opciones.find((o) => o.valor === v)).filter((o): o is OpcionMulti => !!o),
    [valores, opciones],
  );
  const filtradas = React.useMemo(() => filtrarOpcionesMulti(opciones, busqueda), [opciones, busqueda]);
  const exacta = filtradas.some((o) => o.etiqueta.trim().toLowerCase() === busqueda.trim().toLowerCase());
  const mostrarCrear = !!onCrear && busqueda.trim() !== '' && !exacta;
  const totalFilas = filtradas.length + (mostrarCrear ? 1 : 0);

  React.useEffect(() => {
    setActivo(0);
  }, [busqueda, abierto]);

  const alternar = (valor: string) => onValoresChange(alternarValorMulti(valores, valor));

  const crear = () => {
    if (!onCrear) return;
    onCrear(busqueda.trim());
    setBusqueda('');
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => (totalFilas === 0 ? 0 : (a + 1) % totalFilas));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => (totalFilas === 0 ? 0 : (a - 1 + totalFilas) % totalFilas));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activo < filtradas.length) {
        const o = filtradas[activo];
        if (o && !o.deshabilitada) alternar(o.valor);
      } else if (mostrarCrear) {
        crear();
      }
    } else if (e.key === 'Backspace' && busqueda === '' && valores.length > 0) {
      onValoresChange(valores.slice(0, -1));
    }
  };

  return (
    <Popover open={abierto} onOpenChange={(a) => !deshabilitado && setAbierto(a)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={deshabilitado}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          {...aria}
          className={cn(
            'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-left text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
            aria['aria-invalid'] && 'border-line-danger',
            className,
          )}
        >
          {elegidas.length === 0 && <span className="px-1 text-fg-muted">{placeholder}</span>}
          {elegidas.map((o) => (
            <span
              key={o.valor}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-tint py-0.5 pl-2 pr-1 text-xs font-medium text-brand-deep"
            >
              {o.color && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />}
              <span className="truncate">{o.etiqueta}</span>
              <span
                role="button"
                tabIndex={deshabilitado ? -1 : 0}
                aria-label={etiquetaQuitar(o.etiqueta)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!deshabilitado) alternar(o.valor);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!deshabilitado) alternar(o.valor);
                  }
                }}
                className="rounded-full p-0.5 hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X className="h-3 w-3" aria-hidden />
              </span>
            </span>
          ))}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={alTeclear}
            placeholder={placeholderBusqueda}
            aria-controls={idLista}
            aria-activedescendant={totalFilas > 0 ? `${idLista}-${activo}` : undefined}
            className="h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
          />
        </div>
        <ul id={idLista} role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto py-1">
          {filtradas.length === 0 && !mostrarCrear && (
            <li className="px-3 py-2 text-sm text-fg-secondary">{textoVacio}</li>
          )}
          {filtradas.map((o, i) => {
            const marcada = seleccion.has(o.valor);
            return (
              <li
                key={o.valor}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={marcada}
                aria-disabled={o.deshabilitada || undefined}
                onMouseEnter={() => setActivo(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => !o.deshabilitada && alternar(o.valor)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-fg',
                  i === activo && 'bg-hover',
                  o.deshabilitada && 'cursor-not-allowed opacity-50',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    marcada ? 'border-brand bg-brand text-fg-on-brand' : 'border-line-strong',
                  )}
                >
                  {marcada && <Check className="h-3 w-3" />}
                </span>
                {o.color && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.etiqueta}</span>
                  {o.descripcion && <span className="block truncate text-xs text-fg-secondary">{o.descripcion}</span>}
                </span>
              </li>
            );
          })}
          {mostrarCrear && (
            <li
              id={`${idLista}-${filtradas.length}`}
              role="option"
              aria-selected={false}
              onMouseEnter={() => setActivo(filtradas.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={crear}
              className={cn(
                'flex cursor-pointer items-center gap-2 border-t border-line px-3 py-2 text-sm font-medium text-link',
                activo === filtradas.length && 'bg-hover',
              )}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {textoCrear(busqueda.trim())}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
