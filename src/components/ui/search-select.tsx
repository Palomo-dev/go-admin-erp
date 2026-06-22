'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
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
    const lower = search.toLowerCase();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(lower) ||
      (opt.sublabel?.toLowerCase().includes(lower) ?? false)
    );
  }, [options, search]);

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
          role="combobox"
          aria-expanded={open}
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
      </PopoverContent>
    </Popover>
  );
}

export default SearchSelect;
