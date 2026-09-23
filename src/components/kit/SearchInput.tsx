'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { crearDebounce } from './debounce';

/**
 * Buscador único del listado (Figma `SearchBar`/`SearchInput`, PATRONES §3):
 * a la izquierda, ocupando el ancho sobrante; a su derecha, «Filtros».
 *
 * `onChange` llega con debounce (400 ms por defecto); Enter lo dispara ya y
 * Escape borra. El atajo «/» enfoca el buscador desde cualquier parte de la
 * página salvo que se esté escribiendo en otro campo.
 */
export interface SearchInputProps {
  /** Valor confirmado (normalmente el de la URL). Si cambia desde fuera, el campo se sincroniza. */
  value: string;
  /** Con debounce. */
  onChange: (valor: string) => void;
  /** Sin debounce, en cada tecla (para filtrar al instante lo ya cargado). */
  onValueChange?: (valor: string) => void;
  debounceMs?: number;
  placeholder?: string;
  /** Nombre accesible si el placeholder no basta. */
  etiqueta?: string;
  /** Tecla que enfoca el buscador; `false` para desactivarla. */
  atajo?: string | false;
  /** Puntito de actividad mientras el servidor responde (no esqueleto). */
  cargando?: boolean;
  /** Ranura a la derecha (lector de códigos en POS). */
  accesorio?: React.ReactNode;
  tamano?: 'sm' | 'md';
  id?: string;
  autoFocus?: boolean;
  className?: string;
}

function esCampoEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onChange,
    onValueChange,
    debounceMs = 400,
    placeholder = 'Buscar…',
    etiqueta,
    atajo = '/',
    cargando,
    accesorio,
    tamano = 'md',
    id,
    autoFocus,
    className,
  },
  refExterno,
) {
  const [texto, setTexto] = React.useState(value);
  const ultimoEmitido = React.useRef(value);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const debounced = React.useMemo(
    () =>
      crearDebounce((v: string) => {
        ultimoEmitido.current = v;
        onChangeRef.current(v);
      }, debounceMs),
    [debounceMs],
  );
  React.useEffect(() => () => debounced.cancelar(), [debounced]);

  // El valor cambió desde fuera (limpiar filtros, «atrás» del navegador).
  React.useEffect(() => {
    if (value !== ultimoEmitido.current) {
      ultimoEmitido.current = value;
      debounced.cancelar();
      setTexto(value);
    }
  }, [value, debounced]);

  React.useEffect(() => {
    if (!atajo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== atajo || e.ctrlKey || e.metaKey || e.altKey || esCampoEditable(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [atajo]);

  const cambiar = (v: string) => {
    setTexto(v);
    onValueChange?.(v);
    debounced.llamar(v);
  };

  const limpiar = () => {
    debounced.cancelar();
    setTexto('');
    onValueChange?.('');
    ultimoEmitido.current = '';
    onChange('');
    inputRef.current?.focus();
  };

  const asignarRef = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof refExterno === 'function') refExterno(el);
    else if (refExterno) refExterno.current = el;
  };

  return (
    <div
      role="search"
      className={cn(
        'group relative flex min-w-0 items-center rounded-lg border border-line-strong bg-surface transition-colors',
        'focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20',
        tamano === 'md' ? 'h-10' : 'h-8',
        className,
      )}
    >
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-fg-muted" strokeWidth={1.5} />
      <input
        ref={asignarRef}
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={texto}
        placeholder={placeholder}
        aria-label={etiqueta ?? placeholder}
        aria-busy={cargando || undefined}
        onChange={(e) => cambiar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            debounced.ejecutarYa();
          } else if (e.key === 'Escape' && texto) {
            e.preventDefault();
            limpiar();
          }
        }}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent pl-9 pr-2 text-sm text-fg outline-none placeholder:text-fg-muted',
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />
      <div className="flex shrink-0 items-center gap-1 pr-2">
        {cargando && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-brand" />}
        {texto ? (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Borrar búsqueda"
            className="flex size-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        ) : (
          atajo && (
            <kbd
              aria-hidden="true"
              className="hidden h-5 min-w-5 items-center justify-center rounded border border-line bg-subtle px-1 font-sans text-[11px] leading-none text-fg-muted lg:flex"
            >
              {atajo}
            </kbd>
          )
        )}
        {accesorio}
      </div>
    </div>
  );
});
