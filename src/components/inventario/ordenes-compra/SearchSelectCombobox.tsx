'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Check } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface SearchSelectOption {
  id: number;
  name: string;
  subtitle?: string;
}

interface SearchSelectComboboxProps {
  options: SearchSelectOption[];
  value: string;
  onSelect: (option: SearchSelectOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function SearchSelectCombobox({
  options,
  value,
  onSelect,
  placeholder = 'Buscar...',
  disabled = false,
  icon
}: SearchSelectComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<SearchSelectOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const opt = options.find(o => o.id.toString() === value);
      setSelected(opt || null);
    } else {
      setSelected(null);
    }
  }, [value, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(option => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      option.name.toLowerCase().includes(search) ||
      option.subtitle?.toLowerCase().includes(search)
    );
  });

  const handleSelect = (option: SearchSelectOption) => {
    setSelected(option);
    onSelect(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    setSelected(null);
    onSelect(null);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {selected ? (
        <div className="flex items-center gap-2 p-2.5 border rounded-lg bg-white dark:bg-gray-900 dark:border-gray-700">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
              {selected.name}
            </p>
            {selected.subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {selected.subtitle}
              </p>
            )}
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 hover:text-gray-600"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="pl-10 dark:bg-gray-900 dark:border-gray-700"
          />
        </div>
      )}

      {isOpen && !selected && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">No se encontraron resultados</p>
            </div>
          ) : (
            <div className="py-1">
              {filtered.slice(0, 30).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    "w-full flex items-center gap-2 p-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors",
                    value === option.id.toString() && "bg-blue-50 dark:bg-blue-900/20"
                  )}
                >
                  {icon && <span className="flex-shrink-0">{icon}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
                      {option.name}
                    </p>
                    {option.subtitle && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {option.subtitle}
                      </p>
                    )}
                  </div>
                  {value === option.id.toString() && (
                    <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchSelectCombobox;
