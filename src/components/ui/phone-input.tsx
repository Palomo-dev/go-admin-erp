'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  countryPhoneCodes,
  getCountryByIso,
  parsePhoneString,
  formatPhoneForStorage,
  DEFAULT_COUNTRY_ISO,
  type CountryPhoneCode,
} from '@/lib/data/countryPhoneCodes';

export interface PhoneInputProps {
  /**
   * Valor completo del teléfono (ej: "+57 3001234567").
   * Se mantiene compatible con el formato actual de la BD.
   */
  value?: string;
  /** Se invoca con el string combinado (código + número) listo para guardar. */
  onChange: (value: string) => void;
  /** Placeholder del input del número. */
  placeholder?: string;
  /** Deshabilita todo el componente. */
  disabled?: boolean;
  /** Clase extra para el contenedor. */
  className?: string;
  /** Clase extra para el input del número. */
  inputClassName?: string;
  /** ID del input del número (para labels/atributos). */
  id?: string;
  /** name del input del número (para forms nativos). */
  name?: string;
  /** Código ISO del país a preseleccionar si `value` viene vacío. */
  defaultIso?: string;
  /** Requerido (atributo del input del número). */
  required?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = '300 123 4567',
  disabled = false,
  className,
  inputClassName,
  id,
  name,
  defaultIso = DEFAULT_COUNTRY_ISO,
  required = false,
}: PhoneInputProps) {
  // Detectar país y número a partir del valor entrante
  const parsed = React.useMemo(() => {
    if (!value) return null;
    return parsePhoneString(value);
  }, [value]);

  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  // País seleccionado (ISO). Si el valor no trae código, usamos el default.
  const selectedIso = parsed?.iso ?? defaultIso;
  const selectedCountry = getCountryByIso(selectedIso) ?? countryPhoneCodes[0];

  // Número sin código de país (lo que el usuario escribe).
  const numberPart = parsed?.number ?? '';

  const filtered = React.useMemo(() => {
    if (!search) return countryPhoneCodes;
    const lower = search.toLowerCase();
    return countryPhoneCodes.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.dialCode.includes(search) ||
        c.iso.toLowerCase().includes(lower),
    );
  }, [search]);

  const handleSelectCountry = (country: CountryPhoneCode) => {
    const newFull = formatPhoneForStorage(country.dialCode, numberPart);
    onChange(newFull);
    setOpen(false);
    setSearch('');
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNumber = e.target.value;
    const newFull = formatPhoneForStorage(selectedCountry.dialCode, newNumber);
    onChange(newFull);
  };

  React.useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    if (!open) setSearch('');
  }, [open]);

  return (
    <div className={cn('flex w-full', className)}>
      {/* Selector de código de país */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-9 shrink-0 rounded-r-none border-r-0 px-2.5 font-normal bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            aria-label="Seleccionar código de país"
          >
            <span className="text-base leading-none mr-1">{selectedCountry.flag}</span>
            <span className="text-sm">{selectedCountry.dialCode}</span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[300px] p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar país o código..."
              className="h-9 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            />
          </div>
          <ScrollArea className="h-[260px]">
            <div className="p-1">
              {filtered.length === 0 && (
                <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No se encontraron resultados
                </div>
              )}
              {filtered.map((country) => {
                const isSelected = country.iso === selectedIso;
                return (
                  <button
                    key={`${country.iso}-${country.dialCode}`}
                    type="button"
                    onClick={() => handleSelectCountry(country)}
                    className={cn(
                      'flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800',
                      isSelected && 'bg-blue-50 dark:bg-blue-900/20',
                    )}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="text-base leading-none mr-2">{country.flag}</span>
                    <span className="flex-1 min-w-0 text-left truncate">
                      {country.name}
                    </span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      {country.dialCode}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Input del número */}
      <Input
        id={id}
        name={name}
        type="tel"
        value={numberPart}
        onChange={handleNumberChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={cn('rounded-l-none', inputClassName)}
      />
    </div>
  );
}

export default PhoneInput;
