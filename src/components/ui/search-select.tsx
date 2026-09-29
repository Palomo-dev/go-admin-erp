'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

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
   * Ranura «crear» (Figma `SearchSelect`, propiedad «Mostrar crear»): última
   * fila del desplegable que crea un registro con lo escrito. Recibe el texto
   * buscado (puede ir vacío) y cierra el desplegable; quien llama abre su alta
   * rápida y, al guardar, selecciona el nuevo valor.
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
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const isNone = value === noneValue || (!value && noneLabel);

  const displayLabel = isNone && noneLabel
    ? noneLabel
    : selectedOption
      ? selectedOption.label
      : placeholder;

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    // Sin distinguir tildes: «medellin» encuentra «Medellín».
    const plano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const lower = plano(search);
    return options.filter((opt) =>
      plano(opt.label).includes(lower) ||
      (opt.sublabel ? plano(opt.sublabel).includes(lower) : false)
    );
  }, [options, search]);

  const textoCrear = search.trim();
  const coincideExacto = !!textoCrear && options.some((opt) => opt.label.trim().toLowerCase() === textoCrear.toLowerCase());
  const mostrarCrear = !!onCreate && !coincideExacto && (!!textoCrear || !!createEmptyLabel);
  const handleCreate = () => {
    if (!onCreate) return;
    setOpen(false);
    setSearch('');
    onCreate(textoCrear);
  };

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue);
    setOpen(false);
    setSearch('');
  };

  React.useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!open) {
      setSearch('');
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-10 font-normal bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700',
            !selectedOption && !isNone && 'text-gray-500 dark:text-gray-400',
            className,
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Enter sin resultados = crear con lo escrito.
              if (e.key === 'Enter' && mostrarCrear && filteredOptions.length === 0) {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder={searchPlaceholder}
            className="h-9 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
          />
        </div>
        <ScrollArea className="h-[240px]">
          <div className="p-1">
            {filteredOptions.length === 0 && !noneLabel && (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptyText}
              </div>
            )}
            {noneLabel && (
              <button
                type="button"
                onClick={() => handleSelect(noneValue)}
                className={cn(
                  'flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800',
                  isNone && 'bg-blue-50 dark:bg-blue-900/20',
                )}
              >
                <Check className={cn('mr-2 h-4 w-4', isNone ? 'opacity-100' : 'opacity-0')} />
                <span className="text-gray-500 dark:text-gray-400">{noneLabel}</span>
              </button>
            )}
            {filteredOptions.length === 0 && noneLabel && (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptyText}
              </div>
            )}
            {filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800',
                    isSelected && 'bg-blue-50 dark:bg-blue-900/20',
                  )}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="block truncate">{option.label}</span>
                    {option.sublabel && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                        {option.sublabel}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
        {mostrarCrear && (
          <div className="border-t border-line p-1">
            <button
              type="button"
              onClick={handleCreate}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm font-medium text-link outline-none hover:bg-hover focus-visible:bg-hover"
            >
              <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
              <span className="truncate">
                {textoCrear && createLabel ? createLabel(textoCrear) : createEmptyLabel ?? textoCrear}
              </span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default SearchSelect;
