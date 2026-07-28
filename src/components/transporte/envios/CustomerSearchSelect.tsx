'use client';

import * as React from 'react';
import { Search, Loader2, X, MapPin, Phone, Mail, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/Utils';

export interface CustomerSearchResult {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
}

interface CustomerSearchSelectProps {
  onSearch: (query: string) => Promise<CustomerSearchResult[]>;
  onSelect: (customer: CustomerSearchResult) => void;
  selectedName?: string;
  selectedPhone?: string;
  placeholder?: string;
  disabled?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
    'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-red-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function CustomerSearchSelect({
  onSearch,
  onSelect,
  selectedName,
  selectedPhone,
  placeholder = 'Buscar cliente...',
  disabled = false,
}: CustomerSearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await onSearch(searchQuery);
      setResults(data);
    } catch (error) {
      console.error('Error searching customers:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (customer: CustomerSearchResult) => {
    onSelect(customer);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const clearSelection = () => {
    onSelect({ id: '', full_name: '', phone: '', email: '', address: '', city: '' });
  };

  return (
    <div ref={containerRef} className="relative">
      {selectedName ? (
        <div className="flex items-center justify-between rounded-lg border bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-medium', getAvatarColor(selectedName))}>
              {getInitials(selectedName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{selectedName}</p>
              {selectedPhone && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {selectedPhone}
                </p>
              )}
            </div>
          </div>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection} className="h-7 w-7 p-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(query);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || loading}
            onClick={() => handleSearch(query)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {open && !selectedName && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-white dark:bg-gray-900 shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">Buscando...</span>
            </div>
          ) : results.length > 0 ? (
            <ScrollArea className="max-h-64">
              <div className="divide-y">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className="flex w-full items-start gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-medium', getAvatarColor(c.full_name))}>
                      {getInitials(c.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.full_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </span>
                        )}
                        {c.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {c.city}
                          </span>
                        )}
                      </div>
                      {c.address && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{c.address}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          ) : query.trim() ? (
            <div className="py-6 text-center text-sm text-gray-500">
              No se encontraron clientes
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-gray-500">
              Escriba para buscar clientes
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CustomerSearchSelect;
