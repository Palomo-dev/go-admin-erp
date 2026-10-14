'use client';

/**
 * SearchSelect del sistema de diseño (Figma `02 Componentes`, nodo 104:3125):
 * disparador a lo ancho del campo, menú con buscador, fila seleccionada en
 * tinte y, si cabe, «Crear …». Sustituye el combobox de ancho fijo y sin
 * teclado. La lista tiene su propio scroll (`max-h` + `overflow-y-auto`);
 * dentro de un diálogo lo mueve `scrollEnCapa` del `Popover`.
 */
import * as React from 'react';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { filtrarPorTexto, moverResalte } from '@/components/kit/searchSelectLogica';

export interface SearchSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchSelectProps {
  options: SearchSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  noneLabel?: string;
  noneValue?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Ranura «crear» (Figma, propiedad «Mostrar crear»): última fila del
   * desplegable. Recibe el texto buscado (puede ir vacío) y cierra el menú.
   */
  onCreate?: (texto: string) => void;
  /** Texto de la fila con lo buscado: `(t) => «Crear “${t}”»`. */
  createLabel?: (texto: string) => string;
  /** Texto de la fila sin búsqueda («Crear categoría»); sin él, solo aparece al escribir. */
  createEmptyLabel?: string;
  /** Id del disparador (para <label htmlFor> / FormField). */
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function SearchSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'No se encontraron resultados',
  noneLabel,
  noneValue = 'none',
  disabled = false,
  className,
  onCreate,
  createLabel,
  createEmptyLabel,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [resalte, setResalte] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listaRef = React.useRef<HTMLDivElement>(null);
  const listaId = React.useId();

  const selectedOption = options.find((opt) => opt.value === value);
  const isNone = value === noneValue || (!value && !!noneLabel);
  const displayLabel = isNone && noneLabel ? noneLabel : selectedOption ? selectedOption.label : placeholder;

  const filas = React.useMemo(() => {
    const base: SearchSelectOption[] = [...(noneLabel ? [{ value: noneValue, label: noneLabel }] : []), ...options];
    return filtrarPorTexto(base, search, (opt) => [opt.label, opt.sublabel]);
  }, [noneLabel, noneValue, options, search]);

  const indice = filas.length === 0 ? -1 : Math.min(Math.max(resalte, 0), filas.length - 1);
  const textoCrear = search.trim();
  const coincideExacto = !!textoCrear && options.some((opt) => opt.label.trim().toLowerCase() === textoCrear.toLowerCase());
  const mostrarCrear = !!onCreate && !coincideExacto && (!!textoCrear || !!createEmptyLabel);

  const elegir = (selectedValue: string) => {
    onValueChange(selectedValue);
    setOpen(false);
    setSearch('');
  };

  const crear = () => {
    if (!onCreate) return;
    setOpen(false);
    setSearch('');
    onCreate(textoCrear);
  };

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    const i = filas.findIndex((fila) => fila.value === value);
    setResalte(i >= 0 ? i : 0);
    return () => window.clearTimeout(timer);
    // Solo al abrir: si dependiera de `filas`, cada tecla repondría el resalte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    const caja = listaRef.current;
    const fila = caja?.querySelector<HTMLElement>('[data-resaltada="true"]');
    if (!caja || !fila) return;
    const delta = fila.getBoundingClientRect().top - caja.getBoundingClientRect().top;
    if (delta < 0) caja.scrollTop += delta;
    else if (delta + fila.offsetHeight > caja.clientHeight) caja.scrollTop += delta + fila.offsetHeight - caja.clientHeight;
  }, [indice, filas]);

  const onTecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const siguiente = moverResalte(indice, filas.length, e.key);
      if (siguiente !== null) setResalte(siguiente);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (indice >= 0 && filas[indice]) elegir(filas[indice].value);
      else if (mostrarCrear && filas.length === 0) crear();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listaId}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || undefined}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-sm font-normal text-fg',
            'hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'disabled:cursor-not-allowed disabled:opacity-50',
            open ? 'border-brand' : 'border-line',
            ariaInvalid && 'border-danger',
            !selectedOption && !isNone && 'text-fg-muted',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="pointer-events-auto z-[60] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-line bg-surface p-1 text-fg shadow-md"
      >
        <div className="flex h-9 items-center gap-2 px-2">
          <Search aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setResalte(0);
            }}
            onKeyDown={onTecla}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-autocomplete="list"
            aria-controls={listaId}
            aria-activedescendant={indice >= 0 ? `${listaId}-${indice}` : undefined}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
          />
        </div>
        <div className="mx-1 h-px bg-line" />
        <div ref={listaRef} id={listaId} role="listbox" className="max-h-60 overflow-y-auto p-1">
          {filas.length === 0 && <p className="px-2 py-6 text-center text-sm text-fg-secondary">{emptyText}</p>}
          {filas.map((fila, i) => {
            const activa = fila.value === value || (fila.value === noneValue && isNone);
            const resaltada = i === indice;
            return (
              <button
                key={fila.value}
                id={`${listaId}-${i}`}
                type="button"
                role="option"
                aria-selected={activa}
                data-resaltada={resaltada ? 'true' : undefined}
                onMouseEnter={() => setResalte(i)}
                onClick={() => elegir(fila.value)}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none',
                  activa ? 'bg-brand-tint text-brand-deep' : 'text-fg',
                  resaltada && !activa && 'bg-hover',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{fila.label}</span>
                  {fila.sublabel && <span className="block truncate text-xs text-fg-secondary">{fila.sublabel}</span>}
                </span>
                {activa && <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />}
              </button>
            );
          })}
        </div>
        {mostrarCrear && (
          <>
            <div className="mx-1 h-px bg-line" />
            <button
              type="button"
              onClick={crear}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-link outline-none hover:bg-hover focus-visible:bg-hover"
            >
              <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{textoCrear && createLabel ? createLabel(textoCrear) : createEmptyLabel ?? textoCrear}</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default SearchSelect;
